/*
  Authenticated Admin shell behaviour.

  The shell markup itself lives in admin/index.html and is kept mounted for the
  whole session; this module only wires up:

    - active navigation state,
    - the tablet/mobile sidebar drawer (hamburger, backdrop, Escape, focus trap),
    - the mobile topbar title.

  The shell is only ever revealed after routeSession() has confirmed
  owner + aal2 (admin/admin.js). Nothing here performs an authorization check —
  authorization lives in the database.
*/

import { t, applyStaticTranslations, createLanguageSwitch } from "./i18n.js";

const DESKTOP_QUERY = "(min-width: 1024px)";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

export function initShell() {
  const shellEl = document.getElementById("admin-screen");
  const sidebarEl = document.getElementById("admin-sidebar");
  const backdropEl = document.getElementById("admin-backdrop");
  const toggleEl = document.getElementById("sidebar-toggle");
  const closeEl = document.getElementById("sidebar-close");
  const contentEl = document.getElementById("admin-content");
  const topbarTitleEl = document.getElementById("admin-topbar-title");

  const navLinks = Array.from(
    sidebarEl.querySelectorAll("[data-route]")
  );

  const desktopMedia = window.matchMedia(DESKTOP_QUERY);

  let drawerOpen = false;

  function isDesktop() {
    return desktopMedia.matches;
  }

  function openDrawer() {
    if (drawerOpen || isDesktop()) {
      return;
    }

    drawerOpen = true;

    shellEl.classList.add("is-drawer-open");
    document.body.classList.add("has-drawer-open");
    backdropEl.hidden = false;
    sidebarEl.setAttribute("aria-hidden", "false");
    toggleEl.setAttribute("aria-expanded", "true");

    // Move focus into the drawer so keyboard users are not left behind it.
    const first = sidebarEl.querySelector(FOCUSABLE);

    if (first) {
      first.focus();
    }
  }

  function closeDrawer({ restoreFocus = true } = {}) {
    if (!drawerOpen) {
      return;
    }

    drawerOpen = false;

    shellEl.classList.remove("is-drawer-open");
    document.body.classList.remove("has-drawer-open");
    backdropEl.hidden = true;
    toggleEl.setAttribute("aria-expanded", "false");

    syncSidebarHiddenState();

    if (restoreFocus && !isDesktop()) {
      toggleEl.focus();
    }
  }

  /*
    On desktop the sidebar is a permanent landmark, so it must not be marked
    aria-hidden. On smaller screens a closed drawer is hidden from assistive
    technology as well as visually.
  */
  function syncSidebarHiddenState() {
    if (isDesktop()) {
      sidebarEl.removeAttribute("aria-hidden");
      return;
    }

    sidebarEl.setAttribute("aria-hidden", drawerOpen ? "false" : "true");
  }

  function handleKeydown(event) {
    if (!drawerOpen) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeDrawer();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    // Simple focus trap: keep Tab cycling inside the open drawer.
    const focusable = Array.from(
      sidebarEl.querySelectorAll(FOCUSABLE)
    ).filter(node => node.offsetParent !== null);

    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

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

  function handleMediaChange() {
    if (isDesktop()) {
      closeDrawer({ restoreFocus: false });
    }

    syncSidebarHiddenState();
  }

  function handleNavClick() {
    // Selecting a page closes the drawer on tablet/mobile.
    closeDrawer({ restoreFocus: false });
  }

  function handleCloseClick() {
    closeDrawer();
  }

  toggleEl.addEventListener("click", openDrawer);
  closeEl.addEventListener("click", handleCloseClick);
  backdropEl.addEventListener("click", handleCloseClick);
  document.addEventListener("keydown", handleKeydown);

  navLinks.forEach(link => {
    link.addEventListener("click", handleNavClick);
  });

  if (typeof desktopMedia.addEventListener === "function") {
    desktopMedia.addEventListener("change", handleMediaChange);
  } else {
    desktopMedia.addListener(handleMediaChange);
  }

  syncSidebarHiddenState();

  let activeRouteName = null;

  const actionsEl = document.getElementById("admin-topbar-actions");

  if (actionsEl && actionsEl.childElementCount === 0) {
    actionsEl.appendChild(createLanguageSwitch());
  }

  /* Re-labels the parts of the shell that are static markup, then the
     header title, which is derived from the active route. */
  function applyLanguage() {
    applyStaticTranslations(shellEl);

    if (activeRouteName) {
      const label = t("nav." + activeRouteName);
      topbarTitleEl.textContent = label;
      document.title = `${label} · ${t("shell.brandName")}`;
    }
  }

  function setActiveRoute(route) {
    navLinks.forEach(link => {
      const isActive = link.dataset.route === route.name;

      link.classList.toggle("is-active", isActive);

      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    /* Route titles come from the dictionary via nav.<name>, so the header
       and the sidebar always agree in whichever language is active. */
    activeRouteName = route.name;
    const label = t("nav." + route.name);

    topbarTitleEl.textContent = label;
    document.title = `${label} · ${t("shell.brandName")}`;
  }

  function destroy() {
    closeDrawer({ restoreFocus: false });

    toggleEl.removeEventListener("click", openDrawer);
    closeEl.removeEventListener("click", handleCloseClick);
    backdropEl.removeEventListener("click", handleCloseClick);
    document.removeEventListener("keydown", handleKeydown);

    navLinks.forEach(link => {
      link.removeEventListener("click", handleNavClick);
    });

    if (typeof desktopMedia.removeEventListener === "function") {
      desktopMedia.removeEventListener("change", handleMediaChange);
    } else {
      desktopMedia.removeListener(handleMediaChange);
    }

    document.title = "Admin CMS";
  }

  return {
    contentEl,
    setActiveRoute,
    applyLanguage,
    destroy
  };
}
