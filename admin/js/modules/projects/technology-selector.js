/*
  Project technology selector (Phase 8A).

  Selects rows from the shared public.technologies library into
  public.project_technologies. It never creates, edits, enables or disables a
  technology — that stays in the Technologies Manager.

  RULES FROM THE SOURCE OF TRUTH
  ------------------------------
  - Only is_active = true technologies are offered for NEW selection.
  - A technology that is already related but has since been disabled stays
    visible and selected on that project, and is never silently dropped
    (ADMIN-CMS-DATABASE.md section 33 / section 57).
  - show_in_public_stack does NOT gate project eligibility: project-only tags
    (show_in_public_stack = false) are perfectly valid selections.
  - Duplicates are impossible: project_technologies has a composite primary key
    (project_id, technology_id); the UI simply cannot offer a selected row twice.

  Selection is staged locally and diffed on save by editor-view.js.
*/

import { el, append, clear } from "../../core/dom.js";
import { t } from "../../core/i18n.js";

export function createTechnologySelector({
  technologies = [],
  initialSelectedIds = [],
  onChange
}) {
  const root = el("section", "admin-subsection");
  append(root, el("h3", "subsection-title", t("projTech.title")));

  append(root, el("p", "form-help", t("projTech.help")));

  const byId = new Map(technologies.map(row => [row.id, row]));

  let selected = initialSelectedIds.filter(id => byId.has(id));
  let search = "";

  /* ---------------- selected chips ---------------- */

  const selectedBlock = el("div", "selector-block");
  append(selectedBlock, el("h4", "selector-heading", t("projTech.selected")));
  const selectedSlot = el("div", "selector-chips");
  append(selectedBlock, selectedSlot);

  /* ---------------- search + available ---------------- */

  const searchField = el("div", "form-field");
  const searchLabel = el("label", "form-label", t("projTech.searchLabel"));
  const searchInput = el("input", "admin-input");
  searchInput.type = "search";
  searchInput.id = "project-technology-search";
  searchInput.placeholder = t("projTech.searchPlaceholder");
  searchInput.autocomplete = "off";
  searchLabel.htmlFor = searchInput.id;

  searchInput.addEventListener("input", () => {
    search = searchInput.value;
    renderAvailable();
  });

  append(searchField, searchLabel, searchInput);

  const availableBlock = el("div", "selector-block");
  append(availableBlock, el("h4", "selector-heading", t("projTech.available")));
  const availableSlot = el("div", "selector-options");
  append(availableBlock, availableSlot);

  append(root, selectedBlock, searchField, availableBlock);

  function notify() {
    if (typeof onChange === "function") {
      onChange();
    }
  }

  function labelFor(row) {
    if (!row.show_in_public_stack) {
      return t("projTech.projectOnly");
    }

    return row.public_group === "languages"
      ? t("projTech.groupLanguages")
      : row.public_group === "development_systems"
      ? t("projTech.groupDevelopment")
      : row.public_group === "tools_platforms"
      ? t("projTech.groupTools")
      : t("projTech.groupPublic");
  }

  function renderSelected() {
    clear(selectedSlot);

    if (selected.length === 0) {
      append(
        selectedSlot,
        el("p", "form-help", t("projTech.emptySelected"))
      );
      return;
    }

    selected.forEach(id => {
      const row = byId.get(id);

      if (!row) {
        return;
      }

      const chip = el("span", "selector-chip");
      append(chip, el("span", "selector-chip-label", row.name));

      if (row.is_active === false) {
        append(
          chip,
          el("span", "status-badge status-badge-disabled", t("status.inactive"))
        );
      }

      const remove = el("button", "selector-chip-remove", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", t("projTech.removeOf", { name: row.name }));
      remove.addEventListener("click", () => {
        selected = selected.filter(entry => entry !== id);
        renderSelected();
        renderAvailable();
        notify();
      });

      append(chip, remove);
      append(selectedSlot, chip);
    });
  }

  function renderAvailable() {
    clear(availableSlot);

    const term = search.trim().toLowerCase();
    const selectedSet = new Set(selected);

    const options = technologies.filter(row => {
      // Disabled technologies are never offered for a NEW selection.
      if (row.is_active === false) {
        return false;
      }

      if (selectedSet.has(row.id)) {
        return false;
      }

      if (term === "") {
        return true;
      }

      return (
        String(row.name || "").toLowerCase().includes(term) ||
        String(row.slug || "").toLowerCase().includes(term)
      );
    });

    if (options.length === 0) {
      append(
        availableSlot,
        el(
          "p",
          "form-help",
          technologies.length === 0
            ? t("projTech.emptyAll")
            : t("projTech.emptyMatch")
        )
      );
      return;
    }

    options.forEach(row => {
      const button = el("button", "selector-option");
      button.type = "button";
      button.setAttribute("aria-label", t("projTech.addOf", { name: row.name }));

      append(
        button,
        el("span", "selector-option-name", row.name),
        el("span", "selector-option-group", labelFor(row))
      );

      button.addEventListener("click", () => {
        if (!selected.includes(row.id)) {
          selected = selected.concat(row.id);
        }

        renderSelected();
        renderAvailable();
        notify();
      });

      append(availableSlot, button);
    });
  }

  renderSelected();
  renderAvailable();

  return {
    element: root,
    getSelectedIds: () => selected.slice(),
    getSelectedNames: () =>
      selected.map(id => (byId.get(id) ? byId.get(id).name : "")).filter(Boolean),
    snapshot: () => JSON.stringify(selected),
    setSavedIds(ids) {
      selected = ids.filter(id => byId.has(id));
      renderSelected();
      renderAvailable();
    }
  };
}
