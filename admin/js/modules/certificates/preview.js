/*
  Certificate preview (Phase C).

  Shows the two faces of a certificate card side by side, styled to match the
  public design: black card, white typography, blue accent (#2997ff — the same
  dark-surface blue the public --cert-accent uses).

  It deliberately does NOT rebuild the 3D globe. The owner needs to check
  wording, the badge and the category icon; the rotation, drag handling and
  perspective maths belong to js/certificates.js and duplicating them here
  would mean two implementations to keep in step.

  Every value is written with textContent through el(), and the icon comes from
  the frozen category table — never from stored data.
*/

import { el, append, clear } from "../../core/dom.js";
import { openModal } from "../../core/modal.js";
import { buildCategoryIcon, categoryLabel } from "./categories.js";

const ACCENT = "#2997ff";

function line(className, value) {
  return value ? el("p", className, value) : null;
}

/*
  Front face: icon, period, title, publisher.

  The badge is intentionally absent. The public front is sparse by design and
  the badge lives on the back; moving it forward would change the card, not
  just preview it.
*/
function buildFront(data) {
  const face = el("div", "cert-preview-face cert-preview-front");

  append(face, el("span", "cert-preview-accent-line"));

  const icon = buildCategoryIcon(data.category, "cert-preview-icon", ACCENT);
  append(face, icon);

  const text = el("div", "cert-preview-front-text");

  append(
    text,
    line("cert-preview-year", data.period),
    el("h4", "cert-preview-title", data.title || "Untitled certificate"),
    line("cert-preview-publisher", data.publisher)
  );

  append(face, text);

  return face;
}

/*
  Back face: title (shared with the front), issuer line, badge, description.
*/
function buildBack(data) {
  const face = el("div", "cert-preview-face cert-preview-back");

  const inner = el("div", "cert-preview-back-inner");

  append(
    inner,
    el("h4", "cert-preview-back-title", data.title || "Untitled certificate"),
    line("cert-preview-back-subtitle", data.issuerLine)
  );

  if (data.badgeText) {
    append(inner, el("span", "cert-preview-badge", data.badgeText));
  }

  if (data.description) {
    append(inner, el("p", "cert-preview-desc", data.description));
  }

  /*
    The public back carries a "LIHAT SERTIFIKAT" button. It becomes a real link
    once a document is uploaded, preferring the stored file and falling back to
    the issuer's own verification URL.

    New tab, never an iframe: the site CSP sets frame-src 'none' and
    object-src 'none', so an embedded viewer would mean relaxing both.
    rel="noopener noreferrer" keeps the opened tab away from window.opener.
  */
  const href = data.documentUrl || data.externalUrl || null;

  if (href) {
    const cta = el("a", "cert-preview-link", "LIHAT SERTIFIKAT");
    cta.href = href;
    cta.target = "_blank";
    cta.rel = "noopener noreferrer";
    append(inner, cta);
  } else {
    append(inner, el("span", "cert-preview-link is-empty", "LIHAT SERTIFIKAT"));
  }

  append(face, inner);

  return face;
}

export function buildCertificatePreview(data) {
  const wrap = el("div", "cert-preview");

  const frontColumn = el("div", "cert-preview-column");
  append(
    frontColumn,
    el("p", "cert-preview-caption", "Front"),
    buildFront(data)
  );

  const backColumn = el("div", "cert-preview-column");
  append(
    backColumn,
    el("p", "cert-preview-caption", "Back"),
    buildBack(data)
  );

  append(wrap, frontColumn, backColumn);

  const meta = el("p", "form-help", `Category: ${categoryLabel(data.category)}`);
  append(wrap, meta);

  return wrap;
}

export function openCertificatePreview(data) {
  const body = el("div", "cert-preview-body");
  append(body, buildCertificatePreview(data));

  openModal({
    title: "Certificate preview",
    description:
      "Both faces of the card as they will appear on the public site, including unsaved changes. The public section shows these inside the rotating carousel.",
    body,
    actions: [{ label: "Close", variant: "secondary", onClick: ctl => ctl.close() }]
  });
}

export function refreshPreview(host, data) {
  clear(host);
  append(host, buildCertificatePreview(data));
}
