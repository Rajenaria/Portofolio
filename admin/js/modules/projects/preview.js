/*
  Project preview (Phase 8A, media added in Phase 8B).

  Read-only, Admin-side structured preview built from the CURRENT editor values,
  including unsaved ones. It mirrors the content shape of the existing V1 card
  and detail page (category, title, short description, chips / detail title,
  intro, meta, about heading, paragraphs, links) without claiming visual parity
  and without touching any public file.

  The cover and the documentation gallery are rendered from the real stored
  images — a public URL for portfolio-media, a short-lived signed URL for the
  private portfolio-staging bucket — and from any image still pending upload,
  which is labelled as such.

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

  if (data.coverUrl) {
    const img = el("img", "project-preview-cover");
    img.src = data.coverUrl;
    img.alt = data.coverAlt || "Project cover";
    append(mediaSlot, img);

    if (data.coverPending) {
      append(mediaSlot, el("span", "status-badge status-badge-pending", "Pending upload"));
    }
  } else {
    append(mediaSlot, el("span", "media-field-empty", "No cover image yet."));
  }

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

  const documentation = data.documentation || [];
  const galleryBlock = el("div", "preview-line");
  append(galleryBlock, el("span", "preview-label", "Documentation Gallery"));

  if (documentation.length === 0) {
    append(galleryBlock, el("p", "preview-value", "—"));
  } else {
    const grid = el("div", "preview-photo-grid");

    documentation.forEach((item, index) => {
      const figure = el("figure", "preview-photo");

      if (item.url) {
        const img = el("img", "preview-photo-image");
        img.src = item.url;
        img.alt = item.altText || `Documentation image ${index + 1}`;
        append(figure, img);
      } else {
        append(figure, el("p", "media-field-empty", "No image"));
      }

      const caption = el("figcaption", "preview-photo-caption");
      append(
        caption,
        el(
          "span",
          "preview-photo-title",
          item.altText || `Image ${String(index + 1).padStart(2, "0")}`
        )
      );

      if (!item.isActive) {
        append(caption, el("span", "status-badge status-badge-disabled", "Disabled"));
      }

      if (item.pending) {
        append(caption, el("span", "status-badge status-badge-pending", "Pending"));
      }

      append(figure, caption);
      append(grid, figure);
    });

    append(galleryBlock, grid);
  }

  append(detail, galleryBlock);

  append(
    detail,
    line("Repository URL", data.githubUrl),
    line("Live Demo URL", data.demoUrl)
  );

  append(body, detail);

  return openModal({
    title: "Project preview",
    description:
      "Read-only preview of the current values, including unsaved text and pending images. This is an Admin content preview, not the public layout.",
    body,
    actions: [{ label: "Close", variant: "secondary", onClick: ctl => ctl.close() }]
  });
}
