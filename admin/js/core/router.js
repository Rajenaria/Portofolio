/*
  Lightweight hash router for the Admin CMS.

  Why hash routing:
  the Admin is a static, single-document application served from GitHub Pages.
  Hash routes (#/dashboard, #/projects, ...) require no server rewrite rules and
  no separate HTML file per screen. The authenticated shell stays mounted; only
  the main content region is replaced.

  This router is intentionally small: no dependencies, no build step, no
  framework. See docs/Features/005-ADMIN-DASHBOARD-CMS-V2.md section 46.
*/

import { clear } from "./dom.js";

function parseHash(rawHash) {
  const hash = String(rawHash || "");

  // "#/projects?x=1" -> "projects"
  const withoutHash = hash.replace(/^#/, "");
  const withoutQuery = withoutHash.split("?")[0];

  return withoutQuery.replace(/^\/+/, "").replace(/\/+$/, "");
}

export function createRouter({
  container,
  routes,
  defaultRoute,
  onRouteChange
}) {
  const routeMap = new Map();

  routes.forEach(route => {
    routeMap.set(route.name, route);
  });

  if (!routeMap.has(defaultRoute)) {
    throw new Error("Router default route is not registered.");
  }

  let started = false;
  let activeName = null;
  let activeCleanup = null;
  let activeAbort = null;

  function replaceHash(name) {
    const target = `#/${name}`;

    if (window.location.hash === target) {
      return;
    }

    // replaceState keeps unknown/implicit routes out of the back-button history.
    try {
      window.history.replaceState(null, "", target);
    } catch (error) {
      window.location.hash = target;
    }
  }

  function resolve() {
    const name = parseHash(window.location.hash);

    if (routeMap.has(name)) {
      return name;
    }

    return defaultRoute;
  }

  function teardownActive() {
    if (activeAbort) {
      activeAbort.abort();
      activeAbort = null;
    }

    if (typeof activeCleanup === "function") {
      try {
        activeCleanup();
      } catch (error) {
        console.error(error);
      }
    }

    activeCleanup = null;
  }

  async function renderRoute(name, { force = false } = {}) {
    if (!force && name === activeName) {
      return;
    }

    const route = routeMap.get(name);

    teardownActive();
    clear(container);

    activeName = name;
    activeAbort = new AbortController();

    const signal = activeAbort.signal;

    if (typeof onRouteChange === "function") {
      onRouteChange(route);
    }

    container.scrollTop = 0;
    window.scrollTo(0, 0);

    try {
      const cleanup = await route.render(container, { signal });

      // A newer navigation may have started while this route was awaiting data.
      if (signal.aborted) {
        if (typeof cleanup === "function") {
          cleanup();
        }
        return;
      }

      activeCleanup = typeof cleanup === "function" ? cleanup : null;
    } catch (error) {
      if (!signal.aborted) {
        console.error(error);
      }
    }
  }

  function handleHashChange() {
    const name = resolve();

    replaceHash(name);
    renderRoute(name);
  }

  function start() {
    if (started) {
      return;
    }

    started = true;
    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();
  }

  function stop() {
    if (!started) {
      return;
    }

    started = false;
    window.removeEventListener("hashchange", handleHashChange);

    teardownActive();
    clear(container);

    activeName = null;
  }

  function navigate(name) {
    if (!routeMap.has(name)) {
      return;
    }

    window.location.hash = `#/${name}`;
  }

  function reload() {
    if (activeName) {
      renderRoute(activeName, { force: true });
    }
  }

  return {
    start,
    stop,
    navigate,
    reload,
    getActiveRoute: () => activeName
  };
}
