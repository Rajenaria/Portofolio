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
import { t } from "../core/i18n.js";

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

/*
  The four things this CMS manages. Declared once so the skeleton, the error
  state and the loaded state can never drift out of step with each other.
*/
const CARDS = [
  { key: "projects", labelKey: "dashboard.projects" },
  { key: "experiences", labelKey: "dashboard.experiences" },
  { key: "certificates", labelKey: "dashboard.certificates" },
  { key: "technologies", labelKey: "dashboard.technologies" }
];

const TYPE_LABELS = {
  project: "dashboard.typeProject",
  experience: "dashboard.typeExperience",
  certificate: "dashboard.typeCertificate"
};

function typeLabel(kind) {
  return t(TYPE_LABELS[kind] || "common.type");
}

function statusBreakdown(counts) {
  return [
    { label: t("dashboard.published"), value: counts.published },
    { label: t("dashboard.draft"), value: counts.draft },
    { label: t("dashboard.archived"), value: counts.archived }
  ];
}

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
      title: t("dashboard.title"),
      subtitle: t("dashboard.subtitle"),
      actions: [
        {
          label: t("dashboard.newProject"),
          href: "#/projects",
          variant: "primary"
        },
        {
          label: t("dashboard.newExperience"),
          href: "#/experience",
          variant: "secondary"
        },
        {
          label: t("dashboard.newCertificate"),
          href: "#/certificates",
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
  append(recentSection, el("h2", "section-title", t("dashboard.recent")));

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
  append(recentSlot, el("p", "loading-text", t("common.loading")));

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

    CARDS.forEach(card => append(kpiGrid, unavailableCard(t(card.labelKey))));

    append(
      recentSlot,
      el("p", "loading-text", t("dashboard.recentUnavailable"))
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
      label: t("dashboard.projects"),
      total: data.projects.total,
      unit: t("dashboard.totalActive"),
      breakdown: statusBreakdown(data.projects),
      href: "#/projects",
      linkLabel: t("dashboard.manageProjects")
    }),
    kpiCard({
      label: t("dashboard.experiences"),
      total: data.experiences.total,
      unit: t("dashboard.totalActive"),
      breakdown: statusBreakdown(data.experiences),
      href: "#/experience",
      linkLabel: t("dashboard.manageExperience")
    }),
    kpiCard({
      label: t("dashboard.certificates"),
      total: data.certificates.total,
      unit: t("dashboard.totalActive"),
      breakdown: statusBreakdown(data.certificates),
      href: "#/certificates",
      linkLabel: t("dashboard.manageCertificates")
    }),
    kpiCard({
      label: t("dashboard.technologies"),
      total: data.technologies.total,
      unit: t("dashboard.total"),
      breakdown: [
        { label: t("dashboard.active"), value: data.technologies.active },
        { label: t("dashboard.inactive"), value: data.technologies.inactive }
      ],
      href: "#/technologies",
      linkLabel: t("dashboard.manageTechnologies")
    })
  );

  append(recentSlot, buildRecentContent(data.recent));
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

async function loadDashboardData() {
  /*
    Four queries instead of one count query per status.

    CMS volume is small (see ADMIN-CMS-DATABASE.md section 66), so fetching the
    rows once and deriving both the KPI breakdown and the Recent Content list
    from the same result is cheaper than issuing a count query per status.
  */
  const [projects, experiences, certificates, technologies] = await Promise.all([
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
      .from("certificates")
      .select("id, title, status, updated_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),

    supabaseClient
      .from("technologies")
      .select("id, is_active")
  ]);

  const failure = [projects, experiences, certificates, technologies].find(
    result => result.error
  );

  if (failure) {
    throw failure.error;
  }

  const projectRows = projects.data || [];
  const experienceRows = experiences.data || [];
  const certificateRows = certificates.data || [];
  const technologyRows = technologies.data || [];

  return {
    projects: summariseStatus(projectRows),
    experiences: summariseStatus(experienceRows),
    certificates: summariseStatus(certificateRows),
    technologies: summariseTechnologies(technologyRows),
    recent: buildRecentList(projectRows, experienceRows, certificateRows)
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

function buildRecentList(projectRows, experienceRows, certificateRows) {
  const items = [];

  /* The visible type label is resolved at render time, not here, so switching
     language re-labels these rows without another round trip. */
  const sources = [
    { rows: projectRows, kind: "project" },
    { rows: experienceRows, kind: "experience" },
    { rows: certificateRows, kind: "certificate" }
  ];

  sources.forEach(source => {
    source.rows.forEach(row => {
      items.push({
        id: `${source.kind}-${row.id}`,
        kind: source.kind,
        title: row.title,
        status: row.status,
        updatedAt: row.updated_at
      });
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
  CARDS.forEach(card => {
    const node = el("article", "kpi-card is-loading");

    append(
      node,
      el("p", "kpi-label", t(card.labelKey)),
      el("p", "kpi-value", "—"),
      el("p", "kpi-unit", t("common.loading"))
    );

    append(grid, node);
  });
}

function unavailableCard(label) {
  const card = el("article", "kpi-card is-unavailable");

  append(
    card,
    el("p", "kpi-label", label),
    el("p", "kpi-value", "—"),
    el("p", "kpi-unit", t("dashboard.unavailable"))
  );

  return card;
}

function kpiCard({ label, total, unit, breakdown, href, linkLabel }) {
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

  /* Each card ends where its content is edited, so the overview is a way in
     rather than a dead end. A plain link: the router owns navigation. */
  if (href) {
    const link = el("a", "kpi-link", linkLabel);
    link.href = href;
    append(card, link);
  }

  return card;
}

function buildRecentContent(items) {
  if (items.length === 0) {
    return emptyState({
      title: t("dashboard.empty"),
      description: t("dashboard.emptyHelp")
    });
  }

  const wrapper = el("div", "recent-list");

  const head = el("div", "recent-row recent-row-head");

  append(
    head,
    el("span", "recent-cell recent-cell-title", t("common.title")),
    el("span", "recent-cell recent-cell-type", t("common.type")),
    el("span", "recent-cell recent-cell-status", t("common.status")),
    el("span", "recent-cell recent-cell-updated", t("common.updated"))
  );

  append(wrapper, head);

  const list = el("ul", "recent-items");

  items.forEach(item => {
    const row = el("li", "recent-row");

    // Every value below is written as text, never as markup.
    const title = el("span", "recent-cell recent-cell-title");
    append(
      title,
      el("span", "recent-title", item.title || t("certificates.untitled"))
    );

    const type = el("span", "recent-cell recent-cell-type");
    append(
      type,
      el("span", `type-badge type-badge-${item.kind}`, typeLabel(item.kind))
    );

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
    el("p", "admin-alert-title", t("dashboard.loadError")),
    el("p", "admin-alert-text", t("dashboard.loadErrorHelp"))
  );

  const retry = el(
    "button",
    "admin-button admin-button-secondary",
    t("common.tryAgain")
  );
  retry.type = "button";

  retry.addEventListener("click", async () => {
    if (signal.aborted) {
      return;
    }

    retry.disabled = true;
    retry.textContent = t("common.loading");

    await load(container, signal);
  });

  append(alert, retry);

  return alert;
}
