import { el, append, clear } from "../../core/dom.js";
import { t, getLanguage } from "../../core/i18n.js";
import { requestCv, validateCvFile } from "../../core/cv-client.js";
import { SUPABASE_URL } from "../../core/config.js";
import { formatBytes } from "../../core/image-processor.js";

export function createCvTab({ onDirtyChange }) {
  const root = el("section", "admin-subsection cv-management");
  const heading = el("h3", "subsection-title", t("cv.title"));
  const header = el("div", "cv-header");
  append(header, heading, el("p", "form-help", t("cv.help")));
  const details = el("div", "cv-current");
  const label = el("label", "form-label", t("cv.choose"));
  const input = el("input", "visually-hidden cv-file-input");
  input.type = "file"; input.accept = ".pdf,application/pdf"; input.id = "profile-cv-file"; label.htmlFor = input.id;
  input.tabIndex = -1;
  const upload = el("div", "cv-upload");
  const pickerRow = el("div", "cv-picker-row");
  const picker = el("button", "admin-button admin-button-secondary", t("cv.pickFile")); picker.type = "button";
  picker.setAttribute("aria-controls", input.id);
  const pendingText = el("span", "form-help cv-selected-file");
  pendingText.id = "profile-cv-selection"; pendingText.setAttribute("aria-live", "polite");
  const uploadHelp = el("p", "form-help", t("cv.fileHelp")); uploadHelp.id = "profile-cv-file-help";
  input.setAttribute("aria-describedby", `${pendingText.id} ${uploadHelp.id}`);
  picker.setAttribute("aria-describedby", `${pendingText.id} ${uploadHelp.id}`);
  picker.addEventListener("click", () => input.click());
  append(pickerRow, picker, pendingText); append(upload, label, input, pickerRow, uploadHelp);
  const feedback = el("p", "form-help"); feedback.setAttribute("role", "status"); feedback.setAttribute("aria-live", "polite");
  const actions = el("div", "editor-actions cv-actions");
  function button(key, id) { const node = el("button", "admin-button admin-button-secondary", t(key)); node.type = "button"; node.id = id; append(actions, node); return node; }
  const save = button("cv.save", "profile-cv-save"), discard = button("cv.discard", "profile-cv-discard"), reload = button("common.tryAgain", "profile-cv-reload");
  save.classList.replace("admin-button-secondary", "admin-button-primary");
  append(root, header, details, upload, actions, feedback);
  let row = null, file = null, operation = null, expected = null, busy = false, alive = true, selection = 0;
  const controller = new AbortController();
  let retryNeeded = false, retryUpload = false;
  function sync() {
    input.disabled = busy || !row;
    picker.disabled = input.disabled;
    save.disabled = busy || !file;
    discard.disabled = busy || !file;
    reload.disabled = busy || (Boolean(file) && !retryUpload);
    reload.hidden = !retryNeeded || busy;
    pendingText.textContent = file ? `${file.name} · ${formatBytes(file.size)}` : t("cv.noFile");
    onDirtyChange(Boolean(file) || busy);
  }
  function render() {
    clear(details);
    if (!row) { append(details, el("p", "form-help", t("cv.unavailable"))); return; }
    if (!row.cv_version) { append(details, el("p", "form-help", t("cv.empty"))); return; }
    const metadata = el("dl", "cv-metadata");
    function item(key, value) { const entry = el("div"); append(entry, el("dt", "settings-term", t(key)), el("dd", "settings-value", value)); metadata.append(entry); }
    item("cv.filename", row.cv_filename);
    item("cv.size", formatBytes(row.cv_size_bytes));
    const updated = el("time"); updated.dateTime = row.cv_updated_at;
    updated.textContent = new Intl.DateTimeFormat(getLanguage() === "id" ? "id-ID" : "en-GB", {
      day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta", timeZoneName: "short"
    }).format(new Date(row.cv_updated_at));
    item("cv.updated", ""); metadata.lastElementChild.querySelector("dd").append(updated);
    append(details, metadata);
    const link = el("a", "link-button", t("cv.download"));
    link.href = `${SUPABASE_URL}/functions/v1/cv-document?v=${encodeURIComponent(row.cv_version)}`;
    append(details, link);
  }
  function message(error) {
    return t(error?.code === "SCHEMA_UNAVAILABLE" ? "cv.schema" : error?.code === "FORBIDDEN" ? "cv.forbidden" :
      (error?.code || "").startsWith("INVALID_") ? "cv.invalid" : error?.code === "ACTIVE_CHANGED" || error?.code === "VERSION_CONFLICT" ? "cv.conflict" : "cv.unconfirmed");
  }
  async function load() {
    busy = true; retryNeeded = false; retryUpload = false; feedback.textContent = t("cv.loading"); sync();
    try { row = await requestCv({ signal: controller.signal }); if (alive) feedback.textContent = ""; }
    catch (error) { if (alive) { retryNeeded = true; feedback.textContent = message(error); } }
    finally { if (alive) { busy = false; render(); sync(); } }
  }
  input.addEventListener("change", async () => {
    const token = ++selection, chosen = input.files?.[0];
    if (!chosen) return;
    busy = true; sync();
    try {
      await validateCvFile(chosen);
      if (!alive || token !== selection) return;
      file = chosen; operation = crypto.randomUUID(); expected = row.cv_version; feedback.textContent = "";
      retryNeeded = false; retryUpload = false;
    } catch (error) { if (alive) { input.value = ""; feedback.textContent = message(error); } }
    finally { if (alive && token === selection) { busy = false; sync(); } }
  });
  discard.addEventListener("click", () => { file = null; operation = null; retryUpload = false; input.value = ""; feedback.textContent = ""; sync(); });
  reload.addEventListener("click", () => { if (file) save.click(); else load(); });
  save.addEventListener("click", async () => {
    if (busy || !file) return;
    busy = true; retryNeeded = false; retryUpload = false; feedback.textContent = t("cv.saving"); sync();
    let confirmed = null;
    try {
      confirmed = await requestCv({ file, version: operation, previous: expected, signal: controller.signal });
    } catch (error) {
      if (error.ambiguous && alive) {
        try {
          const current = await requestCv({ signal: controller.signal });
          if (current.cv_version === operation && current.cv_filename === file.name && current.cv_size_bytes === file.size) confirmed = current;
          else row = current;
        } catch { /* Keep the last confirmed metadata and the pending operation. */ }
      }
      if (alive && !confirmed) { retryNeeded = true; retryUpload = Boolean(error.ambiguous); feedback.textContent = message(error); }
    } finally {
      if (alive) {
        if (confirmed?.cv_version === operation && confirmed.cv_filename === file.name && confirmed.cv_size_bytes === file.size) {
          row = confirmed; file = null; operation = null; input.value = ""; feedback.textContent = t("cv.saved");
          retryNeeded = false; retryUpload = false;
        } else if (confirmed) { retryNeeded = true; retryUpload = true; feedback.textContent = t("cv.unconfirmed"); }
        busy = false; render(); sync();
      }
    }
  });
  load();
  return { element: root, isDirty: () => Boolean(file) || busy,
    destroy() { alive = false; selection++; controller.abort(); clear(root); } };
}
