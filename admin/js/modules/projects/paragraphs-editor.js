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
import { t } from "../../core/i18n.js";

let localIdCounter = 0;

export function createParagraphsEditor({ initialParagraphs = [], onChange }) {
  const root = el("section", "admin-subsection");

  const header = el("div", "subsection-header");
  append(header, el("h3", "subsection-title", t("projPara.title")));

  const addButton = el(
    "button",
    "admin-button admin-button-secondary",
    t("projPara.add")
  );
  addButton.type = "button";
  addButton.addEventListener("click", () => openEditor(null));
  append(header, addButton);

  const listSlot = el("div", "ordered-list-slot");

  append(
    root,
    header,
    el("p", "form-help", t("projPara.help")),
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
        el("p", "form-help", t("projPara.empty"))
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

      const up = actionButton(
        t("action.moveUp"),
        t("projPara.moveUpOf", { position }),
        () => move(index, -1)
      );

      const down = actionButton(
        t("action.moveDown"),
        t("projPara.moveDownOf", { position }),
        () => move(index, 1)
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
        actionButton(t("common.edit"), t("projPara.editOf", { position }), () =>
          openEditor(paragraph)
        )
      );

      const remove = actionButton(
        t("common.remove"),
        t("projPara.removeOf", { position }),
        () => removeParagraph(paragraph, position)
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
      title: t("projPara.removeTitle", { position }),
      lines: [t("projPara.removeLine")],
      confirmLabel: t("common.remove"),
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
      label: t("projPara.field"),
      required: true,
      value: existing ? existing.content : "",
      rows: 7,
      help: t("projPara.fieldHelp")
    });

    append(form, content.node);

    const initialValue = content.value;

    const controller = openModal({
      title: t(isNew ? "projPara.addTitle" : "projPara.editTitle"),
      body: form,
      actions: [
        {
          label: t("common.cancel"),
          variant: "secondary",
          onClick: ctl => ctl.requestClose("cancel")
        },
        {
          label: t(isNew ? "projPara.addTitle" : "projPara.save"),
          variant: "primary",
          onClick: () => apply()
        }
      ],
      onRequestClose: async () => {
        if (content.value === initialValue) {
          return true;
        }

        return await confirmDialog({
          title: t("discard.title"),
          lines: [t("discard.line")],
          confirmLabel: t("discard.confirm"),
          cancelLabel: t("discard.cancel"),
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
        content.setError(t("projPara.errRequired"));
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
