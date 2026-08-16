/*
  Placeholder route shells.

  These are deliberately empty: this phase delivers the Admin shell, the router
  and the Dashboard only. CMS CRUD, forms and image uploads arrive in later
  phases (see docs/Features/005-ADMIN-DASHBOARD-CMS-V2.md section 41).

  No fake records, no dummy forms, no mock statistics — anything shown here
  would have to be invented, and inventing content is explicitly forbidden by
  the design baseline.

  Each route below will be replaced by its own module file
  (modules/profile.js, modules/experience.js, ...) as those phases land.
*/

import { el, append, pageHeader, emptyState } from "../core/dom.js";

function createPlaceholderRoute({ name, title, subtitle, note }) {
  return {
    name,
    title,

    render(container) {
      append(
        container,
        pageHeader({ title, subtitle })
      );

      const panel = el("section", "admin-section");

      append(
        panel,
        emptyState({
          title: "Not available yet.",
          description: note
        })
      );

      append(container, panel);
    }
  };
}

export const profileRoute = createPlaceholderRoute({
  name: "profile",
  title: "Profile & About",
  subtitle: "Manage the content displayed in your Hero and About sections.",
  note:
    "Hero, About Me and Organization editing will be added in a later phase."
});

export const experienceRoute = createPlaceholderRoute({
  name: "experience",
  title: "Experience",
  subtitle: "Manage the experiences displayed on your portfolio.",
  note: "The experience list and editor will be added in a later phase."
});

export const projectsRoute = createPlaceholderRoute({
  name: "projects",
  title: "Projects",
  subtitle: "Manage portfolio projects.",
  note: "The project list and editor will be added in a later phase."
});

export const technologiesRoute = createPlaceholderRoute({
  name: "technologies",
  title: "Technologies",
  subtitle:
    "Manage technologies and project tags used across your portfolio.",
  note: "The technology manager will be added in a later phase."
});
