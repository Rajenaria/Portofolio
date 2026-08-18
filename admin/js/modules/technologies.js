/*
  Technologies Manager (CMS Phase 4).

  Central technology / project-tag library shared by the public About Tech Stack
  and, later, by the Project editor. This module manages `public.technologies`
  only. It reads `public.project_technologies` for the usage count and never
  writes to it.

  SCOPE BOUNDARIES
  ----------------
  - No permanent delete: V1 uses Disable (docs/Design section 43).
  - No drag-and-drop: Move Up / Move Down over `sort_order` (docs/Design 44).
  - No public renderer changes: the public Tech Stack stays static this phase.
  - No project relationship editing.

  SECURITY
  --------
  Authorization is PostgreSQL RLS (owner + aal2). Everything here is UX.
  Every database value reaches the DOM through createElement + textContent via
  js/core/dom.js — there is no innerHTML path. `icon_key` is treated as an
  opaque identifier and is never interpreted as markup, SVG, CSS or a URL.
  Database constraints (case-insensitive unique name, unique slug, slug regex,
  public_group allow-list, public_group-required-when-public) remain
  authoritative; the checks below only produce friendlier messages.
*/

import { supabaseClient } from "../core/supabase.js";

import {
  el,
  append,
  clear,
  pageHeader,
  emptyState
} from "../core/dom.js";

import { openModal, confirmDialog, closeAllModals } from "../core/modal.js";
import { toast } from "../core/toast.js";

const PUBLIC_GROUPS = [
  { value: "languages", label: "Languages" },
  { value: "development_systems", label: "Development & Systems" },
  { value: "tools_platforms", label: "Tools & Platforms" }
];

const GROUP_LABELS = PUBLIC_GROUPS.reduce((map, group) => {
  map[group.value] = group.label;
  return map;
}, {});

const NAME_MAX = 100;
const SLUG_MAX = 120;
const ICON_KEY_MAX = 120;

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/*
  Two accepted shapes, both plain identifiers — never markup, URLs or
  whitespace:

    1. an Iconify id, "collection:name" (simple-icons:nextdotjs). This is what
       the picker writes and what the public renderer hands to <iconify-icon>.
    2. a legacy bare key (docker, figma) still stored on rows created before
       the picker existed, resolved through the public site's local icon map.

  Neither shape can contain <, >, ", /, whitespace or a scheme, so a stored
  value can only ever be an icon identifier — it can never become markup, a
  data: URL or a path traversal.
*/

const ICONIFY_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*:[a-z0-9]+(-[a-z0-9]+)*$/;

const LEGACY_ICON_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

function isValidIconKey(value) {
  return ICONIFY_ID_PATTERN.test(value) || LEGACY_ICON_KEY_PATTERN.test(value);
}

/*
  Iconify's public API. Search feeds the picker; the SVG endpoint feeds the
  preview through a plain <img>, which cannot execute script and needs no
  innerHTML. Both origins are added to the Admin CSP as connect-src / img-src.
*/

const ICONIFY_API = "https://api.iconify.design";

// Brand/technology icons live here, so they are offered first.
const ICONIFY_PREFERRED_PREFIX = "simple-icons";

export const technologiesRoute = {
  name: "technologies",
  title: "Technologies",
  render
};

async function render(container, { signal }) {
  const state = {
    items: [],
    usage: new Map(),
    filters: {
      search: "",
      group: "all",
      status: "all"
    },
    status: "loading"
  };

  let closeOpenMenu = null;

  function closeMenu() {
    if (closeOpenMenu) {
      closeOpenMenu();
      closeOpenMenu = null;
    }
  }

  function handleDocumentPointerDown(event) {
    if (!closeOpenMenu) {
      return;
    }

    const menu = container.querySelector(".row-actions.is-open");

    if (menu && !menu.contains(event.target)) {
      closeMenu();
    }
  }

  function handleDocumentKeydown(event) {
    if (event.key === "Escape" && closeOpenMenu) {
      closeMenu();
    }
  }

  document.addEventListener("pointerdown", handleDocumentPointerDown);
  document.addEventListener("keydown", handleDocumentKeydown);

  append(
    container,
    pageHeader({
      title: "Technologies",
      subtitle:
        "Manage technologies and project tags used across your portfolio.",
      actions: [
        {
          label: "+ Add Technology",
          variant: "primary",
          onClick: () => openEditor(null)
        }
      ]
    })
  );

  const toolbar = buildToolbar();
  append(container, toolbar.node);

  const listSlot = el("div", "table-slot");
  append(container, listSlot);

  await load();

  return () => {
    document.removeEventListener("pointerdown", handleDocumentPointerDown);
    document.removeEventListener("keydown", handleDocumentKeydown);
    closeMenu();
    closeAllModals();
  };

  /* ---------------------------------------------------------------- */
  /* Data                                                              */
  /* ---------------------------------------------------------------- */

  async function load() {
    state.status = "loading";
    renderList();

    let technologies;
    let relationships;

    try {
      [technologies, relationships] = await Promise.all([
        supabaseClient
          .from("technologies")
          .select(
            "id, name, slug, icon_key, public_group, show_in_public_stack, is_active, sort_order, created_at"
          )
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),

        // Usage count is always derived, never stored on `technologies`.
        supabaseClient.from("project_technologies").select("technology_id")
      ]);
    } catch (error) {
      if (signal.aborted) {
        return;
      }

      console.error(error);
      state.status = "error";
      renderList();
      return;
    }

    if (signal.aborted) {
      return;
    }

    if (technologies.error || relationships.error) {
      console.error(technologies.error || relationships.error);
      state.status = "error";
      renderList();
      return;
    }

    state.items = technologies.data || [];

    state.usage = new Map();
    (relationships.data || []).forEach(row => {
      const current = state.usage.get(row.technology_id) || 0;
      state.usage.set(row.technology_id, current + 1);
    });

    state.status = "ready";
    renderList();
  }

  /* ---------------------------------------------------------------- */
  /* Toolbar                                                           */
  /* ---------------------------------------------------------------- */

  function buildToolbar() {
    const node = el("div", "admin-toolbar");

    const searchField = el("div", "toolbar-field toolbar-field-search");
    const searchLabel = el("label", "toolbar-label", "Search");
    const searchInput = el("input", "admin-input");

    searchInput.type = "search";
    searchInput.id = "technology-search";
    searchInput.placeholder = "Search technologies...";
    searchInput.autocomplete = "off";
    searchLabel.htmlFor = searchInput.id;

    searchInput.addEventListener("input", () => {
      state.filters.search = searchInput.value;
      closeMenu();
      renderList();
    });

    append(searchField, searchLabel, searchInput);

    const groupField = buildSelectField({
      id: "technology-group-filter",
      label: "Public Group",
      options: [
        { value: "all", label: "All" },
        ...PUBLIC_GROUPS,
        { value: "project_only", label: "Project-only" }
      ],
      onChange: value => {
        state.filters.group = value;
        closeMenu();
        renderList();
      }
    });

    const statusField = buildSelectField({
      id: "technology-status-filter",
      label: "Status",
      options: [
        { value: "all", label: "All" },
        { value: "active", label: "Active" },
        { value: "disabled", label: "Disabled" }
      ],
      onChange: value => {
        state.filters.status = value;
        closeMenu();
        renderList();
      }
    });

    append(node, searchField, groupField.node, statusField.node);

    return { node };
  }

  function buildSelectField({ id, label, options, onChange }) {
    const field = el("div", "toolbar-field");
    const fieldLabel = el("label", "toolbar-label", label);
    const select = el("select", "admin-select");

    select.id = id;
    fieldLabel.htmlFor = id;

    options.forEach(option => {
      const optionNode = el("option", null, option.label);
      optionNode.value = option.value;
      append(select, optionNode);
    });

    select.addEventListener("change", () => onChange(select.value));

    append(field, fieldLabel, select);

    return { node: field, select };
  }

  /* ---------------------------------------------------------------- */
  /* Filtering                                                         */
  /* ---------------------------------------------------------------- */

  function filtersActive() {
    return (
      state.filters.search.trim() !== "" ||
      state.filters.group !== "all" ||
      state.filters.status !== "all"
    );
  }

  function visibleItems() {
    const term = state.filters.search.trim().toLowerCase();

    return state.items.filter(item => {
      if (term) {
        const name = (item.name || "").toLowerCase();
        const slug = (item.slug || "").toLowerCase();

        if (!name.includes(term) && !slug.includes(term)) {
          return false;
        }
      }

      if (state.filters.group === "project_only") {
        if (item.show_in_public_stack) {
          return false;
        }
      } else if (state.filters.group !== "all") {
        if (item.public_group !== state.filters.group) {
          return false;
        }
      }

      if (state.filters.status === "active" && !item.is_active) {
        return false;
      }

      if (state.filters.status === "disabled" && item.is_active) {
        return false;
      }

      return true;
    });
  }

  /* ---------------------------------------------------------------- */
  /* List rendering                                                    */
  /* ---------------------------------------------------------------- */

  function renderList() {
    closeMenu();
    clear(listSlot);

    if (state.status === "loading") {
      append(listSlot, el("p", "loading-text", "Loading technologies..."));
      return;
    }

    if (state.status === "error") {
      append(listSlot, buildErrorPanel());
      return;
    }

    if (state.items.length === 0) {
      append(
        listSlot,
        emptyState({
          title: "No technologies yet.",
          description:
            "Add your first technology to start building the shared technology library."
        })
      );
      return;
    }

    const rows = visibleItems();

    if (rows.length === 0) {
      append(
        listSlot,
        emptyState({
          title: "No technologies match your filters.",
          description: "Try another search term, public group or status."
        })
      );
      return;
    }

    append(listSlot, buildTable(rows));

    const summary = el(
      "p",
      "table-summary",
      rows.length === state.items.length
        ? `${state.items.length} technologies`
        : `${rows.length} of ${state.items.length} technologies`
    );

    append(listSlot, summary);

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
      el("p", "admin-alert-title", "Could not load technologies."),
      el(
        "p",
        "admin-alert-text",
        "Check your connection and try again. If the problem continues, sign out and sign in again."
      )
    );

    const retry = el(
      "button",
      "admin-button admin-button-secondary",
      "Try Again"
    );

    retry.type = "button";
    retry.addEventListener("click", () => {
      load();
    });

    append(panel, retry);

    return panel;
  }

  function buildTable(rows) {
    const wrap = el("div", "admin-table-wrap");
    const table = el("table", "admin-table admin-table-technologies");

    const thead = el("thead");
    const headRow = el("tr");

    [
      "Icon",
      "Technology",
      "Public Group",
      "Public",
      "Status",
      "Usage"
    ].forEach(label => {
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

    rows.forEach(item => {
      append(tbody, buildRow(item));
    });

    append(table, tbody);
    append(wrap, table);

    return wrap;
  }

  function buildRow(item) {
    const row = el("tr", item.is_active ? "" : "is-disabled-row");

    // Icon: safe initials only. icon_key is never rendered as markup.
    const iconCell = cell("Icon");
    const badge = el("span", "tech-icon", initialsFor(item.name));
    badge.setAttribute("aria-hidden", "true");
    append(iconCell, badge);

    const nameCell = cell("Technology");
    append(nameCell, el("span", "tech-name", item.name));

    const meta = el("span", "tech-meta");
    append(meta, el("span", "tech-slug", item.slug));

    if (item.icon_key) {
      append(meta, el("span", "tech-icon-key", `icon: ${item.icon_key}`));
    }

    append(nameCell, meta);

    const groupCell = cell("Public Group");
    append(
      groupCell,
      el(
        "span",
        item.public_group ? "tech-group" : "tech-group tech-group-none",
        item.public_group
          ? GROUP_LABELS[item.public_group] || item.public_group
          : "Project-only"
      )
    );

    const publicCell = cell("Public");
    append(
      publicCell,
      el(
        "span",
        item.show_in_public_stack
          ? "flag-badge flag-badge-yes"
          : "flag-badge flag-badge-no",
        item.show_in_public_stack ? "Yes" : "No"
      )
    );

    const statusCell = cell("Status");
    append(
      statusCell,
      el(
        "span",
        item.is_active
          ? "status-badge status-badge-active"
          : "status-badge status-badge-disabled",
        item.is_active ? "Active" : "Disabled"
      )
    );

    const usageCount = state.usage.get(item.id) || 0;
    const usageCell = cell("Usage");
    append(usageCell, el("span", "usage-count", usageCount));
    append(
      usageCell,
      el(
        "span",
        "visually-hidden",
        usageCount === 1 ? " project" : " projects"
      )
    );

    const actionsCell = cell("Actions");
    actionsCell.className = "cell-actions";
    append(actionsCell, buildActionsMenu(item));

    append(
      row,
      iconCell,
      nameCell,
      groupCell,
      publicCell,
      statusCell,
      usageCell,
      actionsCell
    );

    return row;
  }

  function cell(label) {
    const node = el("td");
    node.dataset.label = label;
    return node;
  }

  /* ---------------------------------------------------------------- */
  /* Row actions menu                                                  */
  /* ---------------------------------------------------------------- */

  function buildActionsMenu(item) {
    const wrap = el("div", "row-actions");

    const trigger = el("button", "icon-button", "⋯");
    trigger.type = "button";
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", `Actions for ${item.name}`);

    trigger.addEventListener("click", () => {
      const isOpen = wrap.classList.contains("is-open");

      closeMenu();

      if (isOpen) {
        return;
      }

      openMenu();
    });

    append(wrap, trigger);

    function openMenu() {
      const index = state.items.findIndex(entry => entry.id === item.id);
      const canReorder = !filtersActive();

      const menu = el("div", "row-menu");
      menu.setAttribute("role", "menu");

      const entries = [
        {
          label: "Edit",
          onSelect: () => openEditor(item)
        },
        {
          label: "Move Up",
          disabled: !canReorder || index <= 0,
          hint: canReorder ? null : "Clear search and filters to reorder.",
          onSelect: () => move(index, -1)
        },
        {
          label: "Move Down",
          disabled: !canReorder || index === -1 || index >= state.items.length - 1,
          hint: canReorder ? null : "Clear search and filters to reorder.",
          onSelect: () => move(index, 1)
        },
        {
          label: item.is_active ? "Disable" : "Enable",
          onSelect: () => toggleActive(item)
        }
      ];

      const buttons = [];

      entries.forEach(entry => {
        const button = el("button", "row-menu-item", entry.label);
        button.type = "button";
        button.setAttribute("role", "menuitem");

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
        const next =
          (current + step + enabled.length) % enabled.length;

        enabled[next].focus();
      });

      append(wrap, menu);
      wrap.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");

      const firstEnabled = buttons.find(button => !button.disabled);

      if (firstEnabled) {
        firstEnabled.focus();
      }

      closeOpenMenu = () => {
        // Only pull focus back to the trigger when focus is actually inside
        // the menu; otherwise typing in the search box would lose focus every
        // time the list re-renders.
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

  /* ---------------------------------------------------------------- */
  /* Reorder                                                           */
  /* ---------------------------------------------------------------- */

  async function move(index, direction) {
    const target = index + direction;

    if (index < 0 || target < 0 || target >= state.items.length) {
      return;
    }

    const reordered = state.items.slice();
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);

    /*
      Normalise to a dense 0..n-1 sequence and write only the rows whose value
      actually changed. This stays correct when the stored sort_order contains
      duplicates or gaps, which the schema deliberately allows
      (ADMIN-CMS-DATABASE.md section 8).
    */
    const updates = [];

    reordered.forEach((entry, position) => {
      if (Number(entry.sort_order) !== position) {
        updates.push({ id: entry.id, sort_order: position });
      }
    });

    if (updates.length === 0) {
      return;
    }

    for (const update of updates) {
      const { data, error } = await supabaseClient
        .from("technologies")
        .update({ sort_order: update.sort_order })
        .eq("id", update.id)
        .select("id");

      if (signal.aborted) {
        return;
      }

      if (error || !data || data.length === 0) {
        if (error) {
          console.error(error);
        }

        toast(
          error
            ? friendlyDbError(error)
            : "Could not reorder technologies. Your session may not be authorized.",
          "error"
        );

        await load();
        return;
      }
    }

    toast("Order updated.");
    await load();
  }

  /* ---------------------------------------------------------------- */
  /* Enable / Disable                                                  */
  /* ---------------------------------------------------------------- */

  async function toggleActive(item) {
    const disabling = item.is_active;

    const confirmed = await confirmDialog({
      title: disabling ? `Disable ${item.name}?` : `Enable ${item.name}?`,
      lines: disabling
        ? [
            "This technology will no longer be available for new project selections.",
            `Existing projects using ${item.name} will keep their current relationship.`
          ]
        : [
            "This technology will become available for new project selections again."
          ],
      confirmLabel: disabling ? "Disable" : "Enable",
      variant: disabling ? "danger" : "primary"
    });

    if (!confirmed || signal.aborted) {
      return;
    }

    const { data, error } = await supabaseClient
      .from("technologies")
      .update({ is_active: !item.is_active })
      .eq("id", item.id)
      .select("id");

    if (signal.aborted) {
      return;
    }

    if (error || !data || data.length === 0) {
      if (error) {
        console.error(error);
      }

      toast(
        error
          ? friendlyDbError(error)
          : "Could not update this technology. Your session may not be authorized.",
        "error"
      );

      return;
    }

    toast(disabling ? "Technology disabled." : "Technology enabled.");
    await load();
  }

  /* ---------------------------------------------------------------- */
  /* Add / Edit modal                                                  */
  /* ---------------------------------------------------------------- */

  function openEditor(existing) {
    const isNew = !existing;

    const form = el("form", "modal-form");
    form.noValidate = true;

    const formError = el("p", "form-error");
    formError.setAttribute("role", "alert");
    append(form, formError);

    const nameField = textField({
      id: "technology-name",
      label: "Name",
      required: true,
      maxLength: NAME_MAX,
      value: existing ? existing.name : ""
    });

    const slugField = textField({
      id: "technology-slug",
      label: "Slug",
      maxLength: SLUG_MAX,
      value: existing ? existing.slug : "",
      help: isNew
        ? "Auto-generated from the name. Lowercase letters, numbers and hyphens."
        : "Changing the slug changes future public links. Lowercase letters, numbers and hyphens."
    });

    const iconField = textField({
      id: "technology-icon-key",
      label: "Icon (Iconify id)",
      maxLength: ICON_KEY_MAX,
      value: existing && existing.icon_key ? existing.icon_key : "",
      help:
        "Search below, or type an Iconify id such as simple-icons:react. Identifiers only — markup is not accepted."
    });

    const iconPicker = createIconPicker(iconField);

    const publicField = checkboxField({
      id: "technology-public",
      label: "Show in Public Tech Stack",
      checked: existing ? existing.show_in_public_stack : false
    });

    const groupField = selectField({
      id: "technology-public-group",
      label: "Public Group",
      value: existing && existing.public_group ? existing.public_group : "",
      placeholder: "Select a group",
      options: PUBLIC_GROUPS,
      help: "Required when the technology appears in the public Tech Stack."
    });

    const activeField = checkboxField({
      id: "technology-active",
      label: "Active",
      checked: existing ? existing.is_active : true
    });

    append(
      form,
      nameField.node,
      slugField.node,
      iconPicker.node,
      publicField.node,
      groupField.node,
      activeField.node
    );

    // Hidden submit keeps Enter-to-save working without a real form action
    // (the CSP sets form-action 'none'; submission is always prevented).
    const hiddenSubmit = el("button", "visually-hidden");
    hiddenSubmit.type = "submit";
    hiddenSubmit.tabIndex = -1;
    append(form, hiddenSubmit);

    let slugTouched = !isNew;

    nameField.input.addEventListener("input", () => {
      if (isNew && !slugTouched) {
        slugField.input.value = slugify(nameField.input.value);
      }
    });

    slugField.input.addEventListener("input", () => {
      slugTouched = true;
    });

    function syncGroupState() {
      const isPublic = publicField.input.checked;

      groupField.select.disabled = !isPublic;
      groupField.node.classList.toggle("is-disabled", !isPublic);

      if (!isPublic) {
        // Project-only records carry no public group.
        groupField.select.value = "";
      }
    }

    publicField.input.addEventListener("change", syncGroupState);
    syncGroupState();

    const initial = snapshot();

    function snapshot() {
      return JSON.stringify({
        name: nameField.input.value,
        slug: slugField.input.value,
        iconKey: iconField.input.value,
        isPublic: publicField.input.checked,
        group: groupField.select.value,
        isActive: activeField.input.checked
      });
    }

    function isDirty() {
      return snapshot() !== initial;
    }

    const controller = openModal({
      title: isNew ? "Add Technology" : "Edit Technology",
      body: form,
      actions: [
        {
          label: "Cancel",
          variant: "secondary",
          onClick: ctl => ctl.requestClose("cancel")
        },
        {
          label: isNew ? "Add Technology" : "Save Changes",
          variant: "primary",
          onClick: () => submit()
        }
      ],
      onRequestClose: async () => {
        if (!isDirty()) {
          return true;
        }

        return await confirmDialog({
          title: "Discard changes?",
          lines: [
            "You have unsaved changes. Your changes will be lost if you leave this form."
          ],
          confirmLabel: "Discard",
          cancelLabel: "Keep Editing",
          variant: "danger"
        });
      }
    });

    form.addEventListener("submit", event => {
      event.preventDefault();
      submit();
    });

    async function submit() {
      clearErrors();

      const values = {
        name: nameField.input.value.trim(),
        slug: slugField.input.value.trim().toLowerCase(),
        iconKey: iconField.input.value.trim(),
        isPublic: publicField.input.checked,
        group: groupField.select.value,
        isActive: activeField.input.checked
      };

      if (isNew && values.slug === "") {
        values.slug = slugify(values.name);
        slugField.input.value = values.slug;
      }

      const errors = validate(values, existing);

      if (Object.keys(errors).length > 0) {
        showErrors(errors);
        return;
      }

      const payload = {
        name: values.name,
        slug: values.slug,
        icon_key: values.iconKey === "" ? null : values.iconKey,
        show_in_public_stack: values.isPublic,
        public_group: values.isPublic ? values.group : null,
        is_active: values.isActive
      };

      controller.setBusy(true, isNew ? "Adding..." : "Saving...");

      let result;

      if (isNew) {
        payload.sort_order = nextSortOrder();

        result = await supabaseClient
          .from("technologies")
          .insert(payload)
          .select("id");
      } else {
        result = await supabaseClient
          .from("technologies")
          .update(payload)
          .eq("id", existing.id)
          .select("id");
      }

      if (signal.aborted) {
        return;
      }

      controller.setBusy(false);
      syncGroupState();

      if (result.error) {
        console.error(result.error);
        formError.textContent = friendlyDbError(result.error);
        return;
      }

      // An UPDATE filtered out by RLS returns 200 with zero rows.
      if (!result.data || result.data.length === 0) {
        formError.textContent =
          "Could not save this technology. Your session may not be authorized.";
        return;
      }

      controller.close();
      toast(isNew ? "Technology added." : "Changes saved successfully.");
      await load();
    }

    function clearErrors() {
      formError.textContent = "";

      [nameField, slugField, iconField, groupField].forEach(field => {
        field.setError("");
      });
    }

    function showErrors(errors) {
      if (errors.name) {
        nameField.setError(errors.name);
      }

      if (errors.slug) {
        slugField.setError(errors.slug);
      }

      if (errors.iconKey) {
        iconField.setError(errors.iconKey);
      }

      if (errors.group) {
        groupField.setError(errors.group);
      }

      formError.textContent = "Please correct the highlighted fields.";

      const firstInvalid = [nameField, slugField, iconField, groupField].find(
        field => field.errorNode.textContent !== ""
      );

      if (firstInvalid) {
        firstInvalid.focus();
      }
    }
  }

  function validate(values, existing) {
    const errors = {};

    if (values.name === "") {
      errors.name = "Technology name is required.";
    } else if (values.name.length > NAME_MAX) {
      errors.name = `Use ${NAME_MAX} characters or fewer.`;
    } else {
      const duplicateName = state.items.find(
        item =>
          (!existing || item.id !== existing.id) &&
          (item.name || "").toLowerCase() === values.name.toLowerCase()
      );

      if (duplicateName) {
        errors.name = `A technology named "${duplicateName.name}" already exists.`;
      }
    }

    if (values.slug === "") {
      errors.slug =
        "Slug is required. Use lowercase letters, numbers and hyphens.";
    } else if (values.slug.length > SLUG_MAX) {
      errors.slug = `Use ${SLUG_MAX} characters or fewer.`;
    } else if (!SLUG_PATTERN.test(values.slug)) {
      errors.slug =
        "Use lowercase letters, numbers and single hyphens, for example: node-js.";
    } else {
      const duplicateSlug = state.items.find(
        item =>
          (!existing || item.id !== existing.id) &&
          (item.slug || "").toLowerCase() === values.slug
      );

      if (duplicateSlug) {
        errors.slug = "This slug is already used by another technology.";
      }
    }

    if (values.iconKey !== "") {
      if (values.iconKey.length > ICON_KEY_MAX) {
        errors.iconKey = `Use ${ICON_KEY_MAX} characters or fewer.`;
      } else if (!isValidIconKey(values.iconKey)) {
        errors.iconKey =
          "Pick an icon from the search, or type an Iconify id such as simple-icons:react.";
      }
    }

    if (values.isPublic && values.group === "") {
      errors.group =
        "Select a public group to show this technology in the public Tech Stack.";
    }

    return errors;
  }

  function nextSortOrder() {
    if (state.items.length === 0) {
      return 0;
    }

    return (
      state.items.reduce(
        (max, item) => Math.max(max, Number(item.sort_order) || 0),
        0
      ) + 1
    );
  }
}

/* ------------------------------------------------------------------ */
/* Icon picker                                                         */
/*                                                                     */
/* Searches Iconify rather than shipping a hand-maintained icon list,  */
/* so a new technology (React, Next.js, Supabase…) needs no code       */
/* change. Only the identifier is ever stored.                         */
/*                                                                     */
/* SECURITY: results are rendered as <img src=".../<prefix>/<name>.svg">*/
/* built from an identifier that already matched ICONIFY_ID_PATTERN,   */
/* then encoded. No SVG payload is ever parsed, injected or trusted —  */
/* an <img> cannot execute script, and there is no innerHTML here.     */
/* ------------------------------------------------------------------ */

function iconPreviewUrl(iconId) {
  if (!ICONIFY_ID_PATTERN.test(iconId)) {
    return null;
  }

  const [prefix, name] = iconId.split(":");

  return `${ICONIFY_API}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`;
}

function createIconPicker(iconField) {

  const node = el("div", "form-field icon-picker");

  /* ---- label + combobox input ---- */

  const label = el("label", "form-label", "Icon");
  label.htmlFor = "technology-icon-search";
  append(node, label);

  const combo = el("div", "icon-combobox");

  const search = el("input", "admin-input icon-combobox-input");
  search.type = "text";
  search.id = "technology-icon-search";
  search.placeholder = "Search icon… e.g. LinkedIn, React, Next.js";
  search.autocomplete = "off";
  search.spellcheck = false;
  search.setAttribute("role", "combobox");
  search.setAttribute("aria-expanded", "false");
  search.setAttribute("aria-autocomplete", "list");
  search.setAttribute("aria-controls", "technology-icon-listbox");

  const panel = el("div", "icon-combobox-panel");
  panel.id = "technology-icon-listbox";
  panel.setAttribute("role", "listbox");
  panel.hidden = true;

  const status = el("p", "icon-combobox-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const list = el("div", "icon-combobox-list");

  append(panel, status, list);
  append(combo, search, panel);
  append(node, combo);

  append(
    node,
    el(
      "p",
      "form-help",
      "Brand icons are listed first. Only the identifier is stored."
    )
  );

  /* ---- selected icon card ---- */

  const selected = el("div", "icon-selected");
  const selectedLabel = el("p", "icon-selected-label", "Selected icon");
  const selectedRow = el("div", "icon-selected-row");

  const selectedImg = el("img", "icon-selected-img");
  selectedImg.alt = "";
  selectedImg.setAttribute("aria-hidden", "true");

  const selectedId = el("span", "icon-selected-id");

  const clearButton = el("button", "icon-selected-clear", "Clear");
  clearButton.type = "button";

  append(selectedRow, selectedImg, selectedId, clearButton);
  append(selected, selectedLabel, selectedRow);
  append(node, selected);

  /* ---- advanced: the manual identifier field ---- */

  const advanced = el("details", "icon-advanced");
  const summary = el("summary", "icon-advanced-summary", "Advanced");
  append(advanced, summary, iconField.node);
  append(node, advanced);

  /* ---------------------------------------------------------------- */

  let options = [];
  let activeIndex = -1;

  function currentValue() {
    return iconField.input.value.trim();
  }

  /*
    "simple-icons:visual-studio-code" reads as "Visual Studio Code".
    Derived from the identifier itself rather than a lookup table, so
    a newly published icon never needs a code change.
  */

  function readableName(iconId) {
    const name = iconId.split(":")[1] || iconId;

    return name
      .split("-")
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  function renderSelected() {
    const value = currentValue();

    if (value === "") {
      selected.hidden = true;
      return;
    }

    selected.hidden = false;
    selectedId.textContent = value;

    const url = iconPreviewUrl(value);

    if (!url) {
      // A legacy bare key has no Iconify preview but is still valid.
      selectedImg.hidden = true;
      return;
    }

    selectedImg.hidden = false;
    selectedImg.src = url;
  }

  selectedImg.addEventListener("error", () => {
    selectedImg.hidden = true;
  });

  clearButton.addEventListener("click", () => {
    iconField.input.value = "";
    iconField.setError("");
    renderSelected();
    search.focus();
  });

  iconField.input.addEventListener("input", renderSelected);

  /* ---- dropdown ---- */

  function closePanel() {
    panel.hidden = true;
    search.setAttribute("aria-expanded", "false");
    activeIndex = -1;
  }

  function openPanel() {
    panel.hidden = false;
    search.setAttribute("aria-expanded", "true");
  }

  function setActive(index) {
    if (options.length === 0) {
      return;
    }

    activeIndex = (index + options.length) % options.length;

    options.forEach((option, i) => {
      const isActive = i === activeIndex;

      option.button.classList.toggle("is-active", isActive);
      option.button.setAttribute("aria-selected", isActive ? "true" : "false");

      if (isActive) {
        option.button.scrollIntoView({ block: "nearest" });
      }
    });
  }

  function choose(iconId) {
    iconField.input.value = iconId;
    iconField.setError("");
    renderSelected();
    closePanel();

    search.value = "";
    clear(list);
    options = [];
    status.textContent = "";
    search.focus();
  }

  function showResults(icons) {
    clear(list);
    options = [];

    icons.forEach(iconId => {
      const url = iconPreviewUrl(iconId);

      if (!url) {
        return;
      }

      const button = el("button", "icon-option");
      button.type = "button";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", "false");

      const img = el("img", "icon-option-preview");
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      img.setAttribute("aria-hidden", "true");

      const text = el("span", "icon-option-text");

      append(
        text,
        el("span", "icon-option-name", readableName(iconId)),
        el("span", "icon-option-id", iconId)
      );

      const check = el("span", "icon-option-check", "✓");
      check.setAttribute("aria-hidden", "true");

      append(button, img, text, check);

      if (iconId === currentValue()) {
        button.classList.add("is-selected");
      }

      button.addEventListener("click", () => choose(iconId));

      append(list, button);

      options.push({ id: iconId, button });
    });
  }

  let searchToken = 0;

  async function fetchJson(url) {
    const response = await fetch(url, { headers: { Accept: "application/json" } });

    if (!response.ok) {
      throw new Error("icon search: " + response.status);
    }

    return await response.json();
  }

  /*
    Iconify's relevance ranking buries brand icons: searching
    "LinkedIn" returns no simple-icons entry at all, even though
    simple-icons:linkedin exists. Sorting cannot fix what the API
    never returned, so the brand collection is asked directly.

    An exact name probe is the most reliable of the three, because
    simple-icons names the icon after the brand ("linkedin",
    "react"). Punctuation is stripped, so "Next.js" probes
    "nextjs".
  */

  /*
    Technology names are routinely punctuated ("Next.js", "Node.js",
    "Socket.IO") while icon collections cannot use punctuation in a
    name. simple-icons resolves this by spelling the separator out,
    so "Next.js" is published as "nextdotjs".

    These candidates are produced from the punctuation itself, not
    from any brand list: lowercase as typed, punctuation removed,
    each dot spelled as "dot", and punctuation as spaces. A name
    with no punctuation collapses to a single candidate.
  */

  function queryCandidates(query) {
    const lower = query.toLowerCase().trim();

    const candidates = [
      lower,
      lower.replace(/[^a-z0-9]+/g, ""),
      lower.replace(/\./g, "dot").replace(/[^a-z0-9]+/g, ""),
      lower.replace(/[^a-z0-9]+/g, " ").trim()
    ];

    return [...new Set(candidates)].filter(Boolean);
  }

  /*
    Asks the brand collection directly whether an icon of that exact
    name exists. This is the most reliable source: Iconify's own
    relevance search returns no simple-icons entry at all for
    "LinkedIn", even though simple-icons:linkedin exists.
  */

  async function findBrandExact(query) {
    const slugs = queryCandidates(query)
      .map(candidate => candidate.replace(/[^a-z0-9]/g, ""))
      .filter(Boolean);

    const unique = [...new Set(slugs)];

    if (unique.length === 0) {
      return [];
    }

    try {
      const body = await fetchJson(
        ICONIFY_API +
          "/" +
          ICONIFY_PREFERRED_PREFIX +
          ".json?icons=" +
          unique.map(encodeURIComponent).join(",")
      );

      const icons = (body && body.icons) || {};

      // Keeps candidate order, so the closest spelling wins.
      return unique
        .filter(slug => icons[slug])
        .map(slug => ICONIFY_PREFERRED_PREFIX + ":" + slug);
    } catch (error) {
      return [];
    }
  }

  async function findBrandSearch(query) {
    try {
      const body = await fetchJson(
        ICONIFY_API +
          "/search?query=" +
          encodeURIComponent(query) +
          "&prefixes=" +
          ICONIFY_PREFERRED_PREFIX +
          "&limit=24"
      );

      return Array.isArray(body.icons) ? body.icons : [];
    } catch (error) {
      return [];
    }
  }

  async function findGeneral(query) {
    const body = await fetchJson(
      ICONIFY_API + "/search?query=" + encodeURIComponent(query) + "&limit=48"
    );

    return Array.isArray(body.icons) ? body.icons : [];
  }

  async function runSearch(query) {
    const token = ++searchToken;

    openPanel();
    clear(list);
    options = [];
    status.textContent = "Searching…";

    try {
      /*
        Brand-first by construction rather than by sorting
        afterwards. The searches also run against the normalised
        spelling, because Iconify returns nothing at all for a
        punctuated query like "Next.js".
      */

      const candidates = queryCandidates(query);
      const stripped = candidates[1] && candidates[1] !== candidates[0]
        ? candidates[1]
        : null;

      const [exact, brand, brandStripped, general, generalStripped] =
        await Promise.all([
          findBrandExact(query),
          findBrandSearch(query),
          stripped ? findBrandSearch(stripped) : Promise.resolve([]),
          findGeneral(query),
          stripped ? findGeneral(stripped).catch(() => []) : Promise.resolve([])
        ]);

      // A stale response from an earlier keystroke must not replace a newer one.
      if (token !== searchToken) {
        return;
      }

      const seen = new Set();
      const merged = [];

      [exact, brand, brandStripped, general, generalStripped].forEach(group => {
        group.forEach(id => {
          if (!seen.has(id) && ICONIFY_ID_PATTERN.test(id)) {
            seen.add(id);
            merged.push(id);
          }
        });
      });

      if (merged.length === 0) {
        status.textContent = 'No icons found for "' + query + '".';
        return;
      }

      status.textContent =
        merged.length + " icon" + (merged.length === 1 ? "" : "s") + " found";

      showResults(merged);
    } catch (error) {
      console.error(error);

      status.textContent =
        "Icon search is unavailable. Use Advanced to type an id.";
    }
  }

  let debounce = null;

  search.addEventListener("input", () => {
    window.clearTimeout(debounce);

    const query = search.value.trim();

    if (query.length < 2) {
      closePanel();
      clear(list);
      options = [];
      status.textContent = "";
      return;
    }

    debounce = window.setTimeout(() => runSearch(query), 300);
  });

  search.addEventListener("focus", () => {
    if (options.length > 0) {
      openPanel();
    }
  });

  search.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closePanel();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      if (panel.hidden && options.length > 0) {
        openPanel();
      }

      setActive(activeIndex + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(activeIndex - 1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();

      if (activeIndex >= 0 && options[activeIndex]) {
        choose(options[activeIndex].id);
        return;
      }

      window.clearTimeout(debounce);

      const query = search.value.trim();

      if (query.length >= 2) {
        runSearch(query);
      }
    }
  });

  /*
    Clicking anywhere outside the combobox closes it. Bound once per
    editor dialog, which the modal removes together with this node.
  */

  document.addEventListener("pointerdown", event => {
    if (!combo.contains(event.target)) {
      closePanel();
    }
  });

  renderSelected();

  return { node, renderSelected };
}

/* ------------------------------------------------------------------ */
/* Form field builders                                                 */
/* ------------------------------------------------------------------ */

function fieldShell({ id, label, required, help }) {
  const node = el("div", "form-field");

  const labelNode = el("label", "form-label");
  labelNode.htmlFor = id;
  labelNode.textContent = label;

  if (required) {
    const marker = el("span", "form-required", " *");
    marker.setAttribute("aria-hidden", "true");
    append(labelNode, marker);
  }

  append(node, labelNode);

  const helpNode = help ? el("p", "form-help", help) : null;
  const errorNode = el("p", "field-error");
  errorNode.id = `${id}-error`;

  return { node, labelNode, helpNode, errorNode };
}

function attachMeta(shell, control, id) {
  if (shell.helpNode) {
    shell.helpNode.id = `${id}-help`;
    append(shell.node, shell.helpNode);
    control.setAttribute("aria-describedby", shell.helpNode.id);
  }

  append(shell.node, shell.errorNode);

  function setError(message) {
    shell.errorNode.textContent = message || "";

    const describedBy = [];

    if (shell.helpNode) {
      describedBy.push(shell.helpNode.id);
    }

    if (message) {
      describedBy.push(shell.errorNode.id);
      control.setAttribute("aria-invalid", "true");
      shell.node.classList.add("has-error");
    } else {
      control.removeAttribute("aria-invalid");
      shell.node.classList.remove("has-error");
    }

    if (describedBy.length > 0) {
      control.setAttribute("aria-describedby", describedBy.join(" "));
    } else {
      control.removeAttribute("aria-describedby");
    }
  }

  return setError;
}

function textField({ id, label, required, maxLength, value, help }) {
  const shell = fieldShell({ id, label, required, help });

  const input = el("input", "admin-input");
  input.type = "text";
  input.id = id;
  input.value = value || "";
  input.autocomplete = "off";
  input.spellcheck = false;

  if (maxLength) {
    input.maxLength = maxLength;
  }

  if (required) {
    input.required = true;
  }

  append(shell.node, input);

  const setError = attachMeta(shell, input, id);

  return {
    node: shell.node,
    input,
    errorNode: shell.errorNode,
    setError,
    focus: () => input.focus()
  };
}

function selectField({ id, label, value, options, placeholder, help }) {
  const shell = fieldShell({ id, label, help });

  const select = el("select", "admin-select");
  select.id = id;

  if (placeholder) {
    const empty = el("option", null, placeholder);
    empty.value = "";
    append(select, empty);
  }

  options.forEach(option => {
    const optionNode = el("option", null, option.label);
    optionNode.value = option.value;
    append(select, optionNode);
  });

  select.value = value || "";

  append(shell.node, select);

  const setError = attachMeta(shell, select, id);

  return {
    node: shell.node,
    select,
    errorNode: shell.errorNode,
    setError,
    focus: () => select.focus()
  };
}

function checkboxField({ id, label, checked }) {
  const node = el("div", "form-field form-field-toggle");

  const input = el("input", "admin-checkbox");
  input.type = "checkbox";
  input.id = id;
  input.checked = Boolean(checked);

  const labelNode = el("label", "form-toggle-label", label);
  labelNode.htmlFor = id;

  append(node, input, labelNode);

  return {
    node,
    input,
    errorNode: el("p"),
    setError: () => {},
    focus: () => input.focus()
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

function initialsFor(name) {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return (words[0][0] + words[1][0]).toUpperCase();
}

/*
  Maps Postgres/PostgREST errors onto safe, user-facing messages.
  Raw database text is never shown in the UI (security baseline section 68).
*/
function friendlyDbError(error) {
  if (!error) {
    return "Could not save this technology. Please try again.";
  }

  const haystack = `${error.code || ""} ${error.message || ""} ${
    error.details || ""
  }`.toLowerCase();

  if (error.code === "23505" || haystack.includes("duplicate key")) {
    if (haystack.includes("name_lower")) {
      return "A technology with this name already exists.";
    }

    if (haystack.includes("slug")) {
      return "A technology with this slug already exists.";
    }

    return "This technology already exists.";
  }

  if (error.code === "23514" || haystack.includes("check constraint")) {
    if (haystack.includes("public_group_required")) {
      return "Select a public group before showing this technology in the public Tech Stack.";
    }

    if (haystack.includes("slug_check")) {
      return "Slug format is not valid. Use lowercase letters, numbers and hyphens.";
    }

    if (haystack.includes("public_group_check")) {
      return "That public group is not one of the three supported groups.";
    }

    return "Some values are not valid. Please review the form.";
  }

  if (
    error.code === "42501" ||
    error.code === "PGRST301" ||
    haystack.includes("row-level security")
  ) {
    return "Your session is not authorized for this change. Sign in again and retry.";
  }

  return "Could not save this technology. Please try again.";
}
