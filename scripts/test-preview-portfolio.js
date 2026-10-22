/* Directed launcher tests only. No dependencies or real backend. */
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const http = require("node:http"), assert = require("node:assert/strict");
const { launch, responseFor, readPublicFile, optionsFromArgs, ORIGIN, CMS } = require("./preview-portfolio");
const fixture = require("./fixtures/portfolio-preview/fixture");
const ROOT = path.resolve(__dirname, "..");
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-preview-test-"));
if (OUT === ROOT || OUT.startsWith(ROOT + path.sep)) throw Error("Evidence must be outside repository");
fs.mkdirSync(OUT, { recursive: true });
const results = [], evidence = [], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let preview, trap;
function check(name, actual) { assert.equal(actual, true, name); results.push({ name, status: "PASS" }); }
async function until(p, expression, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await p.evaluate(expression)) return; await wait(80); }
  throw Error("Observable preview condition did not settle");
}
async function screenshot(p, name) {
  const shot = await p.send("Page.captureScreenshot", { format: "png" }, p.session);
  fs.writeFileSync(path.join(OUT, name), Buffer.from(shot.data, "base64"));
}
async function reload(p) {
  await p.send("Page.reload", { ignoreCache: true }, p.session);
  await until(p, "document.documentElement.classList.contains('is-loaded')");
}
async function key(p, name) {
  const number = { Enter: 13, Escape: 27, Tab: 9, ArrowRight: 39 }[name];
  for (const type of ["keyDown", "keyUp"]) await p.send("Input.dispatchKeyEvent", {
    type, key: name, code: name, windowsVirtualKeyCode: number, nativeVirtualKeyCode: number,
    ...(type === "keyDown" && name === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {})
  }, p.session);
}
async function run() {
  const tables = fixture.tables();
  const route = (url, method = "GET") => responseFor({ url, method }, {}, tables);
  check("unknown external origin denied", route("https://blocked.preview.invalid/x").status === 403);
  check("literal IP external origin denied", route("http://192.0.2.1/x").status === 403);
  check("unknown local API denied", route(CMS + "/rest/v1/unknown").status === 403);
  check("write methods denied", ["POST", "PUT", "PATCH", "DELETE"].every(method => route(CMS + "/rest/v1/profile_content", method).status === 403));
  check("old CV version denied", route(CMS + "/functions/v1/cv-document?v=00000000-0000-4000-8000-000000000007").status === 403);
  check("unknown certificate denied", route(CMS + "/functions/v1/certificate-document?id=unknown").status === 403);
  check("private storage paths denied", route(CMS + "/storage/v1/object/private/portfolio-cv/cv/file.pdf").status === 403);
  check("real static owner CV denied", route(ORIGIN + "/assets/documents/CV-Rajendra%20Aria%20Nismara.pdf").status === 403);
  check("admin/tooling/config/traversal denied", ["/admin/index.html", "/scripts/preview-portfolio.js", "/.env", "/.git/config", "/docs/Features/M07-PERFORMANCE-OPTIMIZATION.md", "/js/%2e%2e%2fadmin/admin.js"].every(url => route(ORIGIN + url).status === 403));
  const withoutCsp = value => value.toString().replace(/<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*">/gi, '').replace(/>\s+</g, '><').trim();
  check("original frontend preserved apart from fixture CSP", withoutCsp(route(ORIGIN + "/index.html").body) === withoutCsp(fs.readFileSync(path.join(ROOT, "index.html"))));
  check("remote Supabase guestbook denied", route('https://production-denied.supabase.co/rest/v1/comments').status === 403);
  check("actual renderer served byte-exact", readPublicFile("js/cms/certificates.js").body.equals(fs.readFileSync(path.join(ROOT, "js/cms/certificates.js"))));
  check("CLI rejects unknown switch and invalid count", [ ["--unknown"], ["--certificates", "999"], ["--projects", "-1"] ].every(args => { try { optionsFromArgs(args); return false; } catch { return true; } }));
  const pdf = fixture.pdf.toString();
  const xref = Number(pdf.match(/startxref\n(\d+)/)[1]);
  check("synthetic one-page PDF has valid xref", pdf.startsWith("%PDF-1.4") && pdf.slice(xref).startsWith("xref\n") && pdf.includes("/Count 1") && pdf.endsWith("%%EOF\n"));
  let failed;
  try { await launch({ headless: true, _testInterceptionFailure: true }); } catch (error) { failed = error; }
  check("interception setup failure stops before application navigation", !!failed && failed.previewAudit.applicationNavigations === 0);
  check("failed startup profile cleaned", failed.previewAudit.cleanup === "PASS" && !fs.existsSync(failed.profile));
  evidence.push({ phase: "setup-failure", audit: failed.previewAudit });

  let trapConnections = 0;
  trap = http.createServer((req, res) => { res.end("LOCAL SYNTHETIC TRAP"); });
  trap.on("connection", () => trapConnections++);
  await new Promise(resolve => trap.listen(0, "127.0.0.1", resolve));
  preview = await launch({ headless: true, beforeNavigate: async p => {
    check("deny probe passed before app load", p.audit.startupProbe === "PASS" && p.audit.applicationNavigations === 0);
    await p.send("Fetch.disable", {}, p.session);
    // A fetch from about:blank may be rejected by Chrome before reaching the proxy.
    // A top-level navigation exercises the fallback transport guard; DNS denial
    // may also prevent Chrome from resolving the proxy itself.
    const blocked = await p.send("Page.navigate", { url: `http://127.0.0.1:${trap.address().port}/synthetic-trap` }, p.session);
    p.audit.fallbackProbe = { error: blocked.errorText, trapConnections };
    check("fallback denies request when interception disabled", /^net::ERR_/.test(blocked.errorText || "") && trapConnections === 0);
    await p.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] }, p.session);
    await p.send("Page.navigate", { url: "about:blank" }, p.session);
    check("interception restored before app load", await p.evaluate("fetch('https://blocked.preview.invalid/restored').then(r=>r.status)") === 403);
    await p.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__previewIntro=[];document.addEventListener('animationend',e=>{if(e.target.matches?.('#initial-loader .loader'))window.__previewIntro.push({name:e.animationName,pseudo:e.pseudoElement,elapsed:e.elapsedTime})},true)` }, p.session);
  } });
  await until(preview, "document.documentElement.classList.contains('is-loaded')&&document.querySelectorAll('.cert-slot').length===8&&document.querySelector('h1').textContent.includes('DEMO')");
  check("window clearly labelled fixture", (await preview.evaluate("document.title")).startsWith("[LOCAL FIXTURE PREVIEW]"));
  check("external protocol contact clicks blocked", await preview.evaluate("(()=>{const a=document.querySelector('a[href^=\"mailto:\"]');if(!a)return false;const e=new MouseEvent('click',{bubbles:true,cancelable:true});a.dispatchEvent(e);return e.defaultPrevented})()"));
  check("WebSocket external connection denied", await preview.evaluate("new Promise(resolve=>{const ws=new WebSocket('wss://blocked.preview.invalid/socket');ws.onopen=()=>{ws.close();resolve(false)};ws.onerror=()=>resolve(true);setTimeout(()=>{ws.close();resolve(false)},3000)})"));
  check("full opening animation completes both tracks", await preview.evaluate("window.__previewIntro.some(e=>e.name==='l8-0'&&!e.pseudo&&e.elapsed>=2.99)&&window.__previewIntro.some(e=>e.name==='l8-1'&&e.pseudo==='::after'&&e.elapsed>=2.99)&&!document.getElementById('initial-loader')"));
  check("certificates rendered by original CMS", await preview.evaluate("document.querySelectorAll('.cert-slot').length===8&&document.querySelector('#certRing').textContent.includes('DEMO Certificate')"));
  check("project cover and contain metadata rendered in six-card grid", await preview.evaluate("(()=>{const c=[...document.querySelectorAll('#projectGrid .project-card')];return c.length===6&&c.every(e=>e.textContent.includes('DEMO Project'))&&!document.querySelector('#projectLoadMore').hidden&&[...document.querySelectorAll('#projectGrid img')].some(e=>getComputedStyle(e).objectFit==='contain')})()"));
  check("three actual hero cards populated", await preview.evaluate("[...document.querySelectorAll('.hero-photo-card img')].length===3&&[...document.querySelectorAll('.hero-photo-card img')].every(e=>e.complete&&e.naturalWidth>0&&e.alt.includes('DEMO'))"));
  check("guestbook uses synthetic read fixture", await preview.evaluate("document.body.textContent.includes('DEMO Pengunjung')"));
  const href = await preview.evaluate("document.querySelector('[data-cv-download]').href");
  check("hero and footer share active fixture CV", await preview.evaluate(`document.querySelectorAll('[data-cv-download]').length===2&&[...document.querySelectorAll('[data-cv-download]')].every(e=>e.href===${JSON.stringify(href)}&&!e.hasAttribute('aria-disabled'))`));
  await screenshot(preview, "desktop-home.png");
  const download = new Promise(resolve => preview.on("Browser.downloadProgress", event => { if (event.state === "completed") resolve(); }));
  await preview.evaluate("document.querySelector('[data-cv-download]').click()");
  await Promise.race([download, wait(10000).then(() => { throw Error("Fixture download timeout"); })]);
  const files = fs.readdirSync(preview.downloads);
  check("CV attachment downloaded with exact synthetic bytes", files.length === 1 && fs.readFileSync(path.join(preview.downloads, files[0])).equals(fixture.pdf));
  fs.copyFileSync(path.join(preview.downloads, files[0]), path.join(OUT, "DEMO-local-CV.pdf"));

  await preview.evaluate("document.querySelector('#projectGrid').scrollIntoView({behavior:'instant',block:'center'});document.querySelector('#projectGrid a').focus()");
  check("project semantic link keyboard focus without carousel controller", await preview.evaluate("document.activeElement.matches('#projectGrid a')&&!window.refreshProjectCarousel&&!document.querySelector('.project-carousel-control')"));
  await preview.evaluate("document.querySelector('.cert-slot.is-active .cert-flip-button').focus()");
  await key(preview, "Enter");
  await until(preview, "!!document.querySelector('.cert-slot.is-active.is-flipped')");
  await key(preview, "Escape");
  check("certificate keyboard flip and Escape restore focus", await preview.evaluate("!document.querySelector('.cert-slot.is-active.is-flipped')&&document.activeElement.matches('.cert-face-front .cert-flip-button')"));
  check("keyboard focus remains accessible", await preview.evaluate("!document.activeElement.closest('[inert],[aria-hidden=true]')&&document.activeElement.matches(':focus-visible')"));
  await screenshot(preview, "desktop-certificates.png");

  const target = await preview.send("Target.createTarget", { url: "about:blank" });
  const sid = await preview.waitForSession(target.targetId);
  check("new tab isolated before resume", preview.audit.sessions.length >= 2 && preview.audit.sessions.every(s => s.interceptionBeforeResume));
  check("new tab denies unknown external request", await preview.evaluate("fetch('https://blocked.preview.invalid/new-tab').then(r=>r.status)", sid) === 403);
  await preview.send("Page.navigate", { url: ORIGIN + "/project.html?slug=demo-project-1" }, sid);
  const deadline = Date.now() + 10000;
  let detail = false;
  while (Date.now() < deadline) { detail = await preview.evaluate("document.querySelector('.pcs-hero h1')?.textContent.includes('DEMO Project 1')", sid); if (detail) break; await wait(100); }
  check("original project detail renders in isolated new tab", detail);
  await preview.send("Target.closeTarget", { targetId: target.targetId });
  check("no real network responses or runtime exceptions", preview.audit.realConnections === 0 && preview.audit.errors.length === 0 && trapConnections === 0);
  await preview.stop();
  check("normal profile removed after shutdown", preview.audit.cleanup === "PASS" && !fs.existsSync(preview.profile));
  evidence.push({ phase: "desktop", audit: preview.audit });

  const mobile = { headless: true, mobile: true, reducedMotion: true, certificates: 2, projects: 2 };
  preview = await launch(mobile);
  await until(preview, "document.documentElement.classList.contains('is-loaded')&&document.querySelectorAll('.cert-simple-card').length===2");
  check("mobile viewport and reduced motion active", await preview.evaluate("innerWidth===390&&matchMedia('(prefers-reduced-motion: reduce)').matches&&!document.getElementById('initial-loader')"));
  check("mobile responsive hero variant selected", await preview.evaluate("[...document.querySelectorAll('.hero-photo-card img')].every(e=>e.currentSrc.includes('-mobile.webp'))"));
  check("reduced motion grid has no autoplay and visible content", await preview.evaluate("!window.refreshProjectCarousel&&[...document.querySelectorAll('#projectGrid .project-card')].every(e=>getComputedStyle(e).opacity==='1')"));
  await screenshot(preview, "mobile-home-reduced.png");
  for (const count of [1, 0]) {
    preview.tables.certificates = fixture.tables({ certificates: count }).certificates;
    await reload(preview);
    await until(preview, count ? "document.querySelectorAll('.cert-simple-card').length===1" : "document.querySelector('.cert-simple [role=status]')?.textContent.includes('Belum ada')");
    check("preview supports certificate count " + count, true);
  }
  mobile.certificateError = true;
  await reload(preview);
  await until(preview, "document.querySelector('.cert-simple [role=status]')?.textContent.includes('gagal')||document.querySelector('.cert-simple [role=status]')?.textContent.includes('dimuat')");
  check("certificate failure remains an error fixture", preview.audit.requests.some(r => r.kind === "fixture-error" && r.status === 503));
  check("mobile requests have no real network responses or runtime exceptions", preview.audit.realConnections === 0 && preview.audit.errors.length === 0);
  await preview.stop();
  check("mobile profile removed after shutdown", preview.audit.cleanup === "PASS" && !fs.existsSync(preview.profile));
  evidence.push({ phase: "mobile-reduced-and-empty", audit: preview.audit });
}
run().catch(error => {
  results.push({ name: error.message, status: "FAIL" }); process.exitCode = 1;
}).finally(async () => {
  if (preview) { await preview.stop(); if (!evidence.some(e => e.audit === preview.audit)) evidence.push({ phase: "interrupted", audit: preview.audit }); }
  if (trap) await new Promise(resolve => trap.close(resolve));
  const report = { results, evidence, limitations: ["No real PostgreSQL/Auth/RLS/Storage/Edge Function validation", "No external font/icon fidelity", "Not an OS-level packet capture", "No full M01-M06 regression rerun"] };
  fs.writeFileSync(path.join(OUT, "preview-results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: results.filter(r => r.status === "PASS").length, fail: results.filter(r => r.status === "FAIL").length, last: results.at(-1), evidence: OUT }));
});
