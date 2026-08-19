/*
  Reusable image picker + optimisation preview (CMS Phase 5).

  Wraps js/core/image-processor.js in an Admin-styled component with four
  states: EMPTY -> PROCESSING -> READY | ERROR.

  It deliberately knows nothing about Hero photos, About galleries, Project
  covers or documentation images. A caller mounts it, receives the optimised
  File through onReady, and decides what to do with it.

  IT DOES NOT UPLOAD. There is no Supabase import in this file. Storage
  integration belongs to the later CMS modules
  (docs/Design/ADMIN-DASHBOARD-DESIGN.md section 45).

  SECURITY
  --------
  Filenames are attacker-influenced data, so they are written with textContent
  like any other untrusted value. Nothing in this module assigns innerHTML.
  Preview uses a same-origin blob: object URL that is revoked as soon as it is
  replaced or the component is destroyed.
*/

import { el, append, clear } from "./dom.js";
import { t } from "./i18n.js";

import {
  processImage,
  isAbortError,
  formatBytes,
  formatDimensions,
  formatPercent,
  MAX_INPUT_BYTES,
  ACCEPTED_MIME_TYPES
} from "./image-processor.js";

let instanceCounter = 0;

/* Resolved per render, not at module load, so a language switch reaches it
   and the limit is read from the processor rather than restated here. */
function helperText() {
  return t("picker.hint", { size: formatBytes(MAX_INPUT_BYTES) });
}

/*
  createImagePicker(options)

  options:
    label        visible field label (default "Image")
    helperText   overrides the default constraints line
    processing   options forwarded to processImage (preset, maxDimension, ...)
    onReady(result)   called when the owner confirms "Use Optimized"
    onError(error)    optional; the component always renders the error itself
    onStateChange(state)  optional; "empty" | "processing" | "ready" | "error"

  returns:
    { element, reset, destroy, getResult }
*/
export function createImagePicker(options = {}) {
  instanceCounter += 1;

  const idPrefix = `image-picker-${instanceCounter}`;
  const processingOptions = options.processing || {};

  const root = el("div", "image-picker");
  root.dataset.state = "empty";

  /* ---------------- persistent parts ---------------- */

  const label = el("label", "form-label", options.label || t("picker.label"));
  label.htmlFor = `${idPrefix}-input`;

  const input = el("input", "visually-hidden");
  input.type = "file";
  input.id = `${idPrefix}-input`;
  // The accept attribute is a convenience filter only; processImage re-validates.
  input.accept = ACCEPTED_MIME_TYPES.join(",");

  const body = el("div", "image-picker-body");

  /*
    Single polite live region. Processing and success messages are announced
    without stealing focus; errors are rendered separately with role="alert".
  */
  const liveRegion = el("p", "visually-hidden");
  liveRegion.id = `${idPrefix}-status`;
  liveRegion.setAttribute("role", "status");
  liveRegion.setAttribute("aria-live", "polite");

  append(root, label, input, body, liveRegion);

  /* ---------------- state ---------------- */

  let currentResult = null;
  let previewUrl = null;
  let activeAbort = null;
  let destroyed = false;

  function setState(state) {
    root.dataset.state = state;

    if (typeof options.onStateChange === "function") {
      options.onStateChange(state);
    }
  }

  function announce(message) {
    liveRegion.textContent = message;
  }

  function releasePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
  }

  function cancelActive() {
    if (activeAbort) {
      activeAbort.abort();
      activeAbort = null;
    }
  }

  function openFileDialog() {
    input.click();
  }

  function browseButton(text) {
    const button = el("button", "admin-button admin-button-secondary", text);
    button.type = "button";
    button.addEventListener("click", openFileDialog);
    return button;
  }

  /* ---------------- renderers ---------------- */

  function renderEmpty() {
    clear(body);
    releasePreview();
    currentResult = null;

    const zone = el("div", "image-picker-empty");

    append(
      zone,
      el("p", "image-picker-hint", t("picker.empty")),
      browseButton(t("picker.browse")),
      el("p", "form-help", options.helperText || helperText())
    );

    append(body, zone);
    setState("empty");
  }

  function renderProcessing() {
    clear(body);

    const zone = el("div", "image-picker-processing");

    append(
      zone,
      el("p", "image-picker-hint", t("picker.processing")),
      el("p", "form-help", t("picker.processingHelp"))
    );

    append(body, zone);
    setState("processing");
    announce(t("picker.processingStatus"));
  }

  function statRow(term, value) {
    const row = el("div", "image-stat-row");

    append(
      row,
      el("dt", "image-stat-term", term),
      el("dd", "image-stat-value", value)
    );

    return row;
  }

  function statBlock(title, rows) {
    const block = el("div", "image-stat-block");
    append(block, el("h3", "image-stat-title", title));

    const list = el("dl", "image-stat-list");
    rows.forEach(row => append(list, statRow(row[0], row[1])));

    append(block, list);

    return block;
  }

  function renderReady(result) {
    clear(body);
    releasePreview();

    currentResult = result;
    previewUrl = URL.createObjectURL(result.optimized.blob);

    const figure = el("figure", "image-picker-preview");

    const image = el("img", "image-picker-image");
    image.src = previewUrl;
    /*
      Alt text describes the role of the image, not the untrusted filename.
      The filename itself is shown below as plain text.
    */
    image.alt = t("picker.previewAlt");
    image.decoding = "async";

    const caption = el("figcaption", "image-picker-caption");
    // Untrusted filename: text only, never markup.
    append(caption, el("span", "image-picker-filename", result.optimized.name));

    append(figure, image, caption);

    const stats = el("div", "image-stats");

    append(
      stats,
      statBlock(t("picker.original"), [
        [
          t("picker.dimensions"),
          formatDimensions(result.original.width, result.original.height)
        ],
        [t("picker.size"), formatBytes(result.original.size)],
        [t("picker.type"), result.original.type]
      ]),
      statBlock(t("picker.optimized"), [
        [
          t("picker.dimensions"),
          formatDimensions(result.optimized.width, result.optimized.height)
        ],
        [t("picker.size"), formatBytes(result.optimized.size)],
        [t("picker.type"), "WebP"],
        [t("picker.quality"), String(result.optimized.quality)]
      ])
    );

    const savings = el("p", "image-savings");

    if (result.savings.bytes > 0) {
      append(
        savings,
        el("strong", "image-savings-value", formatPercent(result.savings.percent)),
        el(
          "span",
          "image-savings-label",
          t("picker.savings", { bytes: formatBytes(result.savings.bytes) })
        )
      );
    } else {
      append(
        savings,
        el(
          "span",
          "image-savings-label",
          t("picker.noSavings")
        )
      );
    }

    const actions = el("div", "image-picker-actions");

    const useButton = el(
      "button",
      "admin-button admin-button-primary",
      t("picker.use")
    );

    useButton.type = "button";
    useButton.addEventListener("click", () => {
      if (typeof options.onReady === "function") {
        options.onReady(currentResult);
      }

      announce(t("picker.selected"));
    });

    append(actions, browseButton(t("picker.chooseAnother")), useButton);

    append(body, figure, stats, savings, actions);

    setState("ready");
    announce(
      `Image optimized. ${formatDimensions(
        result.optimized.width,
        result.optimized.height
      )}, ${formatBytes(result.optimized.size)}.`
    );
  }

  function renderError(error) {
    clear(body);
    releasePreview();
    currentResult = null;

    const box = el("div", "image-picker-error");
    box.setAttribute("role", "alert");

    append(
      box,
      el("p", "image-picker-error-text", error.message),
      el("p", "form-help", options.helperText || HELPER_TEXT),
      browseButton(t("picker.chooseAnother"))
    );

    append(body, box);
    setState("error");
  }

  /* ---------------- flow ---------------- */

  async function handleFile(file) {
    // A newer selection always wins: cancel whatever is still running.
    cancelActive();

    const controller = new AbortController();
    activeAbort = controller;

    renderProcessing();

    let result;

    try {
      result = await processImage(file, {
        ...processingOptions,
        signal: controller.signal
      });
    } catch (error) {
      if (destroyed || controller.signal.aborted || isAbortError(error)) {
        return;
      }

      // Technical detail stays in the console; the UI shows the safe message.
      console.error(error);

      renderError(error);

      if (typeof options.onError === "function") {
        options.onError(error);
      }

      return;
    } finally {
      if (activeAbort === controller) {
        activeAbort = null;
      }
    }

    // Stale result guard: a newer file was chosen while this one was encoding.
    if (destroyed || controller.signal.aborted) {
      return;
    }

    renderReady(result);
  }

  input.addEventListener("change", () => {
    const file = input.files && input.files[0];

    // Reset so choosing the same file twice still fires a change event.
    input.value = "";

    if (file) {
      handleFile(file);
    }
  });

  renderEmpty();

  return {
    element: root,

    getResult: () => currentResult,

    reset() {
      cancelActive();
      renderEmpty();
      announce("");
    },

    destroy() {
      destroyed = true;
      cancelActive();
      releasePreview();
      clear(body);
      root.remove();
    }
  };
}
