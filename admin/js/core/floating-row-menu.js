import { el } from "./dom.js";

let sequence = 0;

// Used only by Projects/Certificates. The portal escapes table/card clipping;
// listeners exist only while a menu is open and are released together.
export function openFloatingRowMenu({ trigger, entries, onClose, last = false }) {
  const menu = el("div","row-menu row-menu-floating");
  menu.id = `floating-row-menu-${++sequence}`;
  menu.setAttribute("role","menu");
  menu.setAttribute("aria-label",trigger.getAttribute("aria-label"));
  const events = new AbortController(), options = {signal:events.signal};
  let closed = false;
  function close(restore = menu.contains(document.activeElement)) {
    if (closed) return;
    closed = true; events.abort(); menu.remove();
    trigger.setAttribute("aria-expanded","false"); trigger.removeAttribute("aria-controls");
    trigger.parentElement?.classList.remove("is-open");
    if (restore && trigger.isConnected) trigger.focus({preventScroll:true});
    onClose?.();
  }
  const buttons = entries.map(entry => {
    const item = el("button",`row-menu-item${entry.danger ? " is-danger" : ""}`,entry.label);
    item.type = "button"; item.setAttribute("role","menuitem"); item.tabIndex = -1;
    item.disabled = Boolean(entry.disabled);
    if (entry.hint) item.title = entry.hint;
    item.addEventListener("click",() => { close(true); entry.onSelect(); },options);
    menu.append(item); return item;
  });
  menu.style.visibility = "hidden";
  document.body.append(menu);
  const viewport = window.visualViewport;
  const leftEdge = (viewport?.offsetLeft || 0)+8, topEdge = (viewport?.offsetTop || 0)+8;
  const rightEdge = leftEdge+(viewport?.width || document.documentElement.clientWidth)-16;
  const bottomEdge = topEdge+(viewport?.height || window.innerHeight)-16;
  const anchor = trigger.getBoundingClientRect();
  menu.style.maxWidth = `${Math.max(0,rightEdge-leftEdge)}px`;
  menu.style.maxHeight = `${Math.max(0,bottomEdge-topEdge)}px`;
  const box = menu.getBoundingClientRect();
  const below = Math.max(0,bottomEdge-anchor.bottom-4), above = Math.max(0,anchor.top-topEdge-4);
  const upward = box.height > below && above > below;
  const room = upward ? above : below;
  if (room < 1 || anchor.bottom < topEdge || anchor.top > bottomEdge) { close(false); return close; }
  const height = Math.min(box.height,room);
  menu.style.maxHeight = `${height}px`;
  menu.style.left = `${Math.max(leftEdge,Math.min(anchor.right-box.width,rightEdge-box.width))}px`;
  menu.style.top = `${upward ? anchor.top-4-height : anchor.bottom+4}px`;
  menu.style.visibility = "visible";
  trigger.setAttribute("aria-expanded","true"); trigger.setAttribute("aria-controls",menu.id);
  trigger.parentElement?.classList.add("is-open");
  const enabled = buttons.filter(button => !button.disabled);
  (last ? enabled.at(-1) : enabled[0])?.focus({preventScroll:true});
  document.addEventListener("pointerdown",event => {
    if (!menu.contains(event.target) && !trigger.contains(event.target)) close(false);
  },{...options,capture:true});
  document.addEventListener("keydown",event => {
    if (event.key === "Escape") { event.preventDefault(); close(true); }
    else if (event.key === "Tab") close(true);
    else if (menu.contains(event.target) && ["ArrowDown","ArrowUp","Home","End"].includes(event.key)) {
      event.preventDefault();
      if (!enabled.length) return;
      const current = enabled.indexOf(document.activeElement);
      const index = event.key === "Home" ? 0 : event.key === "End" ? enabled.length-1
        : (current+(event.key === "ArrowDown" ? 1 : -1)+enabled.length)%enabled.length;
      enabled[index].focus({preventScroll:true});
      enabled[index].scrollIntoView({block:"nearest"});
    }
  },options);
  window.addEventListener("scroll",event => { if (!(event.target instanceof Node && menu.contains(event.target))) close(); },{...options,capture:true,passive:true});
  window.addEventListener("resize",() => close(),options);
  viewport?.addEventListener("resize",() => close(),options);
  viewport?.addEventListener("scroll",() => close(),options);
  return close;
}
