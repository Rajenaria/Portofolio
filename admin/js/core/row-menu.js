/*
  Shared, viewport-safe row action menu.

  Certificates, Projects, Experience and Technologies all render a per-row
  "..." menu inside a table cell that sits inside .admin-table-wrap, which
  clips with overflow:hidden for its rounded-corner card look. A menu
  positioned relative to that cell gets cut off on the rows nearest the
  bottom of the wrap. Portalling the menu into #admin-menu-root (a body-level
  sibling, same idea as #admin-modal-root) and positioning it with
  position:fixed from the trigger's own geometry sidesteps the clip entirely
  instead of loosening it.

  One menu open at a time, globally: opening a second one closes the first,
  which is also what happens today when each module enforces it locally.
*/

import { el, append } from "./dom.js";

let current = null; // { trigger, menu, buttons }

function portalRoot() {
  return document.getElementById("admin-menu-root");
}

function focusableButtons() {
  return current ? current.buttons.filter(button => !button.disabled) : [];
}

/*
  Measures the menu's natural size, then decides whether it opens downward
  (default) or flips upward when the space below the trigger cannot hold it
  and the space above is bigger. Whichever side is chosen, the menu is
  clamped inside the viewport (small margin) and given internal scrolling if
  it still cannot fit the space it was given.
*/
function reposition() {
  if (!current) {
    return;
  }

  const { trigger, menu } = current;
  const margin = 8;
  const gap = 4;

  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const triggerRect = trigger.getBoundingClientRect();

  menu.style.maxHeight = "";
  menu.style.overflowY = "";

  const menuRect = menu.getBoundingClientRect();
  const menuWidth = menuRect.width;
  const menuHeight = menuRect.height;

  const spaceBelow = viewportHeight - triggerRect.bottom - gap - margin;
  const spaceAbove = triggerRect.top - gap - margin;

  let top;
  let available;

  if (menuHeight <= spaceBelow || spaceBelow >= spaceAbove) {
    top = triggerRect.bottom + gap;
    available = spaceBelow;
  } else {
    available = spaceAbove;
    top = triggerRect.top - gap - Math.min(menuHeight, available);
  }

  top = Math.max(margin, top);

  if (menuHeight > available) {
    menu.style.maxHeight = `${Math.max(120, available)}px`;
    menu.style.overflowY = "auto";
  }

  let left = triggerRect.right - menuWidth;
  left = Math.min(left, viewportWidth - margin - menuWidth);
  left = Math.max(margin, left);

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}

function handlePointerDown(event) {
  if (current && !current.menu.contains(event.target) && !current.trigger.contains(event.target)) {
    closeRowMenu();
  }
}

function handleKeydown(event) {
  if (!current) {
    return;
  }

  if (event.key === "Escape") {
    closeRowMenu();
    return;
  }

  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return;
  }

  if (!current.menu.contains(document.activeElement)) {
    return;
  }

  event.preventDefault();

  const enabled = focusableButtons();

  if (enabled.length === 0) {
    return;
  }

  const index = enabled.indexOf(document.activeElement);
  const step = event.key === "ArrowDown" ? 1 : -1;
  enabled[(index + step + enabled.length) % enabled.length].focus();
}

function handleWindowChange() {
  reposition();
}

document.addEventListener("pointerdown", handlePointerDown);
document.addEventListener("keydown", handleKeydown);
window.addEventListener("resize", handleWindowChange);
window.addEventListener("scroll", handleWindowChange, true);

export function closeRowMenu() {
  if (!current) {
    return;
  }

  const { trigger, menu } = current;
  const focusWasInMenu = menu.contains(document.activeElement);

  menu.remove();
  trigger.setAttribute("aria-expanded", "false");
  current = null;

  if (focusWasInMenu && document.contains(trigger)) {
    trigger.focus();
  }
}

export function isRowMenuOpenFor(trigger) {
  return Boolean(current && current.trigger === trigger);
}

/*
  entries: array of { label, onSelect, disabled, hint, danger } — the exact
  shape each module's normalEntries()/trashEntries() already produces.
*/
export function openRowMenu({ trigger, entries }) {
  if (isRowMenuOpenFor(trigger)) {
    closeRowMenu();
    return;
  }

  closeRowMenu();

  const root = portalRoot();

  if (!root) {
    return;
  }

  const menu = el("div", "row-menu");
  menu.setAttribute("role", "menu");

  const buttons = entries.map(entry => {
    const button = el("button", "row-menu-item", entry.label);
    button.type = "button";
    button.setAttribute("role", "menuitem");

    if (entry.danger) {
      button.classList.add("is-danger");
    }

    if (entry.disabled) {
      button.disabled = true;

      if (entry.hint) {
        button.title = entry.hint;
      }
    } else {
      button.addEventListener("click", () => {
        closeRowMenu();
        entry.onSelect();
      });
    }

    append(menu, button);
    return button;
  });

  current = { trigger, menu, buttons };

  append(root, menu);
  trigger.setAttribute("aria-expanded", "true");
  reposition();

  const first = buttons.find(button => !button.disabled);

  if (first) {
    first.focus();
  }
}
