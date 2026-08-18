/*
  Minimal toast feedback for the Admin CMS.

  Rules from docs/Design/ADMIN-DASHBOARD-DESIGN.md section 53:
    - short and clear,
    - no raw stack trace, no raw Supabase/Postgres error text,
    - technical details stay in the console during development.

  SECURITY: messages are written with textContent only.
*/

import { el, append } from "./dom.js";

const VISIBLE_MS = 4000;

export function toast(message, type = "success") {
  const host = document.getElementById("admin-toast-root");

  if (!host) {
    return;
  }

  const node = el("div", `admin-toast admin-toast-${type}`, message);

  // Errors interrupt; successes are announced politely by the live region.
  node.setAttribute("role", type === "error" ? "alert" : "status");

  append(host, node);

  window.setTimeout(() => {
    node.remove();
  }, VISIBLE_MS);
}
