import { el, append, clear } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { requestCv, validateCvFile } from "../../core/cv-client.js";
import { SUPABASE_URL } from "../../core/config.js";

export function createCvTab({ onDirtyChange }) {
  const root = el("section", "admin-subsection");
  const heading = el("h3", "subsection-title", t("cv.title"));
  const details = el("div", "settings-list");
  const label = el("label", "form-label", t("cv.choose"));
  const input = el("input", "admin-input");
  input.type = "file"; input.accept = ".pdf,application/pdf"; input.id = "profile-cv-file"; label.htmlFor = input.id;
  const pendingText = el("p", "form-help");
  const feedback = el("p", "form-help"); feedback.setAttribute("role", "status"); feedback.setAttribute("aria-live", "polite");
  const actions = el("div", "editor-actions");
  function button(key, id) { const node = el("button", "admin-button admin-button-secondary", t(key)); node.type = "button"; node.id = id; append(actions, node); return node; }
  const save = button("cv.save", "profile-cv-save"), discard = button("cv.discard", "profile-cv-discard"), reload = button("common.tryAgain", "profile-cv-reload");
  append(root, heading, el("p", "form-help", t("cv.help")), details, label, input, pendingText, actions, feedback);
  let row = null, file = null, operation = null, expected = null, busy = false, alive = true, selection = 0;
  const controller = new AbortController();
  function sync() {
    input.disabled = busy || !row;
    save.disabled = busy || !file;
    discard.disabled = busy || !file;
    reload.disabled = busy || !!file;
    pendingText.textContent = file ? `${file.name} - ${file.size} bytes` : "";
    onDirtyChange(Boolean(file) || busy);
  }
  function render() {
    clear(details);
    if (!row) { append(details, el("p", "form-help", t("cv.unavailable"))); return; }
    if (!row.cv_version) { append(details, el("p", "form-help", t("cv.empty"))); return; }
    append(details, el("p", null, row.cv_filename), el("p", "form-help", `${row.cv_size_bytes} bytes - ${row.cv_updated_at}`));
    const link = el("a", "link-button", t("cv.download"));
    link.href = `${SUPABASE_URL}/functions/v1/cv-document?v=${encodeURIComponent(row.cv_version)}`;
    append(details, link);
  }
  function message(error) {
    return t(error?.code === "SCHEMA_UNAVAILABLE" ? "cv.schema" : error?.code === "FORBIDDEN" ? "cv.forbidden" :
      (error?.code || "").startsWith("INVALID_") ? "cv.invalid" : error?.code === "ACTIVE_CHANGED" || error?.code === "VERSION_CONFLICT" ? "cv.conflict" : "cv.unconfirmed");
  }
  async function load() {
    busy = true; feedback.textContent = t("cv.loading"); sync();
    try { row = await requestCv({ signal: controller.signal }); if (alive) feedback.textContent = ""; }
    catch (error) { if (alive) feedback.textContent = message(error); }
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
    } catch (error) { if (alive) { input.value = ""; feedback.textContent = message(error); } }
    finally { if (alive && token === selection) { busy = false; sync(); } }
  });
  discard.addEventListener("click", () => { file = null; operation = null; input.value = ""; feedback.textContent = ""; sync(); });
  reload.addEventListener("click", load);
  save.addEventListener("click", async () => {
    if (busy || !file) return;
    busy = true; feedback.textContent = t("cv.saving"); sync();
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
      if (alive && !confirmed) feedback.textContent = message(error);
    } finally {
      if (alive) {
        if (confirmed?.cv_version === operation && confirmed.cv_filename === file.name && confirmed.cv_size_bytes === file.size) {
          row = confirmed; file = null; operation = null; input.value = ""; feedback.textContent = t("cv.saved");
        } else if (confirmed) feedback.textContent = t("cv.unconfirmed");
        busy = false; render(); sync();
      }
    }
  });
  load();
  return { element: root, isDirty: () => Boolean(file) || busy,
    destroy() { alive = false; selection++; controller.abort(); clear(root); } };
}
