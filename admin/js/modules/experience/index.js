/*
  Experience route (Phase 7).

  One route with two internal views inside the existing Admin shell:

      list    the table / card list, filters and row actions
      editor  the full-page Add/Edit form (never a modal)

  Switching views is local page state: the router is untouched, the hash stays
  #/experience and the authenticated shell is never remounted.

  UNSAVED CHANGES
  ---------------
  No autosave. While the editor holds unsaved values, three exits are guarded:
  Back to Experience, sidebar navigation, and browser refresh/close. The guard
  never fires when the form is clean.

  This module manages structured data only. It performs no Storage calls and
  does not touch the public Experience renderer or js/experience-stack.js.
*/

import { supabaseClient } from "../../core/supabase.js";
import { el, append, clear, pageHeader } from "../../core/dom.js";
import { confirmDialog, closeAllModals } from "../../core/modal.js";
import { toast } from "../../core/toast.js";
import { t } from "../../core/i18n.js";

import { createExperienceList } from "./list-view.js";
import { createExperienceEditor } from "./editor-view.js";

export const experienceRoute = {
  name: "experience",
  title: "Experience",  // Fallback only: the shell titles routes from nav.*
  render
};

async function render(container, { signal }) {
  const headerSlot = el("div", "route-header-slot");
  const viewSlot = el("div", "route-view-slot");

  append(container, headerSlot, viewSlot);

  let listView = null;
  let editorView = null;
  let dirty = false;
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

    if (!link || link.dataset.route === "experience") {
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
      title: t("unsaved.title"),
      lines: [t("unsaved.experience"), t("unsaved.lost")],
      confirmLabel: t("unsaved.leave"),
      cancelLabel: t("unsaved.stay"),
      variant: "danger"
    });
  }

  function onDirtyChange(next) {
    dirty = next;
  }

  /* ---------------- views ---------------- */

  function renderHeader({ inEditor }) {
    clear(headerSlot);

    append(
      headerSlot,
      pageHeader({
        title: t("exp.title"),
        subtitle: t("exp.subtitle"),
        actions: inEditor
          ? []
          : [
              {
                label: t("exp.add"),
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
    dirty = false;

    renderHeader({ inEditor: false });

    listView = createExperienceList({
      onEdit: id => showEditor(id),
      onCreate: () => showEditor(null)
    });

    append(viewSlot, listView.element);
    listView.load();
  }

  async function showEditor(id) {
    let record = null;
    let tags = [];

    if (id) {
      clear(viewSlot);
      append(viewSlot, el("p", "loading-text", t("exp.loading")));

      const [experience, tagRows] = await Promise.all([
        supabaseClient
          .from("experiences")
          .select(
            "id, type, title, role, location, description, status, sort_order, published_at, archived_at, deleted_at, created_at, updated_at, translations"
          )
          .eq("id", id)
          .maybeSingle(),

        supabaseClient
          .from("experience_tags")
          .select("id, label, sort_order")
          .eq("experience_id", id)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true })
      ]);

      if (signal.aborted) {
        return;
      }

      if (experience.error || !experience.data || tagRows.error) {
        console.error(experience.error || tagRows.error);
        toast(t("exp.errOpen"), "error");
        showList();
        return;
      }

      record = experience.data;
      tags = tagRows.data || [];
    }

    teardownViews();
    renderHeader({ inEditor: true });

    editorView = createExperienceEditor({
      record,
      tags,
      onDirtyChange,
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
