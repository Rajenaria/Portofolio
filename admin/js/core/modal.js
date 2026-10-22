/*
  Reusable accessible modal for the Admin CMS.

  Provides:
    - role="dialog" aria-modal="true" with a labelled title,
    - focus trap (Tab / Shift+Tab cycle inside the dialog),
    - Escape and backdrop close routed through an interceptable request,
    - focus restoration to the element that opened the modal,
    - a modal stack so a confirmation can open on top of a form modal.

  Design baseline: docs/Design/ADMIN-DASHBOARD-DESIGN.md section 51.

  SECURITY: this module never assigns innerHTML. Titles and descriptions are
  written with textContent; bodies are DOM nodes supplied by the caller.
*/

import { el, append, clear } from "./dom.js";
import { t } from "./i18n.js";
import { registerNavigationGuard } from "./navigation-guard.js";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

const stack = [];

let keydownBound = false;

function root() {
  return document.getElementById("admin-modal-root");
}

function topModal() {
  return stack[stack.length - 1] || null;
}

function focusableIn(node) {
  return Array.from(node.querySelectorAll(FOCUSABLE)).filter(
    item => item.offsetParent !== null || item === document.activeElement
  );
}

function handleKeydown(event) {
  const modal = topModal();

  if (!modal) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    modal.requestClose("escape");
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const items = focusableIn(modal.dialog);

  if (items.length === 0) {
    event.preventDefault();
    modal.dialog.focus();
    return;
  }

  const first = items[0];
  const last = items[items.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function ensureKeydownBound() {
  if (keydownBound) {
    return;
  }

  document.addEventListener("keydown", handleKeydown, true);
  keydownBound = true;
}

let titleIdCounter = 0;

/*
  openModal({ title, description, body, actions, onRequestClose, size })

  actions: [{ label, variant, onClick(controller), autofocus }]
  onRequestClose(reason) may return false (or a Promise resolving to false)
  to veto closing — used for the unsaved-changes guard.
*/
export function openModal({
  title,
  description,
  body,
  actions = [],
  onRequestClose,
  isDirty,
  size,
  onClosed
}) {
  ensureKeydownBound();

  const previouslyFocused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

  titleIdCounter += 1;
  const titleId = `admin-modal-title-${titleIdCounter}`;

  const overlay = el("div", "modal-overlay");

  const dialog = el(
    "div",
    size === "small" ? "modal-dialog modal-dialog-small" : "modal-dialog"
  );

  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", titleId);
  dialog.tabIndex = -1;

  const header = el("div", "modal-header");
  const heading = el("h2", "modal-title", title);
  heading.id = titleId;
  append(header, heading);

  if (description) {
    append(header, el("p", "modal-description", description));
  }

  append(dialog, header);

  const content = el("div", "modal-body");

  if (body) {
    append(content, body);
  }

  append(dialog, content);

  const footer = el("div", "modal-footer");
  const actionButtons = [];

  const controller = {
    close,
    requestClose,
    setBusy,
    dialog,
    footer
  };

  actions.forEach(action => {
    const button = el(
      "button",
      `admin-button admin-button-${action.variant || "secondary"}`,
      action.label
    );

    button.type = "button";
    button.dataset.defaultLabel = action.label;

    button.addEventListener("click", () => {
      action.onClick(controller);
    });

    actionButtons.push(button);
    append(footer, button);
  });

  if (actionButtons.length > 0) {
    append(dialog, footer);
  }

  append(overlay, dialog);
  append(root(), overlay);

  document.body.classList.add("has-modal-open");

  const entry = {
    overlay,
    dialog,
    requestClose,
    previouslyFocused
  };

  stack.push(entry);
  let modalBusy = false;
  const snapshot = () => JSON.stringify(Array.from(content.querySelectorAll("input,select,textarea"),
    field => [field.name, field.type, field.value, field.checked]));
  const baseline = snapshot();
  const releaseGuard = typeof onRequestClose === "function"
    ? registerNavigationGuard(
        () => modalBusy || (typeof isDirty === "function" ? isDirty() : snapshot() !== baseline),
        () => modalBusy ? false : onRequestClose("navigation"))
    : () => {};
  entry.close = close;

  overlay.addEventListener("mousedown", event => {
    if (event.target === overlay) {
      requestClose("backdrop");
    }
  });

  // Initial focus: first action marked autofocus, else first focusable node.
  const autofocusIndex = actions.findIndex(action => action.autofocus);
  const focusTarget =
    autofocusIndex >= 0
      ? actionButtons[autofocusIndex]
      : focusableIn(dialog)[0] || dialog;

  focusTarget.focus();

  async function requestClose(reason) {
    if (modalBusy) return;
    if (typeof onRequestClose === "function") {
      const allowed = await onRequestClose(reason);

      if (allowed === false) {
        return;
      }
    }

    close();
  }

  function close() {
    const index = stack.indexOf(entry);

    if (index === -1) {
      return;
    }

    releaseGuard();
    stack.splice(index, 1);
    overlay.remove();

    if (stack.length === 0) {
      document.body.classList.remove("has-modal-open");
    }

    if (previouslyFocused && document.contains(previouslyFocused)) {
      previouslyFocused.focus();
    }

    if (typeof onClosed === "function") {
      onClosed();
    }
  }

  /*
    Disables every action while an async request runs and swaps the label of
    the primary action to its pending text ("Saving...", "Disabling...").
    Prevents duplicate submits (design baseline section 9).
  */
  let fieldsDisabledByBusy = [];

  function setBusy(busy, pendingLabel) {
    modalBusy = busy;
    actionButtons.forEach((button, index) => {
      button.disabled = busy;

      if (!busy) {
        // Always restore the original label, including on the error path
        // where setBusy(false) is called without a pending label.
        button.textContent = button.dataset.defaultLabel;
        return;
      }

      if (index === actionButtons.length - 1 && pendingLabel) {
        button.textContent = pendingLabel;
      }
    });

    const fields = Array.from(
      content.querySelectorAll("input, select, textarea, button")
    );

    if (busy) {
      // Remember which fields were already disabled by the form itself
      // (for example Public Group while the public toggle is off) so that
      // re-enabling never resurrects a control that should stay disabled.
      fieldsDisabledByBusy = fields.filter(field => !field.disabled);
      fieldsDisabledByBusy.forEach(field => {
        field.disabled = true;
      });

      return;
    }

    fieldsDisabledByBusy.forEach(field => {
      field.disabled = false;
    });

    fieldsDisabledByBusy = [];
  }

  return controller;
}

/*
  Small confirmation dialog. Resolves true when confirmed, false otherwise.
  Used for Enable/Disable and for the unsaved-changes guard.
*/
export function confirmDialog({
  title,
  description,
  lines = [],
  confirmLabel = t("modal.confirm"),
  cancelLabel = t("common.cancel"),
  variant = "primary"
}) {
  return new Promise(resolve => {
    let settled = false;

    const body = el("div", "confirm-body");

    lines.forEach(line => {
      append(body, el("p", "confirm-line", line));
    });

    const controller = openModal({
      title,
      description,
      body: lines.length > 0 ? body : null,
      size: "small",
      actions: [
        {
          label: cancelLabel,
          variant: "secondary",
          onClick: ctl => {
            settle(false);
            ctl.close();
          }
        },
        {
          label: confirmLabel,
          variant,
          autofocus: true,
          onClick: ctl => {
            settle(true);
            ctl.close();
          }
        }
      ],
      onClosed: () => settle(false)
    });

    function settle(value) {
      if (settled) {
        return;
      }

      settled = true;
      resolve(value);
    }

    return controller;
  });
}

export function closeAllModals() {
  while (stack.length > 0) {
    stack[stack.length - 1].close();
  }

  document.body.classList.remove("has-modal-open");

  const modalRoot = root();

  if (modalRoot) {
    clear(modalRoot);
  }
}
