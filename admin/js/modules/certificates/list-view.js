/*
  Certificate list (Phase C).

  Same shape as the Experience and Projects lists: one table, a toolbar of
  filters, and a per-row actions menu. Lifecycle is the shared one —

      draft  <->  published        Show on / Hide from public site
      any     ->  archived         Archive
      archived ->  draft           Restore to Draft
      any     ->  Trash            Move to Trash (deleted_at)
      Trash   ->  draft            Restore
      Trash   ->  gone             Delete Permanently (typed confirmation)

  ACTION WORDING
  --------------
  The database speaks draft/published/archived; the owner thinks "is this on
  my site or not". So the two everyday actions are labelled by their effect —
  "Show on public site" and "Hide from public site" — while still writing the
  same status column every other module uses. Hiding never deletes anything.

  All visible strings come from core/i18n.js; nothing in this file decides
  wording per language.

  THE MINIMUM-PUBLISHED RULE
  --------------------------
  The public carousel needs at least three cards. The database enforces that
  with a latch: any count is allowed until the CMS first reaches three
  published certificates, and from then on it may never drop below three.

  Activation is not fetched separately — it is derivable from the count this
  view already loads. A state below three can only exist before the latch
  armed, because afterwards the database would have rejected it. So:

      publishedCount >= 3   ->  latched, guard the reducing actions
      publishedCount <  3   ->  still bootstrapping, everything allowed

  The guards below are usability: they explain the rule and stop the owner
  reaching a dead end. The database remains the authority.
*/

import { supabaseClient } from "../../core/supabase.js";
import {
  el,
  append,
  clear,
  emptyState,
  statusBadge,
  updatedAt
} from "../../core/dom.js";
import { confirmDialog, openModal } from "../../core/modal.js";
import { toast } from "../../core/toast.js";
import { textField, trimmed } from "../../core/form.js";
import { t } from "../../core/i18n.js";

import {
  buildCategoryIcon,
  categoryLabel,
  CERTIFICATE_CATEGORIES
} from "./categories.js";
import { openCertificatePreview } from "./preview.js";
import { documentUrl, removeDocument } from "../../core/document-storage.js";

const SELECT_COLUMNS =
  "id, title, publisher, period, category, issuer_line, badge_text, description, status, sort_order, published_at, archived_at, deleted_at, created_at, updated_at, document_bucket, document_path, document_type, external_url";

const MINIMUM_PUBLISHED = 3;

/* Resolved at call time, never cached: the language can change while the list
   is on screen and the hint has to follow it. */
function minimumHint() {
  return t("certificates.minimumHint", { min: MINIMUM_PUBLISHED });
}

function rowTitle(row) {
  return row.title || t("certificates.thisOne");
}

export function createCertificateList({ onEdit, onChanged }) {
  const root = el("div", "certificate-list-view");

  const state = {
    rows: [],
    filters: { search: "", status: "all", category: "all" },
    status: "loading",
    busy: false
  };

  let closeOpenMenu = null;

  function closeMenu() {
    if (closeOpenMenu) {
      closeOpenMenu();
      closeOpenMenu = null;
    }
  }

  function handlePointerDown(event) {
    if (!closeOpenMenu) {
      return;
    }

    const menu = root.querySelector(".row-actions.is-open");

    if (menu && !menu.contains(event.target)) {
      closeMenu();
    }
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && closeOpenMenu) {
      closeMenu();
    }
  }

  document.addEventListener("pointerdown", handlePointerDown);
  document.addEventListener("keydown", handleKeydown);

  /* ---------------- toolbar ---------------- */

  const toolbar = el("div", "admin-toolbar");

  const searchField = el("div", "toolbar-field toolbar-field-search");
  const searchLabel = el("label", "toolbar-label", t("common.search"));
  const searchInput = el("input", "admin-input");
  searchInput.type = "search";
  searchInput.id = "certificate-search";
  searchInput.placeholder = t("certificates.searchPlaceholder");
  searchInput.autocomplete = "off";
  searchLabel.htmlFor = searchInput.id;

  searchInput.addEventListener("input", () => {
    state.filters.search = searchInput.value;
    closeMenu();
    renderList();
  });

  append(searchField, searchLabel, searchInput);

  const statusField = el("div", "toolbar-field");
  const statusLabel = el("label", "toolbar-label", t("common.status"));
  const statusSelect = el("select", "admin-select");
  statusSelect.id = "certificate-status-filter";
  statusLabel.htmlFor = statusSelect.id;

  [
    { value: "all", label: t("common.all") },
    { value: "draft", label: t("status.draft") },
    { value: "published", label: t("status.published") },
    { value: "archived", label: t("status.archived") },
    { value: "trash", label: t("certificates.trash") }
  ].forEach(option => {
    const node = el("option", null, option.label);
    node.value = option.value;
    append(statusSelect, node);
  });

  statusSelect.addEventListener("change", () => {
    state.filters.status = statusSelect.value;
    closeMenu();
    renderList();
  });

  append(statusField, statusLabel, statusSelect);

  const categoryField = el("div", "toolbar-field");
  const categoryLabelNode = el("label", "toolbar-label", t("common.category"));
  const categorySelect = el("select", "admin-select");
  categorySelect.id = "certificate-category-filter";
  categoryLabelNode.htmlFor = categorySelect.id;

  const allOption = el("option", null, t("common.all"));
  allOption.value = "all";
  append(categorySelect, allOption);

  CERTIFICATE_CATEGORIES.forEach(entry => {
    const node = el("option", null, categoryLabel(entry.key));
    node.value = entry.key;
    append(categorySelect, node);
  });

  categorySelect.addEventListener("change", () => {
    state.filters.category = categorySelect.value;
    closeMenu();
    renderList();
  });

  append(categoryField, categoryLabelNode, categorySelect);
  append(toolbar, searchField, statusField, categoryField);

  const bannerSlot = el("div", "cert-minimum-slot");
  const listSlot = el("div", "table-slot");
  append(root, bannerSlot, toolbar, listSlot);

  /* ---------------- data ---------------- */

  async function load() {
    state.status = "loading";
    renderList();

    const { data, error } = await supabaseClient
      .from("certificates")
      .select(SELECT_COLUMNS)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      state.status = "error";
      renderList();
      return;
    }

    state.rows = data || [];
    state.status = "ready";
    renderList();

    if (typeof onChanged === "function") {
      onChanged();
    }
  }

  function isTrashView() {
    return state.filters.status === "trash";
  }

  function filtersActive() {
    return (
      state.filters.search.trim() !== "" ||
      state.filters.status !== "all" ||
      state.filters.category !== "all"
    );
  }

  function activeRows() {
    return state.rows.filter(row => !row.deleted_at);
  }

  function publishedRows() {
    return state.rows.filter(row => row.status === "published" && !row.deleted_at);
  }

  function publishedCount() {
    return publishedRows().length;
  }

  /*
    See the header note: below the minimum the latch cannot have armed, at or
    above it the latch is armed, so the count alone tells us which regime we
    are in.
  */
  function minimumIsLatched() {
    return publishedCount() >= MINIMUM_PUBLISHED;
  }

  /* True when taking this row off the public site would break the rule. */
  function wouldBreakMinimum(row) {
    if (row.deleted_at || row.status !== "published") {
      return false;
    }

    return minimumIsLatched() && publishedCount() <= MINIMUM_PUBLISHED;
  }

  function visibleRows() {
    const term = state.filters.search.trim().toLowerCase();

    let base = isTrashView()
      ? state.rows.filter(row => row.deleted_at)
      : activeRows().filter(row =>
          state.filters.status === "all" ? true : row.status === state.filters.status
        );

    if (state.filters.category !== "all") {
      base = base.filter(row => row.category === state.filters.category);
    }

    if (term === "") {
      return base;
    }

    return base.filter(row =>
      ["title", "publisher", "period", "issuer_line", "badge_text"].some(key =>
        String(row[key] || "").toLowerCase().includes(term)
      )
    );
  }

  /* ---------------- minimum banner ---------------- */

  function renderBanner() {
    clear(bannerSlot);

    if (state.status !== "ready") {
      return;
    }

    const count = publishedCount();
    const latched = minimumIsLatched();
    const atMinimum = latched && count === MINIMUM_PUBLISHED;

    const panel = el(
      "div",
      atMinimum
        ? "admin-alert admin-alert-warning cert-minimum"
        : "admin-alert cert-minimum"
    );

    /*
      The headline states the situation and the rule in one breath, because
      "3 of 3" on its own does not tell the owner what happens next.
    */
    append(
      panel,
      el("p", "cert-minimum-count", String(count)),
      el(
        "p",
        "admin-alert-title",
        t(
          count === 1
            ? "certificates.visibleCountOne"
            : "certificates.visibleCount",
          { count, min: MINIMUM_PUBLISHED }
        )
      )
    );

    if (!latched) {
      append(
        panel,
        el(
          "p",
          "admin-alert-text",
          t("certificates.setupHint", { min: MINIMUM_PUBLISHED })
        )
      );
    } else if (atMinimum) {
      append(panel, el("p", "admin-alert-text", t("certificates.atMinimum")));
    } else {
      append(
        panel,
        el(
          "p",
          "admin-alert-text",
          t("certificates.headroom", { count: count - MINIMUM_PUBLISHED })
        )
      );
    }

    append(bannerSlot, panel);
  }

  /* ---------------- rendering ---------------- */

  function renderList() {
    closeMenu();
    renderBanner();
    clear(listSlot);

    if (state.status === "loading") {
      append(listSlot, el("p", "loading-text", t("certificates.loading")));
      return;
    }

    if (state.status === "error") {
      append(listSlot, buildErrorPanel());
      return;
    }

    const rows = visibleRows();

    if (isTrashView() && rows.length === 0) {
      append(
        listSlot,
        emptyState({
          title: t("certificates.emptyTrashTitle"),
          description: t("certificates.emptyTrashHelp")
        })
      );
      return;
    }

    if (!isTrashView() && activeRows().length === 0) {
      append(
        listSlot,
        emptyState({
          title: t("certificates.emptyTitle"),
          description: t("certificates.emptyHelp")
        })
      );
      return;
    }

    if (rows.length === 0) {
      append(
        listSlot,
        emptyState({
          title: t("certificates.emptyFilterTitle"),
          description: t("certificates.emptyFilterHelp")
        })
      );
      return;
    }

    append(listSlot, buildTable(rows));

    append(
      listSlot,
      el(
        "p",
        "table-summary",
        isTrashView()
          ? t("certificates.summaryTrash", { count: rows.length })
          : t("certificates.summary", {
              shown: rows.length,
              total: activeRows().length
            })
      )
    );

    if (!isTrashView() && filtersActive()) {
      append(
        listSlot,
        el("p", "table-note", t("certificates.reorderNote"))
      );
    }
  }

  function buildErrorPanel() {
    const panel = el("div", "admin-alert admin-alert-error");
    panel.setAttribute("role", "alert");

    append(
      panel,
      el("p", "admin-alert-title", t("certificates.loadError")),
      el("p", "admin-alert-text", t("certificates.loadErrorHelp"))
    );

    const retry = el(
      "button",
      "admin-button admin-button-secondary",
      t("common.tryAgain")
    );
    retry.type = "button";
    retry.addEventListener("click", load);
    append(panel, retry);

    return panel;
  }

  function buildTable(rows) {
    const wrap = el("div", "admin-table-wrap");
    const table = el("table", "admin-table admin-table-certificates");

    const thead = el("thead");
    const headRow = el("tr");

    const columns = [
      t("certificates.colCertificate"),
      t("common.category"),
      t("common.status"),
      isTrashView() ? t("common.deleted") : t("common.updated")
    ];

    columns.forEach(label => {
      const cellNode = el("th", null, label);
      cellNode.scope = "col";
      append(headRow, cellNode);
    });

    const actionsHead = el("th");
    actionsHead.scope = "col";
    append(actionsHead, el("span", "visually-hidden", t("common.actions")));
    append(headRow, actionsHead);

    append(thead, headRow);
    append(table, thead);

    const tbody = el("tbody");
    rows.forEach(row => append(tbody, buildRow(row)));
    append(table, tbody);

    append(wrap, table);

    return wrap;
  }

  function cell(label) {
    const node = el("td");
    node.dataset.label = label;
    return node;
  }

  function buildRow(row) {
    const item = el("tr");

    if (row.status === "archived") {
      item.classList.add("is-muted-row");
    }

    const titleCell = cell(t("certificates.colCertificate"));
    titleCell.classList.add("cell-primary");
    append(
      titleCell,
      el("span", "row-title", row.title || t("certificates.untitled"))
    );

    const subtitleParts = [row.publisher, row.period].filter(Boolean);

    if (subtitleParts.length > 0) {
      append(titleCell, el("span", "row-subtle", subtitleParts.join(" · ")));
    }

    const categoryCell = cell(t("common.category"));
    const categoryWrap = el("div", "cert-category-cell");
    append(
      categoryWrap,
      buildCategoryIcon(row.category, "cert-category-icon"),
      el("span", null, categoryLabel(row.category))
    );
    append(categoryCell, categoryWrap);

    const statusCell = cell(t("common.status"));
    append(statusCell, statusBadge(row.status));

    const timeCell = cell(isTrashView() ? t("common.deleted") : t("common.updated"));
    append(timeCell, updatedAt(isTrashView() ? row.deleted_at : row.updated_at));

    /* cell-actions is the shared class the other three lists use: it sets the
       column width here and pins the menu top-right once the table collapses
       into cards below 900px. */
    const actionsCell = el("td", "cell-actions");
    append(actionsCell, buildActionsMenu(row));

    append(item, titleCell, categoryCell, statusCell, timeCell, actionsCell);

    return item;
  }

  function buildActionsMenu(row) {
    const wrap = el("div", "row-actions");

    const trigger = el("button", "icon-button", "⋯");
    trigger.type = "button";
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute(
      "aria-label",
      t("certificates.actionsFor", { title: rowTitle(row) })
    );

    trigger.addEventListener("click", () => {
      const isOpen = wrap.classList.contains("is-open");
      closeMenu();

      if (!isOpen) {
        openMenu();
      }
    });

    append(wrap, trigger);

    function openMenu() {
      const menu = el("div", "row-menu");
      menu.setAttribute("role", "menu");

      const entries = isTrashView() ? trashEntries(row) : normalEntries(row);
      const buttons = [];

      entries.forEach(entry => {
        const button = el("button", "row-menu-item", entry.label);
        button.type = "button";
        button.setAttribute("role", "menuitem");

        if (entry.danger) {
          button.classList.add("is-danger");
        }

        if (entry.disabled) {
          button.disabled = true;

          if (entry.hint) {
            button.title = entry.hint;
          }
        } else {
          button.addEventListener("click", () => {
            closeMenu();
            entry.onSelect();
          });
        }

        buttons.push(button);
        append(menu, button);
      });

      menu.addEventListener("keydown", event => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
          return;
        }

        event.preventDefault();

        const enabled = buttons.filter(button => !button.disabled);

        if (enabled.length === 0) {
          return;
        }

        const current = enabled.indexOf(document.activeElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        enabled[(current + step + enabled.length) % enabled.length].focus();
      });

      append(wrap, menu);
      wrap.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");

      const first = buttons.find(button => !button.disabled);

      if (first) {
        first.focus();
      }

      closeOpenMenu = () => {
        const focusWasInMenu = menu.contains(document.activeElement);
        menu.remove();
        wrap.classList.remove("is-open");
        trigger.setAttribute("aria-expanded", "false");

        if (focusWasInMenu && document.contains(trigger)) {
          trigger.focus();
        }
      };
    }

    return wrap;
  }

  function normalEntries(row) {
    const canReorder = !filtersActive();
    const ordered = activeRows();
    const orderedIndex = ordered.findIndex(entry => entry.id === row.id);
    const blocked = wouldBreakMinimum(row);

    const documentHref = documentUrl(row.document_bucket, row.document_path);

    const entries = [
      { label: t("common.edit"), onSelect: () => onEdit(row.id) },
      { label: t("common.preview"), onSelect: () => previewRow(row) },
      {
        label: t("certificates.viewDocument"),
        disabled: !documentHref,
        hint: documentHref ? null : t("certificates.noDocument"),
        /* New tab, never an iframe: the site CSP sets frame-src 'none' and
           object-src 'none', and an embedded viewer would mean relaxing both. */
        onSelect: () => window.open(documentHref, "_blank", "noopener,noreferrer")
      },
      {
        label: t("action.moveUp"),
        disabled: !canReorder || orderedIndex <= 0,
        hint: canReorder ? null : t("certificates.reorderHint"),
        onSelect: () => move(orderedIndex, -1)
      },
      {
        label: t("action.moveDown"),
        disabled: !canReorder || orderedIndex === -1 || orderedIndex >= ordered.length - 1,
        hint: canReorder ? null : t("certificates.reorderHint"),
        onSelect: () => move(orderedIndex, 1)
      }
    ];

    if (row.status === "published") {
      entries.push({
        label: t("action.hide"),
        disabled: blocked,
        hint: blocked ? minimumHint() : null,
        onSelect: () => hide(row)
      });
    } else if (row.status === "draft") {
      entries.push({ label: t("action.show"), onSelect: () => show(row) });
    }

    if (row.status === "archived") {
      entries.push({
        label: t("action.restoreDraft"),
        onSelect: () => restoreToDraft(row)
      });
    } else {
      entries.push({
        label: t("action.archive"),
        disabled: blocked,
        hint: blocked ? minimumHint() : null,
        onSelect: () => archive(row)
      });
    }

    entries.push({
      label: t("action.moveToTrash"),
      danger: true,
      disabled: blocked,
      hint: blocked ? minimumHint() : null,
      onSelect: () => moveToTrash(row)
    });

    return entries;
  }

  function trashEntries(row) {
    return [
      { label: t("common.preview"), onSelect: () => previewRow(row) },
      { label: t("action.restore"), onSelect: () => restoreFromTrash(row) },
      {
        label: t("action.deletePermanently"),
        danger: true,
        onSelect: () => permanentlyDelete(row)
      }
    ];
  }

  function previewRow(row) {
    openCertificatePreview({
      title: row.title,
      publisher: row.publisher,
      period: row.period,
      category: row.category,
      issuerLine: row.issuer_line,
      badgeText: row.badge_text,
      description: row.description,
      documentUrl: documentUrl(row.document_bucket, row.document_path),
      externalUrl: row.external_url
    });
  }

  /* ---------------- mutations ---------------- */

  function setBusy(next) {
    state.busy = next;
    root.classList.toggle("is-busy", next);
  }

  /*
    The database raises check_violation from the minimum-published trigger.
    That is the authority, and the owner should see the real reason rather
    than a generic failure, so it is surfaced verbatim-ish here.
  */
  function failureMessage(error, fallback) {
    if (error && error.code === "23514" && /at least 3/i.test(error.message || "")) {
      return minimumHint();
    }

    return fallback;
  }

  async function applyPatch(row, patch, successMessage, fallbackMessage) {
    if (state.busy) {
      return false;
    }

    setBusy(true);

    const { data, error } = await supabaseClient
      .from("certificates")
      .update(patch)
      .eq("id", row.id)
      .select("id");

    setBusy(false);

    if (error || !data || data.length === 0) {
      if (error) {
        console.error(error);
      }

      toast(failureMessage(error, fallbackMessage), "error");
      await load();
      return false;
    }

    toast(successMessage);
    await load();
    return true;
  }

  async function show(row) {
    const patch = { status: "published", archived_at: null };

    /* published_at records the FIRST publish and must survive a hide/show
       cycle, so it is only ever set when absent. */
    if (!row.published_at) {
      patch.published_at = new Date().toISOString();
    }

    await applyPatch(
      row,
      patch,
      t("certificates.toastShown"),
      t("certificates.errShow")
    );
  }

  async function hide(row) {
    const confirmed = await confirmDialog({
      title: t("certificates.hideTitle", { title: rowTitle(row) }),
      lines: [t("certificates.hideLine1"), t("certificates.hideLine2")],
      confirmLabel: t("action.hide"),
      variant: "danger"
    });

    if (!confirmed) {
      return;
    }

    await applyPatch(
      row,
      { status: "draft", archived_at: null },
      t("certificates.toastHidden"),
      t("certificates.errHide")
    );
  }

  async function archive(row) {
    const confirmed = await confirmDialog({
      title: t("certificates.archiveTitle", { title: rowTitle(row) }),
      lines: [t("certificates.archiveLine1"), t("certificates.archiveLine2")],
      confirmLabel: t("action.archive"),
      variant: "danger"
    });

    if (!confirmed) {
      return;
    }

    await applyPatch(
      row,
      { status: "archived", archived_at: new Date().toISOString() },
      t("certificates.toastArchived"),
      t("certificates.errArchive")
    );
  }

  async function restoreToDraft(row) {
    await applyPatch(
      row,
      { status: "draft", archived_at: null },
      t("certificates.toastRestoredDraft"),
      t("certificates.errRestore")
    );
  }

  async function moveToTrash(row) {
    const confirmed = await confirmDialog({
      title: t("certificates.trashTitle", { title: rowTitle(row) }),
      lines: [t("certificates.trashLine1"), t("certificates.trashLine2")],
      confirmLabel: t("action.moveToTrash"),
      variant: "danger"
    });

    if (!confirmed) {
      return;
    }

    await applyPatch(
      row,
      { deleted_at: new Date().toISOString() },
      t("certificates.toastTrashed"),
      t("certificates.errTrash")
    );
  }

  async function restoreFromTrash(row) {
    /* Restored content never returns public on its own. */
    await applyPatch(
      row,
      { deleted_at: null, status: "draft", archived_at: null },
      t("certificates.toastRestored"),
      t("certificates.errRestore")
    );
  }

  async function permanentlyDelete(row) {
    const confirmed = await typedDeleteConfirm(row);

    if (!confirmed || state.busy) {
      return;
    }

    setBusy(true);

    const { data, error } = await supabaseClient
      .from("certificates")
      .delete()
      .eq("id", row.id)
      .select("id");

    setBusy(false);

    if (error || !data || data.length === 0) {
      if (error) {
        console.error(error);
      }

      toast(failureMessage(error, t("certificates.errDelete")), "error");
      await load();
      return;
    }

    /*
      Row first, object second. The row is gone, so a lingering object is only
      recoverable noise; deleting the file first and then failing the row would
      leave a record pointing at nothing.

      Trash deliberately does NOT do this — a soft-deleted certificate keeps
      its document so Restore brings back a complete record.
    */
    if (row.document_path) {
      const removed = await removeDocument(row.document_bucket, row.document_path);

      if (removed.failed.length > 0) {
        toast(t("certificates.docCleanupWarning"), "error");
        await load();
        return;
      }
    }

    toast(t("certificates.toastDeleted"));
    await load();
  }

  function typedDeleteConfirm(row) {
    return new Promise(resolve => {
      let settled = false;

      const body = el("div", "confirm-body");

      append(
        body,
        el("p", "confirm-line", rowTitle(row)),
        el("p", "confirm-line", t("certificates.deleteLine"))
      );

      const field = textField({
        id: "certificate-delete-confirm",
        label: t("certificates.deleteConfirmLabel"),
        value: "",
        maxLength: 10
      });

      append(body, field.node);

      openModal({
        title: t("certificates.deleteTitle"),
        body,
        size: "small",
        actions: [
          {
            label: t("common.cancel"),
            variant: "secondary",
            onClick: ctl => {
              settle(false);
              ctl.close();
            }
          },
          {
            label: t("action.deletePermanently"),
            variant: "danger",
            onClick: ctl => {
              if (trimmed(field.value) !== "DELETE") {
                field.setError(t("certificates.deleteConfirmError"));
                field.focus();
                return;
              }

              settle(true);
              ctl.close();
            }
          }
        ],
        onClosed: () => settle(false)
      });

      field.control.addEventListener("input", () => field.setError(""));
      field.focus();

      function settle(value) {
        if (settled) {
          return;
        }

        settled = true;
        resolve(value);
      }
    });
  }

  /*
    Reorder normalises the whole active list to a dense 0..n-1 sequence and
    writes only the rows whose position actually changed, so gaps or duplicate
    sort_order values cannot accumulate. Publication status is never part of
    the patch.
  */
  async function move(index, direction) {
    const ordered = activeRows();
    const target = index + direction;

    if (state.busy || index < 0 || target < 0 || target >= ordered.length) {
      return;
    }

    const reordered = ordered.slice();
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);

    const updates = [];

    reordered.forEach((row, position) => {
      if (Number(row.sort_order) !== position) {
        updates.push({ id: row.id, sort_order: position });
      }
    });

    if (updates.length === 0) {
      return;
    }

    setBusy(true);

    for (const update of updates) {
      const { data, error } = await supabaseClient
        .from("certificates")
        .update({ sort_order: update.sort_order })
        .eq("id", update.id)
        .select("id");

      if (error || !data || data.length === 0) {
        if (error) {
          console.error(error);
        }

        setBusy(false);
        toast(t("certificates.errOrder"), "error");
        await load();
        return;
      }
    }

    setBusy(false);
    toast(t("certificates.toastOrder"));
    await load();
  }

  return {
    element: root,
    load,
    destroy() {
      closeMenu();
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeydown);
      clear(root);
    }
  };
}
