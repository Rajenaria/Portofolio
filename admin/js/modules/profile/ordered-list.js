/*
  Ordered list manager shared by the three ordered collections in Profile &
  About: about_interests, about_organization_skills and about_gallery.

  All three share the same shape (uuid id, sort_order, is_active, created_at),
  so ordering, enable/disable and destructive removal are implemented once here
  and the caller only supplies how a row renders and how add/edit works.

  ORDERING
  --------
  sort_order ASC, created_at ASC. Move Up / Move Down only; no drag and drop
  (docs/Design/ADMIN-DASHBOARD-DESIGN.md section 44). Reordering normalises the
  visible set to a dense 0..n-1 sequence and writes only the rows whose value
  actually changed, so duplicate or gapped sort_order values cannot break it.

  SECURITY: every database value is rendered through createElement/textContent
  by the caller's renderRow and by the helpers here. Authorization is RLS.
*/

import { supabaseClient } from "../../core/supabase.js";
import { el, append, clear, emptyState } from "../../core/dom.js";
import { confirmDialog } from "../../core/modal.js";
import { toast } from "../../core/toast.js";
import { t } from "../../core/i18n.js";

export function createOrderedList({
  table,
  title,
  addLabel,
  emptyTitle,
  emptyDescription,
  selectColumns,
  renderRow,
  onAdd,
  onEdit,
  supportsActive = true,
  removeConfirm,
  onAfterRemove,
  describeRow
}) {
  const root = el("section", "admin-subsection");

  const header = el("div", "subsection-header");
  append(header, el("h3", "subsection-title", title));

  const addButton = el("button", "admin-button admin-button-secondary", addLabel);
  addButton.type = "button";
  addButton.addEventListener("click", () => onAdd(api));
  append(header, addButton);

  const listSlot = el("div", "ordered-list-slot");

  append(root, header, listSlot);

  let rows = [];
  let status = "loading";
  let busy = false;

  function setBusy(next) {
    busy = next;
    root.classList.toggle("is-busy", next);
    addButton.disabled = next;

    Array.from(root.querySelectorAll(".ordered-row button")).forEach(button => {
      button.disabled = next || button.dataset.permanentlyDisabled === "true";
    });
  }

  async function load() {
    status = "loading";
    render();

    const { data, error } = await supabaseClient
      .from(table)
      .select(selectColumns)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      status = "error";
      render();
      return;
    }

    rows = data || [];
    status = "ready";
    render();
  }

  function render() {
    clear(listSlot);

    if (status === "loading") {
      append(
        listSlot,
        el("p", "loading-text", t("olist.loading", { title: title.toLowerCase() }))
      );
      return;
    }

    if (status === "error") {
      const panel = el("div", "admin-alert admin-alert-error");
      panel.setAttribute("role", "alert");

      append(
        panel,
        el(
          "p",
          "admin-alert-title",
          t("olist.loadError", { title: title.toLowerCase() })
        ),
        el("p", "admin-alert-text", t("list.loadErrorHelp"))
      );

      const retry = el(
        "button",
        "admin-button admin-button-secondary",
        t("common.tryAgain")
      );
      retry.type = "button";
      retry.addEventListener("click", load);
      append(panel, retry);

      append(listSlot, panel);
      return;
    }

    if (rows.length === 0) {
      append(
        listSlot,
        emptyState({ title: emptyTitle, description: emptyDescription })
      );
      return;
    }

    const list = el("ol", "ordered-list");

    rows.forEach((row, index) => {
      append(list, buildRow(row, index));
    });

    append(listSlot, list);
  }

  function buildRow(row, index) {
    const item = el("li", "ordered-row");

    if (supportsActive && row.is_active === false) {
      item.classList.add("is-inactive");
    }

    const position = el(
      "span",
      "ordered-position",
      String(index + 1).padStart(2, "0")
    );

    const bodySlot = el("div", "ordered-body");
    append(bodySlot, renderRow(row));

    const actions = el("div", "ordered-actions");
    const label = describeRow
      ? describeRow(row)
      : t("olist.itemAt", { index: index + 1 });

    const up = actionButton(
      t("action.moveUp"),
      t("olist.moveUpOf", { label }),
      () => move(index, -1)
    );

    const down = actionButton(
      t("action.moveDown"),
      t("olist.moveDownOf", { label }),
      () => move(index, 1)
    );

    if (index === 0) {
      up.disabled = true;
      up.dataset.permanentlyDisabled = "true";
    }

    if (index === rows.length - 1) {
      down.disabled = true;
      down.dataset.permanentlyDisabled = "true";
    }

    append(actions, up, down);

    append(
      actions,
      actionButton(t("common.edit"), t("olist.editOf", { label }), () =>
        onEdit(row, api)
      )
    );

    if (supportsActive) {
      const isActive = row.is_active !== false;
      append(
        actions,
        actionButton(
          t(isActive ? "common.disable" : "common.enable"),
          t("olist.toggleOf", {
            action: t(isActive ? "common.disable" : "common.enable"),
            label
          }),
          () => toggleActive(row)
        )
      );
    }

    const remove = actionButton(
      t("common.remove"),
      t("olist.removeOf", { label }),
      () => removeRow(row)
    );
    remove.classList.add("is-danger");
    append(actions, remove);

    append(item, position, bodySlot, actions);

    return item;
  }

  function actionButton(text, ariaLabel, handler) {
    const button = el("button", "ordered-action", text);
    button.type = "button";
    button.setAttribute("aria-label", ariaLabel);
    button.addEventListener("click", handler);
    return button;
  }

  async function move(index, direction) {
    const target = index + direction;

    if (busy || target < 0 || target >= rows.length) {
      return;
    }

    const reordered = rows.slice();
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);

    const updates = [];

    reordered.forEach((row, position) => {
      if (Number(row.sort_order) !== position) {
        updates.push({ id: row.id, sort_order: position });
      }
    });

    if (updates.length === 0) {
      return;
    }

    setBusy(true);

    for (const update of updates) {
      const { data, error } = await supabaseClient
        .from(table)
        .update({ sort_order: update.sort_order })
        .eq("id", update.id)
        .select("id");

      if (error || !data || data.length === 0) {
        if (error) {
          console.error(error);
        }

        setBusy(false);
        toast(t("olist.errOrder"), "error");
        await load();
        return;
      }
    }

    setBusy(false);
    toast(t("list.orderUpdated"));
    await load();
  }

  async function toggleActive(row) {
    if (busy) {
      return;
    }

    setBusy(true);

    const { data, error } = await supabaseClient
      .from(table)
      .update({ is_active: row.is_active === false })
      .eq("id", row.id)
      .select("id");

    setBusy(false);

    if (error || !data || data.length === 0) {
      if (error) {
        console.error(error);
      }

      toast(t("olist.errToggle"), "error");
      return;
    }

    toast(t(row.is_active === false ? "olist.enabled" : "olist.disabled"));
    await load();
  }

  async function removeRow(row) {
    if (busy) {
      return;
    }

    const confirmed = await confirmDialog(
      removeConfirm
        ? removeConfirm(row)
        : {
            title: t("olist.removeTitle"),
            lines: [t("confirm.cannotBeUndone")],
            confirmLabel: t("common.remove"),
            variant: "danger"
          }
    );

    if (!confirmed) {
      return;
    }

    setBusy(true);

    /*
      Database row first, storage objects afterwards. An orphaned file is
      recoverable; a row pointing at a deleted object is not.
    */
    const { data, error } = await supabaseClient
      .from(table)
      .delete()
      .eq("id", row.id)
      .select("id");

    if (error || !data || data.length === 0) {
      if (error) {
        console.error(error);
      }

      setBusy(false);
      toast(t("olist.errRemove"), "error");
      return;
    }

    let warning = null;

    if (typeof onAfterRemove === "function") {
      warning = await onAfterRemove(row);
    }

    setBusy(false);

    toast(warning || t("olist.removed"), warning ? "error" : "success");
    await load();
  }

  const api = {
    element: root,
    load,
    reload: load,
    getRows: () => rows.slice(),
    nextSortOrder: () =>
      rows.length === 0
        ? 0
        : rows.reduce((max, row) => Math.max(max, Number(row.sort_order) || 0), 0) + 1
  };

  return api;
}
