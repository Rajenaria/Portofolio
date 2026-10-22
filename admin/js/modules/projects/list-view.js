/*
  Project list: server gateway catalog and status actions, with legacy child
  summaries for compatibility. Working Draft editing/preview owns content;
  publication validation and revision checks remain on the server.

  Hide/Archive/Trash preserve media. Permanent deletion stays deferred until
  draft/revision references have been audited. This module never deletes files.
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

import { confirmDialog } from "../../core/modal.js";
import { toast } from "../../core/toast.js";
import { t } from "../../core/i18n.js";

/* Resolved at call time so a language switch mid-list relabels everything. */
function rowTitle(row) {
  return row.title || t("proj.thisOne");
}
import { projectCommand } from "../../core/project-client.js";
import { openCaseStudyPreview } from "./case-study-preview.js";

export function createProjectList({ onEdit, onChanged }) {
  const root = el("div", "experience-list-view project-list-view");

  const state = {
    rows: [],
    paragraphsByProject: new Map(),
    technologiesByProject: new Map(),
    mediaByProject: new Map(),
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

  const searchFieldWrap = el("div", "toolbar-field toolbar-field-search");
  const searchLabel = el("label", "toolbar-label", t("common.search"));
  const searchInput = el("input", "admin-input");
  searchInput.type = "search";
  searchInput.id = "project-search";
  searchInput.placeholder = t("proj.searchPlaceholder");
  searchInput.autocomplete = "off";
  searchLabel.htmlFor = searchInput.id;

  searchInput.addEventListener("input", () => {
    state.filters.search = searchInput.value;
    closeMenu();
    renderList();
  });

  append(searchFieldWrap, searchLabel, searchInput);

  const statusFieldWrap = el("div", "toolbar-field");
  const statusLabel = el("label", "toolbar-label", t("common.status"));
  const statusSelect = el("select", "admin-select");
  statusSelect.id = "project-status-filter";
  statusLabel.htmlFor = statusSelect.id;

  [
    { value: "all", label: t("common.all") },
    { value: "draft", label: t("status.draft") },
    { value: "published", label: t("status.published") },
    { value: "archived", label: t("status.archived") },
    { value: "trash", label: t("proj.trash") }
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

  append(statusFieldWrap, statusLabel, statusSelect);
  append(toolbar, searchFieldWrap, statusFieldWrap);

  const listSlot = el("div", "table-slot");
  append(root, toolbar, listSlot);

  /* ---------------- data ---------------- */

  async function load() {
    state.status = "loading";
    renderList();

    async function readProjects() {
      try {
        const data=[];let after=null;
        for(let page=0;page<100;page++){
          const batch=await projectCommand({action:'list',after});
          if(!Array.isArray(batch))throw Error('Invalid catalog');
          data.push(...batch);if(batch.length<100)return {data:data.sort((a,b)=>a.sort_order-b.sort_order)};
          const cursor=batch.at(-1).id;if(cursor===after)throw Error('Invalid cursor');after=cursor;
        }
        throw Error('Catalog limit exceeded');
      } catch { return {error:new Error('Project API unavailable; migration/function cutover required')}; }
    }
    const [projects, paragraphs, relations, media] = await Promise.all([
      readProjects(),

      supabaseClient
        .from("project_paragraphs")
        .select("id, project_id, content, sort_order")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),

      supabaseClient
        .from("project_technologies")
        .select("project_id, technology_id, sort_order, technologies(name)")
        .order("sort_order", { ascending: true }),

      supabaseClient
        .from("project_media")
        .select("id, project_id, bucket_name, desktop_path, alt_text, sort_order, is_active")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
    ]);

    if (projects.error || paragraphs.error || relations.error || media.error) {
      console.error(
        projects.error || paragraphs.error || relations.error || media.error
      );
      state.status = "error";
      renderList();
      return;
    }

    state.rows = projects.data || [];

    state.paragraphsByProject = new Map();
    (paragraphs.data || []).forEach(row => {
      const list = state.paragraphsByProject.get(row.project_id) || [];
      list.push(row);
      state.paragraphsByProject.set(row.project_id, list);
    });

    state.technologiesByProject = new Map();
    (relations.data || []).forEach(row => {
      const list = state.technologiesByProject.get(row.project_id) || [];
      list.push(row.technologies ? row.technologies.name : "");
      state.technologiesByProject.set(row.project_id, list);
    });

    state.mediaByProject = new Map();
    (media.data || []).forEach(row => {
      const list = state.mediaByProject.get(row.project_id) || [];
      list.push(row);
      state.mediaByProject.set(row.project_id, list);
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
      ["title", "slug", "card_category", "short_description"].some(key =>
        String(row[key] || "").toLowerCase().includes(term)
      )
    );
  }

  /* ---------------- rendering ---------------- */

  function renderList() {
    closeMenu();
    clear(listSlot);

    if (state.status === "loading") {
      append(listSlot, el("p", "loading-text", t("proj.loading")));
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
          title: t("proj.emptyTrashTitle"),
          description: t("proj.emptyTrashHelp")
        })
      );
      return;
    }

    if (!isTrashView() && activeRows().length === 0) {
      append(
        listSlot,
        emptyState({
          title: t("proj.emptyTitle"),
          description: t("proj.emptyHelp")
        })
      );
      return;
    }

    if (rows.length === 0) {
      append(
        listSlot,
        emptyState({
          title: t("proj.emptyFilterTitle"),
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
          ? t("proj.summaryTrash", { count: rows.length })
          : t("proj.summary", { shown: rows.length, total: activeRows().length })
      )
    );

    if (isTrashView()) {
      append(
        listSlot,
        el("p", "table-note", t("proj.trashNote"))
      );
      return;
    }

    if (filtersActive()) {
      append(
        listSlot,
        el("p", "table-note", "Urutan project diubah lewat Sort order pada Working Draft, kemudian Publish.")
      );
    }
  }

  function buildErrorPanel() {
    const panel = el("div", "admin-alert admin-alert-error");
    panel.setAttribute("role", "alert");

    append(
      panel,
      el("p", "admin-alert-title", t("proj.loadError")),
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
    const table = el("table", "admin-table admin-table-projects");

    const thead = el("thead");
    const headRow = el("tr");

    const columns = isTrashView()
      ? [
          t("proj.colProject"),
          t("common.category"),
          t("common.status"),
          t("common.deleted")
        ]
      : [
          t("proj.colProject"),
          t("common.category"),
          t("common.status"),
          t("proj.colFeatured"),
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

    const titleCell = cell(t("proj.colProject"));
    titleCell.classList.add("cell-primary");
    append(titleCell, el("span", "row-title", row.title || t("proj.untitled")));
    append(titleCell, el("span", "row-subtle", row.slug));
    append(item, titleCell);

    const categoryCell = cell(t("common.category"));
    append(
      categoryCell,
      row.card_category
        ? el("span", "type-badge", row.card_category)
        : el("span", "row-subtle", t("common.none"))
    );
    append(item, categoryCell);

    const statusCell = cell(t("common.status"));
    append(statusCell, statusBadge(row.status));
    append(item, statusCell);

    if (!isTrashView()) {
      const featuredCell = cell(t("proj.colFeatured"));
      append(
        featuredCell,
        el(
          "span",
          row.featured ? "flag-badge flag-badge-yes" : "flag-badge flag-badge-no",
          t(row.featured ? "common.yes" : "common.no")
        )
      );
      append(item, featuredCell);
    }

    const timeCell = cell(isTrashView() ? t("common.deleted") : t("common.updated"));
    append(timeCell, updatedAt(isTrashView() ? row.deleted_at : row.updated_at));
    append(item, timeCell);

    const actionsCell = cell(t("common.actions"));
    actionsCell.className = "cell-actions";
    append(actionsCell, buildActionsMenu(row));
    append(item, actionsCell);

    return item;
  }

  /* ---------------- row actions ---------------- */

  function buildActionsMenu(row) {
    const wrap = el("div", "row-actions");

    const trigger = el("button", "icon-button", "⋯");
    trigger.type = "button";
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute(
      "aria-label",
      t("proj.actionsFor", { title: rowTitle(row) })
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
    const entries = [
      { label: t("common.edit"), onSelect: () => onEdit(row.id) },
      { label: t("common.preview"), onSelect: () => previewRow(row) },
      { label: "Atur urutan pada Working Draft", onSelect: () => onEdit(row.id) }
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

  async function previewRow(row) {
    try { const data = await projectCommand({action:'read',id:row.id}); openCaseStudyPreview(row.id,data.draft.payload); }
    catch { toast('Draft preview unavailable. Tidak ada data private yang dipublikasikan.', 'error'); }
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

    try {
      const action = patch.deleted_at ? 'trash' : Object.hasOwn(patch,'deleted_at') ? 'restore' : patch.status === 'archived' ? 'archive' : patch.status === 'published' ? 'show' : 'hide';
      const result=await projectCommand({action,id:row.id,publication:row.publication_version,expected:0,operation:crypto.randomUUID()});
      if(result.state!=='committed')throw new Error('UNCONFIRMED');
    } catch {
      setBusy(false);toast(failureMessage+' Hasil belum dikonfirmasi; muat ulang sebelum mencoba lagi.', 'error');return false;
    }
    setBusy(false);
    toast(successMessage);
    await load();
    return true;
  }

  async function publish(row) {
    if(!row.published_at){onEdit(row.id);toast('Review dan Publish melalui Working Draft editor.');return;}
    await applyPatch(row,{status:'published'},t('proj.toastPublished'),t('proj.errPublish'));
  }

  async function unpublish(row) {
    const confirmed = await confirmDialog({
      title: t("proj.hideTitle", { title: rowTitle(row) }),
      lines: [t("proj.hideLine1"), t("proj.hideLine2")],
      confirmLabel: t("action.hide"),
      variant: "danger"
    });

    if (!confirmed) {
      return;
    }

    // published_at is deliberately absent: it records the FIRST publish and must
    // survive an unpublish/republish cycle.
    await applyPatch(
      row,
      { status: "draft", archived_at: null },
      t("proj.toastHidden"),
      t("proj.errHide")
    );
  }

  async function archive(row) {
    const confirmed = await confirmDialog({
      title: t("proj.archiveTitle", { title: rowTitle(row) }),
      lines: [t("proj.archiveLine1"), t("proj.archiveLine2")],
      confirmLabel: t("action.archive"),
      variant: "danger"
    });

    if (!confirmed) {
      return;
    }

    await applyPatch(
      row,
      { status: "archived", archived_at: new Date().toISOString() },
      t("proj.toastArchived"),
      t("proj.errArchive")
    );
  }

  async function restoreToDraft(row) {
    await applyPatch(
      row,
      { status: "draft", archived_at: null },
      t("proj.toastRestoredDraft"),
      t("proj.errRestore")
    );
  }

  async function moveToTrash(row) {
    const confirmed = await confirmDialog({
      title: t("proj.trashTitle", { title: rowTitle(row) }),
      lines: [t("proj.trashLine1"), t("proj.trashLine2")],
      confirmLabel: t("action.moveToTrash"),
      variant: "danger"
    });

    if (!confirmed) {
      return;
    }

    await applyPatch(
      row,
      { deleted_at: new Date().toISOString() },
      t("proj.toastTrashed"),
      t("proj.errTrash")
    );
  }

  async function restoreFromTrash(row) {
    // Restored content never returns public on its own.
    await applyPatch(
      row,
      { deleted_at: null, status: "draft", archived_at: null },
      t("proj.toastRestored"),
      t("proj.errRestore")
    );
  }

  // Keep the existing deferred action visible without suggesting cleanup is safe.
  async function permanentlyDelete() {
    toast('Permanent delete ditunda. Asset dan seluruh referensi draft/revision harus diaudit terlebih dahulu.', 'error');
  }

  async function move() { toast('Ubah Sort order di Working Draft, lalu Publish untuk mengaktifkannya.'); }

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
