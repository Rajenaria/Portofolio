/*
  Projects route (Phase 8A core, Phase 8B media).

  One route with two internal views inside the existing Admin shell:

      list    the table / card list, filters and row actions
      editor  the full-page Add/Edit form (never a modal)

  Switching views is local page state: the router is untouched, the hash stays
  #/projects and the authenticated shell is never remounted.

  UNSAVED CHANGES
  ---------------
  No autosave. While the editor holds unsaved values — including staged
  paragraphs, technology selections and pending images — three exits are
  guarded: Back to Projects, sidebar navigation, and browser refresh/close.
  Preview never clears the dirty state.

  The public Project renderer is still out of scope: nothing here writes to any
  Portfolio V1 file.
*/

import { supabaseClient } from "../../core/supabase.js";
import { el, append, clear, pageHeader } from "../../core/dom.js";
import { confirmDialog, closeAllModals } from "../../core/modal.js";
import { toast } from "../../core/toast.js";

import { createProjectList } from "./list-view.js";
import { createProjectEditor } from "./editor-view.js";

export const projectsRoute = {
  name: "projects",
  title: "Projects",
  render
};

// The cover columns must be selected here: the editor rebuilds the cover field
// from them, so leaving them out would make a saved cover disappear on reopen.
const PROJECT_COLUMNS =
  "id, slug, title, card_category, short_description, detail_title_main, detail_title_highlight, detail_intro, role, project_date, project_type, about_heading, cover_bucket, cover_desktop_path, cover_mobile_path, cover_alt, github_url, demo_url, featured, sort_order, status, published_at, archived_at, deleted_at, created_at, updated_at";

async function render(container, { signal }) {
  const headerSlot = el("div", "route-header-slot");
  const viewSlot = el("div", "route-view-slot");

  append(container, headerSlot, viewSlot);

  let listView = null;
  let editorView = null;
  let bypassNavigationGuard = false;

  /* ---------------- unsaved-changes guards ---------------- */

  function isDirty() {
    return Boolean(editorView && editorView.isDirty());
  }

  function handleBeforeUnload(event) {
    if (!isDirty()) {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
  }

  async function handleNavigationCapture(event) {
    if (bypassNavigationGuard || !isDirty()) {
      return;
    }

    const link = event.target.closest
      ? event.target.closest(".sidebar-link[data-route]")
      : null;

    if (!link || link.dataset.route === "projects") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!(await confirmUnsaved())) {
      return;
    }

    bypassNavigationGuard = true;
    link.click();
  }

  window.addEventListener("beforeunload", handleBeforeUnload);
  document.addEventListener("click", handleNavigationCapture, true);

  async function confirmUnsaved() {
    return await confirmDialog({
      title: "Leave without saving?",
      lines: [
        "You have unsaved changes in this project.",
        "Your changes will be lost if you leave now."
      ],
      confirmLabel: "Leave Without Saving",
      cancelLabel: "Stay",
      variant: "danger"
    });
  }

  /* ---------------- views ---------------- */

  function renderHeader({ inEditor }) {
    clear(headerSlot);

    append(
      headerSlot,
      pageHeader({
        title: "Projects",
        subtitle: "Manage portfolio projects and their published content.",
        actions: inEditor
          ? []
          : [
              {
                label: "+ New Project",
                variant: "primary",
                onClick: () => showEditor(null)
              }
            ]
      })
    );
  }

  function teardownViews() {
    if (listView) {
      listView.destroy();
      listView = null;
    }

    if (editorView) {
      editorView.destroy();
      editorView = null;
    }

    clear(viewSlot);
  }

  function showList() {
    teardownViews();
    renderHeader({ inEditor: false });

    listView = createProjectList({
      onEdit: id => showEditor(id)
    });

    append(viewSlot, listView.element);
    listView.load();
  }

  async function showEditor(id) {
    clear(viewSlot);
    append(viewSlot, el("p", "loading-text", "Loading project..."));

    // The technology library is always needed by the selector.
    const requests = [
      supabaseClient
        .from("technologies")
        .select("id, name, slug, is_active, show_in_public_stack, public_group, sort_order")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
    ];

    if (id) {
      requests.push(
        supabaseClient.from("projects").select(PROJECT_COLUMNS).eq("id", id).maybeSingle(),
        supabaseClient
          .from("project_paragraphs")
          .select("id, content, sort_order")
          .eq("project_id", id)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabaseClient
          .from("project_technologies")
          .select("technology_id, sort_order")
          .eq("project_id", id)
          .order("sort_order", { ascending: true }),
        supabaseClient
          .from("project_media")
          .select("id, bucket_name, desktop_path, mobile_path, alt_text, sort_order, is_active")
          .eq("project_id", id)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true })
      );
    }

    const results = await Promise.all(requests);

    if (signal.aborted) {
      return;
    }

    const failure = results.find(result => result.error);

    if (failure || (id && !results[1].data)) {
      console.error(failure ? failure.error : "project not found");
      toast("Could not open this project.", "error");
      showList();
      return;
    }

    const technologies = results[0].data || [];
    const record = id ? results[1].data : null;
    const paragraphs = id ? results[2].data || [] : [];
    const selectedTechnologyIds = id
      ? (results[3].data || []).map(row => row.technology_id)
      : [];
    const media = id ? results[4].data || [] : [];

    teardownViews();
    renderHeader({ inEditor: true });

    editorView = createProjectEditor({
      record,
      paragraphs,
      media,
      technologies,
      selectedTechnologyIds,
      onDirtyChange: () => {},
      onSaved: () => {},
      onBack: async () => {
        if (isDirty() && !(await confirmUnsaved())) {
          return;
        }

        showList();
      }
    });

    append(viewSlot, editorView.element);
    viewSlot.scrollIntoView({ block: "start" });
  }

  showList();

  return () => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    document.removeEventListener("click", handleNavigationCapture, true);
    teardownViews();
    closeAllModals();
  };
}
