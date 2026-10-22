/* Developer-only Chrome/CDP preview. No server, dependencies or app mode.
   Run: node scripts/preview-portfolio.js [--mobile] [--reduced-motion]
   All request bodies/headers and browser stderr are deliberately excluded from logs. */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const { spawn } = require("node:child_process");
const fixture = require("./fixtures/portfolio-preview/fixture.js");
const environment = require('../js/environment.js');
const { cspFor, withMeta } = require('./prepare-environment.js');
const ROOT = fs.realpathSync(path.resolve(__dirname, ".."));
const ORIGIN = "http://127.0.0.1:47832"; // Virtual: no listening HTTP server.
const CMS = "http://127.0.0.1:54321";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".webp": "image/webp", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

function optionsFromArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--mobile") options.mobile = true;
    else if (arg === "--reduced-motion") options.reducedMotion = true;
    else if (arg === "--devtools") options.devtools = true;
    else if (arg === "--certificates" || arg === "--projects") {
      const n = Number(args[++i]);
      if (!Number.isInteger(n) || n < 0 || n > 20) throw Error("Jumlah kartu harus integer 0-20.");
      options[arg.slice(2)] = n;
    } else if (arg === "--certificate-error") options.certificateError = true;
    else if (arg === "--help") options.help = true;
    else throw Error("Argumen tidak dikenal. Gunakan --help.");
  }
  return options;
}

function readPublicFile(relative) {
  // Explicit public categories; never serve admin, tooling, credentials or real CV.
  if (!(relative === "index.html" || relative === "project.html" ||
    /^(js|css)\/[a-zA-Z0-9_./-]+\.(js|css)$/.test(relative) ||
    /^assets\/images\//.test(relative))) return null;
  if (relative.split(/[\\/]/).some(part => part === ".." || part.startsWith(".")) || relative.includes("\\")) return null;
  const file = path.resolve(ROOT, relative);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file)) return null;
  const real = fs.realpathSync(file);
  if (!real.startsWith(ROOT + path.sep) || !fs.statSync(real).isFile()) return null;
  const canonical = path.relative(ROOT, real).split(path.sep).join("/");
  if (!(canonical === "index.html" || canonical === "project.html" ||
    /^(js|css)\//.test(canonical) || /^assets\/images\//.test(canonical))) return null;
  const type = MIME[path.extname(real).toLowerCase()];
  return type ? { body: fs.readFileSync(real), type } : null;
}

function responseFor(request, options, tables) {
  const denied = { status: 403, body: "Blocked by isolated local preview", type: "text/plain", kind: "denied" };
  let url;
  try { url = new URL(request.url); } catch { return denied; }
  if (url.username || url.password) return denied;
  const appHtml = /^\/(?:index\.html|project\.html|admin\/index\.html|projects\/project-(?:football-club|ecommerce)\.html)$/.test(url.pathname) || url.pathname === '/';
  const configured = response => response && appHtml && url.origin === ORIGIN && /^text\/html/.test(response.type)
    ? { ...response, body: withMeta(response.body.toString(), cspFor({ backendOrigin: CMS,
      admin: url.pathname.startsWith('/admin/'), legacy: url.pathname.startsWith('/projects/') })) }
    : response;
  // Developer-only exact fixture routes, restricted to the two virtual local origins.
  // Unknown routes still fail closed; this never forwards a request to any server.
  if ([ORIGIN,CMS].includes(url.origin) && options._fixtureRoutes?.[url.origin+url.pathname]) {
    const response = options._fixtureRoutes[url.origin+url.pathname](request);
    return response?.then ? response.then(configured) : configured(response);
  }
  if (url.origin === ORIGIN && url.pathname === '/js/environment-config.js' && request.method === 'GET') return {
    status: 200, body: environment.configScript(fixture.environmentConfig(ORIGIN)),
    type: 'text/javascript', kind: 'fixture-environment' };
  const json = rows => ({ status: 200, body: JSON.stringify(rows), type: "application/json", kind: "fixture-cms" });
  const document = () => ({ status: 200, body: fixture.pdf, type: "application/pdf", kind: "fixture-document",
    headers: [{ name: "Content-Disposition", value: 'attachment; filename="DEMO-local-CV.pdf"' }] });
  const guestbook = url.origin === CMS && url.pathname === "/rest/v1/comments";
  const projectRpc = url.origin === CMS && url.pathname === '/rest/v1/rpc/project_catalog';
  const knownApi = projectRpc || url.origin === CMS && (/^\/rest\/v1\/[a-z_]+$/.test(url.pathname) ||
    ["/functions/v1/cv-document", "/functions/v1/certificate-document"].includes(url.pathname));
  // CORS preflight is synthetic too. No writes are accepted, including guestbook.
  if (request.method === "OPTIONS" && (knownApi || guestbook)) {
    return { status: 204, body: "", type: "text/plain", kind: "fixture-preflight" };
  }
  if(projectRpc && request.method==='POST'){
    if(options.projectError)return {status:503,body:'{"code":"SYNTHETIC_FAILURE"}',type:'application/json',kind:'fixture-error'};
    if(options.projectLegacy||options.projectMissingRpc)return {status:404,body:'{"code":"PGRST202"}',type:'application/json',kind:'fixture-legacy-schema'};
    let args;try{args=JSON.parse(request.postData||'{}');}catch{return denied;}
    if(Object.keys(args).some(k=>!['p_after','p_limit','p_slug'].includes(k)))return denied;
    const {snapshot}=require('./fixtures/portfolio-preview/project-snapshots');
    const rows=tables.projects.filter(r=>(!args.p_after||r.id>args.p_after)&&(!args.p_slug||r.slug===args.p_slug)).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,Math.min(100,Math.max(1,args.p_limit||100))).map(row=>{const r=snapshot(row,tables.projects.indexOf(row));if(!args.p_slug){r.payload.sections=[];r.payload.hero=null;}return r;});
    return json(rows.slice(0,Math.min(100,Math.max(1,args.p_limit||100))));
  }
  if (request.method !== "GET") return denied;
  if (guestbook) return json(tables.comments);
  if (url.origin === CMS) {
    if(url.pathname==='/functions/v1/project-media'){
      const row=tables.projects.find(r=>r.id===url.searchParams.get('project')&&r.id===url.searchParams.get('asset'));
      const variant=url.searchParams.get('variant');
      if(!row||!['desktop','mobile'].includes(variant))return denied;
      const key=variant==='mobile'?row.cover_mobile_path:row.cover_desktop_path;
      const file=Object.hasOwn(fixture.media,key)&&readPublicFile(fixture.media[key]);
      return file?{...file,status:200,kind:'fixture-project-media'}:denied;
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      if (!Object.hasOwn(tables, table)) return denied;
      if(table==='projects'&&options.projectLegacy&&url.searchParams.get('select')?.includes('published_revision_id'))return {status:400,body:'{"code":"42703","message":"column published_revision_id does not exist"}',type:'application/json',kind:'fixture-legacy-schema'};
      if (table === "certificates" && options.certificateError) return {
        status: 503, body: '{"message":"DEMO simulated certificate failure"}', type: "application/json", kind: "fixture-error" };
      let rows = tables[table];
      if (table === "projects" && url.searchParams.has("slug")) rows = rows.filter(row => "eq." + row.slug === url.searchParams.get("slug"));
      return json(rows);
    }
    if (url.pathname === "/functions/v1/cv-document" && url.searchParams.get("v") === fixture.VERSION) return document();
    if (url.pathname === "/functions/v1/certificate-document" &&
      tables.certificates.some(row => row.id === url.searchParams.get("id") && row.status === "published")) return document();
    const prefix = "/storage/v1/object/public/portfolio-media/";
    if (url.pathname.startsWith(prefix)) {
      let key;
      try { key = decodeURIComponent(url.pathname.slice(prefix.length)); } catch { return denied; }
      const file = Object.hasOwn(fixture.media, key) && readPublicFile(fixture.media[key]);
      if (file) return { ...file, status: 200, kind: "fixture-media" };
    }
    return denied;
  }
  if (url.origin !== ORIGIN) return denied;
  let relative;
  try { relative = decodeURIComponent(url.pathname === "/" ? "index.html" : url.pathname.slice(1)); } catch { return denied; }
  const file = readPublicFile(relative);
  return file ? configured({ ...file, status: 200, kind: "repository-public-file" }) : denied;
}

async function launch(options = {}) {
  const chrome = options.chromePath || process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
  if (!fs.existsSync(chrome)) throw Error("Chrome tidak ditemukan. Atur CHROME_PATH ke executable Chrome lokal.");
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "portfolio-local-preview-"));
  const profile = path.join(directory, "chrome-profile");
  const downloads = path.join(directory, "downloads");
  fs.mkdirSync(profile); fs.mkdirSync(downloads);
  const tables = fixture.tables(options);
  const audit = { requests: [], sessions: [], rejectedTargetTypes: [], responses: 0, realConnections: 0, proxyDenials: 0, cancelled: 0,
    errors: [], applicationNavigations: 0, cleanup: "NOT RUN", startupProbe: "NOT RUN" };
  // Own the fallback proxy port throughout the session. It only destroys sockets;
  // unlike a guessed closed port, another local proxy cannot take it over.
  const denyProxy = net.createServer(socket => { audit.proxyDenials++; socket.destroy(); });
  try {
    await new Promise((resolve, reject) => {
      denyProxy.once("error", reject); denyProxy.listen(0, "127.0.0.1", resolve);
    });
  } catch {
    fs.rmdirSync(profile); fs.rmdirSync(downloads); fs.rmdirSync(directory);
    throw Error("Fallback network guard unavailable; Chrome not started");
  }
  const args = [ ...(options.headless ? ["--headless=new"] : []), ...(options.devtools ? ["--auto-open-devtools-for-tabs"] : []),
    "--remote-debugging-pipe", "--user-data-dir=" + profile,
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update",
    "--disable-sync", "--disable-extensions", "--disable-domain-reliability", "--disable-quic",
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp", "--disable-breakpad", "--disable-component-extensions-with-background-pages",
    "--proxy-server=http://127.0.0.1:" + denyProxy.address().port, "--proxy-bypass-list=<-loopback>", "--host-resolver-rules=MAP * ~NOTFOUND",
    "--window-size=" + (options.mobile ? "450,950" : "1440,1000"), "about:blank" ];
  const proc = spawn(chrome, args, { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"], windowsHide: !!options.headless });
  let sequence = 0, buffer = Buffer.alloc(0), stopping = false, stopTask, ended = false, failure;
  const pending = new Map(), listeners = new Map(), sessions = new Map();
  let resolveMain, rejectMain;
  const main = new Promise((resolve, reject) => { resolveMain = resolve; rejectMain = reject; });
  // A setup failure can happen before the startup routine reaches await main.
  main.catch(() => {});
  let resolveExit;
  const exited = new Promise(resolve => { resolveExit = resolve; });
  const on = (event, fn) => listeners.set(event, [...(listeners.get(event) || []), fn]);
  function send(method, params = {}, sessionId) {
    if (ended) return Promise.reject(Error("Chrome session ended"));
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(Error("CDP timeout: " + method)); }, 10000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      proc.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0", error => {
        if (error && pending.has(id)) { pending.get(id).reject(Error("CDP pipe unavailable")); pending.delete(id); }
      });
    });
  }
  async function stop() {
    if (stopTask) return stopTask;
    stopping = true;
    stopTask = (async () => {
      if (!ended) {
        await Promise.race([send("Browser.close").catch(() => {}), sleep(1500)]);
        await Promise.race([exited, sleep(2000)]);
        if (!ended) { proc.kill(); await Promise.race([exited, sleep(2000)]); }
      }
      if (!ended) { audit.cleanup = "FAIL: browser still running"; return; }
      await new Promise(resolve => denyProxy.close(resolve));
      // Delete only the exact profile created by this invocation. Never remove parent/downloads.
      const expected = path.join(fs.realpathSync(directory), "chrome-profile");
      if (path.resolve(profile) !== expected || !directory.startsWith(fs.realpathSync(os.tmpdir()) + path.sep) ||
        !path.basename(directory).startsWith("portfolio-local-preview-")) { audit.cleanup = "FAIL: path guard"; return; }
      for (let attempt = 0; attempt < 12; attempt++) {
        try {
          if (fs.existsSync(profile) && fs.realpathSync(profile) !== expected) throw Error("Profile path changed");
          fs.rmSync(profile, { recursive: true, force: true });
          audit.cleanup = "PASS"; return;
        } catch { await sleep(250); }
      }
      audit.cleanup = "FAIL: profile still locked";
    })();
    return stopTask;
  }
  function fatal(reason) {
    if (stopping) return;
    failure = reason; audit.errors.push(reason); rejectMain(Error(reason));
    void stop();
  }
  denyProxy.on("error", () => fatal("Fallback network guard failed"));
  proc.on("error", () => { ended = true; resolveExit(); fatal("Chrome launch failed"); });
  proc.on("exit", () => {
    ended = true; resolveExit();
    for (const task of pending.values()) task.reject(Error("Chrome session ended"));
    pending.clear();
    if (!stopping) { rejectMain(Error("Chrome closed during startup")); void stop(); }
  });
  proc.stderr.on("data", () => {});
  for (const pipe of [proc.stdio[3], proc.stdio[4]]) pipe.on("error", () => fatal("CDP pipe failed"));
  proc.stdio[4].on("data", chunk => {
    buffer = Buffer.concat([buffer, chunk]); let at;
    while ((at = buffer.indexOf(0)) >= 0) {
      const raw = buffer.subarray(0, at).toString("utf8"); buffer = buffer.subarray(at + 1);
      if (!raw) continue;
      let message;
      try { message = JSON.parse(raw); } catch { fatal("Invalid CDP message"); return; }
      if (message.id) {
        const task = pending.get(message.id); pending.delete(message.id);
        if (task) {
          if (message.error) {
            const error = Error("CDP rejected: " + message.error.code);
            error.cancelled = /Invalid InterceptionId/.test(message.error.message);
            task.reject(error);
          } else task.resolve(message.result || {});
        }
      } else for (const fn of listeners.get(message.method) || []) {
        Promise.resolve().then(() => fn(message.params, message.sessionId)).catch(() => fatal("CDP event handler failed"));
      }
    }
  });
  on("Fetch.requestPaused", async (event, sid) => {
    if (stopping) return;
    if (sessions.get(sid)?.devtools && event.request.url.startsWith("devtools://devtools/bundled/")) {
      // These are Chrome's installed tool files, never HTTP/network resources.
      audit.requests.push({ kind: "chrome-internal-resource", status: 0, method: event.request.method });
      try { await send("Fetch.continueRequest", { requestId: event.requestId }, sid); }
      catch (error) { if (!error.cancelled && !stopping) fatal("DevTools resource interception failed"); }
      return;
    }
    let response;
    try { response = await responseFor(event.request, options, tables); } catch { fatal("Fixture routing failed"); return; }
    // No URLs, query strings, headers, credentials or request bodies in audit output.
    audit.requests.push({ kind: response.kind, status: response.status, method: event.request.method });
    try {
      await send("Fetch.fulfillRequest", { requestId: event.requestId, responseCode: response.status,
        responseHeaders: [ { name: "Content-Type", value: response.type }, { name: "Cache-Control", value: "no-store" },
          { name: "X-Content-Type-Options", value: "nosniff" }, { name: "Access-Control-Allow-Origin", value: "*" },
          { name: "Access-Control-Allow-Headers", value: "*" }, { name: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          ...(response.headers || []) ], body: Buffer.from(response.body).toString("base64") }, sid);
    } catch (error) {
      // Navigation can invalidate an intercepted request. Do not ignore other failures.
      if (stopping || !sessions.has(sid)) return;
      if (error.cancelled) audit.cancelled++;
      else fatal("Request interception failed");
    }
  });
  on("Network.responseReceived", (event, sid) => {
    audit.responses++;
    if (sessions.get(sid)?.devtools && event.response.url.startsWith("devtools://devtools/bundled/") && !event.response.remoteIPAddress) return;
    if (event.response.remoteIPAddress || event.response.fromServiceWorker || event.response.fromDiskCache) {
      audit.realConnections++; fatal("Unexpected non-fixture response");
    }
  });
  on("Runtime.exceptionThrown", (_, sid) => { if (!sessions.get(sid)?.devtools) audit.errors.push("Application runtime exception (details suppressed)"); });
  on("Target.detachedFromTarget", event => { sessions.delete(event.sessionId); });
  const titleScript = `(()=>{const prefix='[LOCAL FIXTURE PREVIEW] ';new MutationObserver(()=>{if(document.head&&!document.title.startsWith(prefix))document.title=prefix+document.title}).observe(document,{childList:true,subtree:true,characterData:true});document.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(link){try{if(!['http:','https:'].includes(new URL(link.href,location.href).protocol))event.preventDefault()}catch{event.preventDefault()}}},true)})()`;
  on("Target.attachedToTarget", async event => {
    const sid = event.sessionId, type = event.targetInfo.type;
    if (stopping) return;
    const devtools = type === "other" && event.targetInfo.url.startsWith("devtools://devtools/bundled/");
    if (!["page", "iframe"].includes(type) && !devtools) {
      audit.rejectedTargetTypes.push(type);
      await send("Target.closeTarget", { targetId: event.targetInfo.targetId }); return;
    }
    sessions.set(sid, { id: event.targetInfo.targetId, ready: false, devtools });
    try {
      if (options._testInterceptionFailure) throw Error("Synthetic interception failure");
      await send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] }, sid);
      await send("Network.enable", {}, sid);
      await send("Network.setBypassServiceWorker", { bypass: true }, sid);
      await send("Network.setCacheDisabled", { cacheDisabled: true }, sid);
      await send("Network.setBlockedURLs", { urls: ["ws://*", "wss://*", "file://*", "ftp://*"] }, sid);
      await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sid);
      await send("Runtime.enable", {}, sid);
      await send("Page.enable", {}, sid);
      if (!devtools) await send("Page.addScriptToEvaluateOnNewDocument", { source: titleScript }, sid);
      if (options.mobile && !devtools) {
        await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sid);
        await send("Emulation.setTouchEmulationEnabled", { enabled: true }, sid);
      }
      if (options.reducedMotion && !devtools) await send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sid);
      const state = sessions.get(sid);
      if (!state) return;
      state.ready = true; audit.sessions.push({ type, interceptionBeforeResume: true });
      await send("Runtime.runIfWaitingForDebugger", {}, sid);
      if (type === "page") resolveMain(sid);
    } catch { fatal("Target isolation setup failed; app not loaded"); }
  });
  const evaluate = async (expression, sid) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sid);
    if (result.exceptionDetails) throw Error("Preview evaluation failed");
    return result.result.value;
  };
  try {
    await send("Browser.getVersion");
    await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads, eventsEnabled: true });
    await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    const startupTimeout = setTimeout(() => rejectMain(Error("Isolation startup timeout")), 12000);
    let sid;
    try { sid = await main; } finally { clearTimeout(startupTimeout); }
    const probe = await evaluate("fetch('https://blocked.preview.invalid/probe').then(r=>r.status).catch(()=>0)", sid);
    if (probe !== 403 || failure) throw Error("Isolation probe failed; app not loaded");
    audit.startupProbe = "PASS";
    if (options.beforeNavigate) await options.beforeNavigate({ send, evaluate: expression => evaluate(expression, sid), session: sid, audit, on });
    if (failure || stopping) throw Error("Isolation unavailable; app not loaded");
    audit.applicationNavigations++;
    await send("Page.navigate", { url: ORIGIN + "/index.html" }, sid);
    await send("Target.activateTarget", { targetId: sessions.get(sid).id });
    return { send, on, evaluate: (expression, session = sid) => evaluate(expression, session), session: sid,
      sessions, audit, stop, exited, profile, directory, downloads, origin: ORIGIN, tables,
      waitForSession: async id => {
        for (let i = 0; i < 100; i++) {
          for (const [session, state] of sessions) if (state.id === id && state.ready) return session;
          if (failure) throw Error(failure);
          await sleep(50);
        }
        throw Error("New target isolation timeout");
      } };
  } catch (error) {
    await stop();
    error.previewAudit = audit; error.profile = profile;
    throw error;
  }
}

async function cli() {
  const options = optionsFromArgs(process.argv.slice(2));
  if (options.help) {
    console.log("node scripts/preview-portfolio.js [--mobile] [--reduced-motion] [--devtools] [--certificates 0-20] [--projects 0-20] [--certificate-error]");
    console.log("Chrome baru dengan profile sementara. Tidak memerlukan Live Server/Supabase. F12: DevTools; Ctrl+C/tutup seluruh jendela: berhenti.");
    return;
  }
  const preview = await launch(options);
  console.log("LOCAL FIXTURE PREVIEW - data DEMO, renderer/frontend asli.");
  console.log("URL virtual (hanya bekerja di Chrome yang baru dibuka): " + preview.origin + "/index.html");
  console.log("F12: DevTools / device toolbar. Ctrl+C atau tutup seluruh jendela preview untuk selesai.");
  console.log("Download PDF sintetis: " + preview.downloads);
  console.log("Isolasi awal PASS; semua request dipenuhi fixture/file lokal atau ditolak. Tidak ada server preview publik.");
  const interrupt = () => { void preview.stop(); };
  process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
  await preview.exited;
  await preview.stop();
  process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt);
  console.log("Pembersihan profile sementara: " + preview.audit.cleanup);
  if (preview.audit.errors.length || preview.audit.cleanup !== "PASS") process.exitCode = 1;
}
if (require.main === module) cli().catch(() => {
  console.error("Preview dihentikan: launcher/isolation gagal. Aplikasi tidak boleh dibuka di profile normal untuk menggantikannya.");
  process.exitCode = 1;
});
module.exports = { launch, responseFor, readPublicFile, optionsFromArgs, ORIGIN, CMS };
