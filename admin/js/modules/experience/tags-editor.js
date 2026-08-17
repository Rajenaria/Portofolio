/*
  Experience tag editor (Phase 7).

  Tags are simple per-Experience labels in public.experience_tags. They are NOT
  the shared Technologies library and are never joined to public.technologies
  (Features doc section 14.4, Design doc section 20).

  STAGED, NOT IMMEDIATE
  ---------------------
  Tags live in local state and are persisted by the editor's Save, for two
  reasons:

    - a brand new Experience has no id yet, so its tags cannot be inserted
      until the parent row exists;
    - mixing immediate tag writes into a form that also has unsaved text would
      make "unsaved changes" meaningless.

  On save the editor diffs this list against what was loaded and issues the
  minimum set of inserts / updates / deletes.

  The database enforces unique (experience_id, lower(label)); the duplicate
  check here only produces a friendlier message.
*/

import { el, append, clear } from "../../core/dom.js";
import { openModal, confirmDialog } from "../../core/modal.js";
import { textField, trimmed } from "../../core/form.js";

export const TAG_LABEL_MAX = 100;

let localIdCounter = 0;

export function createTagsEditor({ initialTags = [], onChange }) {
  const root = el("section", "admin-subsection");

  const header = el("div", "subsection-header");
  append(header, el("h3", "subsection-title", "Tags"));

  const addButton = el("button", "admin-button admin-button-secondary", "+ Add Tag");
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
      "Short plain-text labels shown as chips on the Experience card, for example: Networking, Cybersecurity, Leadership."
    ),
    listSlot
  );

  /*
    Working copy. Each entry keeps its database id when it has one; new tags
    carry a temporary local key so the UI can track them before insert.
  */
  let tags = initialTags.map(tag => ({
    id: tag.id,
    key: tag.id || `local-${(localIdCounter += 1)}`,
    label: tag.label,
    sort_order: Number(tag.sort_order) || 0
  }));

  function notify() {
    if (typeof onChange === "function") {
      onChange();
    }
  }

  function render() {
    clear(listSlot);

    if (tags.length === 0) {
      append(
        listSlot,
        el("p", "form-help", "No tags yet. Tags are optional.")
      );
      return;
    }

    const list = el("ol", "ordered-list");

    tags.forEach((tag, index) => {
      const item = el("li", "ordered-row");

      append(
        item,
        el("span", "ordered-position", String(index + 1).padStart(2, "0"))
      );

      const body = el("div", "ordered-body");
      append(body, el("span", "ordered-title", tag.label));
      append(item, body);

      const actions = el("div", "ordered-actions");

      const up = actionButton("Move up", `Move ${tag.label} up`, () => move(index, -1));
      const down = actionButton("Move down", `Move ${tag.label} down`, () => move(index, 1));

      if (index === 0) {
        up.disabled = true;
      }

      if (index === tags.length - 1) {
        down.disabled = true;
      }

      append(
        actions,
        up,
        down,
        actionButton("Edit", `Edit ${tag.label}`, () => openEditor(tag))
      );

      const remove = actionButton("Remove", `Remove ${tag.label}`, () => removeTag(tag));
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

    if (target < 0 || target >= tags.length) {
      return;
    }

    const copy = tags.slice();
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);

    // Dense 0..n-1 ordering; duplicates and gaps in the loaded data are
    // normalised the moment the owner reorders.
    tags = copy.map((tag, position) => ({ ...tag, sort_order: position }));

    render();
    notify();
  }

  async function removeTag(tag) {
    const confirmed = await confirmDialog({
      title: `Remove tag "${tag.label}"?`,
      lines: ["The tag is removed from this experience when you save."],
      confirmLabel: "Remove",
      variant: "danger"
    });

    if (!confirmed) {
      return;
    }

    tags = tags
      .filter(entry => entry.key !== tag.key)
      .map((entry, position) => ({ ...entry, sort_order: position }));

    render();
    notify();
  }

  function openEditor(existing) {
    const isNew = !existing;

    const form = el("form", "modal-form");
    form.noValidate = true;

    const formError = el("p", "form-error");
    formError.setAttribute("role", "alert");

    const label = textField({
      id: "experience-tag-label",
      label: "Tag Label",
      required: true,
      maxLength: TAG_LABEL_MAX,
      value: existing ? existing.label : "",
      help: "Plain text only, for example: Cybersecurity."
    });

    append(form, formError, label.node);

    const submit = el("button", "visually-hidden");
    submit.type = "submit";
    submit.tabIndex = -1;
    append(form, submit);

    const initialValue = label.value;

    const controller = openModal({
      title: isNew ? "Add Tag" : "Edit Tag",
      body: form,
      size: "small",
      actions: [
        {
          label: "Cancel",
          variant: "secondary",
          onClick: ctl => ctl.requestClose("cancel")
        },
        {
          label: isNew ? "Add Tag" : "Save Tag",
          variant: "primary",
          onClick: () => apply()
        }
      ],
      onRequestClose: async () => {
        if (label.value === initialValue) {
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
      label.setError("");
      formError.textContent = "";

      const value = trimmed(label.value);

      if (value === "") {
        label.setError("Tag label is required.");
        label.focus();
        return;
      }

      if (value.length > TAG_LABEL_MAX) {
        label.setError(
          `Tag label must be ${TAG_LABEL_MAX} characters or fewer (currently ${value.length}).`
        );
        label.focus();
        return;
      }

      const duplicate = tags.find(
        entry =>
          (!existing || entry.key !== existing.key) &&
          entry.label.toLowerCase() === value.toLowerCase()
      );

      if (duplicate) {
        label.setError("This experience already has a tag with that label.");
        label.focus();
        return;
      }

      if (isNew) {
        tags = tags.concat({
          id: null,
          key: `local-${(localIdCounter += 1)}`,
          label: value,
          sort_order: tags.length
        });
      } else {
        tags = tags.map(entry =>
          entry.key === existing.key ? { ...entry, label: value } : entry
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
    getTags: () => tags.map(tag => ({ ...tag })),
    snapshot: () =>
      JSON.stringify(tags.map(tag => [tag.id || null, tag.label, tag.sort_order])),
    setSavedTags(savedTags) {
      tags = savedTags.map((tag, position) => ({
        id: tag.id,
        key: tag.id,
        label: tag.label,
        sort_order: Number(tag.sort_order) || position
      }));

      render();
    }
  };
}
