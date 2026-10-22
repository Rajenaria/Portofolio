/* Native Chrome/CDP, no dependencies. All requests are fulfilled or denied.
   Run: node scripts/test-m03-carousel.js [external-output-directory]
   This is fixture integration, not a real Auth/Storage security test. */
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const ROOT = path.resolve(__dirname, "..");
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m03-browser-"));
if (OUT === ROOT || OUT.startsWith(ROOT + path.sep)) throw new Error("Output must be outside repository");
fs.mkdirSync(OUT, { recursive: true });
const chrome = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const proc = spawn(chrome, ["--headless=new", "--remote-debugging-pipe", "--user-data-dir=" + path.join(OUT, "chrome-profile-" + Date.now()),
  "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update",
  "--disable-sync", "--disable-extensions", "--disable-domain-reliability", "--disable-quic",
  "--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=<-loopback>", "--host-resolver-rules=MAP * ~NOTFOUND", "about:blank"],
  { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"], windowsHide: true });
let seq = 0, buffer = Buffer.alloc(0), session, count = 0, lastExpression;
const pending = new Map(), listeners = new Map(), network = [], errors = [], results = [];
proc.stdio[4].on("data", chunk => {
  buffer = Buffer.concat([buffer, chunk]); let at;
  while ((at = buffer.indexOf(0)) >= 0) {
    const raw = buffer.subarray(0, at).toString(); buffer = buffer.subarray(at + 1);
    if (!raw) continue;
    const message = JSON.parse(raw);
    if (message.id) {
      const task = pending.get(message.id);
      if (task) { pending.delete(message.id); message.error ? task.reject(Error(JSON.stringify(message.error))) : task.resolve(message.result || {}); }
    } else for (const fn of listeners.get(message.method) || []) fn(message.params, message.sessionId);
  }
});
proc.stderr.on("data", () => {});
const on = (event, fn) => listeners.set(event, [...(listeners.get(event) || []), fn]);
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(Error("Timeout: " + method)); }, 20000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    proc.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
  });
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const ID = "00000000-0000-4000-8000-000000000001";
let mode = "short";
const rows = () => Array.from({ length: count }, (_, i) => ({ id: "00000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
  status: "published", deleted_at: null, title: mode === "long" ? ("Sertifikat Pengembangan Sistem Terdistribusi dan Keamanan Aplikasi ".repeat(3)).slice(0,175) + i : "Certificate " + (i + 1), category: "course", publisher: mode === "long" ? "Synthetic institution ".repeat(6) : "Synthetic issuer",
  period: "2026", issuer_line: mode === "long" ? "Accredited institution ".repeat(7) : "Synthetic institution", description: mode === "empty" ? "" : mode === "long" ? "Konten sertifikat sintetis untuk pengujian aksesibilitas dan overflow. ".repeat(6).slice(0,400) : "Fixture description.",
  document_bucket: "portfolio-documents", document_path: `certificates/${ID}.pdf`, document_type: "pdf", sort_order: i }));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg" };
on("Fetch.requestPaused", async (event, sid) => {
  const url = new URL(event.request.url); let body = "Denied", status = 403, type = "text/plain", decision = "blocked";
  if (["http://127.0.0.1:47832", "http://127.0.0.1:54321"].includes(url.origin)) {
    if (url.pathname.startsWith("/rest/v1/")) {
      body = JSON.stringify(url.pathname.endsWith("certificates") ? rows() : []);
      status = 200; type = "application/json"; decision = "synthetic-api";
    } else if (url.pathname === "/js/guestbook.js") {
      body = "/* disabled in isolated browser fixture */"; status = 200; type = "text/javascript"; decision = "disabled-guestbook";
    } else {
      const local = path.resolve(ROOT, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
      if (local.startsWith(ROOT + path.sep) && fs.existsSync(local) && fs.statSync(local).isFile()) {
        body = fs.readFileSync(local); status = 200; type = mime[path.extname(local)] || "application/octet-stream"; decision = "local-source";
      } else { status = 404; body = "Unavailable"; decision = "local-missing"; }
    }
  }
  network.push({ url: url.origin + url.pathname, decision, status });
  try { await send("Fetch.fulfillRequest", { requestId: event.requestId, responseCode: status,
    responseHeaders: [{ name: "Content-Type", value: type }, { name: "Cache-Control", value: "no-store" },
      { name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Headers", value: "*" }],
    body: Buffer.from(body).toString("base64") }, sid); } catch (error) {
      // A navigation can cancel an intercepted request before it is fulfilled.
      if (!error.message.includes("Invalid InterceptionId")) errors.push(error.message);
    }
});
on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
on("Page.javascriptDialogOpening", async () => {
  await send("Page.handleJavaScriptDialog", { accept: false }, session);
});
async function evaluate(expression) {
  lastExpression = expression;
  const reply = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, session);
  if (reply.exceptionDetails) throw Error(reply.exceptionDetails.exception?.description || reply.exceptionDetails.text);
  return reply.result.value;
}
async function check(name, expression) {
  const actual = await evaluate(expression); assert.equal(actual, true, name + ": " + JSON.stringify(actual));
  results.push({ name, status: "PASS" });
}
async function waitFor(expression) {
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    if (await evaluate(expression)) return;
    await wait(100);
  }
  throw Error("Fixture did not settle: " + expression);
}

async function settle() {
  await evaluate("(()=>{const section=document.getElementById('certificates');section.getAnimations({subtree:true}).forEach(a=>{try{a.finish()}catch{}});return true})()");
  await wait(30);
}
async function shot(name) {
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, session);
  fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(result.data, "base64"));
}
async function key(value, code, number) {
  for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", {
    type, key: value, code, windowsVirtualKeyCode: number, nativeVirtualKeyCode: number,
    ...(type === "keyDown" && value === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {})
  }, session);
}
async function loadDataset(amount, content) {
  count = amount; mode = content;
  const before = await evaluate("window.__buildSerial");
  await evaluate(`import('/js/cms/certificates.js?fixture=${Date.now()}-${Math.random()}').then(()=>true)`);
  await waitFor(`window.__buildSerial>${before}`);
  await waitFor(`document.querySelectorAll('${amount < 3 ? ".cert-simple-card" : ".cert-slot"}').length===${amount}`);
  await settle();
}

(async () => {
  const version = await send("Browser.getVersion");
  const target = await send("Target.createTarget", { url: "about:blank" });
  session = (await send("Target.attachToTarget", { targetId: target.targetId, flatten: true })).sessionId;
  await send("Target.activateTarget", { targetId: target.targetId });
  await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, session);
  await send("Runtime.enable", {}, session); await send("Page.enable", {}, session);
  await send("Page.navigate", { url: "http://127.0.0.1:47832/index.html" }, session);
  await waitFor("!!window.certificatesCarousel&&document.querySelector('.cert-simple [role=status]')?.textContent.includes('Belum ada')");
  await waitFor("!document.documentElement.classList.contains('is-loading')&&!document.querySelector('.loader')");
  await evaluate("(()=>{window.__buildSerial=0;const build=window.certificatesCarousel.rebuild;window.certificatesCarousel.rebuild=(...args)=>{window.__buildSerial++;return build(...args)}})()");
  await check("external-network-denied", "fetch('https://network-denied.invalid/probe').then(r=>r.status===403)");
  const viewports = process.argv.includes("--interactions-only") ? [] : [[1280, 900], [768, 1024], [390, 844], [280, 720], [195, 720], [160, 720]];
  for (const [width, height] of viewports) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 }, session);
    await wait(180);
    for (const amount of [0, 1, 2, 3, 5, 8, 12, 20]) for (const content of ["empty", "short", "long"]) {
      await loadDataset(amount, content);
      await evaluate("document.getElementById('certStage').scrollIntoView({block:'center',behavior:'instant'})");
      await settle();
      const metric = await evaluate(`(()=>{
        const stage=document.getElementById('certStage').getBoundingClientRect();
        const cards=[...document.querySelectorAll('.cert-slot')],active=document.querySelector('.cert-slot.is-active');
        const bounds=active?.getBoundingClientRect();
        const visible=cards.filter(c=>+getComputedStyle(c.querySelector('.cert-face')).opacity>.08);
        return {count:cards.length,simple:document.querySelectorAll('.cert-simple-card').length,
          sizes:cards.map(c=>[c.offsetWidth,c.offsetHeight]),radius:parseFloat(getComputedStyle(document.getElementById('certificates')).getPropertyValue('--cert-radius')),
          activeInside:!bounds||(bounds.left>=stage.left-1&&bounds.right<=stage.right+1),
          visible:visible.length,activeCount:document.querySelectorAll('.cert-slot[aria-hidden=false]').length,
          dots:document.querySelectorAll('.cert-dot').length,
          sectionFits:document.getElementById('certificates').scrollWidth<=document.getElementById('certificates').clientWidth,
          controlsFit:document.getElementById('certDots').scrollWidth<=document.getElementById('certDots').clientWidth,
          inputSafe:cards.every(c=>c.classList.contains('is-active') ? !c.inert : c.inert&&getComputedStyle(c).pointerEvents==='none'),
          cardOwnsCenter:!bounds||document.elementFromPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2)?.closest('.cert-slot')===active,
          linkSafe:[...document.querySelectorAll('.cert-simple-card a,.cert-link[href]')].every(a=>a.href.includes('/functions/v1/certificate-document?id='))};
      })()`);
      assert.equal(metric.linkSafe, true);
      assert.equal(metric.sectionFits, true, JSON.stringify(metric));
      if (amount < 3) assert.equal(metric.simple, amount);
      else {
        assert.equal(metric.count, amount); assert.equal(metric.dots, amount);
        assert.equal(new Set(metric.sizes.map(size => size.join("x"))).size, 1);
        assert.equal(metric.sizes[0][1], width <= 640 ? Math.round(Math.max(240,Math.min(200,width-48)*1.38)) : width <= 1024 ? 365 : 428);
        assert(metric.visible <= 3); assert.equal(metric.activeCount, 1); assert.equal(metric.inputSafe, true);
        assert.equal(metric.activeInside, true, JSON.stringify(metric)); assert.equal(metric.cardOwnsCenter, true, JSON.stringify(metric));
        assert.equal(metric.controlsFit, true); assert(Number.isFinite(metric.radius));
      }
      results.push({ name: `matrix-${width}-${amount}-${content}`, status: "PASS", metric });
      if (content === "long" && [5, 20].includes(amount) && [1280, 390].includes(width)) await shot(`front-${width}-${amount}`);
    }
  }
  // Normal-motion transitions and native keyboard input after static matrix checks.
  await loadDataset(20, "long");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, session);
  await wait(200); await settle();
  await evaluate("document.getElementById('certStage').scrollIntoView({block:'center',behavior:'instant'})");
  await wait(100); await settle();
  const nextPoint = await evaluate("(()=>{const r=document.getElementById('certNext').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...nextPoint }, session);
  await waitFor("getComputedStyle(document.getElementById('certNext')).backgroundColor==='rgb(29, 29, 31)'");
  await check("native-mouse-hover-feedback", "getComputedStyle(document.getElementById('certNext')).backgroundColor==='rgb(29, 29, 31)'");
  const clickPoint = await evaluate("(()=>{const r=document.getElementById('certNext').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...clickPoint }, session);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...clickPoint }, session); await wait(850);
  await check("native-mouse-navigation-click", "document.querySelector('.cert-slot.is-active').dataset.index==='3'");
  await evaluate("document.querySelector('.cert-slot.is-active .cert-flip-button').focus()");
  await key("Enter", "Enter", 13); await wait(650);
  await check("keyboard-enter-flips-with-visible-focus", "!!document.querySelector('.cert-slot.is-active.is-flipped')&&!document.activeElement.closest('[inert],[aria-hidden=true]')");
  await check("long-back-content-reachable-by-scrolling", "(()=>{const region=document.querySelector('.cert-slot.is-active .cert-back-inner');region.scrollTop=region.scrollHeight;return region.scrollTop>0&&region.textContent.includes('Konten sertifikat')})()");
  await shot("back-long-desktop");
  await key("Escape", "Escape", 27); await settle();
  await check("escape-closes-and-restores-focus", "!document.querySelector('.is-active.is-flipped')&&document.activeElement.matches('.cert-face-front .cert-flip-button')");
  await key("ArrowRight", "ArrowRight", 39); await wait(850);
  await check("arrow-moves-focus-off-old-card", "document.activeElement.closest('.cert-slot').classList.contains('is-active')&&!document.activeElement.closest('[inert],[aria-hidden=true]')");
  await key("End", "End", 35); await settle();
  await check("end-selects-last-certificate", "document.querySelector('.cert-slot.is-active').dataset.index==='19'");
  await key("Home", "Home", 36); await settle();
  await check("home-selects-first-certificate", "document.querySelector('.cert-slot.is-active').dataset.index==='0'");
  for (let i = 0; i < 45; i++) {
    await key("Tab", "Tab", 9);
    assert.equal(await evaluate("!document.activeElement.closest('[inert],[aria-hidden=true]')"), true, `Tab step ${i}`);
  }
  await check("tab-never-enters-hidden-card-or-face", "!document.activeElement.closest('[inert],[aria-hidden=true]')");
  await evaluate("for(let i=0;i<47;i++)document.getElementById('certNext').click()");
  await wait(1100);
  await check("rapid-navigation-keeps-one-active-card-and-finite-transform", "document.querySelector('.cert-slot.is-active').dataset.index==='7'&&document.querySelectorAll('.cert-slot[aria-hidden=false]').length===1&&!getComputedStyle(document.getElementById('certRing')).transform.includes('NaN')");
  for (let i = 0; i < 20; i++) {
    await evaluate(`document.querySelectorAll('.cert-dot')[${i}].click()`); await settle();
    await check(`all-data-reachable-${i}`, `document.querySelector('.cert-slot.is-active').dataset.index==='${i}'`);
  }
  for (const amount of [3, 5, 8, 12, 20]) {
    await loadDataset(amount, "long");
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, session);
    await wait(40);
    for (const flipped of [true, false]) {
      await evaluate("document.querySelector('.cert-slot.is-active').click()");
      // Existing global reduced-motion CSS uses an !important microsecond duration.
      await check(`reduced-motion-one-face-${amount}-${flipped}`, `(()=>{const card=document.querySelector('.cert-slot.is-active');return card.classList.contains('is-flipped')===${flipped}&&[...card.querySelectorAll('.cert-face')].filter(f=>getComputedStyle(f).visibility==='visible'&&+getComputedStyle(f).opacity>.9).length===1&&parseFloat(getComputedStyle(card.querySelector('.cert-flip')).transitionDuration)<=.001&&parseFloat(getComputedStyle(card.querySelector('.cert-face')).transitionDuration)<=.001})()`);
    }
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] }, session);
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, session);
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 }, session);
  await loadDataset(8, "short"); await wait(180); await settle();
  await evaluate("document.getElementById('certStage').scrollIntoView({block:'center',behavior:'instant'})");
  const point = await evaluate("(()=>{const r=document.getElementById('certStage').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+30}})()");
  const beforeDrag = await evaluate("document.querySelector('.cert-slot.is-active').dataset.index");
  await evaluate("window.__pointerTrace=[];for(const name of ['pointerdown','pointermove','pointerup','pointercancel'])window.addEventListener(name,e=>window.__pointerTrace.push({type:e.type,target:e.target.className,x:e.clientX,y:e.clientY,primary:e.isPrimary,button:e.button}),true)");
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: point.x, y: point.y }] }, session);
  for (let i = 1; i <= 6; i++) {
    await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x - i * 20, y: point.y }] }, session);
    await wait(20);
  }
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, session); await wait(900);
  await check("native-touch-drag-snaps-and-releases-state", `document.querySelector('.cert-slot.is-active').dataset.index!==${JSON.stringify(beforeDrag)}&&!document.querySelector('.is-dragging')`);
  const tap = await evaluate("(()=>{const r=document.querySelector('.cert-slot.is-active .cert-face-front .cert-flip-button').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [tap] }, session);
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, session); await settle();
  await check("flip-after-drag-is-not-swallowed", "!!document.querySelector('.cert-slot.is-active.is-flipped')");
  await shot("mobile-touch-flipped");
  // Repeated rebuild and destroy expose orphaned listeners through double navigation.
  await loadDataset(5, "short"); await loadDataset(12, "empty"); await loadDataset(5, "long");
  await evaluate("document.getElementById('certNext').click()"); await settle();
  await check("rebuild-has-one-controller-and-live-region", "document.querySelector('.cert-slot.is-active').dataset.index==='3'&&document.querySelectorAll('.cert-live').length===1");
  await evaluate("window.certificatesCarousel.destroy();document.getElementById('certNext').click()");
  await check("destroy-cleans-cards-and-live-region", "document.querySelectorAll('.cert-slot,.cert-live').length===0");
  results.push({ name: "native-browser-zoom-200", status: "NOT VERIFIED", reason: "Viewport emulation is not native browser zoom; no metric is claimed." });
  assert.equal(errors.length, 0, errors.join("\n"));
  await finish(null, version);
})().catch(error => finish(error));
async function finish(error, browser) {
  let diagnostic;
  if (error) {
    try {
      diagnostic = await evaluate("(()=>{const card=document.querySelector('.cert-slot.is-active'),r=card?.getBoundingClientRect();return {bounds:r?.toJSON(),flipped:card?.classList.contains('is-flipped'),focus:document.activeElement.outerHTML.slice(0,160),reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,faces:card?[...card.querySelectorAll('.cert-face')].map(f=>({opacity:getComputedStyle(f).opacity,visibility:getComputedStyle(f).visibility,transition:getComputedStyle(f).transitionDuration})):[],flipTransition:card?getComputedStyle(card.querySelector('.cert-flip')).transitionDuration:null,hit:r?[...document.elementsFromPoint(r.x+r.width/2,r.y+r.height/2)].map(e=>e.className||e.tagName):[],scrollY,innerHeight}})()");
      await shot('failure');
    } catch {}
  }
  const pointerTrace = await evaluate("window.__pointerTrace||[]").catch(()=>[]);
  const summary = { passed: results.filter(r=>r.status==='PASS').length, failed: error ? 1 : 0,
    notVerified: results.filter(r=>r.status==='NOT VERIFIED').length };
  const report = { browser, summary, results, network, errors, pointerTrace, ...(error ? { error: error.stack, lastExpression, diagnostic } : {}) };
  fs.writeFileSync(path.join(OUT, "m03-browser-results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...summary, errors, error: error?.message, output: OUT }));
  try { await send("Browser.close"); } catch {}
  proc.kill(); if (error || errors.length) process.exitCode = 1;
}
