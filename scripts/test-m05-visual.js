/* Native Chrome/CDP, no dependencies. All requests are fulfilled or denied.
   Run: node scripts/test-m05-visual.js [external-output-directory]
   This is fixture integration, not a real Auth/Storage security test. */
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const ROOT = path.resolve(__dirname, "..");
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m05-browser-"));
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
let apiMode = "normal", content = "short", savedRecord = null, photoCount = 3, longProfile = false;
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
      } else if (url.pathname.endsWith("hero_media")) body=JSON.stringify(Array.from({length:photoCount},(_,i)=>({slot_number:i+1,bucket_name:"portfolio-media",desktop_path:`profile/portrait-${i}-desktop.webp`,mobile_path:`profile/portrait-${i}-mobile.webp`,alt_text:`Synthetic hero photo ${i+1}`,is_visible:true})));
      else if(url.pathname.endsWith("profile_content")&&longProfile) body=JSON.stringify([{name:"Synthetic Professional Portfolio Owner With A Longer Display Name",professional_title:"Synthetic engineer and accessibility reviewer",hero_description:"Long synthetic profile content for responsive verification. ".repeat(10)}]);
      else body = "[]";
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

async function key(value,code,number){for(const type of ["keyDown","keyUp"])await send("Input.dispatchKeyEvent",{type,key:value,code,windowsVirtualKeyCode:number,nativeVirtualKeyCode:number,...(type==='keyDown'&&value==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})},session);}
async function ready(){await waitFor("!!window.refreshHeroPhotoStack&&!document.documentElement.classList.contains('is-loading')&&!document.querySelector('.loader')");await waitFor(`document.getElementById('heroPhotoStack').dataset.count==='${photoCount}'`);await wait(180);}
(async()=>{
 const version=await send('Browser.getVersion');const target=await send('Target.createTarget',{url:'about:blank'});session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
 await send('Target.activateTarget',{targetId:target.targetId});await send('Fetch.enable',{patterns:[{urlPattern:'*'}]},session);await send('Runtime.enable',{},session);await send('Page.enable',{},session);
 await navigate();await ready();
 await check('external-network-denied',"fetch('https://network-denied.invalid/probe').then(r=>r.status===403)");
 await check('main-landmark-and-skip-link',"document.querySelectorAll('main').length===1&&document.querySelector('main').contains(document.getElementById('home'))&&!document.querySelector('main').contains(document.querySelector('footer'))&&document.querySelector('.skip-link').getAttribute('href')==='#mainContent'");
 await evaluate("document.querySelector('.skip-link').focus()");await key('Enter','Enter',13);
 await check('native-skip-link-activation',"document.activeElement.id==='mainContent'");
 const measurements=[];
 if(!process.argv.includes('--interactions-only')) {
 for(const [width,height] of [[1440,600],[1440,900],[1280,600],[1024,768],[768,1024],[650,900],[390,844],[280,720]])for(const amount of [1,2,3]){
  photoCount=amount;await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},session);await navigate();await ready();
  for(const state of ['rest','spread','focus-hover']){
   await evaluate("document.activeElement.blur();document.getElementById('heroPhotoStack').classList.remove('is-spread');window.scrollTo({top:0,behavior:'instant'})");
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:-10,y:-10},session);
   if(state!=='rest'&&amount>1)await evaluate("document.getElementById('heroPhotoStage').dispatchEvent(new PointerEvent('pointerenter',{pointerType:'mouse'}))");
   if(state==='focus-hover'&&amount>1){
    await evaluate("document.querySelector('.hero-photo-card').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'})");
    const point=await evaluate("(()=>{const r=document.querySelector('.hero-photo-card').getBoundingClientRect();return {x:r.x+r.width/2,y:Math.min(innerHeight-30,r.y+r.height/2)}})()");
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y},session);
   }
   await wait(450);
   const metric=await evaluate("(()=>{const n=document.getElementById('mainNav').getBoundingClientRect(),cards=[...document.querySelectorAll('.hero-photo-card')];return {gap:Math.min(...cards.map(c=>c.getBoundingClientRect().top))-n.bottom,overflow:document.documentElement.scrollWidth-innerWidth,selected:cards.filter(c=>c.getAttribute('aria-pressed')==='true').length,source:cards.every(c=>c.querySelector('source').media==='(max-width: 650px)'),disabled:cards.every(c=>c.disabled)}})()");
   assert(metric.gap>0&&metric.overflow<=0&&metric.selected===1&&metric.source&&(amount!==1||metric.disabled),JSON.stringify({width,height,amount,state,metric}));
   measurements.push({width,height,amount,state,...metric});results.push({name:`hero-${width}x${height}-${amount}-${state}`,status:'PASS'});
  }
 }
 photoCount=3;longProfile=true;
 for(const width of [1440,768,390,280]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},session);await navigate();await ready();
  await check(`cms-long-profile-${width}`,"document.querySelector('h1').textContent.includes('Synthetic Professional')&&document.documentElement.scrollWidth<=innerWidth&&document.querySelector('h1').scrollWidth<=document.querySelector('h1').clientWidth+1");
 }
 }
 longProfile=false;photoCount=3;
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false},session);await navigate();await ready();
 await evaluate("document.querySelector('.hero-photo-card').focus({preventScroll:true})");
 await check('hero-focus-opens-and-announces',"document.getElementById('heroPhotoStack').classList.contains('is-spread')&&[...document.querySelectorAll('.hero-photo-card')].every(c=>c.getAttribute('aria-expanded')==='true')");
 await evaluate("document.getElementById('heroPhotoStage').dispatchEvent(new PointerEvent('pointerleave',{pointerType:'mouse'}))");
 await check('hero-pointer-leave-keeps-keyboard-focus',"document.getElementById('heroPhotoStack').classList.contains('is-spread')");
 await key('Escape','Escape',27);await check('hero-escape-collapses',"!document.getElementById('heroPhotoStack').classList.contains('is-spread')");
 await evaluate("document.activeElement.blur();document.querySelectorAll('.hero-photo-card')[1].focus({preventScroll:true})");await key('Enter','Enter',13);await wait(700);
 await check('hero-native-enter-selects',"document.querySelectorAll('.hero-photo-card')[1].dataset.position==='0'&&document.querySelectorAll('.hero-photo-card')[1].getAttribute('aria-pressed')==='true'");
 await evaluate("for(let i=0;i<10;i++)window.refreshHeroPhotoStack();document.querySelector('.hero-photo-card').focus({preventScroll:true})");
 await check('hero-repeat-refresh-single-state',"document.querySelectorAll('.hero-photo-card').length===3&&document.querySelectorAll('.hero-photo-card[aria-pressed=true]').length===1");
 await evaluate("document.getElementById('mobileNavToggle').focus()");await key('Enter','Enter',13);
 await check('mobile-menu-opens',"document.getElementById('mobileNavToggle').getAttribute('aria-expanded')==='true'&&!document.getElementById('mobileNavMenu').inert");
 await evaluate("document.querySelector('#mobileNavMenu a').focus()");await key('Escape','Escape',27);
 await check('mobile-escape-restores-toggle',"document.activeElement.id==='mobileNavToggle'&&document.getElementById('mobileNavMenu').inert&&document.getElementById('mobileNavToggle').getAttribute('aria-expanded')==='false'");
 await check('about-inactive-panels-inert',"[...document.querySelectorAll('.about-full-slide')].filter(e=>e.inert).length===2&&document.querySelectorAll('.about-navigation-dot[aria-current=true]').length===1");
 await evaluate("document.getElementById('aboutFullNext').focus()");await key(' ','Space',32);await wait(150);
 await check('native-space-advances-about',"document.querySelectorAll('.about-full-slide')[0].inert&&!document.querySelectorAll('.about-full-slide')[1].inert");
 await key('ArrowRight','ArrowRight',39);
 await check('about-keyboard-arrow-and-current-dot',"!document.querySelectorAll('.about-full-slide')[2].inert&&document.querySelector('.about-navigation-dot[aria-current=true]').dataset.aboutIndex==='2'");
 await evaluate("document.querySelectorAll('.about-navigation-dot')[1].click();document.getElementById('aboutOrgNext').click()");
 await check('organization-hidden-photos-and-active-dot',"document.querySelectorAll('.about-org-photo[aria-hidden=false]').length===1&&document.querySelectorAll('.about-org-dot[aria-current=true]').length===1");
 await evaluate("document.querySelectorAll('.about-navigation-dot')[1].click();document.getElementById('aboutOrgNext').focus();document.querySelectorAll('.about-navigation-dot')[2].click()");
 await check('focus-leaves-inactive-panel',"document.activeElement.id==='aboutFullNext'&&!document.activeElement.closest('[inert]')");
 await evaluate("for(let i=0;i<31;i++)document.getElementById('aboutFullNext').click()");
 await check('about-rapid-navigation-consistent',"document.querySelectorAll('.about-full-slide[aria-hidden=false]').length===1&&document.querySelectorAll('.about-navigation-dot[aria-current=true]').length===1");
 await evaluate("document.querySelector('.simple-cv-button').focus({preventScroll:true})");
 await check('cta-keyboard-focus-visible',"getComputedStyle(document.querySelector('.simple-cv-button')).outlineStyle==='solid'&&getComputedStyle(document.querySelector('.simple-cv-button')).outlineWidth==='3px'");
 await evaluate("document.querySelector('footer').classList.remove('reveal-active');document.querySelector('footer a').focus({preventScroll:true})");
 await check('keyboard-focus-reveals-section',"document.querySelector('footer').classList.contains('reveal-active')");
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},session);
 await evaluate("document.getElementById('aboutFullNext').click()");
 await check('reduced-about-transition',"parseFloat(getComputedStyle(document.getElementById('aboutFullTrack')).transitionDuration)<=.001");
 await evaluate("document.querySelector('.hero-photo-card').focus({preventScroll:true});document.querySelectorAll('.hero-photo-card')[2].click()");await wait(30);
 await check('reduced-hero-does-not-retain-animation-lock',"!document.querySelector('.hero-photo-card.is-selecting')");
 await evaluate("window.scrollTo({top:120,behavior:'instant'})");await wait(150);
 await check('sticky-navbar-expands',"document.getElementById('mainNav').classList.contains('is-expanded')&&document.getElementById('mainNav').getBoundingClientRect().top>=9");
 await evaluate("window.scrollTo({top:0,behavior:'instant'})");await shot('m05-mobile');
 results.push({name:'favicon-all-entrypoints',status:'NOT RUN',reason:'Owner approved deferral until personal logo is selected.'});
 results.push({name:'native-zoom-200-other-browsers-physical-screen-reader',status:'NOT VERIFIED'});
 assert.equal(errors.length,0,errors.join('\n'));await finish(null,version,measurements);
})().catch(error=>finish(error));
async function finish(error,browser,measurements){
 const failedExpression=lastExpression;if(error){try{await shot('failure')}catch{}}
 const summary={passed:results.filter(r=>r.status==='PASS').length,failed:error?1:0,notRun:results.filter(r=>r.status==='NOT RUN').length,notVerified:results.filter(r=>r.status==='NOT VERIFIED').length};
 fs.writeFileSync(path.join(OUT,'m05-browser-results.json'),JSON.stringify({browser,summary,results,measurements,network,errors,...(error?{error:error.stack,lastExpression:failedExpression}:{})},null,2));
 console.log(JSON.stringify({...summary,error:error?.message,errors,output:OUT}));try{await send('Browser.close')}catch{}proc.kill();if(error||errors.length)process.exitCode=1;
}
