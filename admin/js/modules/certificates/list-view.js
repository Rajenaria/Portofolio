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

const MINIMUM_HINT =
  "At least 3 certificates must remain visible on the public site.";

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
  const searchLabel = el("label", "toolbar-label", "Search");
  const searchInput = el("input", "admin-input");
  searchInput.type = "search";
  searchInput.id = "certificate-search";
  searchInput.placeholder = "Search certificates...";
  searchInput.autocomplete = "off";
  searchLabel.htmlFor = searchInput.id;

  searchInput.addEventListener("input", () => {
    state.filters.search = searchInput.value;
    closeMenu();
    renderList();
  });

  append(searchField, searchLabel, searchInput);

  const statusField = el("div", "toolbar-field");
  const statusLabel = el("label", "toolbar-label", "Status");
  const statusSelect = el("select", "admin-select");
  statusSelect.id = "certificate-status-filter";
  statusLabel.htmlFor = statusSelect.id;

  [
    { value: "all", label: "All" },
    { value: "draft", label: "Draft" },
    { value: "published", label: "Published" },
    { value: "archived", label: "Archived" },
    { value: "trash", label: "Trash" }
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
  const categoryLabelNode = el("label", "toolbar-label", "Category");
  const categorySelect = el("select", "admin-select");
  categorySelect.id = "certificate-category-filter";
  categoryLabelNode.htmlFor = categorySelect.id;

  const allOption = el("option", null, "All");
  allOption.value = "all";
  append(categorySelect, allOption);

  CERTIFICATE_CATEGORIES.forEach(entry => {
    const node = el("option", null, entry.label);
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

    const panel = el(
      "div",
      latched && count === MINIMUM_PUBLISHED
        ? "admin-alert admin-alert-warning cert-minimum"
        : "admin-alert cert-minimum"
    );

    append(
      panel,
      el(
        "p",
        "admin-alert-title",
        `Published certificates: ${count} · minimum for the public carousel: ${MINIMUM_PUBLISHED}`
      )
    );

    if (!latched) {
      append(
        panel,
        el(
          "p",
          "admin-alert-text",
          `Certificate CMS setup — publish at least ${MINIMUM_PUBLISHED} certificates before the public carousel can use CMS data. Until then you can freely publish and unpublish.`
        )
      );
    } else if (count === MINIMUM_PUBLISHED) {
      append(
        panel,
        el(
          "p",
          "admin-alert-text",
          `You are at the minimum. Hide, Archive and Trash are unavailable for published certificates until you publish another one. ${MINIMUM_HINT}`
        )
      );
    } else {
      append(
        panel,
        el(
          "p",
          "admin-alert-text",
          `You can take ${count - MINIMUM_PUBLISHED} more off the public site before reaching the minimum.`
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
      append(listSlot, el("p", "loading-text", "Loading certificates..."));
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
          title: "Trash is empty.",
          description:
            "Certificates you move to Trash appear here and can be restored."
        })
      );
      return;
    }

    if (!isTrashView() && activeRows().length === 0) {
      append(
        listSlot,
        emptyState({
          title: "No certificates yet.",
          description:
            "Add your first certificate to start building the public carousel."
        })
      );
      return;
    }

    if (rows.length === 0) {
      append(
        listSlot,
        emptyState({
          title: "No certificates match your filters.",
          description: "Try another search term, status or category."
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
          ? `${rows.length} in Trash`
          : `${rows.length} of ${activeRows().length} certificates`
      )
    );

    if (!isTrashView() && filtersActive()) {
      append(
        listSlot,
        el(
          "p",
          "table-note",
          "Move Up and Move Down are available when no search or filter is active, because ordering applies to the whole list."
        )
      );
    }
  }

  function buildErrorPanel() {
    const panel = el("div", "admin-alert admin-alert-error");
    panel.setAttribute("role", "alert");

    append(
      panel,
      el("p", "admin-alert-title", "Could not load certificates."),
      el("p", "admin-alert-text", "Check your connection and try again.")
    );

    const retry = el("button", "admin-button admin-button-secondary", "Try Again");
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

    const columns = isTrashView()
      ? ["Certificate", "Category", "Status", "Deleted"]
      : ["Certificate", "Category", "Status", "Updated"];

    columns.forEach(label => {
      const cellNode = el("th", null, label);
      cellNode.scope = "col";
      append(headRow, cellNode);
    });

    const actionsHead = el("th");
    actionsHead.scope = "col";
    append(actionsHead, el("span", "visually-hidden", "Actions"));
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

    const titleCell = cell("Certificate");
    append(titleCell, el("span", "row-title", row.title || "Untitled certificate"));

    const subtitleParts = [row.publisher, row.period].filter(Boolean);

    if (subtitleParts.length > 0) {
      append(titleCell, el("span", "row-subtle", subtitleParts.join(" · ")));
    }

    const categoryCell = cell("Category");
    const categoryWrap = el("div", "cert-category-cell");
    append(
      categoryWrap,
      buildCategoryIcon(row.category, "cert-category-icon"),
      el("span", null, categoryLabel(row.category))
    );
    append(categoryCell, categoryWrap);

    const statusCell = cell("Status");
    append(statusCell, statusBadge(row.status));

    const timeCell = cell(isTrashView() ? "Deleted" : "Updated");
    append(timeCell, updatedAt(isTrashView() ? row.deleted_at : row.updated_at));

    const actionsCell = el("td", "row-actions-cell");
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
    trigger.setAttribute("aria-label", `Actions for ${row.title || "certificate"}`);

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
      { label: "Edit", onSelect: () => onEdit(row.id) },
      { label: "Preview", onSelect: () => previewRow(row) },
      {
        label: "View Certificate",
        disabled: !documentHref,
        hint: documentHref ? null : "No document uploaded yet.",
        /* New tab, never an iframe: the site CSP sets frame-src 'none' and
           object-src 'none', and an embedded viewer would mean relaxing both. */
        onSelect: () => window.open(documentHref, "_blank", "noopener,noreferrer")
      },
      {
        label: "Move Up",
        disabled: !canReorder || orderedIndex <= 0,
        hint: canReorder ? null : "Clear search and filters to reorder.",
        onSelect: () => move(orderedIndex, -1)
      },
      {
        label: "Move Down",
        disabled: !canReorder || orderedIndex === -1 || orderedIndex >= ordered.length - 1,
        hint: canReorder ? null : "Clear search and filters to reorder.",
        onSelect: () => move(orderedIndex, 1)
      }
    ];

    if (row.status === "published") {
      entries.push({
        label: "Hide from public site",
        disabled: blocked,
        hint: blocked ? MINIMUM_HINT : null,
        onSelect: () => hide(row)
      });
    } else if (row.status === "draft") {
      entries.push({ label: "Show on public site", onSelect: () => show(row) });
    }

    if (row.status === "archived") {
      entries.push({ label: "Restore to Draft", onSelect: () => restoreToDraft(row) });
    } else {
      entries.push({
        label: "Archive",
        disabled: blocked,
        hint: blocked ? MINIMUM_HINT : null,
        onSelect: () => archive(row)
      });
    }

    entries.push({
      label: "Move to Trash",
      danger: true,
      disabled: blocked,
      hint: blocked ? MINIMUM_HINT : null,
      onSelect: () => moveToTrash(row)
    });

    return entries;
  }

  function trashEntries(row) {
    return [
      { label: "Preview", onSelect: () => previewRow(row) },
      { label: "Restore", onSelect: () => restoreFromTrash(row) },
      {
        label: "Delete Permanently",
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
      return MINIMUM_HINT;
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
      "Certificate is now visible on the public site.",
      "Could not show this certificate."
    );
  }

  async function hide(row) {
    const confirmed = await confirmDialog({
      title: `Hide "${row.title || "this certificate"}"?`,
      lines: [
        "This certificate returns to Draft and will no longer appear on the public site.",
        "Nothing is deleted — its content and position are kept, and you can show it again at any time."
      ],
      confirmLabel: "Hide from public site",
      variant: "danger"
    });

    if (!confirmed) {
      return;
    }

    await applyPatch(
      row,
      { status: "draft", archived_at: null },
      "Certificate hidden from the public site.",
      "Could not hide this certificate."
    );
  }

  async function archive(row) {
    const confirmed = await confirmDialog({
      title: `Archive "${row.title || "this certificate"}"?`,
      lines: [
        "Archived certificates do not appear on the public site.",
        "The record is kept and can be restored to Draft later."
      ],
      confirmLabel: "Archive",
      variant: "danger"
    });

    if (!confirmed) {
      return;
    }

    await applyPatch(
      row,
      { status: "archived", archived_at: new Date().toISOString() },
      "Certificate archived.",
      "Could not archive this certificate."
    );
  }

  async function restoreToDraft(row) {
    await applyPatch(
      row,
      { status: "draft", archived_at: null },
      "Certificate restored to draft.",
      "Could not restore this certificate."
    );
  }

  async function moveToTrash(row) {
    const confirmed = await confirmDialog({
      title: `Move "${row.title || "this certificate"}" to Trash?`,
      lines: [
        "The certificate is removed from the public site and from the main list.",
        "You can restore it from Trash, or delete it permanently from there."
      ],
      confirmLabel: "Move to Trash",
      variant: "danger"
    });

    if (!confirmed) {
      return;
    }

    await applyPatch(
      row,
      { deleted_at: new Date().toISOString() },
      "Certificate moved to Trash.",
      "Could not move this certificate to Trash."
    );
  }

  async function restoreFromTrash(row) {
    /* Restored content never returns public on its own. */
    await applyPatch(
      row,
      { deleted_at: null, status: "draft", archived_at: null },
      "Certificate restored as a draft.",
      "Could not restore this certificate."
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

      toast(
        failureMessage(error, "Could not delete this certificate."),
        "error"
      );
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
        toast(
          "Certificate deleted. Its document file could not be removed and may need manual cleanup.",
          "error"
        );
        await load();
        return;
      }
    }

    toast("Certificate deleted permanently.");
    await load();
  }

  function typedDeleteConfirm(row) {
    return new Promise(resolve => {
      let settled = false;

      const body = el("div", "confirm-body");

      append(
        body,
        el("p", "confirm-line", row.title || "This certificate"),
        el(
          "p",
          "confirm-line",
          "This permanently removes the certificate. This action cannot be undone."
        )
      );

      const field = textField({
        id: "certificate-delete-confirm",
        label: "Type DELETE to confirm",
        value: "",
        maxLength: 10
      });

      append(body, field.node);

      openModal({
        title: "Delete permanently?",
        body,
        size: "small",
        actions: [
          {
            label: "Cancel",
            variant: "secondary",
            onClick: ctl => {
              settle(false);
              ctl.close();
            }
          },
          {
            label: "Delete Permanently",
            variant: "danger",
            onClick: ctl => {
              if (trimmed(field.value) !== "DELETE") {
                field.setError("Type DELETE exactly to confirm.");
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
        toast("Could not change the order. Please try again.", "error");
        await load();
        return;
      }
    }

    setBusy(false);
    toast("Order updated.");
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
