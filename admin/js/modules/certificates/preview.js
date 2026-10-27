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
import { tIndonesian as t } from "../../core/i18n.js";
import { openDocument } from "../../core/document-storage.js";
import { buildCategoryIcon, categoryLabel, categoryEntry } from "./categories.js";

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
  const iconWrap = el("div", "cert-preview-icon-wrap");
  append(iconWrap, icon); append(face, iconWrap);

  const text = el("div", "cert-preview-front-text");

  append(
    text,
    line("cert-preview-year", data.period),
    el("h4", "cert-preview-title", data.title || t("certificates.untitled")),
    line("cert-preview-publisher", [data.publisher, categoryEntry(data.category).label].filter(Boolean).join(" \u00b7 "))
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
    el("p", "cert-preview-details-heading", "Certificate Details"),
    el("h4", "cert-preview-back-title", data.title || t("certificates.untitled")),
    line("cert-preview-back-subtitle", [data.publisher, categoryEntry(data.category).label].filter(Boolean).join(" \u00b7 "))
  );

  const details = el("dl", "cert-preview-details");
  [["Period", data.period], ["Credential ID", data.credentialId], ["Grade / Result", data.badgeText]].forEach(([label,value]) => {
    if (!value) return;
    const row = el("div"); append(row, el("dt", "", label), el("dd", "", value)); append(details, row);
  });
  append(inner, details);

  /*
    The public back carries a "VIEW CERTIFICATE" button. It becomes a real link
    once a document is uploaded, preferring the stored file and falling back to
    the issuer's own verification URL.

    New tab, never an iframe: the site CSP sets frame-src 'none' and
    object-src 'none', so an embedded viewer would mean relaxing both.
    rel="noopener noreferrer" keeps the opened tab away from window.opener.
  */
  const href = data.document ? "#" : data.externalUrl || null;

  if (href) {
    const cta = el("a", "cert-preview-link", "VIEW CERTIFICATE");
    cta.href = href;
    if (data.document) cta.addEventListener("click", event => {
      event.preventDefault();
      openDocument(data.document.bucket, data.document.path);
    });
    cta.target = "_blank";
    cta.rel = "noopener noreferrer";
    append(inner, cta);
  } else {
    append(inner, el("span", "cert-preview-link is-empty", "VIEW CERTIFICATE"));
  }

  append(face, inner);

  return face;
}

export function buildCertificatePreview(data, selectedFace = "front") {
  const wrap = el("div", "cert-preview");
  wrap.classList.add("has-face-switch");
  const controls = el("div","cert-preview-controls"); controls.setAttribute("role","group"); controls.setAttribute("aria-label","Sisi pratinjau sertifikat");

  const frontColumn = el("div", "cert-preview-column");
  append(
    frontColumn,
    el("p", "cert-preview-caption", t("certPreview.front")),
    buildFront(data)
  );

  const backColumn = el("div", "cert-preview-column");
  append(
    backColumn,
    el("p", "cert-preview-caption", t("certPreview.back")),
    buildBack(data)
  );

  const switches = ["front","back"].map((face,index) => {
    const control = el("button","admin-button admin-button-secondary",index ? "Belakang" : "Depan"); control.type = "button";
    control.addEventListener("click",() => show(face)); controls.append(control); return control;
  });
  function show(face) {
    wrap.dataset.face = face;
    frontColumn.hidden = face === "back"; backColumn.hidden = face !== "back";
    switches.forEach((control,index) => control.setAttribute("aria-pressed",String(face === (index ? "back" : "front"))));
  }
  append(wrap, controls, frontColumn, backColumn); show(selectedFace === "back" ? "back" : "front");

  const meta = el(
    "p",
    "form-help",
    t("certPreview.category", { name: categoryLabel(data.category) })
  );
  append(wrap, meta);

  return wrap;
}

export function openCertificatePreview(data) {
  const body = el("div", "cert-preview-body");
  append(body, buildCertificatePreview(data));

  const controller = openModal({
    title: t("certPreview.title"),
    description: t("certPreview.description"),
    body,
    actions: [
      {
        label: t("common.close"),
        variant: "secondary",
        onClick: ctl => ctl.close()
      }
    ]
  });
  controller.dialog.classList.add("certificate-preview-dialog");
}

export function refreshPreview(host, data) {
  clear(host);
  append(host, buildCertificatePreview(data));
}
