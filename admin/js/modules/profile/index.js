/*
  Profile & About route (Phase 6).

  Loads the two singletons plus the three hero slots once, then mounts three
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

import { createHeroTab } from "./hero-tab.js";
import { createAboutTab } from "./about-tab.js";
import { createOrganizationTab } from "./organization-tab.js";

const TABS = [
  { id: "hero", label: "Hero" },
  { id: "about", label: "About Me" },
  { id: "organization", label: "Organization" }
];

export const profileRoute = {
  name: "profile",
  title: "Profile & About",
  render
};

async function render(container, { signal }) {
  append(
    container,
    pageHeader({
      title: "Profile & About",
      subtitle: "Manage the content displayed in your Hero and About sections."
    })
  );

  const tabBar = el("div", "tab-bar");
  tabBar.setAttribute("role", "tablist");
  tabBar.setAttribute("aria-label", "Profile sections");

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

  function handleBeforeUnload(event) {
    if (!isDirty()) {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
  }

  let bypassNavigationGuard = false;

  async function handleNavigationCapture(event) {
    if (bypassNavigationGuard || !isDirty()) {
      return;
    }

    const link = event.target.closest
      ? event.target.closest(".sidebar-link[data-route]")
      : null;

    if (!link || link.dataset.route === "profile") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const leave = await confirmUnsaved();

    if (!leave) {
      return;
    }

    bypassNavigationGuard = true;
    link.click();
  }

  window.addEventListener("beforeunload", handleBeforeUnload);
  document.addEventListener("click", handleNavigationCapture, true);

  function isDirty() {
    return Boolean(activeTab && activeTab.isDirty());
  }

  async function confirmUnsaved() {
    return await confirmDialog({
      title: "Leave without saving?",
      lines: [
        "You have unsaved changes on this tab.",
        "Your changes will be lost if you leave now."
      ],
      confirmLabel: "Leave Without Saving",
      cancelLabel: "Stay",
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
      marker.setAttribute("aria-label", "unsaved changes");
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
      const button = el("button", "tab-button", tab.label);
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
    append(statusSlot, el("p", "loading-text", "Loading Profile & About..."));

    const [profileResult, heroResult, organizationResult] = await Promise.all([
      supabaseClient
        .from("profile_content")
        .select(
          "id, name, professional_title, hero_description, about_heading_main, about_heading_highlight, about_lead, about_description, about_photo_bucket, about_photo_desktop_path, about_photo_mobile_path, about_photo_alt"
        )
        .eq("singleton_key", 1)
        .maybeSingle(),

      supabaseClient
        /*
          is_visible is read here so the Hero tab can show hidden slots.
          The owner + aal2 SELECT policy is permissive and separate from the
          public one, so hidden rows still come back for the Admin even though
          the public site never sees them.
        */
        .from("hero_media")
        .select(
          "slot_number, bucket_name, desktop_path, mobile_path, alt_text, is_visible"
        )
        .order("slot_number", { ascending: true }),

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
      el("p", "admin-alert-title", "Could not load Profile & About content."),
      el(
        "p",
        "admin-alert-text",
        "Check your connection and try again. If the problem continues, sign out and sign in again."
      )
    );

    const retry = el("button", "admin-button admin-button-secondary", "Try Again");
    retry.type = "button";
    retry.addEventListener("click", () => {
      load();
    });

    append(panel, retry);

    return panel;
  }

  await load();

  return () => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    document.removeEventListener("click", handleNavigationCapture, true);

    if (activeTab && typeof activeTab.destroy === "function") {
      activeTab.destroy();
    }

    closeAllModals();
  };
}
