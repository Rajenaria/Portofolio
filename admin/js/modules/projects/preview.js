/*
  Project preview (Phase 8A).

  Read-only, Admin-side structured preview built from the CURRENT editor values,
  including unsaved ones. It mirrors the content shape of the existing V1 card
  and detail page (category, title, short description, chips / detail title,
  intro, meta, about heading, paragraphs, links) without claiming visual parity
  and without touching any public file.

  Cover and documentation media are Phase 8B, so the preview says so explicitly
  rather than pretending an image exists.

  SECURITY: every value is written with textContent. Link URLs are validated
  before they are shown, and are rendered as inert text here rather than as a
  live anchor, so a hostile value can never become a clickable target.
*/

import { el, append } from "../../core/dom.js";
import { openModal } from "../../core/modal.js";

function line(label, value) {
  const block = el("div", "preview-line");
  append(
    block,
    el("span", "preview-label", label),
    el("p", "preview-value", value && String(value).trim() !== "" ? value : "—")
  );
  return block;
}

function statusLabel(status) {
  const key = String(status || "draft").toLowerCase();

  if (key === "published") {
    return "Published";
  }

  if (key === "archived") {
    return "Archived";
  }

  return "Draft";
}

export function openProjectPreview(data) {
  const body = el("div", "content-preview");

  append(
    body,
    el(
      "p",
      "form-help",
      "Admin content preview of the current values, including unsaved changes. The public Project card and detail page still render their existing static content."
    )
  );

  /* ---- card shape ---- */

  const card = el("article", "project-preview-card");

  const mediaSlot = el("div", "project-preview-media");
  append(
    mediaSlot,
    el("span", "media-field-empty", "Cover image will be configured separately.")
  );
  append(card, mediaSlot);

  const head = el("div", "project-preview-head");

  if (data.cardCategory) {
    append(head, el("span", "type-badge", data.cardCategory));
  }

  const key = String(data.status || "draft").toLowerCase();
  append(head, el("span", `status-badge status-badge-${key}`, statusLabel(data.status)));

  if (data.featured) {
    append(head, el("span", "flag-badge flag-badge-yes", "Featured"));
  }

  append(card, head);
  append(card, el("h4", "project-preview-title", data.title || "Untitled project"));
  append(
    card,
    el(
      "p",
      "project-preview-description",
      data.shortDescription && String(data.shortDescription).trim() !== ""
        ? data.shortDescription
        : "No short description yet."
    )
  );

  const chips = (data.technologies || []).filter(Boolean);

  if (chips.length > 0) {
    const chipRow = el("div", "experience-preview-tags");
    chips.forEach(name => append(chipRow, el("span", "experience-tag-chip", name)));
    append(card, chipRow);
  }

  append(card, el("p", "project-preview-slug", `project.html?slug=${data.slug || "—"}`));

  append(body, card);

  /* ---- detail shape ---- */

  const detail = el("div", "experience-preview-details");

  const detailTitle = [data.detailTitleMain, data.detailTitleHighlight]
    .filter(value => value && String(value).trim() !== "")
    .join(" ");

  append(
    detail,
    line("Detail Title", detailTitle),
    line("Introduction", data.detailIntro),
    line("Role", data.role),
    line("Date", data.projectDate),
    line("Project Type", data.projectType),
    line("About Heading", data.aboutHeading)
  );

  const paragraphs = data.paragraphs || [];
  const paragraphBlock = el("div", "preview-line");
  append(paragraphBlock, el("span", "preview-label", "About The Project"));

  if (paragraphs.length === 0) {
    append(paragraphBlock, el("p", "preview-value", "—"));
  } else {
    const list = el("ol", "preview-paragraph-list");

    paragraphs.forEach(paragraph => {
      append(list, el("li", "preview-paragraph", paragraph.content));
    });

    append(paragraphBlock, list);
  }

  append(detail, paragraphBlock);

  append(
    detail,
    line("Repository URL", data.githubUrl),
    line("Live Demo URL", data.demoUrl),
    line(
      "Documentation images",
      "Project media will be configured in the next implementation phase."
    )
  );

  append(body, detail);

  return openModal({
    title: "Project preview",
    description:
      "Read-only preview. Media is not part of this phase and is shown as a placeholder.",
    body,
    actions: [{ label: "Close", variant: "secondary", onClick: ctl => ctl.close() }]
  });
}
