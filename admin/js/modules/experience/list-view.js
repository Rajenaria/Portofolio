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
  searchInput.id = "experience-search";
  searchInput.placeholder = "Search experiences...";
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
  statusSelect.id = "experience-status-filter";
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
      append(listSlot, el("p", "loading-text", "Loading experiences..."));
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
          description: "Experiences you move to Trash appear here and can be restored."
        })
      );
      return;
    }

    if (!isTrashView() && activeRows().length === 0) {
      append(
        listSlot,
        emptyState({
          title: "No experiences yet.",
          description:
            "Add your first experience to start building your professional timeline."
        })
      );
      return;
    }

    if (rows.length === 0) {
      append(
        listSlot,
        emptyState({
          title: "No experiences match your filters.",
          description: "Try another search term or status."
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
        rows.length === activeRows().length && !isTrashView()
          ? `${rows.length} experiences`
          : `${rows.length} of ${isTrashView() ? rows.length : activeRows().length} experiences`
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
      el("p", "admin-alert-title", "Could not load experiences."),
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
    const table = el("table", "admin-table admin-table-experiences");

    const thead = el("thead");
    const headRow = el("tr");

    const columns = isTrashView()
      ? ["Experience", "Type", "Status", "Deleted"]
      : ["Experience", "Type", "Role", "Location", "Status", "Updated"];

    columns.forEach(label => {
      const cell = el("th", null, label);
      cell.scope = "col";
      append(headRow, cell);
    });

    const actionsHead = el("th");
    actionsHead.scope = "col";
    append(actionsHead, el("span", "visually-hidden", "Actions"));
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

    const titleCell = cell("Experience");
    append(titleCell, el("span", "row-title", row.title || "Untitled experience"));

    if (row.description) {
      append(
        titleCell,
        el("span", "row-subtle", truncateForDisplay(row.description))
      );
    }

    append(item, titleCell);

    const typeCell = cell("Type");
    append(
      typeCell,
      row.type
        ? el("span", "type-badge", row.type)
        : el("span", "row-subtle", "—")
    );
    append(item, typeCell);

    if (!isTrashView()) {
      const roleCell = cell("Role");
      append(roleCell, el("span", null, row.role || "—"));
      append(item, roleCell);

      const locationCell = cell("Location");
      append(locationCell, el("span", null, row.location || "—"));
      append(item, locationCell);
    }

    const statusCell = cell("Status");
    append(statusCell, statusBadge(row.status));
    append(item, statusCell);

    const timeCell = cell(isTrashView() ? "Deleted" : "Updated");
    append(timeCell, updatedAt(isTrashView() ? row.deleted_at : row.updated_at));
    append(item, timeCell);

    const actionsCell = cell("Actions");
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
    trigger.setAttribute("aria-label", `Actions for ${row.title || "experience"}`);

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

      const entries = isTrashView()
        ? trashEntries(row)
        : normalEntries(row, index, visible);

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

  function normalEntries(row, index, visible) {
    const canReorder = !filtersActive();
    const orderedIndex = activeRows().findIndex(entry => entry.id === row.id);
    const orderedCount = activeRows().length;

    const entries = [
      { label: "Edit", onSelect: () => onEdit(row.id) },
      { label: "Preview", onSelect: () => previewRow(row) },
      {
        label: "Move Up",
        disabled: !canReorder || orderedIndex <= 0,
        hint: canReorder ? null : "Clear search and filters to reorder.",
        onSelect: () => move(orderedIndex, -1)
      },
      {
        label: "Move Down",
        disabled: !canReorder || orderedIndex === -1 || orderedIndex >= orderedCount - 1,
        hint: canReorder ? null : "Clear search and filters to reorder.",
        onSelect: () => move(orderedIndex, 1)
      }
    ];

    if (row.status === "draft") {
      entries.push({ label: "Publish", onSelect: () => publish(row) });
      entries.push({ label: "Archive", onSelect: () => archive(row) });
    }

    if (row.status === "published") {
      entries.push({ label: "Unpublish", onSelect: () => unpublish(row) });
      entries.push({ label: "Archive", onSelect: () => archive(row) });
    }

    if (row.status === "archived") {
      entries.push({ label: "Restore to Draft", onSelect: () => restoreToDraft(row) });
    }

    entries.push({
      label: "Move to Trash",
      danger: true,
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
      toast(
        "Add a description before publishing this experience. Open Edit to add one.",
        "error"
      );
      return;
    }

    const patch = { status: "published" };

    if (!row.published_at) {
      patch.published_at = new Date().toISOString();
    }

    await applyPatch(
      row,
      patch,
      "Experience published.",
      "Could not publish this experience."
    );
  }

  async function unpublish(row) {
    const confirmed = await confirmDialog({
      title: `Unpublish "${row.title || "this experience"}"?`,
      lines: [
        "This experience will return to Draft and will no longer appear in the public portfolio after public migration.",
        "Its content, tags and order are kept, and it can be published again later."
      ],
      confirmLabel: "Unpublish",
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
      "Experience unpublished and moved back to draft.",
      "Could not unpublish this experience."
    );
  }

  async function archive(row) {
    const confirmed = await confirmDialog({
      title: `Archive "${row.title || "this experience"}"?`,
      lines: [
        "Archived experiences will no longer appear in the public portfolio after public migration.",
        "The record and its tags are kept and can be restored later."
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
      "Experience archived.",
      "Could not archive this experience."
    );
  }

  async function restoreToDraft(row) {
    await applyPatch(
      row,
      { status: "draft", archived_at: null },
      "Experience restored to draft.",
      "Could not restore this experience."
    );
  }

  async function moveToTrash(row) {
    const confirmed = await confirmDialog({
      title: `Move "${row.title || "this experience"}" to Trash?`,
      lines: [
        "The experience is hidden from the normal list and from the public portfolio.",
        "You can restore it later from the Trash view."
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
      "Experience moved to Trash.",
      "Could not move this experience to Trash."
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
      "Experience restored as a draft.",
      "Could not restore this experience."
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

      toast("Could not permanently delete this experience.", "error");
      return;
    }

    toast("Experience permanently deleted.");
    await load();
  }

  function typedDeleteConfirm(row) {
    return new Promise(resolve => {
      let settled = false;

      const body = el("div", "confirm-body");

      append(
        body,
        el("p", "confirm-line", row.title || "This experience"),
        el(
          "p",
          "confirm-line",
          "This permanently removes the experience and all of its tags. This action cannot be undone."
        )
      );

      const field = textField({
        id: "experience-delete-confirm",
        label: "Type DELETE to confirm",
        value: "",
        maxLength: 10
      });

      append(body, field.node);

      const controller = openModal({
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
                field.setError('Type DELETE exactly to confirm.');
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
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeydown);
      closeMenu();
    }
  };
}
