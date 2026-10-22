/*
  Projects list (Phase 8A).

  Non-deleted Projects ordered by sort_order ASC, created_at ASC, plus a
  separate Trash view for rows with deleted_at set. Columns come only from
  columns that exist in public.projects.

  STATUS LIFECYCLE (matches projects_status_check)

      draft  --Publish-->  published  --Unpublish-->  draft
      draft/published  --Archive-->  archived  --Restore-->  draft
      any  --Move to Trash-->  deleted_at = now()
      trash  --Restore-->  deleted_at = null, status = draft

  PERMANENT DELETE IS DEFERRED
  ----------------------------
  projects cascades to project_media, so a physical delete here would drop the
  media rows while their Storage objects stayed behind as orphans. Media
  management is Phase 8B, so Trash exposes Restore only and explains why
  (brief section 23). Nothing in this module calls Supabase Storage.
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

import { confirmDialog, openModal } from "../../core/modal.js";
import { toast } from "../../core/toast.js";
import { textField, trimmed } from "../../core/form.js";
import { t } from "../../core/i18n.js";

/* Resolved at call time so a language switch mid-list relabels everything. */
function rowTitle(row) {
  return row.title || t("proj.thisOne");
}
import { removeObjects, resolveMediaUrl } from "../../core/media-storage.js";
import { openProjectPreview } from "./preview.js";

// The cover columns are part of this list because Preview needs them to show
// the image and Delete Permanently needs them to find the objects to remove.
const SELECT_COLUMNS =
  "id, slug, title, card_category, short_description, detail_title_main, detail_title_highlight, detail_intro, role, project_date, project_type, about_heading, cover_bucket, cover_desktop_path, cover_mobile_path, cover_alt, github_url, demo_url, featured, sort_order, status, published_at, archived_at, deleted_at, created_at, updated_at";

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

    const [projects, paragraphs, relations, media] = await Promise.all([
      supabaseClient
        .from("projects")
        .select(SELECT_COLUMNS)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),

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
        el("p", "table-note", t("list.reorderNote"))
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
    const canReorder = !filtersActive();
    const ordered = activeRows();
    const index = ordered.findIndex(entry => entry.id === row.id);

    const entries = [
      { label: t("common.edit"), onSelect: () => onEdit(row.id) },
      { label: t("common.preview"), onSelect: () => previewRow(row) },
      {
        label: t("action.moveUp"),
        disabled: !canReorder || index <= 0,
        hint: canReorder ? null : t("list.reorderHint"),
        onSelect: () => move(index, -1)
      },
      {
        label: t("action.moveDown"),
        disabled: !canReorder || index === -1 || index >= ordered.length - 1,
        hint: canReorder ? null : t("list.reorderHint"),
        onSelect: () => move(index, 1)
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

  async function previewRow(row) {
    const coverUrl = await resolveMediaUrl(row.cover_bucket, row.cover_desktop_path);

    const documentation = await Promise.all(
      (state.mediaByProject.get(row.id) || []).map(async media => ({
        altText: media.alt_text || "",
        isActive: media.is_active !== false,
        pending: false,
        url: await resolveMediaUrl(media.bucket_name, media.desktop_path)
      }))
    );

    openProjectPreview({
      coverUrl,
      coverAlt: row.cover_alt,
      coverPending: false,
      documentation,
      title: row.title,
      slug: row.slug,
      cardCategory: row.card_category,
      shortDescription: row.short_description,
      detailTitleMain: row.detail_title_main,
      detailTitleHighlight: row.detail_title_highlight,
      detailIntro: row.detail_intro,
      role: row.role,
      projectDate: row.project_date,
      projectType: row.project_type,
      aboutHeading: row.about_heading,
      githubUrl: row.github_url,
      demoUrl: row.demo_url,
      featured: row.featured,
      status: row.status,
      paragraphs: state.paragraphsByProject.get(row.id) || [],
      technologies: state.technologiesByProject.get(row.id) || []
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
      .from("projects")
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

  function publishBlockers(row) {
    const missing = [];

    /* Field names come from the same keys the editor labels them with, so the
       two screens never call the same field by two different names. */
    if (!row.card_category) missing.push(t("projEditor.fieldCategory"));
    if (!row.short_description) missing.push(t("projEditor.fieldShort"));
    if (!row.detail_intro) missing.push(t("projEditor.fieldIntro"));
    if (!row.role) missing.push(t("common.role"));
    if (!row.project_date) missing.push(t("projEditor.fieldDate"));
    if (!row.project_type) missing.push(t("projEditor.fieldType"));
    if (!row.about_heading) missing.push(t("projEditor.fieldAbout"));

    if ((state.paragraphsByProject.get(row.id) || []).length === 0) {
      missing.push(t("proj.missingParagraph"));
    }

    return missing;
  }

  async function publish(row) {
    const missing = publishBlockers(row);

    if (missing.length > 0) {
      toast(t("proj.incomplete", { missing: missing.join(", ") }), "error");
      return;
    }

    const patch = { status: "published" };

    if (!row.published_at) {
      patch.published_at = new Date().toISOString();
    }

    await applyPatch(row, patch, t("proj.toastPublished"), t("proj.errPublish"));
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

  /*
    Permanent delete (Trash only).

    Order matters: the database row goes first and Storage objects follow. An
    orphaned file is recoverable; a row pointing at an already-deleted image is
    not. Only paths that this Project actually references are removed — never a
    folder prefix, never anything bucket-wide.
  */
  async function permanentlyDelete(row) {
    if (state.busy) {
      return;
    }

    const mediaRows = await supabaseClient
      .from("project_media")
      .select("bucket_name, desktop_path, mobile_path")
      .eq("project_id", row.id);

    if (mediaRows.error) {
      console.error(mediaRows.error);
      toast(t("proj.errReadMedia"), "error");
      return;
    }

    const documentationCount = (mediaRows.data || []).length;

    const confirmed = await typedDeleteConfirm(row, documentationCount);

    if (!confirmed) {
      return;
    }

    setBusy(true);

    // Collect known object paths BEFORE the cascade removes the child rows.
    const objects = new Map();

    function collect(bucket, paths) {
      if (!bucket) {
        return;
      }

      const list = objects.get(bucket) || [];
      paths.filter(Boolean).forEach(path => list.push(path));
      objects.set(bucket, list);
    }

    collect(row.cover_bucket, [row.cover_desktop_path, row.cover_mobile_path]);

    (mediaRows.data || []).forEach(media => {
      collect(media.bucket_name, [media.desktop_path, media.mobile_path]);
    });

    // project_paragraphs, project_technologies and project_media rows are
    // removed by their ON DELETE CASCADE foreign keys.
    const { data, error } = await supabaseClient
      .from("projects")
      .delete()
      .eq("id", row.id)
      .select("id");

    if (error || !data || data.length === 0) {
      if (error) {
        console.error(error);
      }

      setBusy(false);
      toast(t("proj.errDelete"), "error");
      return;
    }

    const orphans = [];

    for (const [bucket, paths] of objects.entries()) {
      const cleanup = await removeObjects(bucket, paths);

      if (cleanup.failed.length > 0) {
        orphans.push(...cleanup.failed);
      }
    }

    setBusy(false);

    toast(
      orphans.length > 0
        ? t("proj.toastDeletedOrphans", { files: orphans.join(", ") })
        : t("proj.toastDeleted"),
      orphans.length > 0 ? "error" : "success"
    );

    await load();
  }

  function typedDeleteConfirm(row, documentationCount) {
    return new Promise(resolve => {
      let settled = false;

      const body = el("div", "confirm-body");

      append(
        body,
        el("p", "confirm-line", rowTitle(row)),
        el("p", "confirm-line", t("proj.deleteLine"))
      );

      const summary = [];

      if (row.cover_desktop_path) {
        summary.push(t("proj.fileCover"));
      }

      if (documentationCount > 0) {
        summary.push(t("proj.fileDocs", { count: documentationCount }));
      }

      if (summary.length > 0) {
        append(
          body,
          el(
            "p",
            "confirm-line",
            t("proj.filesToDelete", { summary: summary.join(" + ") })
          )
        );
      }

      append(body, el("p", "confirm-line", t("confirm.cannotBeUndone")));

      const field = textField({
        id: "project-delete-confirm",
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

    // Normalise to a dense 0..n-1 sequence and write only what changed, so gaps
    // and duplicates in the stored sort_order cannot break ordering.
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
        .from("projects")
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
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeydown);
      closeMenu();
    }
  };
}
