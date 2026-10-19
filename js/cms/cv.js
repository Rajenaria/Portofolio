import { readTable, CMS_URL } from "./client.js";
import { CV_COLUMNS, cvMetadata, missingCvSchema } from "./cv-data.js";

const links = [...document.querySelectorAll("[data-cv-download]")];
const status = document.getElementById("cvStatus");
const retry = document.getElementById("cvRetry");
let busy = false, dynamicSeen = false;
function disable(message) {
    links.forEach(link => { link.removeAttribute("href"); link.setAttribute("aria-disabled", "true"); link.tabIndex = -1; });
    if (status) { status.hidden = false; status.textContent = message; }
}
function enable(href) {
    links.forEach(link => { link.href = href; link.removeAttribute("aria-disabled"); link.removeAttribute("tabindex"); });
    if (status) { status.hidden = true; status.textContent = ""; }
}
links.forEach(link => link.addEventListener("click", event => {
    if (link.getAttribute("aria-disabled") === "true") event.preventDefault();
}));
async function loadCv() {
    if (busy || !links.length) return;
    busy = true;
    if (retry) retry.hidden = true;
    disable("Memeriksa CV terbaru...");
    try {
        let row, legacy = false;
        try {
            const rows = await readTable("profile_content", `select=${CV_COLUMNS}&singleton_key=eq.1&limit=1`, { cache: "no-store" });
            if (rows.length !== 1) throw new Error("Profile unavailable");
            row = cvMetadata(rows[0]);
        } catch (error) {
            if (!missingCvSchema(error) || dynamicSeen) throw error;
            const old = await readTable("profile_content", "select=id&singleton_key=eq.1&limit=1", { cache: "no-store" });
            if (old.length !== 1 || !old[0].id) throw new Error("Legacy profile not confirmed");
            legacy = true;
        }
        if (legacy || row.cv_version === null) {
            if (dynamicSeen) throw new Error("Dynamic CV disappeared");
            enable("assets/documents/CV-Rajendra Aria Nismara.pdf");
            links.forEach(link => link.setAttribute("download", ""));
        } else {
            dynamicSeen = true;
            links.forEach(link => link.removeAttribute("download"));
            enable(`${CMS_URL}/functions/v1/cv-document?v=${encodeURIComponent(row.cv_version)}`);
        }
    } catch {
        disable("CV belum dapat dimuat. Silakan coba lagi.");
        if (retry) retry.hidden = false;
    } finally { busy = false; }
}
retry?.addEventListener("click", loadCv);
loadCv();
