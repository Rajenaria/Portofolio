/*
  Experience list (Phase 7).

  Shows every non-deleted Experience ordered by sort_order ASC, created_at ASC,
  plus a separate Trash view for rows with deleted_at set. Columns are built
  only from columns that actually exist in public.experiences — there is no
  organization or period column in the schema, so the list shows
  Title / Type / Role / Location / Status / Updated.

  STATUS LIFECYCLE (matches the experiences_status_check constraint)

      draft  --Publish-->  published
      draft/published  --Archive-->  archived
      archived  --Restore-->  draft
      any  --Move to Trash-->  deleted_at = now()
      trash  --Restore-->  deleted_at = null, status = draft
      trash  --Delete Permanently-->  DELETE (tags cascade via FK)

  SECURITY: authorization is RLS (owner + aal2). Every value is rendered with
  createElement + textContent; there is no innerHTML path and no Storage call.
*/

import { supabaseClient } from "../../core/supabase.js";

import {
  el,
  append,
  clear,
  statusBadge,
  updatedAt,
  emptyState
} from "../../core/dom.js";

import { openModal, confirmDialog } from "../../core/modal.js";
import { toast } from "../../core/toast.js";
import { textField, trimmed } from "../../core/form.js";
import { t } from "../../core/i18n.js";
import { openRowMenu, closeRowMenu } from "../../core/row-menu.js";

/* Resolved at call time so a language switch mid-list relabels everything. */
function rowTitle(row) {
  return row.title || t("exp.thisOne");
}
import { openExperiencePreview } from "./preview.js";

const SELECT_COLUMNS =
  "id, type, title, role, location, description, status, sort_order, published_at, archived_at, deleted_at, created_at, updated_at";

export function createExperienceList({ onEdit, onCreate, onChanged }) {
  const root = el("div", "experience-list-view");

  const state = {
    rows: [],
    tagsByExperience: new Map(),
    filters: { search: "", status: "all" },
    status: "loading",
    busy: false
  };

  function closeMenu() {
    closeRowMenu();
  }

  /* ---------------- toolbar ---------------- */

  const toolbar = el("div", "admin-toolbar");

  const searchField = el("div", "toolbar-field toolbar-field-search");
  const searchLabel = el("label", "toolbar-label", t("common.search"));
  const searchInput = el("input", "admin-input");
  searchInput.type = "search";
  searchInput.id = "experience-search";
  searchInput.placeholder = t("exp.searchPlaceholder");
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
  statusSelect.id = "experience-status-filter";
  statusLabel.htmlFor = statusSelect.id;

  [
    { value: "all", label: t("common.all") },
    { value: "draft", label: t("status.draft") },
    { value: "published", label: t("status.published") },
    { value: "archived", label: t("status.archived") },
    { value: "trash", label: t("exp.trash") }
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
  append(toolbar, searchField, statusField);

  const listSlot = el("div", "table-slot");
  append(root, toolbar, listSlot);

  /* ---------------- data ---------------- */

  async function load() {
    state.status = "loading";
    renderList();

    const [experiences, tags] = await Promise.all([
      supabaseClient
        .from("experiences")
        .select(SELECT_COLUMNS)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),

      supabaseClient
        .from("experience_tags")
        .select("id, experience_id, label, sort_order")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
    ]);

    if (experiences.error || tags.error) {
      console.error(experiences.error || tags.error);
      state.status = "error";
      renderList();
      return;
    }

    state.rows = experiences.data || [];

    state.tagsByExperience = new Map();
    (tags.data || []).forEach(tag => {
      const list = state.tagsByExperience.get(tag.experience_id) || [];
      list.push(tag);
      state.tagsByExperience.set(tag.experience_id, list);
    });

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
    return state.filters.search.trim() !== "" || state.filters.status !== "all";
  }

  function activeRows() {
    return state.rows.filter(row => !row.deleted_at);
  }

  function visibleRows() {
    const term = state.filters.search.trim().toLowerCase();

    const base = isTrashView()
      ? state.rows.filter(row => row.deleted_at)
      : activeRows().filter(row =>
          state.filters.status === "all" ? true : row.status === state.filters.status
        );

    if (term === "") {
      return base;
    }

    return base.filter(row =>
      ["title", "type", "role", "location"].some(key =>
        String(row[key] || "").toLowerCase().includes(term)
      )
    );
  }

  /* ---------------- rendering ---------------- */

  function renderList() {
    closeMenu();
    clear(listSlot);

    if (state.status === "loading") {
      append(listSlot, el("p", "loading-text", t("exp.loading")));
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
          title: t("exp.emptyTrashTitle"),
          description: t("exp.emptyTrashHelp")
        })
      );
      return;
    }

    if (!isTrashView() && activeRows().length === 0) {
      append(
        listSlot,
        emptyState({
          title: t("exp.emptyTitle"),
          description: t("exp.emptyHelp")
        })
      );
      return;
    }

    if (rows.length === 0) {
      append(
        listSlot,
        emptyState({
          title: t("exp.emptyFilterTitle"),
          description: t("list.filtersEmptyHelp")
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
          ? t("exp.summaryTrash", { count: rows.length })
          : t("exp.summary", { shown: rows.length, total: activeRows().length })
      )
    );

    if (!isTrashView() && filtersActive()) {
      append(
        listSlot,
        el("p", "table-note", t("list.reorderNote"))
      );
    }
  }

  function buildErrorPanel() {
    const panel = el("div", "admin-alert admin-alert-error");
    panel.setAttribute("role", "alert");

    append(
      panel,
      el("p", "admin-alert-title", t("exp.loadError")),
      el("p", "admin-alert-text", t("list.loadErrorHelp"))
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
    const table = el("table", "admin-table admin-table-experiences");

    const thead = el("thead");
    const headRow = el("tr");

    const columns = isTrashView()
      ? [
          t("exp.colExperience"),
          t("common.type"),
          t("common.status"),
          t("common.deleted")
        ]
      : [
          t("exp.colExperience"),
          t("common.type"),
          t("common.role"),
          t("common.location"),
          t("common.status"),
          t("common.updated")
        ];

    columns.forEach(label => {
      const cell = el("th", null, label);
      cell.scope = "col";
      append(headRow, cell);
    });

    const actionsHead = el("th");
    actionsHead.scope = "col";
    append(actionsHead, el("span", "visually-hidden", t("common.actions")));
    append(headRow, actionsHead);

    append(thead, headRow);
    append(table, thead);

    const tbody = el("tbody");
    rows.forEach((row, index) => append(tbody, buildRow(row, index, rows)));
    append(table, tbody);

    append(wrap, table);

    return wrap;
  }

  function cell(label) {
    const node = el("td");
    node.dataset.label = label;
    return node;
  }

  function buildRow(row, index, visible) {
    const item = el("tr");

    if (row.status === "archived") {
      item.classList.add("is-muted-row");
    }

    const titleCell = cell(t("exp.colExperience"));
    titleCell.classList.add("cell-primary");
    append(titleCell, el("span", "row-title", row.title || t("exp.untitled")));

    if (row.description) {
      append(
        titleCell,
        el("span", "row-subtle", truncateForDisplay(row.description))
      );
    }

    append(item, titleCell);

    const typeCell = cell(t("common.type"));
    append(
      typeCell,
      row.type
        ? el("span", "type-badge", row.type)
        : el("span", "row-subtle", t("common.none"))
    );
    append(item, typeCell);

    if (!isTrashView()) {
      const roleCell = cell(t("common.role"));
      append(roleCell, el("span", null, row.role || t("common.none")));
      append(item, roleCell);

      const locationCell = cell(t("common.location"));
      append(locationCell, el("span", null, row.location || t("common.none")));
      append(item, locationCell);
    }

    const statusCell = cell(t("common.status"));
    append(statusCell, statusBadge(row.status));
    append(item, statusCell);

    const timeCell = cell(isTrashView() ? t("common.deleted") : t("common.updated"));
    append(timeCell, updatedAt(isTrashView() ? row.deleted_at : row.updated_at));
    append(item, timeCell);

    const actionsCell = cell(t("common.actions"));
    actionsCell.className = "cell-actions";
    append(actionsCell, buildActionsMenu(row, index, visible));
    append(item, actionsCell);

    return item;
  }

  function truncateForDisplay(text) {
    const value = String(text).replace(/\s+/g, " ").trim();
    return value.length > 90 ? `${value.slice(0, 90)}…` : value;
  }

  /* ---------------- row actions ---------------- */

  function buildActionsMenu(row, index, visible) {
    const wrap = el("div", "row-actions");

    const trigger = el("button", "icon-button", "⋯");
    trigger.type = "button";
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute(
      "aria-label",
      t("exp.actionsFor", { title: rowTitle(row) })
    );

    trigger.addEventListener("click", () => {
      const entries = isTrashView()
        ? trashEntries(row)
        : normalEntries(row, index, visible);

      openRowMenu({ trigger, entries });
    });

    append(wrap, trigger);

    return wrap;
  }

  function normalEntries(row, index, visible) {
    const canReorder = !filtersActive();
    const orderedIndex = activeRows().findIndex(entry => entry.id === row.id);
    const orderedCount = activeRows().length;

    const entries = [
      { label: t("common.edit"), onSelect: () => onEdit(row.id) },
      { label: t("common.preview"), onSelect: () => previewRow(row) },
      {
        label: t("action.moveUp"),
        disabled: !canReorder || orderedIndex <= 0,
        hint: canReorder ? null : t("list.reorderHint"),
        onSelect: () => move(orderedIndex, -1)
      },
      {
        label: t("action.moveDown"),
        disabled: !canReorder || orderedIndex === -1 || orderedIndex >= orderedCount - 1,
        hint: canReorder ? null : t("list.reorderHint"),
        onSelect: () => move(orderedIndex, 1)
      }
    ];

    if (row.status === "draft") {
      entries.push({ label: t("action.show"), onSelect: () => publish(row) });
      entries.push({ label: t("action.archive"), onSelect: () => archive(row) });
    }

    if (row.status === "published") {
      entries.push({ label: t("action.hide"), onSelect: () => unpublish(row) });
      entries.push({ label: t("action.archive"), onSelect: () => archive(row) });
    }

    if (row.status === "archived") {
      entries.push({
        label: t("action.restoreDraft"),
        onSelect: () => restoreToDraft(row)
      });
    }

    entries.push({
      label: t("action.moveToTrash"),
      danger: true,
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
    const tags = state.tagsByExperience.get(row.id) || [];

    openExperiencePreview({
      type: row.type,
      title: row.title,
      role: row.role,
      location: row.location,
      description: row.description,
      status: row.status,
      tags
    });
  }

  /* ---------------- mutations ---------------- */

  function setBusy(next) {
    state.busy = next;
    root.classList.toggle("is-busy", next);
  }

  async function applyPatch(row, patch, successMessage, failureMessage) {
    if (state.busy) {
      return false;
    }

    setBusy(true);

    const { data, error } = await supabaseClient
      .from("experiences")
      .update(patch)
      .eq("id", row.id)
      .select("id");

    setBusy(false);

    if (error || !data || data.length === 0) {
      if (error) {
        console.error(error);
      }

      toast(failureMessage, "error");
      return false;
    }

    toast(successMessage);
    await load();
    return true;
  }

  async function publish(row) {
    if (!row.description || trimmed(row.description) === "") {
      toast(t("exp.needDescription"), "error");
      return;
    }

    const patch = { status: "published" };

    if (!row.published_at) {
      patch.published_at = new Date().toISOString();
    }

    await applyPatch(
      row,
      patch,
      t("exp.toastPublished"),
      t("exp.errPublish")
    );
  }

  async function unpublish(row) {
    const confirmed = await confirmDialog({
      title: t("exp.hideTitle", { title: rowTitle(row) }),
      lines: [
        t("exp.hideLine1"),
        t("exp.hideLine2")
      ],
      confirmLabel: t("action.hide"),
      variant: "danger"
    });

    if (!confirmed) {
      return;
    }

    /*
      published_at is deliberately absent from this patch: it records the FIRST
      successful publish and must survive an unpublish/republish cycle
      (ADMIN-CMS-DATABASE.md section 87). deleted_at, sort_order, created_at and
      the tag rows are likewise untouched; archived_at is cleared so the record
      lands in a clean draft state.
    */
    await applyPatch(
      row,
      { status: "draft", archived_at: null },
      t("exp.toastHidden"),
      t("exp.errHide")
    );
  }

  async function archive(row) {
    const confirmed = await confirmDialog({
      title: t("exp.archiveTitle", { title: rowTitle(row) }),
      lines: [t("exp.archiveLine1"), t("exp.archiveLine2")],
      confirmLabel: t("action.archive"),
      variant: "danger"
    });

    if (!confirmed) {
      return;
    }

    await applyPatch(
      row,
      { status: "archived", archived_at: new Date().toISOString() },
      t("exp.toastArchived"),
      t("exp.errArchive")
    );
  }

  async function restoreToDraft(row) {
    await applyPatch(
      row,
      { status: "draft", archived_at: null },
      t("exp.toastRestoredDraft"),
      t("exp.errRestore")
    );
  }

  async function moveToTrash(row) {
    const confirmed = await confirmDialog({
      title: t("exp.trashTitle", { title: rowTitle(row) }),
      lines: [t("exp.trashLine1"), t("exp.trashLine2")],
      confirmLabel: t("action.moveToTrash"),
      variant: "danger"
    });

    if (!confirmed) {
      return;
    }

    await applyPatch(
      row,
      { deleted_at: new Date().toISOString() },
      t("exp.toastTrashed"),
      t("exp.errTrash")
    );
  }

  async function restoreFromTrash(row) {
    /*
      Restored content never comes back public on its own: deleted_at is
      cleared and the status is reset to draft in the same update
      (brief section 13).
    */
    await applyPatch(
      row,
      { deleted_at: null, status: "draft", archived_at: null },
      t("exp.toastRestored"),
      t("exp.errRestore")
    );
  }

  async function permanentlyDelete(row) {
    const confirmed = await typedDeleteConfirm(row);

    if (!confirmed) {
      return;
    }

    setBusy(true);

    // experience_tags rows are removed by the FK's ON DELETE CASCADE.
    const { data, error } = await supabaseClient
      .from("experiences")
      .delete()
      .eq("id", row.id)
      .select("id");

    setBusy(false);

    if (error || !data || data.length === 0) {
      if (error) {
        console.error(error);
      }

      toast(t("exp.errDelete"), "error");
      return;
    }

    toast(t("exp.toastDeleted"));
    await load();
  }

  function typedDeleteConfirm(row) {
    return new Promise(resolve => {
      let settled = false;

      const body = el("div", "confirm-body");

      append(
        body,
        el("p", "confirm-line", rowTitle(row)),
        el("p", "confirm-line", t("exp.deleteLine")),
        el("p", "confirm-line", t("confirm.cannotBeUndone"))
      );

      const field = textField({
        id: "experience-delete-confirm",
        label: t("confirm.typeDelete"),
        value: "",
        maxLength: 10
      });

      append(body, field.node);

      const controller = openModal({
        title: t("confirm.deleteTitle"),
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
                field.setError(t("confirm.typeDeleteError"));
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

      return controller;
    });
  }

  async function move(index, direction) {
    const ordered = activeRows();
    const target = index + direction;

    if (state.busy || index < 0 || target < 0 || target >= ordered.length) {
      return;
    }

    const reordered = ordered.slice();
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);

    // Normalise to a dense 0..n-1 sequence and write only what changed, so
    // gaps and duplicates in the stored sort_order cannot break ordering.
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
        .from("experiences")
        .update({ sort_order: update.sort_order })
        .eq("id", update.id)
        .select("id");

      if (error || !data || data.length === 0) {
        if (error) {
          console.error(error);
        }

        setBusy(false);
        toast(t("list.orderError"), "error");
        await load();
        return;
      }
    }

    setBusy(false);
    toast(t("list.orderUpdated"));
    await load();
  }

  return {
    element: root,
    load,
    destroy() {
      closeMenu();
    }
  };
}
