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
  emptyState,
  updatedAt
} from "../core/dom.js";

import { openModal, confirmDialog, closeAllModals } from "../core/modal.js";
import { toast } from "../core/toast.js";
import { t } from "../core/i18n.js";
import { openRowMenu, closeRowMenu } from "../core/row-menu.js";

/*
  Group keys are the contract with public_group's check constraint; the labels
  beside them are the English fallback. Display text is resolved through
  projTech.group* so the picker, the filter and the table all follow the
  interface language.
*/
const PUBLIC_GROUPS = [
  { value: "languages", label: "Languages", key: "projTech.groupLanguages" },
  {
    value: "development_systems",
    label: "Development & Systems",
    key: "projTech.groupDevelopment"
  },
  {
    value: "tools_platforms",
    label: "Tools & Platforms",
    key: "projTech.groupTools"
  }
];

function groupLabel(value) {
  const entry = PUBLIC_GROUPS.find(group => group.value === value);

  return entry ? t(entry.key) : value;
}

function groupOptions() {
  return PUBLIC_GROUPS.map(group => ({
    value: group.value,
    label: groupLabel(group.value)
  }));
}

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

/*
  Collection priority, most colourful first.

  This ordering is the whole reason picked icons render in colour.
  simple-icons draws every glyph with currentColor and no palette, so
  an <img> of it is solid black; devicon, logos, vscode-icons and
  skill-icons all ship real brand colours. simple-icons stays
  available at the end of the list — it is often the only collection
  carrying a given brand — but it is never what the picker offers
  first.
*/

const ICONIFY_COLOR_PREFIXES = [
  "devicon",
  "logos",
  "vscode-icons",
  "skill-icons",
  "devicon-plain"
];

// Probed by exact name when resolving a typed technology name.
const ICONIFY_EXACT_PREFIXES = ["devicon", "logos", "simple-icons"];

function collectionRank(iconId) {
  const prefix = iconId.split(":")[0];
  const index = ICONIFY_COLOR_PREFIXES.indexOf(prefix);

  return index === -1 ? ICONIFY_COLOR_PREFIXES.length : index;
}

export const technologiesRoute = {
  name: "technologies",
  title: "Technologies",  // Fallback only: the shell titles routes from nav.*
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

  function closeMenu() {
    closeRowMenu();
  }

  append(
    container,
    pageHeader({
      title: t("tech.title"),
      subtitle: t("tech.subtitle"),
      actions: [
        {
          label: t("tech.add"),
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
            "id, name, slug, icon_key, public_group, show_in_public_stack, is_active, sort_order, created_at, updated_at"
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
    const searchLabel = el("label", "toolbar-label", t("common.search"));
    const searchInput = el("input", "admin-input");

    searchInput.type = "search";
    searchInput.id = "technology-search";
    searchInput.placeholder = t("tech.searchPlaceholder");
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
      label: t("tech.groupFilter"),
      options: [
        { value: "all", label: t("common.all") },
        ...groupOptions(),
        { value: "project_only", label: t("tech.projectOnly") }
      ],
      onChange: value => {
        state.filters.group = value;
        closeMenu();
        renderList();
      }
    });

    const statusField = buildSelectField({
      id: "technology-status-filter",
      label: t("common.status"),
      options: [
        { value: "all", label: t("common.all") },
        { value: "active", label: t("status.active") },
        { value: "disabled", label: t("tech.statusDisabled") }
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
      append(listSlot, el("p", "loading-text", t("tech.loading")));
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
          title: t("tech.emptyTitle"),
          description: t("tech.emptyHelp")
        })
      );
      return;
    }

    const rows = visibleItems();

    if (rows.length === 0) {
      append(
        listSlot,
        emptyState({
          title: t("tech.emptyFilterTitle"),
          description: t("tech.emptyFilterHelp")
        })
      );
      return;
    }

    append(listSlot, buildTable(rows));

    const summary = el(
      "p",
      "table-summary",
      t("tech.summary", { shown: rows.length, total: state.items.length })
    );

    append(listSlot, summary);

    if (filtersActive()) {
      append(
        listSlot,
        el("p", "table-note", t("list.reorderNote"))
      );
    }
  }

  function buildErrorPanel() {
    const panel = el("div", "admin-alert admin-alert-error");
    panel.setAttribute("role", "alert");

    append(
      panel,
      el("p", "admin-alert-title", t("tech.loadError")),
      el("p", "admin-alert-text", t("list.loadErrorHelp"))
    );

    const retry = el(
      "button",
      "admin-button admin-button-secondary",
      t("common.tryAgain")
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
      t("common.icon"),
      t("tech.colTechnology"),
      t("common.group"),
      t("common.visibility"),
      t("common.status"),
      t("common.updated")
    ].forEach(label => {
      const cell = el("th", null, label);
      cell.scope = "col";
      append(headRow, cell);
    });

    const actionsHead = el("th");
    actionsHead.scope = "col";
    append(actionsHead, el("span", "visually-hidden", t("common.actions")));
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

    /*
      The stored icon, drawn the same way the picker draws it: an <img> at the
      Iconify SVG endpoint, built from an id that already matched
      ICONIFY_ID_PATTERN and then encoded. No SVG payload is parsed and there
      is no innerHTML path, so icon_key still cannot become markup.

      A legacy bare key (docker, figma) has no Iconify id to resolve, so it
      falls back to the initials badge rather than a broken image.
    */
    const iconCell = cell(t("common.icon"));
    iconCell.classList.add("cell-icon");
    const iconUrl = item.icon_key ? iconPreviewUrl(item.icon_key) : null;

    if (iconUrl) {
      const image = el("img", "tech-icon-image");
      image.src = iconUrl;
      image.alt = "";
      image.width = 24;
      image.height = 24;
      image.loading = "lazy";
      image.draggable = false;
      image.title = item.icon_key;
      append(iconCell, image);
    } else {
      const badge = el("span", "tech-icon", initialsFor(item.name));
      badge.setAttribute("aria-hidden", "true");
      append(iconCell, badge);
    }

    const nameCell = cell(t("tech.colTechnology"));
    nameCell.classList.add("cell-primary");
    append(nameCell, el("span", "tech-name", item.name));

    const meta = el("span", "tech-meta");
    append(meta, el("span", "tech-slug", item.slug));

    /* Usage lost its own column to Updated; it belongs with the name anyway,
       where it reads as a property of the technology rather than a metric. */
    const usageCount = state.usage.get(item.id) || 0;
    append(
      meta,
      el("span", "tech-usage", t("tech.usageCount", { count: usageCount }))
    );

    append(nameCell, meta);

    const groupCell = cell(t("common.group"));
    append(
      groupCell,
      el(
        "span",
        item.public_group ? "tech-group" : "tech-group tech-group-none",
        item.public_group ? groupLabel(item.public_group) : t("tech.projectOnly")
      )
    );

    /* Visibility answers "does this show up on the site", which is the
       question the Yes/No flag was really being asked. */
    const publicCell = cell(t("common.visibility"));
    append(
      publicCell,
      el(
        "span",
        item.show_in_public_stack
          ? "flag-badge flag-badge-yes"
          : "flag-badge flag-badge-no",
        item.show_in_public_stack
          ? t("tech.inPublicStack")
          : t("tech.notInPublicStack")
      )
    );

    const statusCell = cell(t("common.status"));
    append(
      statusCell,
      el(
        "span",
        item.is_active
          ? "status-badge status-badge-active"
          : "status-badge status-badge-disabled",
        t(item.is_active ? "status.active" : "tech.statusDisabled")
      )
    );

    const timeCell = cell(t("common.updated"));
    append(timeCell, updatedAt(item.updated_at || item.created_at));

    const actionsCell = cell(t("common.actions"));
    actionsCell.className = "cell-actions";
    append(actionsCell, buildActionsMenu(item));

    append(
      row,
      iconCell,
      nameCell,
      groupCell,
      publicCell,
      statusCell,
      timeCell,
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
    trigger.setAttribute("aria-label", t("tech.actionsFor", { name: item.name }));

    trigger.addEventListener("click", () => {
      const index = state.items.findIndex(entry => entry.id === item.id);
      const canReorder = !filtersActive();

      const entries = [
        {
          label: t("common.edit"),
          onSelect: () => openEditor(item)
        },
        {
          label: t("action.moveUp"),
          disabled: !canReorder || index <= 0,
          hint: canReorder ? null : t("list.reorderHint"),
          onSelect: () => move(index, -1)
        },
        {
          label: t("action.moveDown"),
          disabled: !canReorder || index === -1 || index >= state.items.length - 1,
          hint: canReorder ? null : t("list.reorderHint"),
          onSelect: () => move(index, 1)
        },
        {
          label: t(item.is_active ? "common.disable" : "common.enable"),
          onSelect: () => toggleActive(item)
        }
      ];

      openRowMenu({ trigger, entries });
    });

    append(wrap, trigger);

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
            : t("tech.errOrder"),
          "error"
        );

        await load();
        return;
      }
    }

    toast(t("list.orderUpdated"));
    await load();
  }

  /* ---------------------------------------------------------------- */
  /* Enable / Disable                                                  */
  /* ---------------------------------------------------------------- */

  async function toggleActive(item) {
    const disabling = item.is_active;

    const confirmed = await confirmDialog({
      title: t(disabling ? "tech.disableTitle" : "tech.enableTitle", {
        name: item.name
      }),
      lines: disabling
        ? [t("tech.disableLine1"), t("tech.disableLine2", { name: item.name })]
        : [t("tech.enableLine")],
      confirmLabel: t(disabling ? "common.disable" : "common.enable"),
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
          : t("tech.errToggle"),
        "error"
      );

      return;
    }

    toast(t(disabling ? "tech.toastDisabled" : "tech.toastEnabled"));
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
      label: t("techEditor.fieldName"),
      required: true,
      maxLength: NAME_MAX,
      value: existing ? existing.name : ""
    });

    const slugField = textField({
      id: "technology-slug",
      label: t("techEditor.fieldSlug"),
      maxLength: SLUG_MAX,
      value: existing ? existing.slug : "",
      help: t(
        isNew ? "techEditor.fieldSlugHelpNew" : "techEditor.fieldSlugHelpEdit"
      )
    });

    const iconField = textField({
      id: "technology-icon-key",
      label: t("techEditor.fieldIcon"),
      maxLength: ICON_KEY_MAX,
      value: existing && existing.icon_key ? existing.icon_key : "",
      help: t("techEditor.fieldIconHelp")
    });

    const iconPicker = createIconPicker(iconField);

    const publicField = checkboxField({
      id: "technology-public",
      label: t("techEditor.fieldPublic"),
      checked: existing ? existing.show_in_public_stack : false
    });

    const groupField = selectField({
      id: "technology-public-group",
      label: t("techEditor.fieldGroup"),
      value: existing && existing.public_group ? existing.public_group : "",
      placeholder: t("techEditor.fieldGroupPlaceholder"),
      options: groupOptions(),
      help: t("techEditor.fieldGroupHelp")
    });

    const activeField = checkboxField({
      id: "technology-active",
      label: t("techEditor.fieldActive"),
      checked: existing ? existing.is_active : true
    });

    /*
      Four groups instead of one flat column, matching the Certificates,
      Experience and Projects editors. The modal is narrow, so the groups are
      labelled runs rather than nested cards — a card inside a dialog would be
      a frame inside a frame.
    */
    function group(titleKey, helpKey) {
      const node = el("div", "modal-group");

      append(node, el("h4", "form-subheading", t(titleKey)));

      if (helpKey) {
        append(node, el("p", "form-help", t(helpKey)));
      }

      return node;
    }

    const basicGroup = group("techEditor.basic", null);
    append(basicGroup, nameField.node, slugField.node);

    const iconGroup = group("techEditor.icon", null);
    append(iconGroup, iconPicker.node);

    const visibilityGroup = group(
      "techEditor.visibility",
      "techEditor.visibilityHelp"
    );
    append(
      visibilityGroup,
      publicField.node,
      groupField.node,
      activeField.node,
      el("p", "form-help", t("techEditor.fieldActiveHelp"))
    );

    const previewGroup = group("techEditor.preview", "techEditor.previewHelp");
    const previewSlot = el("div", "tech-preview");
    append(previewGroup, previewSlot);

    append(form, basicGroup, iconGroup, visibilityGroup, previewGroup);

    /*
      The chip as the public Tech Stack draws it: stored icon plus name. It
      reads from the live form, so it answers "did I pick the right icon"
      before anything is written.
    */
    function renderPreview() {
      clear(previewSlot);

      const iconValue = iconField.input.value.trim();
      const url = iconValue ? iconPreviewUrl(iconValue) : null;
      const chip = el("span", "tech-preview-chip");

      if (url) {
        const image = el("img", "tech-preview-icon");
        image.src = url;
        image.alt = "";
        image.width = 22;
        image.height = 22;
        image.draggable = false;
        append(chip, image);
      }

      const label = nameField.input.value.trim();
      append(chip, el("span", "tech-preview-name", label || t("common.name")));
      append(previewSlot, chip);
    }

    renderPreview();
    nameField.input.addEventListener("input", renderPreview);
    iconField.input.addEventListener("input", renderPreview);
    iconField.input.addEventListener("change", renderPreview);

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
      title: t(isNew ? "techEditor.addTitle" : "techEditor.editTitle"),
      body: form,
      actions: [
        {
          label: t("common.cancel"),
          variant: "secondary",
          onClick: ctl => ctl.requestClose("cancel")
        },
        {
          label: t(isNew ? "techEditor.addTitle" : "common.saveChanges"),
          variant: "primary",
          onClick: () => submit()
        }
      ],
      onRequestClose: async () => {
        if (!isDirty()) {
          return true;
        }

        return await confirmDialog({
          title: t("discard.title"),
          lines: [t("discard.line"), t("unsaved.lost")],
          confirmLabel: t("discard.confirm"),
          cancelLabel: t("discard.cancel"),
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

      controller.setBusy(true, t(isNew ? "common.adding" : "common.saving"));

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
        formError.textContent = t("techEditor.errSaveAuth");
        return;
      }

      controller.close();
      toast(t(isNew ? "techEditor.added" : "techEditor.saved"));
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

      formError.textContent = t("techEditor.errFields");

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
      errors.name = t("techEditor.errNameRequired");
    } else if (values.name.length > NAME_MAX) {
      errors.name = t("techEditor.errTooLong", { max: NAME_MAX });
    } else {
      const duplicateName = state.items.find(
        item =>
          (!existing || item.id !== existing.id) &&
          (item.name || "").toLowerCase() === values.name.toLowerCase()
      );

      if (duplicateName) {
        errors.name = t("techEditor.errNameTaken", { name: duplicateName.name });
      }
    }

    if (values.slug === "") {
      errors.slug = t("techEditor.errSlugRequired");
    } else if (values.slug.length > SLUG_MAX) {
      errors.slug = t("techEditor.errTooLong", { max: SLUG_MAX });
    } else if (!SLUG_PATTERN.test(values.slug)) {
      errors.slug = t("techEditor.errSlugFormat");
    } else {
      const duplicateSlug = state.items.find(
        item =>
          (!existing || item.id !== existing.id) &&
          (item.slug || "").toLowerCase() === values.slug
      );

      if (duplicateSlug) {
        errors.slug = t("techEditor.errSlugTaken");
      }
    }

    if (values.iconKey !== "") {
      if (values.iconKey.length > ICON_KEY_MAX) {
        errors.iconKey = t("techEditor.errTooLong", { max: ICON_KEY_MAX });
      } else if (!isValidIconKey(values.iconKey)) {
        errors.iconKey = t("techEditor.errIconFormat");
      }
    }

    if (values.isPublic && values.group === "") {
      errors.group = t("techEditor.errGroupRequired");
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

  const label = el("label", "form-label", t("techIcon.label"));
  label.htmlFor = "technology-icon-search";
  append(node, label);

  const combo = el("div", "icon-combobox");

  const search = el("input", "admin-input icon-combobox-input");
  search.type = "text";
  search.id = "technology-icon-search";
  search.placeholder = t("techIcon.searchPlaceholder");
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
    el("p", "form-help", t("techIcon.help"))
  );

  /* ---- selected icon ---- */

  const selected = el("div", "icon-selected");
  const selectedLabel = el("p", "icon-selected-label", t("techIcon.selected"));
  const selectedRow = el("div", "icon-selected-row");

  const selectedImg = el("img", "icon-selected-img");
  selectedImg.alt = "";
  selectedImg.setAttribute("aria-hidden", "true");

  const selectedId = el("span", "icon-selected-id");

  const clearButton = el("button", "icon-selected-clear", t("common.clear"));
  clearButton.type = "button";

  append(selectedRow, selectedImg, selectedId, clearButton);
  append(selected, selectedLabel, selectedRow);
  append(node, selected);

  /* ---- advanced: the manual identifier field ---- */

  const advanced = el("details", "icon-advanced");
  const summary = el("summary", "icon-advanced-summary", t("techIcon.advanced"));
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
    notifyIconChange();
    search.focus();
  });

  /*
    The picker writes the identifier straight into the field, which fires no
    event of its own. Anything else listening to the field — the editor's live
    preview — would otherwise never learn that the icon changed.
  */
  function notifyIconChange() {
    iconField.input.dispatchEvent(new Event("input", { bubbles: true }));
  }

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
    notifyIconChange();
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

      /*
        Icon-only option: the artwork is the content. The readable
        name and the exact identifier are still available on demand —
        as a two-line hover tooltip and as the accessible name — but
        neither is painted into the grid, where dozens of labels
        would drown the icons they describe.
      */

      const button = el("button", "icon-option");
      button.type = "button";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", "false");
      button.setAttribute("aria-label", readableName(iconId) + ", " + iconId);

      // Assigned as a property, so the newline survives as a real
      // second tooltip line rather than being collapsed as markup.
      button.title = readableName(iconId) + "\n" + iconId;

      const img = el("img", "icon-option-preview");
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      img.setAttribute("aria-hidden", "true");

      // A collection that fails to serve artwork should not leave a
      // blank tile sitting in the grid.
      img.addEventListener(
        "error",
        () => button.remove(),
        { once: true }
      );

      const check = el("span", "icon-option-check", "✓");
      check.setAttribute("aria-hidden", "true");

      append(button, img, check);

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

    const encoded = unique.map(encodeURIComponent).join(",");

    /*
      Colour-bearing collections are probed first, so a pinned exact
      match is a colourful icon rather than a monochrome one.
    */

    const perCollection = await Promise.all(
      ICONIFY_EXACT_PREFIXES.map(async prefix => {
        try {
          const body = await fetchJson(
            ICONIFY_API + "/" + prefix + ".json?icons=" + encoded
          );

          const icons = (body && body.icons) || {};

          // Candidate order preserved, so the closest spelling wins.
          return unique
            .filter(slug => icons[slug])
            .map(slug => prefix + ":" + slug);
        } catch (error) {
          return [];
        }
      })
    );

    return perCollection.flat();
  }

  async function findBrandSearch(query) {
    try {
      const body = await fetchJson(
        ICONIFY_API +
          "/search?query=" +
          encodeURIComponent(query) +
          "&prefixes=" +
          ICONIFY_COLOR_PREFIXES.join(",") +
          "&limit=48"
      );

      return Array.isArray(body.icons) ? body.icons : [];
    } catch (error) {
      return [];
    }
  }

  async function findGeneral(query) {
    const body = await fetchJson(
      ICONIFY_API + "/search?query=" + encodeURIComponent(query) + "&limit=96"
    );

    return Array.isArray(body.icons) ? body.icons : [];
  }

  async function runSearch(query) {
    const token = ++searchToken;

    openPanel();
    clear(list);
    options = [];
    status.textContent = t("techIcon.searching");

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

      /*
        Stable sort by collection, so colourful variants lead while
        every other usable variant stays selectable below them.
      */

      merged.sort((a, b) => collectionRank(a) - collectionRank(b));

      if (merged.length === 0) {
        status.textContent = t("techIcon.noResults", { query });
        return;
      }

      status.textContent = t("techIcon.resultCount", { count: merged.length });

      showResults(merged);
    } catch (error) {
      console.error(error);

      status.textContent = t("techIcon.unavailable");
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
    return t("techEditor.errSaveRetry");
  }

  const haystack = `${error.code || ""} ${error.message || ""} ${
    error.details || ""
  }`.toLowerCase();

  if (error.code === "23505" || haystack.includes("duplicate key")) {
    if (haystack.includes("name_lower")) {
      return t("techEditor.errNameExists");
    }

    if (haystack.includes("slug")) {
      return t("techEditor.errSlugExists");
    }

    return t("techEditor.errExists");
  }

  if (error.code === "23514" || haystack.includes("check constraint")) {
    if (haystack.includes("public_group_required")) {
      return t("techEditor.errGroupRequired");
    }

    if (haystack.includes("slug_check")) {
      return t("techEditor.errSlugFormat");
    }

    if (haystack.includes("public_group_check")) {
      return t("techEditor.errGroupInvalid");
    }

    return t("techEditor.errValues");
  }

  if (
    error.code === "42501" ||
    error.code === "PGRST301" ||
    haystack.includes("row-level security")
  ) {
    return t("list.sessionError");
  }

  return t("techEditor.errSaveRetry");
}
