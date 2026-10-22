/* Native Chrome/CDP, no dependencies. All requests are fulfilled or denied.
   Run: node scripts/test-m02-browser.js [external-output-directory]
   This is fixture integration, not a real Auth/Storage security test. */
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const ROOT = path.resolve(__dirname, "..");
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m02-browser-"));
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
const rows = () => Array.from({ length: count }, (_, i) => ({ id: ID.slice(0, -1) + (i + 1),
  status: "published", deleted_at: null, title: "Certificate " + (i + 1), category: "course", publisher: "Synthetic issuer",
  period: "2026", issuer_line: "Synthetic institution", description: "Fixture description.",
  document_bucket: "portfolio-documents", document_path: `certificates/${ID}.pdf`, document_type: "pdf", sort_order: i }));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg" };
on("Fetch.requestPaused", async (event, sid) => {
  const url = new URL(event.request.url); let body = "Denied", status = 403, type = "text/plain", decision = "blocked";
  if (["http://127.0.0.1:47832", "http://127.0.0.1:54321"].includes(url.origin)) {
    if (url.pathname.startsWith("/rest/v1/")) {
      body = JSON.stringify(url.pathname.endsWith("certificates") ? rows() : []);
      status = 200; type = "application/json"; decision = "synthetic-api";
    } else if (url.pathname === "/admin-fixture.html") {
      body = '<html><head><link rel="stylesheet" href="/admin/admin.css"></head><body><nav><a href="#/certificates" id="cert-nav">Certificates</a><a href="#/experience" id="exp-nav">Experience</a></nav><div id="app"></div><div id="admin-modal-root"></div><div id="admin-toast-root"></div></body></html>';
      status = 200; type = "text/html"; decision = "synthetic-page";
    } else if (url.pathname === "/admin/js/core/supabase.js") {
      body = "export const supabaseClient=window.__client;"; status = 200; type = "text/javascript"; decision = "synthetic-admin-client";
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
  if (status === 200 && url.origin === 'http://127.0.0.1:47832') body = require('./fixtures/portfolio-preview/fixture').configureResponse(url.origin, url.pathname, body, type);
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
async function clickDialog(confirm) {
  await evaluate(`document.querySelectorAll('.modal-overlay:last-child .modal-footer button')[${confirm ? 1 : 0}].click()`);
  await wait(120);
}
async function addEditor(type, value) {
  await evaluate("[...document.querySelectorAll('.page-header button')].find(b=>/Tambah|Add/.test(b.textContent)).click()");
  await wait(200);
  await evaluate(`(()=>{const field=document.getElementById('${type}-title');field.value=${JSON.stringify(value)};field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}

(async () => {
  const version = await send("Browser.getVersion");
  const target = await send("Target.createTarget", { url: "about:blank" });
  session = (await send("Target.attachToTarget", { targetId: target.targetId, flatten: true })).sessionId;
  await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, session);
  await send("Runtime.enable", {}, session); await send("Page.enable", {}, session);
  await send("Page.navigate", { url: "http://127.0.0.1:47832/admin-fixture.html" }, session); await wait(200);
  await check("external-request-is-blocked", "fetch('https://network-denied.invalid/probe').then(r=>r.status===403).catch(()=>true)");
  for (const width of [1280, 390]) for (const amount of [0, 1, 2, 3]) {
    count = amount;
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 }, session);
    await send("Page.navigate", { url: "http://127.0.0.1:47832/index.html" }, session);
    await waitFor(`!!window.certificatesCarousel&&(${amount}===0 ? document.querySelector('.cert-simple [role=status]')?.textContent.includes('Belum ada') : document.querySelectorAll('${amount < 3 ? ".cert-simple-card" : ".cert-slot"}').length===${amount})`);
    await check(`public-count-${amount}-width-${width}`, `(()=>{const simple=document.querySelectorAll('.cert-simple-card'),slots=document.querySelectorAll('.cert-slot');return ${amount}<3 ? simple.length===${amount}&&document.getElementById('certificatesCarousel').hidden : slots.length===${amount}&&!document.getElementById('certificatesCarousel').hidden})()`);
    await check(`public-delivery-links-${amount}-width-${width}`, "[...document.querySelectorAll('.cert-simple-card a,.cert-link[href]')].every(a=>a.href.includes('/functions/v1/certificate-document?id='))");
    if (amount < 3) await check(`simple-layout-no-overflow-${amount}-width-${width}`, "[...document.querySelectorAll('.cert-simple-card')].every(e=>e.getBoundingClientRect().width<=window.innerWidth && e.scrollWidth<=e.clientWidth)");
  }
  // Exercise controller teardown in both directions, not only page reloads.
  await check("public-rebuild-3-to-0-to-2-to-3", `(()=>{const c=window.certificatesCarousel;const data=Array.from({length:3},(_,i)=>({id:String(i),title:'Fixture',icon:'tabler:award',year:'2026',publisher:'Issuer',subtitle:'',badge:'',description:'',link:''}));return c.rebuild([])&&c.rebuild(data.slice(0,2))&&c.rebuild(data)&&document.querySelectorAll('.cert-slot').length===3&&!document.querySelector('.cert-simple')})()`);
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, session);
  await send("Page.navigate", { url: "http://127.0.0.1:47832/admin-fixture.html#/certificates" }, session); await wait(200);
  await evaluate(`(async()=>{
    window.__stored=[];window.__denyDownload=false;window.__objects=new Set();window.__activeDeletes=[];
    window.__client={from(table){let single=false,body=null,operation=null,columns='',id=null;
      const q={select(value){columns=value;return q},eq(key,value){if(key==='id')id=value;return q},is(){return q},order(){return q},limit(){return q},
        insert(value){operation='insert';body=value;return q},update(value){operation='update';body=value;return q},maybeSingle(){single=true;return q},
        then(resolve){let row=null;
          if(operation==='insert'){row={...body,id:'${ID}',created_at:new Date().toISOString()};window.__stored.push(row)}
          else if(operation==='update'){row=window.__stored.find(r=>r.id===id);Object.assign(row,body)}
          else row=window.__stored.find(r=>r.id===id)||null;
          if(operation&&window.__ackLost){window.__ackLost=false;return resolve({data:null,error:'synthetic lost acknowledgement'})}
          if(!operation&&columns.includes('document_bucket')&&window.__readbackFail){window.__readbackFail=false;return resolve({error:'synthetic readback failure'})}
          resolve({data:single?row:table==='certificates'?window.__stored:[],error:null})}};return q},
      storage:{from(){return {
        download:async()=>window.__denyDownload?{error:'denied'}:{data:new Blob(['%PDF-fixture'],{type:'application/pdf'})},
        upload:async(path)=>{window.__objects.add(path);return {data:{path}}},
        info:async(path)=>window.__infoFail?{error:'synthetic verification failure'}:{data:{path}},
        remove:async(paths)=>{for(const path of paths){if(window.__stored.some(r=>r.document_path===path))window.__activeDeletes.push(path);window.__objects.delete(path)}return {data:paths.map(name=>({name}))}}
      }}}};
    window.__guard=await import('/admin/js/core/navigation-guard.js');
    window.__lang=await import('/admin/js/core/i18n.js');
    window.__modal=await import('/admin/js/core/modal.js');
    const {createRouter}=await import('/admin/js/core/router.js');
    const {certificatesRoute}=await import('/admin/js/modules/certificates/index.js');
    const {experienceRoute}=await import('/admin/js/modules/experience/index.js');
    window.__router=createRouter({container:document.getElementById('app'),routes:[certificatesRoute,experienceRoute],defaultRoute:'certificates'});
    window.__lang.onLanguageChange((code,options)=>window.__router.reload(options));
    window.__router.start();
  })()`); await wait(200);
  await addEditor("certificate", "Preserve certificate draft");
  await check("actual-certificate-editor-is-dirty", "window.__guard.hasUnsavedChanges()");
  await evaluate("document.getElementById('exp-nav').click()"); await wait(120);
  await check("sidebar-opens-existing-confirmation", "!!document.querySelector('[role=dialog]')");
  await clickDialog(false);
  await check("sidebar-cancel-preserves-editor-and-hash", "location.hash==='#/certificates'&&document.getElementById('certificate-title').value==='Preserve certificate draft'");
  const language = await evaluate("window.__lang.getLanguage()");
  await evaluate("void window.__lang.setLanguage(window.__lang.getLanguage()==='id'?'en':'id')"); await wait(100);
  await clickDialog(false);
  await check("language-cancel-keeps-language-and-form", `window.__lang.getLanguage()===${JSON.stringify(language)}&&document.getElementById('certificate-title').value==='Preserve certificate draft'`);
  await evaluate("void window.__router.reload()"); await wait(100); await clickDialog(false);
  await check("route-reload-cancel-preserves-editor", "document.getElementById('certificate-title').value==='Preserve certificate draft'");
  await evaluate("document.getElementById('exp-nav').click()"); await wait(100); await clickDialog(true);
  await check("sidebar-confirm-navigates-and-releases-guard", "window.__router.getActiveRoute()==='experience'&&!window.__guard.hasUnsavedChanges()");
  await evaluate("document.getElementById('cert-nav').click()"); await wait(150);
  await addEditor("certificate", "Back button draft");
  await evaluate("history.back()"); await wait(100); await clickDialog(false);
  await check("browser-back-cancel-keeps-form", "location.hash==='#/certificates'&&document.getElementById('certificate-title').value==='Back button draft'");
  // The cancelled traversal restores the URL with replaceState; navigate back
  // through a clean history pair to exercise a confirmed traversal as well.
  await evaluate("document.getElementById('exp-nav').click()"); await wait(100); await clickDialog(true);
  await evaluate("document.getElementById('cert-nav').click()"); await wait(150);
  await addEditor("certificate", "Confirmed back draft");
  await evaluate("history.back()"); await wait(100); await clickDialog(true);
  await check("browser-back-confirm-navigates", "window.__router.getActiveRoute()==='experience'");
  await addEditor("experience", "Forward draft");
  await evaluate("history.forward()"); await wait(100); await clickDialog(false);
  await check("browser-forward-cancel-preserves-form", "document.getElementById('experience-title').value==='Forward draft'");
  await evaluate("document.getElementById('cert-nav').click()"); await wait(100); await clickDialog(true);
  await addEditor("certificate", "Language confirm draft");
  await evaluate("void window.__lang.setLanguage(window.__lang.getLanguage()==='id'?'en':'id')"); await wait(100); await clickDialog(true);
  await check("language-confirm-reloads-without-second-prompt", "!document.querySelector('[role=dialog]')&&!document.getElementById('certificate-title')&&!window.__guard.hasUnsavedChanges()");
  await addEditor("certificate", "Saved synthetic certificate");
  await evaluate("[...document.querySelectorAll('.admin-button-primary')].find(b=>/Simpan|Save/.test(b.textContent)).click()"); await wait(200);
  await check("actual-certificate-save-resets-dirty-state", "window.__stored.length===1&&!window.__guard.hasUnsavedChanges()&&!document.getElementById('certificate-title')");
  await evaluate(`(async()=>{
    const {createCertificateEditor}=await import('/admin/js/modules/certificates/editor-view.js');
    window.__mountDocumentEditor=()=>{
      window.__certEditor?.destroy();document.getElementById('app').replaceChildren();
      window.__certEditor=createCertificateEditor({record:structuredClone(window.__stored[0]),onDirtyChange(){},onSaved(){window.__docSaved=(window.__docSaved||0)+1},onBack(){}});
      document.getElementById('app').appendChild(window.__certEditor.element);
    };
    window.__pickPDF=()=>{const files=new DataTransfer();files.items.add(new File(['%PDF-1.7 synthetic fixture'], 'fixture.pdf', {type:'application/pdf'}));
      const input=document.getElementById('certificate-document-input');input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));};
    window.__mountDocumentEditor();window.__pickPDF();
  })()`); await wait(150);
  await check("actual-document-upload-save-and-readback", "window.__certEditor.save().then(ok=>ok&&window.__objects.has(window.__stored[0].document_path)&&!window.__certEditor.isDirty())");
  await evaluate("window.__oldDocument=window.__stored[0].document_path;window.__pickPDF();window.__ackLost=true"); await wait(100);
  await check("actual-document-replacement-ack-lost-retains-both-files", "window.__certEditor.save().then(ok=>!ok&&window.__objects.has(window.__oldDocument)&&window.__objects.has(window.__stored[0].document_path)&&window.__certEditor.isDirty())");
  await evaluate("window.__mountDocumentEditor();window.__pickPDF()"); await wait(100);
  await check("actual-document-replacement-reload-retry-succeeds", "window.__certEditor.save().then(ok=>ok&&window.__objects.has(window.__stored[0].document_path)&&window.__activeDeletes.length===0)");
  await evaluate("window.__pickPDF();window.__readbackFail=true"); await wait(100);
  await check("actual-document-readback-failure-preserves-committed-file", "window.__certEditor.save().then(ok=>!ok&&window.__objects.has(window.__stored[0].document_path)&&window.__activeDeletes.length===0)");
  await evaluate("window.__mountDocumentEditor();window.__pickPDF();window.__infoFail=true"); await wait(100);
  await check("actual-document-verification-failure-preserves-current-reference", "window.__certEditor.save().then(ok=>!ok&&window.__objects.has(window.__stored[0].document_path)&&window.__activeDeletes.length===0)");
  await evaluate("window.__infoFail=false;window.__certEditor.destroy()");
  await evaluate(`(async()=>{
    window.__documents=await import('/admin/js/core/document-storage.js');
    window.__originalOpen=window.open;
    window.open=()=>({opener:null,document:{body:{textContent:''}},location:{replace:url=>{window.__previewUrl=url}},close:()=>{window.__previewClosed=true}});
    await window.__documents.openDocument('portfolio-documents','certificates/${ID}.pdf');
  })()`);
  await check("admin-preview-uses-authenticated-download-and-blob", "window.__previewUrl.startsWith('blob:')");
  await evaluate("window.__denyDownload=true;void window.__documents.openDocument('portfolio-documents','certificates/00000000-0000-4000-8000-000000000001.pdf')"); await wait(100);
  await check("admin-unauthorized-preview-closes-and-shows-error", "window.__previewClosed&&!!document.querySelector('.admin-toast-error')");
  await evaluate(`(async()=>{
    window.__denyDownload=false;
    const original=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){window.__download={href:this.href,filename:this.download}};
    await window.__documents.openDocument('portfolio-documents','certificates/${ID}.pdf',{download:true});
    HTMLAnchorElement.prototype.click=original;
    window.open=window.__originalOpen;
  })()`);
  await check("admin-download-produces-attachment-from-authenticated-bytes", "window.__download.href.startsWith('blob:')&&window.__download.filename==='certificate.pdf'");
  await evaluate(`(()=>{
    const input=document.createElement('input');input.value='initial';window.__modalInput=input;
    window.__formModal=window.__modal.openModal({title:'Synthetic form',body:input,
      onRequestClose:()=>input.value==='initial'||window.__modal.confirmDialog({title:'Discard?',lines:['Unsaved fixture'],confirmLabel:'Leave',cancelLabel:'Stay'})});
    input.value='pending';
    void window.__guard.requestLeave();
  })()`); await wait(100); await clickDialog(false);
  await check("form-modal-cancel-retains-input-and-dirty-guard", "window.__modalInput.value==='pending'&&window.__guard.hasUnsavedChanges()");
  await evaluate("window.__formModal.setBusy(true);window.__busyLeave=window.__guard.requestLeave()");
  await check("busy-form-modal-blocks-navigation", "window.__busyLeave.then(value=>value===false)");
  await evaluate("window.__formModal.setBusy(false);window.__formModal.close()");
  await check("closed-modal-releases-guard", "!window.__guard.hasUnsavedChanges()");
  await evaluate(`(()=>{
    const input=document.createElement('input');input.value='before';
    window.__modal.openModal({title:'Cleanup fixture',body:input,onRequestClose:()=>false});
    input.value='after';
    window.__modal.closeAllModals();
  })()`);
  await check("route-modal-cleanup-releases-dirty-guards", "!window.__guard.hasUnsavedChanges()&&!document.querySelector('[role=dialog]')");
  assert.equal(errors.length, 0, errors.join("\n"));
  await finish(null, version);
})().catch(error => finish(error));

async function finish(error, browser) {
  const report = { browser, results, network, errors, ...(error ? { error: error.stack, lastExpression } : {}) };
  fs.writeFileSync(path.join(OUT, "m02-browser-results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: results.length, errors, error: error?.message, output: OUT }));
  try { await send("Browser.close"); } catch {}
  proc.kill(); if (error || errors.length) process.exitCode = 1;
}
