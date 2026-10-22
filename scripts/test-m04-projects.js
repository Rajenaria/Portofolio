/* Native Chrome/CDP, no dependencies. All requests are fulfilled or denied.
   Run: node scripts/test-m04-projects.js [external-output-directory]
   This is fixture integration, not a real Auth/Storage security test. */
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const ROOT = path.resolve(__dirname, "..");
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m04-browser-"));
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

// Synthetic rows and all storage bytes are supplied in memory, never forwarded.
let apiMode = "normal", content = "short", savedRecord = null;
const project = (i = 0) => ({id: "p" + i, slug: "fixture-" + i, title: content === "long" ? "Synthetic project ".repeat(12) : "Fixture project " + i,
  card_category: "Synthetic", short_description: content === "empty" ? "" : content === "long" ? "Long description ".repeat(25) : "Synthetic description",
  detail_intro: "Synthetic intro", role: "Fixture role", project_type: "Fixture", about_heading: "About", project_date: "2026-01-01",
  status: "published", deleted_at: null, published_at: "2026-01-01", created_at: "2026-01-01", updated_at: "2026-01-01",
  cover_bucket: "portfolio-media", cover_desktop_path: `projects/${i % 2 ? "portrait" : "landscape"}-desktop.webp`,
  cover_mobile_path: `projects/${i % 2 ? "portrait" : "landscape"}-mobile.webp`, cover_alt: "Synthetic cover",
  cover_fit: i % 2 ? "contain" : "cover", cover_position_x: 20, cover_position_y: 80,
  project_technologies: [], project_media: [], project_paragraphs: []});
const rows = () => savedRecord ? [savedRecord] : Array.from({length: count}, (_, i) => project(i));
const mime = {".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".png":"image/png", ".webp":"image/webp", ".jpg":"image/jpeg"};
on("Fetch.requestPaused", async (event, sid) => {
  const url = new URL(event.request.url); let body = "Denied", status = 403, type = "text/plain", decision = "blocked";
  if (["http://127.0.0.1:47832", "http://127.0.0.1:54321"].includes(url.origin)) {
    status = 200; decision = "fixture";
    if (url.pathname.startsWith("/rest/v1/")) {
      type = "application/json";
      if (url.pathname.endsWith("projects")) {
        if (apiMode === "missing" && url.searchParams.get("select")?.includes("cover_fit")) {
          status = 400; body = JSON.stringify({code:"42703",message:"column projects.cover_fit does not exist"});
        } else if (apiMode === "failure") { status = 500; body = JSON.stringify({code:"XX000",message:"synthetic failure"}); }
        else {
          let data = rows();
          if (url.searchParams.has("slug")) data = data.filter(r => "eq." + r.slug === url.searchParams.get("slug"));
          if (apiMode === "legacy" || apiMode === "missing") data = data.map(({cover_fit, cover_position_x, cover_position_y, ...row})=>row);
          if (apiMode === "invalid") data = data.map(row=>({...row,cover_fit:"url(javascript:bad)",cover_position_x:-1,cover_position_y:"90;bad"}));
          body = JSON.stringify(data);
        }
      } else body = "[]";
    } else if (url.pathname.startsWith("/storage/") || url.pathname === "/fixture-cover.svg") {
      type="image/svg+xml";
      const portrait=url.pathname.includes("portrait");
      body=`<svg xmlns="http://www.w3.org/2000/svg" width="${portrait?400:1200}" height="${portrait?1200:600}"><rect width="100%" height="100%" fill="#dde8f8"/><rect x="4%" y="4%" width="92%" height="92%" fill="none" stroke="#0071e3" stroke-width="8"/><text x="10%" y="50%" font-size="36">SYNTHETIC ${portrait?"PORTRAIT":"LANDSCAPE"}</text></svg>`;
    } else if(url.pathname==="/admin-fixture.html") {
      type="text/html";body='<html><head><link rel="stylesheet" href="/admin/admin.css"></head><body><div id="app"></div><div id="admin-modal-root"></div><div id="admin-toast-root"></div></body></html>';
    } else if(url.pathname==="/admin/js/core/supabase.js") {type="text/javascript";body="export const supabaseClient=window.__client;";}
    else if(url.pathname==="/js/guestbook.js") {type="text/javascript";body="/* denied in fixture */";}
    else {
      const file=path.resolve(ROOT,"."+decodeURIComponent(url.pathname==="/"?"/index.html":url.pathname));
      if(file.startsWith(ROOT+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){body=fs.readFileSync(file);type=mime[path.extname(file)]||"application/octet-stream";}
      else {status=404;body="Unavailable";}
    }
  }
  network.push({url:url.origin+url.pathname,query:url.search,decision,status});
  try { await send("Fetch.fulfillRequest",{requestId:event.requestId,responseCode:status,responseHeaders:[{name:"Content-Type",value:type},{name:"Cache-Control",value:"no-store"},{name:"Access-Control-Allow-Origin",value:"*"},{name:"Access-Control-Allow-Headers",value:"*"}],body:Buffer.from(body).toString("base64")},sid); }
  catch(error){if(!error.message.includes("Invalid InterceptionId"))errors.push(error.message);}
});
on("Runtime.exceptionThrown",event=>errors.push(event.exceptionDetails.exception?.description||event.exceptionDetails.text));
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


async function navigate(page="index.html") {
  await send("Page.navigate",{url:"http://127.0.0.1:47832/"+page},session); await wait(150);
}
async function refresh(amount, mode="short") {
  count=amount;content=mode;
  await evaluate(`import('/js/cms/projects.js?fixture=${Date.now()}-${Math.random()}').then(()=>true)`);
  await waitFor(`document.querySelectorAll('#projectGrid .project-card:not(.project-card-clone)').length===${amount}`);
  await wait(200);
}
async function shot(name) {
  const result=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false},session);
  fs.writeFileSync(path.join(OUT,name+".png"),Buffer.from(result.data,"base64"));
}
async function setField(id,value) {
  await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
}
const adminMock = record => `(async()=>{
 window.__row=${JSON.stringify(record)};window.__reads=[];window.__writes=[];window.__fault=null;window.__saved=0;
 window.__client={from(table){let op=null,body=null,single=false,columns='';const q={
 select(c){columns=c;return q},eq(){return q},is(){return q},match(){return q},order(){return q},limit(){return q},
 maybeSingle(){single=true;return q},single(){single=true;return q},update(v){op='update';body=v;return q},insert(v){op='insert';body=v;return q},delete(){op='delete';return q},in(){return q},
 then(resolve){
  if(!op)window.__reads.push({table,columns});
  if(table==='projects'&&window.__schemaAbsent&&((op&&Object.hasOwn(body||{},'cover_fit'))||columns.includes('cover_fit')))return resolve({data:null,error:{code:'PGRST204',message:'Missing cover_fit in schema cache'}});
  if(op){window.__writes.push({table,op,body});if(window.__fault)return resolve({data:null,error:{code:'TEST',message:'synthetic write failure'}});if(table==='projects')Object.assign(window.__row,body,{updated_at:'2026-10-19'});}
  let data=table==='projects'?[structuredClone(window.__row)]:table==='project_paragraphs'?[{id:'para',content:'Synthetic paragraph',sort_order:0}]:[];
  if(table==='projects'&&window.__schemaAbsent)data=data.map(({cover_fit,cover_position_x,cover_position_y,...row})=>row);
  return resolve({data:single?data[0]||null:data,error:null});}};return q},storage:{from(){return {getPublicUrl(){return {data:{publicUrl:'/fixture-cover.svg'}}},info:async path=>({data:{path}}),createSignedUrl:async()=>({data:{signedUrl:'/fixture-cover.svg'}}),remove:async()=>{throw Error('Unexpected storage removal')}}}}};
 window.__editorModule=await import('/admin/js/modules/projects/editor-view.js');
 window.__mount=(available=true)=>{window.__editor?.destroy();document.getElementById('app').replaceChildren();
 window.__editor=window.__editorModule.createProjectEditor({record:structuredClone(window.__row),coverSchemaAvailable:available,paragraphs:[{id:'para',content:'Synthetic paragraph',sort_order:0}],onDirtyChange:()=>{},onSaved:()=>window.__saved++,onBack:()=>{}});
 document.getElementById('app').appendChild(window.__editor.element);};window.__mount();return true;
})()`;
(async()=>{
 const version=await send("Browser.getVersion");
 const target=await send("Target.createTarget",{url:"about:blank"});
 session=(await send("Target.attachToTarget",{targetId:target.targetId,flatten:true})).sessionId;
 await send("Target.activateTarget",{targetId:target.targetId});
 await send("Fetch.enable",{patterns:[{urlPattern:"*"}]},session);await send("Runtime.enable",{},session);await send("Page.enable",{},session);
 count=3;await navigate();await waitFor("!!window.refreshProjectCarousel&&document.querySelector('#projectGrid img[data-cover-fit]')");
 await waitFor("!document.documentElement.classList.contains('is-loading')&&!document.querySelector('.loader')");
 await check("external-network-denied","fetch('https://network-denied.invalid/probe').then(r=>r.status===403)");
 if(!process.argv.includes("--admin-only")) {
 for(const width of (process.argv.includes("--interactions-only") ? [] : [1280,768,390])) {
  await send("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:false},session);
  for(const mode of ["short","long","empty"]) for(const amount of [1,2,3,8,20]) {
   await refresh(amount,mode);
   await check(`layout-${width}-${mode}-${amount}`,`(()=>{const g=document.getElementById('projectGrid'),cards=[...g.querySelectorAll('.project-card:not(.project-card-clone)')],images=cards.map(c=>c.querySelector('.project-image').getBoundingClientRect());return cards.length===${amount}&&images.every(r=>Math.abs(r.width/r.height-1.5)<.03)&&Math.max(...cards.map(c=>c.offsetHeight))-Math.min(...cards.map(c=>c.offsetHeight))<2&&document.documentElement.scrollWidth<=innerWidth+1&&document.querySelectorAll('.project-carousel-controls').length===1})()`);
  }
  // Offscreen lazy images have no currentSrc until requested; force loading in this fixture only.
  await evaluate("document.querySelectorAll('#projectGrid img').forEach(i=>{i.loading='eager'})");
  await waitFor("[...document.querySelectorAll('#projectGrid img')].every(i=>i.complete&&i.naturalWidth>0)");
  await check(`responsive-selection-${width}`,`[...document.querySelectorAll('#projectGrid img')].every(i=>i.currentSrc.includes('${width<=650?'mobile':'desktop'}'))`);
 }
 await refresh(0);await check("empty-list-hides-section","document.getElementById('portfolio').hidden&&document.querySelectorAll('#projectGrid .project-card').length===0");
 // New page restores the static shell after a successful empty response.
 await refresh(2);
 await check("empty-to-populated-refresh-restores-section", "!document.getElementById('portfolio').hidden&&document.querySelectorAll('#projectGrid .project-card:not(.project-card-clone)').length===2");
 count=8;content="short";await navigate();await waitFor("document.querySelectorAll('#projectGrid img[data-cover-fit]').length>=8");
 await evaluate("document.getElementById('portfolio').scrollIntoView({block:'start'});document.querySelector('.project-carousel-control').blur()");await wait(500);
 await evaluate("window.__before=document.getElementById('projectGrid').scrollLeft");await wait(500);
 await check("autoplay-moves","document.getElementById('projectGrid').scrollLeft>window.__before+5");
 await evaluate("document.getElementById('portfolio').dispatchEvent(new PointerEvent('pointerenter',{pointerType:'mouse'}));document.querySelectorAll('.project-scroll-bar')[1].click()");await wait(800);
 await evaluate("window.__before=document.getElementById('projectGrid').scrollLeft");await wait(2900);
 await check("hover-holds-after-watchdog","Math.abs(document.getElementById('projectGrid').scrollLeft-window.__before)<2");
 await evaluate("document.getElementById('portfolio').dispatchEvent(new PointerEvent('pointerleave',{pointerType:'mouse'}));document.querySelector('#projectGrid .project-link').focus();window.__before=document.getElementById('projectGrid').scrollLeft");await wait(2900);
 await check("focus-holds-after-timeout","Math.abs(document.getElementById('projectGrid').scrollLeft-window.__before)<2");
 await evaluate("document.activeElement.blur();document.querySelectorAll('.project-carousel-control')[1].click();window.__before=document.getElementById('projectGrid').scrollLeft");await wait(700);
 await check("manual-pause","document.querySelectorAll('.project-carousel-control')[1].getAttribute('aria-pressed')==='true'&&Math.abs(document.getElementById('projectGrid').scrollLeft-window.__before)<2");
 await evaluate("document.querySelectorAll('.project-carousel-control')[1].click()");await wait(500);
 await check("manual-resume","document.getElementById('projectGrid').scrollLeft>window.__before+3");
 await evaluate("document.getElementById('projectGrid').focus();document.getElementById('projectGrid').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))");await wait(700);
 await check("keyboard-end","document.querySelectorAll('#projectGrid .project-card:not(.project-card-clone)')[7].classList.contains('is-current')");
 await evaluate("for(let i=0;i<9;i++)document.querySelectorAll('.project-carousel-control')[2].click()");await wait(700);
 await check("rapid-navigation-consistent","document.querySelectorAll('#projectGrid .project-card.is-current').length===1&&document.querySelectorAll('#projectGrid .project-card:not(.project-card-clone)')[0].classList.contains('is-current')");
 await send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]},session);
 await waitFor("document.querySelectorAll('.project-carousel-control')[1].disabled");
 await evaluate("document.activeElement.blur();window.__before=document.getElementById('projectGrid').scrollLeft");await wait(600);
 await check("reduced-motion-stops-autoplay","document.querySelectorAll('.project-carousel-control')[1].disabled&&Math.abs(document.getElementById('projectGrid').scrollLeft-window.__before)<2");
 await check("contain-no-hover-scale","(()=>{const c=[...document.querySelectorAll('#projectGrid .project-card')].find(c=>c.querySelector('img')?.dataset.coverFit==='contain');const i=c.querySelector('img');return getComputedStyle(i).objectFit==='contain'&&getComputedStyle(i).objectPosition==='20% 80%'&&getComputedStyle(i).transform==='none'})()");
 await evaluate("document.getElementById('projectGrid').scrollLeft=0;window.__clicked=0;document.getElementById('projectGrid').addEventListener('click',()=>window.__clicked++)");
 await evaluate("(()=>{const g=document.getElementById('projectGrid');g.dispatchEvent(new PointerEvent('pointerdown',{pointerId:77,pointerType:'mouse',clientX:300,clientY:100,bubbles:true}));g.dispatchEvent(new PointerEvent('pointermove',{pointerId:77,pointerType:'mouse',clientX:170,clientY:100,bubbles:true}));g.dispatchEvent(new PointerEvent('pointerup',{pointerId:77,pointerType:'mouse',clientX:170,clientY:100,bubbles:true}));g.dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true,cancelable:true}));return true})()");
 await check("drag-suppresses-ghost-click","document.getElementById('projectGrid').scrollLeft>50&&window.__clicked===0&&!document.getElementById('projectGrid').classList.contains('is-dragging')");
 // Native mouse hit-testing verifies contain remains unscaled during a real hover.
 await evaluate("document.getElementById('portfolio').scrollIntoView({block:'start'});document.getElementById('projectGrid').focus();document.getElementById('projectGrid').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));document.querySelectorAll('.project-carousel-control')[2].click()");await wait(250);
 const hoverPoint=await evaluate("(()=>{const i=[...document.querySelectorAll('#projectGrid .project-card:not(.project-card-clone)')][1].querySelector('.project-image');const r=i.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
 await send("Input.dispatchMouseEvent",{type:"mouseMoved",x:hoverPoint.x,y:hoverPoint.y},session);await wait(250);
 await check("native-contain-hover-no-cropping", "(()=>{const c=[...document.querySelectorAll('#projectGrid .project-card:not(.project-card-clone)')][1];return c.matches(':hover')&&getComputedStyle(c.querySelector('img')).transform==='none'})()");
 await shot("public-projects");
 // Native touch swipe; all media remain synthetic and external requests stay denied.
 await send("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:1},session);
 await evaluate("document.activeElement.blur();document.getElementById('projectGrid').scrollLeft=0;window.__before=0");
 const touchPoint=await evaluate("(()=>{const r=document.querySelector('#projectGrid .project-image').getBoundingClientRect();return {x:Math.min(innerWidth-35,r.x+r.width*.8),y:Math.min(innerHeight-40,r.y+r.height/2)}})()");
 await send("Input.dispatchMouseEvent",{type:"mouseMoved",x:1,y:1},session);
 await send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:touchPoint.x,y:touchPoint.y}]},session);
 for(let step=1;step<=6;step++){await send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:touchPoint.x-step*20,y:touchPoint.y}]},session);await wait(20);}
 await send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]},session);await wait(150);
 await check("native-touch-swipe-scrolls-and-releases", "document.getElementById('projectGrid').scrollLeft>30&&!document.getElementById('projectGrid').classList.contains('is-dragging')");
 await send("Emulation.setTouchEmulationEnabled",{enabled:false},session);
 await send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"no-preference"}]},session);
 await waitFor("!document.querySelectorAll('.project-carousel-control')[1].disabled");
 await wait(2700);
 await send("Input.dispatchMouseEvent",{type:"mouseMoved",x:-10,y:-10},session);
 await wait(100);
 await evaluate("(()=>{const g=document.getElementById('projectGrid'),c=[...g.querySelectorAll('.project-card:not(.project-card-clone)')];window.__cycle=c.reduce((n,e)=>n+e.getBoundingClientRect().width,0)+parseFloat(getComputedStyle(g).columnGap)*c.length;g.scrollLeft=window.__cycle-3;document.activeElement.blur();document.getElementById('portfolio').dispatchEvent(new PointerEvent('pointerleave',{pointerType:'mouse'}));return true})()");await wait(650);
 await check("autoplay-wraps-equivalent-clone-position", "document.getElementById('projectGrid').scrollLeft<100");
 for(const mode of ["legacy","invalid","missing"]) {
  apiMode=mode;await refresh(3);
  await check(`metadata-${mode}-defaults`,"[...document.querySelectorAll('#projectGrid img')].every(i=>getComputedStyle(i).objectFit==='cover'&&getComputedStyle(i).objectPosition==='50% 50%')");
 }
 apiMode="failure";const before=network.filter(n=>n.url.endsWith('/rest/v1/projects')).length;await refresh(3);
 await check("failed-read-keeps-existing-cards","document.querySelectorAll('#projectGrid .project-card:not(.project-card-clone)').length===3");
 assert.equal(network.filter(n=>n.url.endsWith('/rest/v1/projects')).length-before,1);results.push({name:"server-failure-not-retried-as-schema",status:"PASS"});
 }
 apiMode="normal";
 await send("Emulation.setDeviceMetricsOverride",{width:390,height:900,deviceScaleFactor:1,mobile:false},session);
 await navigate("admin-fixture.html");const record=project();record.status="draft";record.published_at=null;
 await evaluate(adminMock(record));await wait(150);
 await check("admin-initial-preview-and-clean","!window.__editor.isDirty()&&getComputedStyle(document.querySelector('.project-cover-preview img')).objectFit==='cover'");
 await setField("project-cover-fit","contain");await setField("project-cover-x","10");await setField("project-cover-y","90");
 await waitFor("document.querySelector('.project-cover-preview img')?.style.objectPosition==='10% 90%'");
 await check("admin-live-preview-and-dirty","window.__editor.isDirty()&&getComputedStyle(document.querySelector('.project-cover-preview img')).objectFit==='contain'&&getComputedStyle(document.querySelector('.project-cover-preview img')).objectPosition==='10% 90%'");
 await check("admin-preview-ratio","(()=>{const r=document.querySelector('.project-cover-preview img').getBoundingClientRect();return Math.abs(r.width/r.height-1.5)<.03})()");
 await evaluate("document.querySelector('.editor-actions button:first-child').click()");await waitFor("!!document.querySelector('.project-preview-cover')");
 await check("admin-modal-preview-matches-settings", "window.__editor.isDirty()&&getComputedStyle(document.querySelector('.project-preview-cover')).objectFit==='contain'&&getComputedStyle(document.querySelector('.project-preview-cover')).objectPosition==='10% 90%'");
 await evaluate("import('/admin/js/core/modal.js').then(m=>m.closeAllModals())");
 await evaluate("document.querySelector('.editor-actions button:nth-child(2)').click()");await wait(200);
 await check("admin-save-persists-settings","window.__saved===1&&!window.__editor.isDirty()&&window.__row.cover_fit==='contain'&&window.__row.cover_position_x===10&&window.__row.cover_position_y===90");
 await evaluate("window.__mount()");await wait(100);
 await check("admin-reload-settings","document.getElementById('project-cover-fit').value==='contain'&&document.getElementById('project-cover-x').value==='10'&&document.getElementById('project-cover-y').value==='90'&&!window.__editor.isDirty()");
 for(const value of ["-1","101","1.5",""]) {
  await setField("project-cover-x",value);await evaluate("window.__beforeWrites=window.__writes.length;document.querySelector('.editor-actions button:nth-child(2)').click()");await wait(50);
  await check(`admin-invalid-position-${value||'empty'}`,"window.__writes.length===window.__beforeWrites&&window.__editor.isDirty()");
 }
 await setField("project-cover-x","25");await evaluate("window.__fault=true;document.querySelector('.editor-actions button:nth-child(2)').click()");await wait(100);
 await check("admin-db-error-retains-dirty","window.__editor.isDirty()&&window.__saved===1&&window.__row.cover_position_x===10");
 await evaluate("window.__fault=false;window.__schemaAbsent=true;document.querySelector('.editor-actions button:nth-child(2)').click()");await wait(100);
 await check("admin-schema-missing-no-success","window.__saved===1&&window.__editor.isDirty()&&/migrasi|migration/i.test(document.getElementById('admin-toast-root').textContent)");
 await evaluate("window.__schemaAbsent=false;window.__mount(false);document.getElementById('project-cover-x').value='15';document.getElementById('project-cover-x').dispatchEvent(new Event('input'));window.__beforeWrites=window.__writes.length;document.querySelector('.editor-actions button:nth-child(2)').click()");await wait(100);
 await check("admin-known-old-schema-blocks-save","window.__writes.length===window.__beforeWrites&&window.__editor.isDirty()");
 await evaluate("window.__mount()");
 // Publish uses the real editor and existing M01 lifecycle, against the in-memory client only.
 await evaluate("document.querySelector('.editor-actions button:nth-child(3)').click()");await wait(250);
 await check("admin-publish-retains-cover-metadata","window.__row.status==='published'&&window.__row.cover_fit==='contain'&&window.__row.cover_position_x===10&&window.__row.cover_position_y===90");
 savedRecord=await evaluate("structuredClone(window.__row)");
 await evaluate("(async()=>{window.__editor.destroy();document.getElementById('app').replaceChildren();window.__routeModule=await import('/admin/js/modules/projects/index.js');window.__routeCleanup=await window.__routeModule.projectsRoute.render(document.getElementById('app'),{signal:new AbortController().signal});return true})()");
 await waitFor("!!document.querySelector('.row-actions button')");
 await evaluate("document.querySelector('.row-actions button').click();document.querySelectorAll('.row-menu button')[1].click()");await waitFor("!!document.querySelector('.project-preview-cover')");
 await check("list-preview-reads-saved-cover-settings", "getComputedStyle(document.querySelector('.project-preview-cover')).objectFit==='contain'&&getComputedStyle(document.querySelector('.project-preview-cover')).objectPosition==='10% 90%'");
 await evaluate("(async()=>{(await import('/admin/js/core/modal.js')).closeAllModals();document.querySelector('.row-actions button').click();document.querySelector('.row-menu button').click();return true})()");
 await waitFor("!!document.getElementById('project-cover-fit')");
 await check("route-editor-selects-cover-metadata", "document.getElementById('project-cover-fit').value==='contain'&&window.__reads.filter(r=>r.table==='projects'&&r.columns.includes('cover_fit')).length>=2");
 await evaluate("(async()=>{window.__routeCleanup();document.getElementById('app').replaceChildren();window.__schemaAbsent=true;window.__routeCleanup=await window.__routeModule.projectsRoute.render(document.getElementById('app'),{signal:new AbortController().signal});return true})()");
 await waitFor("!!document.querySelector('.row-actions button')");
 await evaluate("document.querySelector('.row-actions button').click();document.querySelector('.row-menu button').click()");await waitFor("!!document.getElementById('project-cover-fit')");
 await check("route-old-schema-falls-back-for-inspection", "document.getElementById('project-cover-fit').value==='cover'&&document.getElementById('project-cover-x').value==='50'");
 await setField("project-cover-fit","contain");
 await evaluate("window.__beforeWrites=window.__writes.length;document.querySelector('.editor-actions button:nth-child(2)').click()");await wait(100);
 await check("route-old-schema-cannot-claim-save", "window.__writes.length===window.__beforeWrites&&/migrasi|migration/i.test(document.getElementById('admin-toast-root').textContent)");
 await evaluate("window.__routeCleanup()");
 await navigate();await waitFor("document.querySelector('#projectGrid img[data-cover-fit]')");
 await check("admin-to-cms-to-public","(()=>{const i=document.querySelector('#projectGrid img');return getComputedStyle(i).objectFit==='contain'&&getComputedStyle(i).objectPosition==='10% 90%'})()");
 await navigate("project.html?slug=fixture-0");await wait(300);
 await check("generic-detail-resolves-own-project","document.getElementById('projectTitle').textContent.includes('Fixture project 0')");
 await navigate("project.html?slug=unknown-fixture");await waitFor("document.getElementById('projectContent').hidden");
 await check("unknown-detail-is-neutral-not-found", "document.getElementById('projectStateTitle').textContent==='Project not found.'");
 apiMode="failure";
 await navigate("project.html?slug=fixture-0");await waitFor("document.getElementById('projectStateTitle').textContent==='Project could not be loaded.'");
 await check("failed-detail-does-not-show-wrong-content", "document.getElementById('projectContent').hidden");
 await navigate();await waitFor("!document.documentElement.classList.contains('is-loading')&&!document.querySelector('.loader')");
 await check("initial-cms-failure-keeps-compatible-legacy-link", "document.querySelectorAll('#projectGrid .project-card:not(.project-card-clone)').length===6&&[...document.querySelectorAll('#projectGrid a')].some(a=>a.getAttribute('href')==='projects/project-ecommerce.html')");
 apiMode="normal";
 await navigate("projects/project-ecommerce.html");
 await check("legacy-ecommerce-neutral","document.querySelector('main').textContent.includes('belum tersedia')&&!document.querySelector('main').textContent.includes('Football')&&[...document.querySelectorAll('a')].some(a=>a.getAttribute('href')==='../index.html#portfolio')");
 await navigate("projects/project-football-club.html");
 await check("legacy-football-content-preserved","document.querySelector('h1').textContent.includes('Football Club')");
 assert.equal(errors.length,0,errors.join('\n'));
 await finish(null,version);
})().catch(error=>finish(error));
async function finish(error,browser) {
 const failedExpression=lastExpression;
 if(error) {try{await shot('failure')}catch{}}
 const diagnostic=await evaluate("({active:document.activeElement?.outerHTML.slice(0,200),hover:document.getElementById('portfolio')?.matches(':hover'),section:document.getElementById('portfolio')?.getBoundingClientRect().toJSON(),cycle:window.__cycle,dirty:window.__editor?.isDirty(),fields:[...document.querySelectorAll('#project-cover-fit,#project-cover-x,#project-cover-y')].map(e=>({id:e.id,value:e.value})),image:document.querySelector('.project-cover-preview img')?.getAttribute('style'),heading:document.querySelector('h1')?.textContent,body:document.body.textContent.slice(-1400),row:window.__row,writes:window.__writes,saved:window.__saved,toasts:document.getElementById('admin-toast-root')?.textContent,preview:[...document.querySelectorAll('.project-cover-preview,.project-cover-preview img')].map(e=>({rect:e.getBoundingClientRect().toJSON(),height:getComputedStyle(e).height,padding:getComputedStyle(e).padding,aspect:getComputedStyle(e).aspectRatio})),reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,scroll:document.getElementById('projectGrid')?.scrollLeft,before:window.__before,button:document.querySelectorAll('.project-carousel-control')[1]?.outerHTML})").catch(()=>null);
 const summary={passed:results.length,failed:error?1:0};
 fs.writeFileSync(path.join(OUT,'m04-browser-results.json'),JSON.stringify({browser,summary,results,network,errors,diagnostic,savedRecord,...(error?{error:error.stack,lastExpression:failedExpression}:{})},null,2));
 console.log(JSON.stringify({...summary,error:error?.message,errors,output:OUT}));
 try{await send('Browser.close')}catch{}proc.kill();if(error||errors.length)process.exitCode=1;
}
