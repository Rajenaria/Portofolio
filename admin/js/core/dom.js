/*
  Safe DOM helpers for the Admin CMS.

  SECURITY: every helper in this file builds nodes with createElement and writes
  text with textContent. Nothing here ever assigns innerHTML, so Supabase content
  (titles, statuses, labels) can never be interpreted as markup.
  See docs/Security/ADMIN-CMS-SECURITY.md section 42.
*/

export function el(tag, className, text) {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text !== undefined && text !== null) {
    node.textContent = String(text);
  }

  return node;
}

export function clear(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

export function append(parent, ...children) {
  children.forEach(child => {
    if (child) {
      parent.appendChild(child);
    }
  });

  return parent;
}

/*
  Local page header used by every Admin route.

  The design baseline deliberately avoids a feature-heavy global topbar, so the
  title / description / primary actions live inside the page itself.
  See docs/Design/ADMIN-DASHBOARD-DESIGN.md section 7.
*/
export function pageHeader({ title, subtitle, actions = [] }) {
  const header = el("header", "page-header");
  const heading = el("div", "page-header-text");

  append(heading, el("h1", "page-title", title));

  if (subtitle) {
    append(heading, el("p", "page-subtitle", subtitle));
  }

  append(header, heading);

  if (actions.length > 0) {
    const actionBar = el("div", "page-actions");

    actions.forEach(action => {
      const className =
        `admin-button admin-button-${action.variant || "secondary"}`;

      // Route shortcuts stay real links; in-page actions become buttons.
      if (action.href) {
        const link = el("a", className, action.label);
        link.href = action.href;
        append(actionBar, link);
        return;
      }

      const button = el("button", className, action.label);
      button.type = "button";
      button.addEventListener("click", action.onClick);
      append(actionBar, button);
    });

    append(header, actionBar);
  }

  return header;
}

export function section(title) {
  const wrapper = el("section", "admin-section");

  if (title) {
    append(wrapper, el("h2", "section-title", title));
  }

  return wrapper;
}

/*
  Status pill. The label is always rendered as text, so status meaning never
  depends on colour alone (accessibility requirement, design baseline section 58).
*/
export function statusBadge(status) {
  const key = String(status || "").toLowerCase();

  const labels = {
    published: "Published",
    draft: "Draft",
    archived: "Archived",
    active: "Active",
    inactive: "Inactive"
  };

  const badge = el(
    "span",
    `status-badge status-badge-${key}`,
    labels[key] || "Unknown"
  );

  return badge;
}

/*
  Human-readable "last updated" text.

  Returns a <time> element so the machine-readable timestamp stays available
  in the datetime attribute while the visible text stays short.
*/
export function updatedAt(isoString) {
  const node = el("time", "updated-at");
  const date = new Date(isoString);

  if (!isoString || Number.isNaN(date.getTime())) {
    node.textContent = "Unknown";
    return node;
  }

  node.dateTime = date.toISOString();
  node.title = date.toLocaleString("en-GB");
  node.textContent = formatRelativeDate(date);

  return node;
}

function formatRelativeDate(date) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  });

  if (diffMs < 60 * 1000) {
    return "Just now";
  }

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();

  const oneDay = 24 * 60 * 60 * 1000;

  if (date.getTime() >= startOfToday) {
    return `Today, ${time}`;
  }

  if (date.getTime() >= startOfToday - oneDay) {
    return `Yesterday, ${time}`;
  }

  const dayDiff = Math.floor((startOfToday - date.getTime()) / oneDay) + 1;

  if (dayDiff < 7) {
    return `${dayDiff} days ago`;
  }

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

/*
  Neutral empty/placeholder panel. Used by routes that have no content yet and
  by the not-implemented-yet module shells.
*/
export function emptyState({ title, description }) {
  const box = el("div", "empty-state");

  append(box, el("p", "empty-state-title", title));

  if (description) {
    append(box, el("p", "empty-state-text", description));
  }

  return box;
}
