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

import { el, append, statusBadge } from "../../core/dom.js";
import { openModal } from "../../core/modal.js";
import { t } from "../../core/i18n.js";

function line(label, value) {
  const block = el("div", "preview-line");
  append(
    block,
    el("span", "preview-label", label),
    el(
      "p",
      "preview-value",
      value && String(value).trim() !== "" ? value : t("common.none")
    )
  );
  return block;
}

export function openProjectPreview(data) {
  const body = el("div", "content-preview");

  append(
    body,
    el(
      "p",
      "form-help",
      t("projPreview.note")
    )
  );

  /* ---- card shape ---- */

  const card = el("article", "project-preview-card");

  const mediaSlot = el("div", "project-preview-media");

  if (data.coverUrl) {
    const img = el("img", "project-preview-cover");
    img.src = data.coverUrl;
    img.alt = data.coverAlt || t("projPreview.cover");
    append(mediaSlot, img);

    if (data.coverPending) {
      append(
        mediaSlot,
        el("span", "status-badge status-badge-pending", t("projMedia.pendingUpload"))
      );
    }
  } else {
    append(mediaSlot, el("span", "media-field-empty", t("projPreview.noCover")));
  }

  append(card, mediaSlot);

  const head = el("div", "project-preview-head");

  if (data.cardCategory) {
    append(head, el("span", "type-badge", data.cardCategory));
  }

  /* The shared badge already translates its own label, so the preview no
     longer keeps a second copy of the status vocabulary. */
  append(head, statusBadge(data.status || "draft"));

  if (data.featured) {
    append(head, el("span", "flag-badge flag-badge-yes", t("projPreview.featured")));
  }

  append(card, head);
  append(card, el("h4", "project-preview-title", data.title || t("proj.untitled")));
  append(
    card,
    el(
      "p",
      "project-preview-description",
      data.shortDescription && String(data.shortDescription).trim() !== ""
        ? data.shortDescription
        : t("projPreview.noShort")
    )
  );

  const chips = (data.technologies || []).filter(Boolean);

  if (chips.length > 0) {
    const chipRow = el("div", "experience-preview-tags");
    chips.forEach(name => append(chipRow, el("span", "experience-tag-chip", name)));
    append(card, chipRow);
  }

  append(
    card,
    el(
      "p",
      "project-preview-slug",
      `project.html?slug=${data.slug || t("common.none")}`
    )
  );

  append(body, card);

  /* ---- detail shape ---- */

  const detail = el("div", "experience-preview-details");

  const detailTitle = [data.detailTitleMain, data.detailTitleHighlight]
    .filter(value => value && String(value).trim() !== "")
    .join(" ");

  append(
    detail,
    line(t("projPreview.detailTitle"), detailTitle),
    line(t("projEditor.fieldIntro"), data.detailIntro),
    line(t("common.role"), data.role),
    line(t("common.date"), data.projectDate),
    line(t("projEditor.fieldType"), data.projectType),
    line(t("projEditor.fieldAbout"), data.aboutHeading)
  );

  const paragraphs = data.paragraphs || [];
  const paragraphBlock = el("div", "preview-line");
  append(paragraphBlock, el("span", "preview-label", t("projPreview.about")));

  if (paragraphs.length === 0) {
    append(paragraphBlock, el("p", "preview-value", t("common.none")));
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
  append(galleryBlock, el("span", "preview-label", t("projPreview.gallery")));

  if (documentation.length === 0) {
    append(galleryBlock, el("p", "preview-value", t("common.none")));
  } else {
    const grid = el("div", "preview-photo-grid");

    documentation.forEach((item, index) => {
      const figure = el("figure", "preview-photo");

      if (item.url) {
        const img = el("img", "preview-photo-image");
        img.src = item.url;
        img.alt =
          item.altText || t("projPreview.docImageAt", { index: index + 1 });
        append(figure, img);
      } else {
        append(figure, el("p", "media-field-empty", t("projMedia.noImage")));
      }

      const caption = el("figcaption", "preview-photo-caption");
      append(
        caption,
        el(
          "span",
          "preview-photo-title",
          item.altText ||
            t("projPreview.imageAt", {
              index: String(index + 1).padStart(2, "0")
            })
        )
      );

      if (!item.isActive) {
        append(
          caption,
          el("span", "status-badge status-badge-disabled", t("projPreview.disabled"))
        );
      }

      if (item.pending) {
        append(
          caption,
          el("span", "status-badge status-badge-pending", t("projPreview.pending"))
        );
      }

      append(figure, caption);
      append(grid, figure);
    });

    append(galleryBlock, grid);
  }

  append(detail, galleryBlock);

  append(
    detail,
    line(t("projEditor.fieldRepo"), data.githubUrl),
    line(t("projEditor.fieldDemo"), data.demoUrl)
  );

  append(body, detail);

  return openModal({
    title: t("projPreview.title"),
    description: t("projPreview.description"),
    body,
    actions: [
      { label: t("common.close"), variant: "secondary", onClick: ctl => ctl.close() }
    ]
  });
}
