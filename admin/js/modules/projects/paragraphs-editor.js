/*
  Project paragraph manager (Phase 8A).

  Backs public.project_paragraphs, whose only content column is `content text`.
  There is no heading column in the schema, so a paragraph is exactly one block
  of plain text — no rich text, no WYSIWYG, no markup
  (ADMIN-CMS-DATABASE.md section 28).

  STAGED, NOT IMMEDIATE
  ---------------------
  Paragraphs live in local state and are persisted by the editor's Save, for the
  same reasons as Experience tags: a brand new Project has no id yet, and mixing
  immediate writes into a form with unsaved text would make the dirty guard
  meaningless. On save the editor diffs against what was loaded.

  Ordering is sort_order ASC, created_at ASC. Move Up / Move Down only.
*/

import { el, append, clear } from "../../core/dom.js";
import { openModal, confirmDialog } from "../../core/modal.js";
import { textareaField, trimmed } from "../../core/form.js";

let localIdCounter = 0;

export function createParagraphsEditor({ initialParagraphs = [], onChange }) {
  const root = el("section", "admin-subsection");

  const header = el("div", "subsection-header");
  append(header, el("h3", "subsection-title", "About The Project"));

  const addButton = el("button", "admin-button admin-button-secondary", "+ Add Paragraph");
  addButton.type = "button";
  addButton.addEventListener("click", () => openEditor(null));
  append(header, addButton);

  const listSlot = el("div", "ordered-list-slot");

  append(
    root,
    header,
    el(
      "p",
      "form-help",
      "Ordered plain-text paragraphs rendered by the future public Project detail page. The number of paragraphs is not limited."
    ),
    listSlot
  );

  let paragraphs = initialParagraphs.map(row => ({
    id: row.id,
    key: row.id || `local-${(localIdCounter += 1)}`,
    content: row.content,
    sort_order: Number(row.sort_order) || 0
  }));

  function notify() {
    if (typeof onChange === "function") {
      onChange();
    }
  }

  function render() {
    clear(listSlot);

    if (paragraphs.length === 0) {
      append(
        listSlot,
        el(
          "p",
          "form-help",
          "No paragraphs yet. At least one paragraph is required before publishing."
        )
      );
      return;
    }

    const list = el("ol", "ordered-list");

    paragraphs.forEach((paragraph, index) => {
      const item = el("li", "ordered-row");
      const position = String(index + 1).padStart(2, "0");

      append(item, el("span", "ordered-position", position));

      const body = el("div", "ordered-body");
      append(body, el("p", "paragraph-preview", paragraph.content));
      append(item, body);

      const actions = el("div", "ordered-actions");

      const up = actionButton("Move up", `Move paragraph ${position} up`, () =>
        move(index, -1)
      );
      const down = actionButton("Move down", `Move paragraph ${position} down`, () =>
        move(index, 1)
      );

      if (index === 0) {
        up.disabled = true;
      }

      if (index === paragraphs.length - 1) {
        down.disabled = true;
      }

      append(
        actions,
        up,
        down,
        actionButton("Edit", `Edit paragraph ${position}`, () => openEditor(paragraph))
      );

      const remove = actionButton("Remove", `Remove paragraph ${position}`, () =>
        removeParagraph(paragraph, position)
      );
      remove.classList.add("is-danger");
      append(actions, remove);

      append(item, actions);
      append(list, item);
    });

    append(listSlot, list);
  }

  function actionButton(text, ariaLabel, handler) {
    const button = el("button", "ordered-action", text);
    button.type = "button";
    button.setAttribute("aria-label", ariaLabel);
    button.addEventListener("click", handler);
    return button;
  }

  function move(index, direction) {
    const target = index + direction;

    if (target < 0 || target >= paragraphs.length) {
      return;
    }

    const copy = paragraphs.slice();
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);

    // Dense 0..n-1 ordering; gaps and duplicates from the stored data are
    // normalised as soon as the owner reorders.
    paragraphs = copy.map((paragraph, position) => ({
      ...paragraph,
      sort_order: position
    }));

    render();
    notify();
  }

  async function removeParagraph(paragraph, position) {
    const confirmed = await confirmDialog({
      title: `Remove paragraph ${position}?`,
      lines: ["The paragraph is removed from this project when you save."],
      confirmLabel: "Remove",
      variant: "danger"
    });

    if (!confirmed) {
      return;
    }

    paragraphs = paragraphs
      .filter(entry => entry.key !== paragraph.key)
      .map((entry, index) => ({ ...entry, sort_order: index }));

    render();
    notify();
  }

  function openEditor(existing) {
    const isNew = !existing;

    const form = el("form", "modal-form");
    form.noValidate = true;

    const content = textareaField({
      id: "project-paragraph-content",
      label: "Paragraph",
      required: true,
      value: existing ? existing.content : "",
      rows: 7,
      help: "Plain text only. No HTML or formatting markup."
    });

    append(form, content.node);

    const initialValue = content.value;

    const controller = openModal({
      title: isNew ? "Add Paragraph" : "Edit Paragraph",
      body: form,
      actions: [
        {
          label: "Cancel",
          variant: "secondary",
          onClick: ctl => ctl.requestClose("cancel")
        },
        {
          label: isNew ? "Add Paragraph" : "Save Paragraph",
          variant: "primary",
          onClick: () => apply()
        }
      ],
      onRequestClose: async () => {
        if (content.value === initialValue) {
          return true;
        }

        return await confirmDialog({
          title: "Discard changes?",
          lines: ["You have unsaved changes in this form."],
          confirmLabel: "Discard",
          cancelLabel: "Keep Editing",
          variant: "danger"
        });
      }
    });

    form.addEventListener("submit", event => {
      event.preventDefault();
      apply();
    });

    function apply() {
      content.setError("");

      const value = trimmed(content.value);

      if (value === "") {
        content.setError("Paragraph text is required.");
        content.focus();
        return;
      }

      if (isNew) {
        paragraphs = paragraphs.concat({
          id: null,
          key: `local-${(localIdCounter += 1)}`,
          content: value,
          sort_order: paragraphs.length
        });
      } else {
        paragraphs = paragraphs.map(entry =>
          entry.key === existing.key ? { ...entry, content: value } : entry
        );
      }

      controller.close();
      render();
      notify();
    }
  }

  render();

  return {
    element: root,
    getParagraphs: () => paragraphs.map(paragraph => ({ ...paragraph })),
    count: () => paragraphs.length,
    snapshot: () =>
      JSON.stringify(
        paragraphs.map(paragraph => [
          paragraph.id || null,
          paragraph.content,
          paragraph.sort_order
        ])
      ),
    setSavedParagraphs(saved) {
      paragraphs = saved.map((row, index) => ({
        id: row.id,
        key: row.id,
        content: row.content,
        sort_order: Number(row.sort_order) || index
      }));

      render();
    }
  };
}
