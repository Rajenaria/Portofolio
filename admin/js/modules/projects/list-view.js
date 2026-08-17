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
  const searchLabel = el("label", "toolbar-label", "Search");
  const searchInput = el("input", "admin-input");
  searchInput.type = "search";
  searchInput.id = "project-search";
  searchInput.placeholder = "Search projects...";
  searchInput.autocomplete = "off";
  searchLabel.htmlFor = searchInput.id;

  searchInput.addEventListener("input", () => {
    state.filters.search = searchInput.value;
    closeMenu();
    renderList();
  });

  append(searchFieldWrap, searchLabel, searchInput);

  const statusFieldWrap = el("div", "toolbar-field");
  const statusLabel = el("label", "toolbar-label", "Status");
  const statusSelect = el("select", "admin-select");
  statusSelect.id = "project-status-filter";
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
      append(listSlot, el("p", "loading-text", "Loading projects..."));
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
          description: "Projects you move to Trash appear here and can be restored."
        })
      );
      return;
    }

    if (!isTrashView() && activeRows().length === 0) {
      append(
        listSlot,
        emptyState({
          title: "No projects yet.",
          description: "Add your first project to start building your portfolio."
        })
      );
      return;
    }

    if (rows.length === 0) {
      append(
        listSlot,
        emptyState({
          title: "No projects match your filters.",
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
        isTrashView()
          ? `${rows.length} in Trash`
          : rows.length === activeRows().length
          ? `${rows.length} projects`
          : `${rows.length} of ${activeRows().length} projects`
      )
    );

    if (isTrashView()) {
      append(
        listSlot,
        el(
          "p",
          "table-note",
          "Permanent deletion removes the project, its paragraphs, technology links, documentation records and every stored image file. It cannot be undone."
        )
      );
      return;
    }

    if (filtersActive()) {
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
      el("p", "admin-alert-title", "Could not load projects."),
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
    const table = el("table", "admin-table admin-table-projects");

    const thead = el("thead");
    const headRow = el("tr");

    const columns = isTrashView()
      ? ["Project", "Category", "Status", "Deleted"]
      : ["Project", "Category", "Status", "Featured", "Updated"];

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

    const titleCell = cell("Project");
    append(titleCell, el("span", "row-title", row.title || "Untitled project"));
    append(titleCell, el("span", "row-subtle", row.slug));
    append(item, titleCell);

    const categoryCell = cell("Category");
    append(
      categoryCell,
      row.card_category
        ? el("span", "type-badge", row.card_category)
        : el("span", "row-subtle", "—")
    );
    append(item, categoryCell);

    const statusCell = cell("Status");
    append(statusCell, statusBadge(row.status));
    append(item, statusCell);

    if (!isTrashView()) {
      const featuredCell = cell("Featured");
      append(
        featuredCell,
        el(
          "span",
          row.featured ? "flag-badge flag-badge-yes" : "flag-badge flag-badge-no",
          row.featured ? "Yes" : "No"
        )
      );
      append(item, featuredCell);
    }

    const timeCell = cell(isTrashView() ? "Deleted" : "Updated");
    append(timeCell, updatedAt(isTrashView() ? row.deleted_at : row.updated_at));
    append(item, timeCell);

    const actionsCell = cell("Actions");
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
    trigger.setAttribute("aria-label", `Actions for ${row.title || "project"}`);

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
      { label: "Edit", onSelect: () => onEdit(row.id) },
      { label: "Preview", onSelect: () => previewRow(row) },
      {
        label: "Move Up",
        disabled: !canReorder || index <= 0,
        hint: canReorder ? null : "Clear search and filters to reorder.",
        onSelect: () => move(index, -1)
      },
      {
        label: "Move Down",
        disabled: !canReorder || index === -1 || index >= ordered.length - 1,
        hint: canReorder ? null : "Clear search and filters to reorder.",
        onSelect: () => move(index, 1)
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

    if (!row.card_category) missing.push("category");
    if (!row.short_description) missing.push("short description");
    if (!row.detail_intro) missing.push("introduction");
    if (!row.role) missing.push("role");
    if (!row.project_date) missing.push("project date");
    if (!row.project_type) missing.push("project type");
    if (!row.about_heading) missing.push("about heading");

    if ((state.paragraphsByProject.get(row.id) || []).length === 0) {
      missing.push("at least one About paragraph");
    }

    return missing;
  }

  async function publish(row) {
    const missing = publishBlockers(row);

    if (missing.length > 0) {
      toast(
        `Cannot publish yet. Open Edit and complete: ${missing.join(", ")}.`,
        "error"
      );
      return;
    }

    const patch = { status: "published" };

    if (!row.published_at) {
      patch.published_at = new Date().toISOString();
    }

    await applyPatch(row, patch, "Project published.", "Could not publish this project.");
  }

  async function unpublish(row) {
    const confirmed = await confirmDialog({
      title: `Unpublish "${row.title || "this project"}"?`,
      lines: [
        "This project will return to Draft and will no longer appear in the public portfolio after public migration.",
        "Its content, paragraphs, technologies and order are kept, and it can be published again later."
      ],
      confirmLabel: "Unpublish",
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
      "Project unpublished and moved back to draft.",
      "Could not unpublish this project."
    );
  }

  async function archive(row) {
    const confirmed = await confirmDialog({
      title: `Archive "${row.title || "this project"}"?`,
      lines: [
        "Archived projects will no longer appear in the public portfolio after public migration.",
        "The record, paragraphs and technology relationships are kept and can be restored later."
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
      "Project archived.",
      "Could not archive this project."
    );
  }

  async function restoreToDraft(row) {
    await applyPatch(
      row,
      { status: "draft", archived_at: null },
      "Project restored to draft.",
      "Could not restore this project."
    );
  }

  async function moveToTrash(row) {
    const confirmed = await confirmDialog({
      title: `Move "${row.title || "this project"}" to Trash?`,
      lines: [
        "The project is hidden from the normal list and from the public portfolio.",
        "Its paragraphs, technologies and media references are kept. You can restore it later."
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
      "Project moved to Trash.",
      "Could not move this project to Trash."
    );
  }

  async function restoreFromTrash(row) {
    // Restored content never returns public on its own.
    await applyPatch(
      row,
      { deleted_at: null, status: "draft", archived_at: null },
      "Project restored as a draft.",
      "Could not restore this project."
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
      toast("Could not read this project's media. Nothing was deleted.", "error");
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
      toast("Could not permanently delete this project.", "error");
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
        ? `Project permanently deleted. These files could not be removed and may need manual cleanup: ${orphans.join(", ")}`
        : "Project permanently deleted.",
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
        el("p", "confirm-line", row.title || "This project"),
        el(
          "p",
          "confirm-line",
          "This permanently removes the project, its paragraphs, its technology relationships, its documentation records and every stored image file."
        )
      );

      const summary = [];

      if (row.cover_desktop_path) {
        summary.push("1 cover image");
      }

      if (documentationCount > 0) {
        summary.push(
          `${documentationCount} documentation image${documentationCount === 1 ? "" : "s"}`
        );
      }

      if (summary.length > 0) {
        append(body, el("p", "confirm-line", `Files to delete: ${summary.join(" and ")}.`));
      }

      append(body, el("p", "confirm-line", "This action cannot be undone."));

      const field = textField({
        id: "project-delete-confirm",
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
