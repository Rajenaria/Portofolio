/*
  Profile & About route (Phase 6).

  Loads the two singletons plus the primary Hero photo once, then mounts three
  internal tabs. Tab state is local page state: switching tabs never remounts
  the authenticated shell and never touches the router, so the hash stays
  #/profile throughout.

  UNSAVED CHANGES
  ---------------
  There is no autosave. A tab that has pending edits or a pending image guards
  three exits:

    - switching to another tab,
    - navigating away through the sidebar (captured click, cancelled and
      replayed only if the owner discards),
    - refreshing or closing the tab (beforeunload).

  The guard is skipped entirely when nothing changed.
*/

import { supabaseClient } from "../../core/supabase.js";
import { el, append, clear, pageHeader } from "../../core/dom.js";
import { confirmDialog, closeAllModals } from "../../core/modal.js";
import { t } from "../../core/i18n.js";
import { registerNavigationGuard } from "../../core/navigation-guard.js";

import { createCvTab } from "./cv-tab.js";
import { createHeroTab } from "./hero-tab.js";
import { createAboutTab } from "./about-tab.js";
import { createOrganizationTab } from "./organization-tab.js";

/* Labels resolve at render time so switching language relabels the tabs. */
const TABS = [
  { id: "hero", key: "profile.tabHero" },
  { id: "about", key: "profile.tabAbout" },
  { id: "organization", key: "profile.tabOrganization" },
  { id: "cv", key: "cv.tab" }
];

export const profileRoute = {
  name: "profile",
  title: "Profile & About",  // Fallback only: the shell titles routes from nav.*
  render
};

async function render(container, { signal }) {
  append(
    container,
    pageHeader({
      title: t("profile.title"),
      subtitle: t("profile.subtitle")
    })
  );

  const tabBar = el("div", "tab-bar");
  tabBar.setAttribute("role", "tablist");
  tabBar.setAttribute("aria-label", t("profile.tabsLabel"));

  const panelSlot = el("div", "tab-panel-slot");
  panelSlot.id = "profile-tab-panel";
  panelSlot.setAttribute("role", "tabpanel");
  panelSlot.tabIndex = -1;

  const statusSlot = el("div", "profile-status");

  append(container, statusSlot);

  let activeTabId = "hero";
  let activeTab = null;
  let dirty = false;
  let data = null;
  const tabButtons = new Map();

  /* ---------------- unsaved-changes guards ---------------- */

  function isDirty() { return Boolean(activeTab && activeTab.isDirty()); }

  const releaseNavigationGuard = registerNavigationGuard(isDirty, confirmUnsaved);

  async function confirmUnsaved() {
    return await confirmDialog({
      title: t("unsaved.title"),
      lines: [t("profile.unsavedTab"), t("unsaved.lost")],
      confirmLabel: t("unsaved.leave"),
      cancelLabel: t("unsaved.stay"),
      variant: "danger"
    });
  }

  function onDirtyChange(next) {
    dirty = next;
    updateTabDirtyMarker();
  }

  function updateTabDirtyMarker() {
    const button = tabButtons.get(activeTabId);

    if (!button) {
      return;
    }

    let marker = button.querySelector(".tab-dirty");

    if (dirty && !marker) {
      marker = el("span", "tab-dirty", "•");
      marker.setAttribute("aria-label", t("profile.unsavedMarker"));
      append(button, marker);
      return;
    }

    if (!dirty && marker) {
      marker.remove();
    }
  }

  /* ---------------- tabs ---------------- */

  function buildTabBar() {
    clear(tabBar);
    tabButtons.clear();

    TABS.forEach(tab => {
      const button = el("button", "tab-button", t(tab.key));
      if (tab.id === "cv") {
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("class", "sidebar-icon cv-tab-icon");
        icon.setAttribute("viewBox", "0 0 20 20");
        icon.setAttribute("aria-hidden", "true");
        icon.setAttribute("focusable", "false");
        const path = document.createElementNS(icon.namespaceURI, "path");
        path.setAttribute("d", "M11.5 2.5H5A1.5 1.5 0 0 0 3.5 4v12A1.5 1.5 0 0 0 5 17.5h10a1.5 1.5 0 0 0 1.5-1.5V7.5Z M11.5 2.5v5h5 M6.5 10.5h7 M6.5 13.5h5");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "1.4");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        icon.append(path); button.prepend(icon);
      }
      button.type = "button";
      button.id = `profile-tab-${tab.id}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", "profile-tab-panel");
      button.setAttribute("aria-selected", tab.id === activeTabId ? "true" : "false");
      button.tabIndex = tab.id === activeTabId ? 0 : -1;

      if (tab.id === activeTabId) {
        button.classList.add("is-active");
      }

      button.addEventListener("click", () => selectTab(tab.id));

      button.addEventListener("keydown", event => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
          return;
        }

        event.preventDefault();

        const index = TABS.findIndex(entry => entry.id === tab.id);
        const step = event.key === "ArrowRight" ? 1 : -1;
        const next = TABS[(index + step + TABS.length) % TABS.length];

        tabButtons.get(next.id).focus();
        selectTab(next.id);
      });

      tabButtons.set(tab.id, button);
      append(tabBar, button);
    });

    updateTabDirtyMarker();
  }

  async function selectTab(id) {
    if (id === activeTabId) {
      return;
    }

    if (isDirty()) {
      const leave = await confirmUnsaved();

      if (!leave) {
        return;
      }
    }

    activeTabId = id;
    mountActiveTab();
  }

  function mountActiveTab() {
    if (activeTab && typeof activeTab.destroy === "function") {
      activeTab.destroy();
    }

    dirty = false;
    clear(panelSlot);

    const options = { onDirtyChange };

    if (activeTabId === "hero") {
      activeTab = createHeroTab({
        profile: data.profile,
        heroSlots: data.heroSlots,
        ...options
      });
    } else if (activeTabId === "about") {
      activeTab = createAboutTab({ profile: data.profile, ...options });
    } else if (activeTabId === "cv") {
      activeTab = createCvTab(options);
    } else {
      activeTab = createOrganizationTab({
        organization: data.organization,
        ...options
      });
    }

    append(panelSlot, activeTab.element);

    buildTabBar();
    panelSlot.setAttribute("aria-labelledby", `profile-tab-${activeTabId}`);
  }

  /* ---------------- load ---------------- */

  async function load() {
    clear(statusSlot);
    append(statusSlot, el("p", "loading-text", t("profile.loading")));

    const [profileResult, heroResult, organizationResult] = await Promise.all([
      supabaseClient
        .from("profile_content")
        .select(
          "id, name, professional_title, hero_description, about_heading_main, about_heading_highlight, about_lead, about_description, about_photo_bucket, about_photo_desktop_path, about_photo_mobile_path, about_photo_alt"
        )
        .eq("singleton_key", 1)
        .maybeSingle(),

      supabaseClient
        // Only the primary photo is editable; legacy slots stay stored.
        .from("hero_media")
        .select(
          "slot_number, bucket_name, desktop_path, mobile_path, alt_text, is_visible"
        )
        .eq("slot_number", 1),

      supabaseClient
        .from("about_organization")
        .select("id, heading_main, heading_highlight, paragraph_1, paragraph_2")
        .eq("singleton_key", 1)
        .maybeSingle()
    ]);

    if (signal.aborted) {
      return;
    }

    const failure = [profileResult, heroResult, organizationResult].find(
      result => result.error
    );

    if (failure || !profileResult.data || !organizationResult.data) {
      if (failure) {
        console.error(failure.error);
      }

      clear(statusSlot);
      append(statusSlot, buildErrorPanel());
      return;
    }

    data = {
      profile: profileResult.data,
      heroSlots: heroResult.data || [],
      organization: organizationResult.data
    };

    clear(statusSlot);
    append(container, tabBar, panelSlot);
    mountActiveTab();
  }

  function buildErrorPanel() {
    const panel = el("div", "admin-alert admin-alert-error");
    panel.setAttribute("role", "alert");

    append(
      panel,
      el("p", "admin-alert-title", t("profile.loadError")),
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

  await load();

  return () => {
    releaseNavigationGuard();

    if (activeTab && typeof activeTab.destroy === "function") {
      activeTab.destroy();
    }

    closeAllModals();
  };
}
