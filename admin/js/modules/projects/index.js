import { COVER_COLUMNS, missingCoverSchema } from "../../../../js/cms/project-cover.js";

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
import { t } from "../../core/i18n.js";
import { registerNavigationGuard } from "../../core/navigation-guard.js";

import { createProjectList } from "./list-view.js";
import { createCaseStudyEditor } from "./case-study-editor.js";
import { projectCommand } from "../../core/project-client.js";

export const projectsRoute = {
  name: "projects",
  title: "Projects",  // Fallback only: the shell titles routes from nav.*
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

  /* ---------------- unsaved-changes guards ---------------- */

  function isDirty() {
    return Boolean(editorView && editorView.isDirty());
  }

  const releaseNavigationGuard = registerNavigationGuard(isDirty, confirmUnsaved);

  async function confirmUnsaved() {
    return await confirmDialog({
      title: t("unsaved.title"),
      lines: [t("unsaved.project"), t("unsaved.lost")],
      confirmLabel: t("unsaved.leave"),
      cancelLabel: t("unsaved.stay"),
      variant: "danger"
    });
  }

  /* ---------------- views ---------------- */

  function renderHeader({ inEditor }) {
    clear(headerSlot);

    append(
      headerSlot,
      pageHeader({
        title: t("proj.title"),
        subtitle: t("proj.subtitle"),
        actions: inEditor
          ? []
          : [
              {
                label: t("proj.add"),
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
    append(viewSlot, el("p", "loading-text", t("proj.loading")));

    try {
      const projectId = id || crypto.randomUUID();
      const [data, technologyResult] = await Promise.all([
        projectCommand({ action: id ? 'read' : 'create', id: projectId }),
        supabaseClient.from('technologies').select('id,name,is_active').order('name')
      ]);
      if (signal.aborted) return;
      if (technologyResult.error) throw technologyResult.error;
      teardownViews();
      renderHeader({ inEditor: true });
      editorView = createCaseStudyEditor({
        data, technologies: technologyResult.data || [],
        onBack: async () => {
          if (isDirty() && !(await confirmUnsaved())) return;
          showList();
        }
      });
    } catch {
      clear(viewSlot);
      append(viewSlot, el('p', 'field-error', 'Project editor belum tersedia. Pastikan migration M09 dan Edge Functions telah diterapkan bersama pada lingkungan yang diotorisasi. Tidak ada fallback Save ke API lama.'));
      return;
    }

    append(viewSlot, editorView.element);
    viewSlot.scrollIntoView({ block: "start" });
  }

  showList();

  return () => {
    releaseNavigationGuard();
    teardownViews();
    closeAllModals();
  };
}
