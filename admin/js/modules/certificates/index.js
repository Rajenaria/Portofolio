/*
  Certificates route (Phase C).

  One route, two internal views inside the existing Admin shell:

      list    the table, filters, minimum-published banner and row actions
      editor  the full-page Add/Edit form (never a modal)

  Switching views is local page state: the router is untouched, the hash stays
  #/certificates and the authenticated shell is never remounted. This mirrors
  the Experience route exactly.

  UNSAVED CHANGES
  ---------------
  No autosave. While the editor holds unsaved values, three exits are guarded:
  Back to Certificates, sidebar navigation, and browser refresh/close. The
  guard never fires when the form is clean.

  SCOPE
  -----
  Structured text only. No Storage calls — the certificate document is Phase D
  — and nothing here touches the public certificate section, which continues to
  render from the static array in js/certificates.js.
*/

import { supabaseClient } from "../../core/supabase.js";
import { el, append, clear, pageHeader } from "../../core/dom.js";
import { confirmDialog, closeAllModals } from "../../core/modal.js";
import { toast } from "../../core/toast.js";

import { createCertificateList } from "./list-view.js";
import { createCertificateEditor } from "./editor-view.js";

const SELECT_COLUMNS =
  "id, title, publisher, period, category, issuer_line, badge_text, description, status, sort_order, published_at, archived_at, deleted_at, created_at, updated_at";

export const certificatesRoute = {
  name: "certificates",
  title: "Certificates",
  render
};

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

    if (!link || link.dataset.route === "certificates") {
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
        "You have unsaved changes in this certificate.",
        "Your changes will be lost if you leave now."
      ],
      confirmLabel: "Leave Without Saving",
      cancelLabel: "Stay",
      variant: "danger"
    });
  }

  function onDirtyChange() {
    /* The guards read isDirty() directly; nothing else needs to react. */
  }

  /* ---------------- views ---------------- */

  function renderHeader({ inEditor }) {
    clear(headerSlot);

    append(
      headerSlot,
      pageHeader({
        title: "Certificates",
        subtitle:
          "Manage the certificates, copyrights and achievements shown in the public carousel.",
        actions: inEditor
          ? []
          : [
              {
                label: "+ New Certificate",
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

    listView = createCertificateList({
      onEdit: id => showEditor(id)
    });

    append(viewSlot, listView.element);
    listView.load();
  }

  async function showEditor(id) {
    let record = null;

    if (id) {
      clear(viewSlot);
      append(viewSlot, el("p", "loading-text", "Loading certificate..."));

      const { data, error } = await supabaseClient
        .from("certificates")
        .select(SELECT_COLUMNS)
        .eq("id", id)
        .maybeSingle();

      if (signal.aborted) {
        return;
      }

      if (error || !data) {
        console.error(error);
        toast("Could not open this certificate.", "error");
        showList();
        return;
      }

      record = data;
    }

    teardownViews();
    renderHeader({ inEditor: true });

    editorView = createCertificateEditor({
      record,
      onDirtyChange,
      onSaved: () => showList(),
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
