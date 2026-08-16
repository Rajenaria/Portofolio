/*
  Dashboard module.

  Read-only overview of the CMS content that already exists in Supabase.
  No CRUD, no charts, no fabricated statistics: every number on this page comes
  from a real query against the configured Supabase project.

  SECURITY
  --------
  All database values (project/experience titles, statuses, timestamps) are
  written into the DOM with createElement + textContent through the helpers in
  js/core/dom.js. There is no innerHTML path for Supabase content anywhere in
  this module. See docs/Security/ADMIN-CMS-SECURITY.md sections 42-43.

  Row visibility is decided by RLS, not by these queries. The explicit
  `deleted_at IS NULL` filters below are defence in depth and match the
  "frontend filter + RLS" rule in ADMIN-CMS-SECURITY.md section 80.
*/

import { supabaseClient } from "../core/supabase.js";

import {
  el,
  append,
  clear,
  pageHeader,
  statusBadge,
  updatedAt,
  emptyState
} from "../core/dom.js";

const RECENT_LIMIT = 5;

export const dashboardRoute = {
  name: "dashboard",
  title: "Dashboard",
  render
};

async function render(container, { signal }) {
  paintFrame(container);

  await load(container, signal);
}

function paintFrame(container) {
  append(
    container,
    pageHeader({
      title: "Dashboard",
      subtitle: "Manage and publish your portfolio content.",
      actions: [
        {
          label: "+ New Project",
          href: "#/projects",
          variant: "primary"
        },
        {
          label: "+ New Experience",
          href: "#/experience",
          variant: "secondary"
        }
      ]
    })
  );

  const alertSlot = el("div", "alert-slot");
  alertSlot.id = "dashboard-alert";

  const kpiGrid = el("div", "kpi-grid");
  kpiGrid.id = "dashboard-kpi";

  const recentSection = el("section", "admin-section");
  append(recentSection, el("h2", "section-title", "Recent Content"));

  const recentSlot = el("div", "recent-slot");
  recentSlot.id = "dashboard-recent";
  append(recentSection, recentSlot);

  append(container, alertSlot, kpiGrid, recentSection);
}

async function load(container, signal) {
  const alertSlot = container.querySelector("#dashboard-alert");
  const kpiGrid = container.querySelector("#dashboard-kpi");
  const recentSlot = container.querySelector("#dashboard-recent");

  clear(alertSlot);
  clear(kpiGrid);
  clear(recentSlot);

  renderKpiSkeleton(kpiGrid);
  append(recentSlot, el("p", "loading-text", "Loading recent content..."));

  let data;

  try {
    data = await loadDashboardData();
  } catch (error) {
    if (signal.aborted) {
      return;
    }

    // Technical detail stays in the console; the UI shows a safe message.
    console.error(error);

    clear(kpiGrid);
    clear(recentSlot);

    append(alertSlot, buildErrorAlert(container, signal));
    append(kpiGrid, unavailableCard("Projects"));
    append(kpiGrid, unavailableCard("Experience"));
    append(kpiGrid, unavailableCard("Technologies"));
    append(
      recentSlot,
      el("p", "loading-text", "Recent content is unavailable.")
    );

    return;
  }

  if (signal.aborted) {
    return;
  }

  clear(kpiGrid);
  clear(recentSlot);

  append(
    kpiGrid,
    kpiCard({
      label: "Projects",
      total: data.projects.total,
      unit: "total active",
      breakdown: [
        { label: "Published", value: data.projects.published },
        { label: "Draft", value: data.projects.draft },
        { label: "Archived", value: data.projects.archived }
      ]
    }),
    kpiCard({
      label: "Experience",
      total: data.experiences.total,
      unit: "total active",
      breakdown: [
        { label: "Published", value: data.experiences.published },
        { label: "Draft", value: data.experiences.draft },
        { label: "Archived", value: data.experiences.archived }
      ]
    }),
    kpiCard({
      label: "Technologies",
      total: data.technologies.total,
      unit: "total",
      breakdown: [
        { label: "Active", value: data.technologies.active },
        { label: "Inactive", value: data.technologies.inactive }
      ]
    })
  );

  append(recentSlot, buildRecentContent(data.recent));
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

async function loadDashboardData() {
  /*
    Three queries instead of eight count queries.

    CMS volume is small (see ADMIN-CMS-DATABASE.md section 66), so fetching the
    rows once and deriving both the KPI breakdown and the Recent Content list
    from the same result is cheaper than issuing a count query per status.
  */
  const [projects, experiences, technologies] = await Promise.all([
    supabaseClient
      .from("projects")
      .select("id, title, status, updated_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),

    supabaseClient
      .from("experiences")
      .select("id, title, status, updated_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),

    supabaseClient
      .from("technologies")
      .select("id, is_active")
  ]);

  const failure = [projects, experiences, technologies].find(
    result => result.error
  );

  if (failure) {
    throw failure.error;
  }

  const projectRows = projects.data || [];
  const experienceRows = experiences.data || [];
  const technologyRows = technologies.data || [];

  return {
    projects: summariseStatus(projectRows),
    experiences: summariseStatus(experienceRows),
    technologies: summariseTechnologies(technologyRows),
    recent: buildRecentList(projectRows, experienceRows)
  };
}

function summariseStatus(rows) {
  const counts = {
    total: rows.length,
    published: 0,
    draft: 0,
    archived: 0
  };

  rows.forEach(row => {
    if (row.status === "published") {
      counts.published += 1;
      return;
    }

    if (row.status === "draft") {
      counts.draft += 1;
      return;
    }

    if (row.status === "archived") {
      counts.archived += 1;
    }
  });

  return counts;
}

function summariseTechnologies(rows) {
  const active = rows.filter(row => row.is_active === true).length;

  return {
    total: rows.length,
    active,
    inactive: rows.length - active
  };
}

function buildRecentList(projectRows, experienceRows) {
  const items = [];

  projectRows.forEach(row => {
    items.push({
      id: `project-${row.id}`,
      type: "Project",
      title: row.title,
      status: row.status,
      updatedAt: row.updated_at
    });
  });

  experienceRows.forEach(row => {
    items.push({
      id: `experience-${row.id}`,
      type: "Experience",
      title: row.title,
      status: row.status,
      updatedAt: row.updated_at
    });
  });

  items.sort((a, b) => {
    const left = new Date(a.updatedAt).getTime() || 0;
    const right = new Date(b.updatedAt).getTime() || 0;

    return right - left;
  });

  return items.slice(0, RECENT_LIMIT);
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function renderKpiSkeleton(grid) {
  ["Projects", "Experience", "Technologies"].forEach(label => {
    const card = el("article", "kpi-card is-loading");

    append(
      card,
      el("p", "kpi-label", label),
      el("p", "kpi-value", "—"),
      el("p", "kpi-unit", "Loading...")
    );

    append(grid, card);
  });
}

function unavailableCard(label) {
  const card = el("article", "kpi-card is-unavailable");

  append(
    card,
    el("p", "kpi-label", label),
    el("p", "kpi-value", "—"),
    el("p", "kpi-unit", "Unavailable")
  );

  return card;
}

function kpiCard({ label, total, unit, breakdown }) {
  const card = el("article", "kpi-card");

  append(
    card,
    el("p", "kpi-label", label),
    el("p", "kpi-value", total),
    el("p", "kpi-unit", unit)
  );

  const list = el("ul", "kpi-breakdown");

  breakdown.forEach(entry => {
    const item = el("li", "kpi-breakdown-item");

    append(
      item,
      el("span", "kpi-breakdown-label", entry.label),
      el("span", "kpi-breakdown-value", entry.value)
    );

    append(list, item);
  });

  append(card, list);

  return card;
}

function buildRecentContent(items) {
  if (items.length === 0) {
    return emptyState({
      title: "No content yet.",
      description:
        "Projects and experiences you create will appear here, most recently updated first."
    });
  }

  const wrapper = el("div", "recent-list");

  const head = el("div", "recent-row recent-row-head");

  append(
    head,
    el("span", "recent-cell recent-cell-title", "Title"),
    el("span", "recent-cell recent-cell-type", "Type"),
    el("span", "recent-cell recent-cell-status", "Status"),
    el("span", "recent-cell recent-cell-updated", "Updated")
  );

  append(wrapper, head);

  const list = el("ul", "recent-items");

  items.forEach(item => {
    const row = el("li", "recent-row");

    // Every value below is written as text, never as markup.
    const title = el("span", "recent-cell recent-cell-title");
    append(title, el("span", "recent-title", item.title || "Untitled"));

    const type = el("span", "recent-cell recent-cell-type");
    append(type, el("span", "type-badge", item.type));

    const status = el("span", "recent-cell recent-cell-status");
    append(status, statusBadge(item.status));

    const updated = el("span", "recent-cell recent-cell-updated");
    append(updated, updatedAt(item.updatedAt));

    append(row, title, type, status, updated);
    append(list, row);
  });

  append(wrapper, list);

  return wrapper;
}

function buildErrorAlert(container, signal) {
  const alert = el("div", "admin-alert admin-alert-error");
  alert.setAttribute("role", "alert");

  append(
    alert,
    el("p", "admin-alert-title", "Could not load dashboard data."),
    el(
      "p",
      "admin-alert-text",
      "Check your connection and try again. If the problem continues, sign out and sign in again."
    )
  );

  const retry = el("button", "admin-button admin-button-secondary", "Try Again");
  retry.type = "button";

  retry.addEventListener("click", async () => {
    if (signal.aborted) {
      return;
    }

    retry.disabled = true;
    retry.textContent = "Loading...";

    await load(container, signal);
  });

  append(alert, retry);

  return alert;
}
