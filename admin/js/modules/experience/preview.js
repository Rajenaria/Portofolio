/*
  Shared Experience preview (Phase 7).

  Read-only, Admin-side structured preview. The public V1 Experience renderer
  has NOT been migrated yet, so this deliberately does not claim visual parity
  and does not reproduce the sticky-stack scroll behaviour. It mirrors the
  CONTENT structure of the existing Experience card (number, type, title, role,
  location, description, tag chips) so the owner can check the shape of what
  they wrote.

  js/experience-stack.js and every public file remain untouched.

  SECURITY: every value is written with textContent through js/core/dom.js.
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

/*
  buildPreviewCard(data)

  data: { position, type, title, role, location, description, tags[], status }
  Returns a DOM node; callers can embed it or hand it to openExperiencePreview.
*/
export function buildPreviewCard(data) {
  const card = el("article", "experience-preview-card");

  const head = el("div", "experience-preview-head");

  if (data.position) {
    append(head, el("span", "experience-preview-number", data.position));
  }

  if (data.type) {
    append(head, el("span", "type-badge", data.type));
  }

  if (data.status) {
    const key = String(data.status).toLowerCase();
    append(
      head,
      el("span", `status-badge status-badge-${key}`, statusLabel(key))
    );
  }

  append(card, head);
  append(card, el("h4", "experience-preview-title", data.title || "Untitled experience"));

  const meta = el("p", "experience-preview-meta");
  const parts = [data.role, data.location].filter(
    value => value && String(value).trim() !== ""
  );

  meta.textContent = parts.length > 0 ? parts.join(" · ") : "—";
  append(card, meta);

  append(
    card,
    el(
      "p",
      "experience-preview-description",
      data.description && String(data.description).trim() !== ""
        ? data.description
        : "No description yet."
    )
  );

  const tags = (data.tags || []).filter(tag => tag && tag.label);

  if (tags.length > 0) {
    const chips = el("div", "experience-preview-tags");

    tags.forEach(tag => {
      append(chips, el("span", "experience-tag-chip", tag.label));
    });

    append(card, chips);
  }

  return card;
}

function statusLabel(key) {
  if (key === "published") {
    return "Published";
  }

  if (key === "archived") {
    return "Archived";
  }

  return "Draft";
}

/*
  Opens the preview dialog. `data` is always the CURRENT form state, so unsaved
  edits appear exactly as they would be saved.
*/
export function openExperiencePreview(data) {
  const body = el("div", "content-preview");

  append(
    body,
    el(
      "p",
      "form-help",
      "This is an Admin content preview. The public Experience section still renders its existing static cards; the sticky stack is not reproduced here."
    ),
    buildPreviewCard(data)
  );

  const details = el("div", "experience-preview-details");

  append(
    details,
    line("Type", data.type),
    line("Title", data.title),
    line("Role", data.role),
    line("Location", data.location),
    line("Description", data.description),
    line(
      "Tags",
      (data.tags || []).map(tag => tag.label).join(", ")
    )
  );

  append(body, details);

  return openModal({
    title: "Experience preview",
    description:
      "Read-only preview of the current values, including unsaved changes.",
    body,
    actions: [
      { label: "Close", variant: "secondary", onClick: ctl => ctl.close() }
    ]
  });
}
