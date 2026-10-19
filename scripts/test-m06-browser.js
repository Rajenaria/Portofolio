/* Native Chrome/CDP, no dependencies. All requests are fulfilled or denied.
   Run: node scripts/test-m06-browser.js [external-output-directory]
   This is fixture integration, not a real Auth/Storage security test. */
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const ROOT = path.resolve(__dirname, "..");
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m06-browser-"));
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

const {runtime,fixture,makePdf,OLD}=require('./test-m06-cv.js');
let api,backend,manage,delivery,publicMode='normal',blockManageRead=false;
const profile={id:'synthetic-profile',name:'Synthetic Owner',professional_title:'Developer',hero_description:'Synthetic description',about_heading_main:'About',about_heading_highlight:'Me',about_lead:'Synthetic',about_description:'Synthetic',about_photo_bucket:null,about_photo_desktop_path:null,about_photo_mobile_path:null,about_photo_alt:''};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.pdf':'application/pdf','.svg':'image/svg+xml'};
on('Fetch.requestPaused',async(event,sid)=>{
 const u=new URL(event.request.url);let body='Denied',status=403,type='text/plain',decision='blocked',extra=[];
 try{
 if(['http://127.0.0.1:47832','http://127.0.0.1:54321'].includes(u.origin)){
  decision='fixture';status=200;
  if(event.request.method==='OPTIONS'){status=204;body='';}
  else if(u.pathname.startsWith('/functions/v1/')){
   const isManage=u.pathname.endsWith('manage-cv');
   if(isManage&&blockManageRead&&event.request.method==='GET'){status=503;body='{"code":"UNCONFIRMED"}';type='application/json'}
   else {
    let data=event.request.postData;
    if(event.request.hasPostData&&!data){data=(await send('Network.getRequestPostData',{requestId:event.networkId},sid)).postData}
    const req=new Request(u,{method:event.request.method,headers:event.request.headers,...(event.request.method==='POST'?{body:data||''}:{})});
    const r=await(isManage?manage:delivery)(req);status=r.status;body=Buffer.from(await r.arrayBuffer());type=r.headers.get('content-type');extra=[...r.headers].filter(([k])=>!['content-type','access-control-allow-origin','access-control-allow-headers'].includes(k)).map(([name,value])=>({name,value}));
   }
  }else if(u.pathname.startsWith('/rest/v1/')){
   type='application/json';body='[]';
   if(u.pathname.endsWith('profile_content')){
    const cvQuery=u.searchParams.get('select')?.includes('cv_version');
    if(cvQuery&&publicMode==='failure'){status=500;body='{"code":"TEST","message":"synthetic failure"}'}
    else if(cvQuery&&publicMode==='legacy'){status=400;body='{"code":"42703","message":"column cv_version does not exist"}'}
    else {let cv={...backend.state.row};if(publicMode==='empty')cv=Object.fromEntries(Object.keys(cv).map(k=>[k,null]));if(publicMode==='invalid')cv.cv_size_bytes=null;
     body=JSON.stringify(publicMode==='missing'?[]:[{...profile,...cv}]);}
   }
  }else if(u.pathname==='/admin-fixture.html'){type='text/html';body='<html><head><link rel="stylesheet" href="/admin/admin.css"></head><body><div id="app"></div><div id="admin-modal-root"></div><div id="admin-toast-root"></div></body></html>'}
  else if(u.pathname==='/admin/js/core/supabase.js'){type='text/javascript';body='export const supabaseClient=window.__client;'}
  else if(u.pathname==='/js/guestbook.js'){type='text/javascript';body='/* disabled in isolated fixture */'}
  else {const file=path.resolve(ROOT,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));if(file.startsWith(ROOT+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){body=fs.readFileSync(file);type=mime[path.extname(file)]||'application/octet-stream'}else{status=404;body='Unavailable'}}
 }
 network.push({path:u.origin+u.pathname,decision,status});
 await send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:type||'application/octet-stream'},{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Headers',value:'*'},{name:'Access-Control-Allow-Methods',value:'GET,POST,OPTIONS'},{name:'Access-Control-Expose-Headers',value:'Content-Disposition,X-Content-Type-Options'},...extra],body:Buffer.from(body).toString('base64')},sid);
 }catch(error){errors.push('Interception: '+error.message);try{await send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'},sid)}catch{}}
});
on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
async function evaluate(expression){lastExpression=expression;const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
async function check(name,expression){const value=await evaluate(expression);assert.equal(value,true,name+': '+JSON.stringify(value));results.push({name,status:'PASS'})}
function nodeCheck(name,value){assert(value,name);results.push({name,status:'PASS'})}
async function waitFor(expression){const until=Date.now()+12000;while(Date.now()<until){if(await evaluate(expression))return;await wait(75)}throw Error('Fixture did not settle: '+expression)}
async function navigate(page='index.html'){await send('Page.navigate',{url:'http://127.0.0.1:47832/'+page},session);await wait(150)}
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png'},session);fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(r.data,'base64'))}
async function publicReady(){await waitFor("document.querySelectorAll('[data-cv-download]').length===2&&(!document.querySelector('[data-cv-download]').hasAttribute('aria-disabled')||!document.getElementById('cvRetry').hidden)")}
async function select(name){const doc=await send('DOM.getDocument',{},session);const q=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#profile-cv-file'},session);await send('DOM.setFileInputFiles',{nodeId:q.nodeId,files:[path.join(OUT,name)]},session);await waitFor("!document.getElementById('profile-cv-file').disabled")}
async function admin(){await navigate('admin-fixture.html');await evaluate(`(async()=>{
 window.__profile=${JSON.stringify(profile)};window.__writes=[];
 window.__client={auth:{getSession:async()=>({data:{session:{access_token:'owner-aal2'}}})},from(table){let body=null,single=false;const q={select(){return q},eq(){return q},order(){return q},maybeSingle(){single=true;return q},update(v){body=v;return q},then(resolve){if(body){window.__writes.push({table,body});Object.assign(window.__profile,body)}let data=table==='profile_content'?[window.__profile]:table==='about_organization'?[{id:'org',heading_main:'Organization',heading_highlight:'',paragraph_1:'Synthetic',paragraph_2:''}]:[];resolve({data:single?data[0]||null:data,error:null})}};return q}};
 const {profileRoute}=await import('/admin/js/modules/profile/index.js');window.__destroy=await profileRoute.render(document.getElementById('app'),{signal:new AbortController().signal});document.getElementById('profile-tab-cv').click();return true})()`);await waitFor("document.getElementById('profile-cv-file')&&!document.getElementById('profile-cv-file').disabled")}
function fault(name){backend.state.fault=name;backend.state.consumed=false}
(async()=>{
 api=await runtime().load('supabase/functions/_shared/cv-service.js');backend=fixture();manage=api.createManageCvHandler(backend);delivery=api.createCvDeliveryHandler(backend);
 fs.writeFileSync(path.join(OUT,'replacement.pdf'),makePdf());fs.writeFileSync(path.join(OUT,'spoof.pdf'),'not a PDF');fs.writeFileSync(path.join(OUT,'empty.pdf'),'');fs.writeFileSync(path.join(OUT,'large.pdf'),Buffer.alloc(5242881));fs.writeFileSync(path.join(OUT,'wrong.txt'),makePdf());
 const version=await send('Browser.getVersion');const target=await send('Target.createTarget',{url:'about:blank'});session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
 await send('Fetch.enable',{patterns:[{urlPattern:'*'}]},session);await send('Runtime.enable',{},session);await send('Page.enable',{},session);
 await navigate();await publicReady();
 await check('network-external-denied',"fetch('https://network-denied.invalid/probe').then(r=>r.status===403)");
 await check('hero-footer-one-active-url',`(()=>{const a=[...document.querySelectorAll('[data-cv-download]')];return a.every(x=>x.href.endsWith('/functions/v1/cv-document?v=${OLD}')&&!x.hasAttribute('download')&&!x.hasAttribute('aria-disabled'))})()`);
 await check('public-response-bytes-and-no-store',`fetch(document.querySelector('[data-cv-download]').href).then(async r=>r.ok&&r.headers.get('cache-control').includes('no-store')&&r.headers.get('content-disposition').includes('attachment')&&(await r.text()).startsWith('%PDF-'))`);
 for(const mode of ['failure','invalid','missing']){publicMode=mode;await navigate();await publicReady();await check('public-fail-closed-'+mode,"[...document.querySelectorAll('[data-cv-download]')].every(a=>!a.hasAttribute('href')&&a.getAttribute('aria-disabled')==='true'&&a.tabIndex===-1)&&!document.getElementById('cvRetry').hidden")}
 publicMode='normal';await evaluate("document.getElementById('cvRetry').click()");await publicReady();await check('public-retry-recovers',"[...document.querySelectorAll('[data-cv-download]')].every(a=>a.hasAttribute('href')&&!a.hasAttribute('aria-disabled'))");
 for(const mode of ['empty','legacy']){publicMode=mode;await navigate();await publicReady();await check('confirmed-fallback-'+mode,"[...document.querySelectorAll('[data-cv-download]')].every(a=>a.getAttribute('href')==='assets/documents/CV-Rajendra Aria Nismara.pdf'&&a.hasAttribute('download'))")}
 publicMode='normal';await admin();
 await check('admin-shows-verified-active',"document.getElementById('profile-tab-panel').textContent.includes('Old.pdf')&&document.querySelector('#profile-tab-panel a').href.includes('/functions/v1/cv-document?v=')");
 for(const name of ['spoof.pdf','empty.pdf','large.pdf','wrong.txt']){await select(name);await check('client-rejects-'+name,"document.getElementById('profile-cv-save').disabled&&!document.getElementById('profile-tab-cv').querySelector('.tab-dirty')");nodeCheck('invalid-file-no-server-upload-'+name,backend.state.uploads===0)}
 await select('replacement.pdf');await check('staged-dirty-no-auto-upload',"!document.getElementById('profile-cv-save').disabled&&!!document.getElementById('profile-tab-cv').querySelector('.tab-dirty')");nodeCheck('selection-does-not-upload',backend.state.uploads===0);
 await evaluate("document.getElementById('profile-tab-about').click()");await waitFor("!!document.querySelector('[role=dialog]')");await check('CV-unsaved-navigation-dialog',"document.querySelector('[role=dialog]').getAttribute('aria-modal')==='true'");
 await evaluate("document.querySelector('.modal-footer .admin-button-secondary').click()");await waitFor("!document.querySelector('[role=dialog]')");await check('cancel-navigation-retains-staged-CV',"!document.getElementById('profile-cv-save').disabled&&document.getElementById('profile-tab-cv').getAttribute('aria-selected')==='true'");
 fault('commit-reject');blockManageRead=true;await evaluate("document.getElementById('profile-cv-save').click()");await waitFor("!document.getElementById('profile-cv-save').disabled");
 nodeCheck('failed-activation-old-reference-survives',backend.state.row.cv_version===OLD&&backend.objects.has('cv/'+OLD+'.pdf')&&backend.objects.size===2);
 await check('unconfirmed-update-retains-staged-operation',"!!document.getElementById('profile-tab-cv').querySelector('.tab-dirty')&&!document.getElementById('profile-cv-save').disabled&&document.getElementById('profile-tab-panel').textContent.includes('Old.pdf')");
 blockManageRead=false;await evaluate("document.getElementById('profile-cv-save').click()");await waitFor("document.getElementById('profile-cv-save').disabled&&!document.getElementById('profile-tab-cv').querySelector('.tab-dirty')");
 nodeCheck('retry-reuses-unique-object-and-keeps-old',backend.objects.size===2&&backend.state.row.cv_version!==OLD&&backend.state.uploads===1);
 await check('confirmed-save-refreshes-admin-metadata',"document.getElementById('profile-tab-panel').textContent.includes('replacement.pdf')&&document.getElementById('profile-cv-file').value===''");await shot('admin-confirmed');
 const active=backend.state.row.cv_version;
 await evaluate("document.getElementById('profile-tab-hero').click()");await waitFor("!!document.getElementById('hero-name')");
 await evaluate("(()=>{const f=document.getElementById('hero-name');f.value='Changed Synthetic';f.dispatchEvent(new Event('input',{bubbles:true}));[...document.querySelectorAll('#profile-tab-panel button')].find(b=>b.classList.contains('admin-button-primary')).click()})()");await waitFor("window.__writes.length>0");
 await check('general-profile-payload-excludes-CV',"window.__writes.filter(w=>w.table==='profile_content').every(w=>Object.keys(w.body).every(k=>!k.startsWith('cv_')))&&window.__profile.name==='Changed Synthetic'");nodeCheck('general-profile-does-not-change-active-CV',backend.state.row.cv_version===active);
 await navigate();await publicReady();await check('admin-to-public-both-links-updated-after-reload',`[...document.querySelectorAll('[data-cv-download]')].every(a=>a.href.endsWith('?v=${active}'))`);
 await check('previous-version-rejected-after-activation',`fetch('http://127.0.0.1:54321/functions/v1/cv-document?v=${OLD}').then(r=>r.status===404&&r.headers.get('cache-control').includes('no-store'))`);
 await check('new-version-attachment-correct',"fetch(document.querySelector('[data-cv-download]').href).then(async r=>r.status===200&&r.headers.get('content-disposition').includes('replacement.pdf')&&r.headers.get('x-content-type-options')==='nosniff'&&(await r.text()).startsWith('%PDF-'))");
 await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.join(OUT,'downloads'),eventsEnabled:true});
 let downloaded=false;on('Browser.downloadProgress',e=>{if(e.state==='completed')downloaded=true});await evaluate("document.querySelector('[data-cv-download]').click()");for(let i=0;i<60&&!downloaded;i++)await wait(100);
 nodeCheck('actual-browser-attachment-download-completed',downloaded);nodeCheck('downloaded-bytes-exact',fs.readFileSync(path.join(OUT,'downloads','replacement.pdf')).equals(makePdf()));

 await admin();await select('replacement.pdf');fault('commit-ack-lost');await evaluate("document.getElementById('profile-cv-save').click()");await waitFor("document.getElementById('profile-cv-save').disabled&&!document.getElementById('profile-tab-cv').querySelector('.tab-dirty')");
 nodeCheck('lost-commit-ack-reconciled-before-success',backend.state.row.cv_version!==active&&backend.objects.size===3);
 await check('reconciled-success-not-pending',"document.getElementById('profile-cv-file').value===''&&document.getElementById('profile-tab-panel').textContent.includes('replacement.pdf')");
 await select('replacement.pdf');fault('limited');const beforeLimited=backend.state.row.cv_version;await evaluate("document.getElementById('profile-cv-save').click()");await waitFor("!document.getElementById('profile-cv-save').disabled");nodeCheck('rate-limit-does-not-activate',backend.state.row.cv_version===beforeLimited);
 await check('rate-limited-stays-dirty',"!!document.getElementById('profile-tab-cv').querySelector('.tab-dirty')");await evaluate("document.getElementById('profile-cv-discard').click()");await check('discard-clears-staging-only',"document.getElementById('profile-cv-save').disabled&&!document.getElementById('profile-tab-cv').querySelector('.tab-dirty')");
 fault('schema');await evaluate("document.getElementById('profile-cv-reload').click()");await waitFor("!document.getElementById('profile-cv-reload').disabled");
 await check('schema-error-feedback-no-success',"document.getElementById('profile-tab-panel').textContent.toLowerCase().includes('migrasi')");
 await evaluate("document.getElementById('profile-tab-about').click()");await waitFor("document.getElementById('profile-tab-about').getAttribute('aria-selected')==='true'");await check('CV-schema-error-does-not-break-other-tabs',"!!document.querySelector('#profile-tab-panel input,#profile-tab-panel textarea')");
 backend=fixture(null,{empty:true});manage=api.createManageCvHandler(backend);delivery=api.createCvDeliveryHandler(backend);await admin();await select('replacement.pdf');await evaluate("document.getElementById('profile-cv-save').click()");await waitFor("document.getElementById('profile-cv-save').disabled&&!document.getElementById('profile-tab-cv').querySelector('.tab-dirty')");nodeCheck('first-upload-from-unconfigured-profile',backend.state.row.cv_version!==null&&backend.state.uploads===1);
 nodeCheck('no-object-deletion-in-browser-workflow',backend.state.deleted.length===0);
 assert.equal(errors.length,0,errors.join('\n'));await finish(null,version);
})().catch(error=>finish(error));
async function finish(error,browser){const failedExpression=lastExpression;if(error)try{await shot('failure')}catch{}const diagnostic=await evaluate("({body:document.body.textContent.slice(-2000),links:[...document.querySelectorAll('[data-cv-download]')].map(a=>a.outerHTML),writes:window.__writes})").catch(()=>null);const summary={passed:results.length,failed:error?1:0};fs.writeFileSync(path.join(OUT,'m06-browser-results.json'),JSON.stringify({browser,summary,results,network,errors,diagnostic,...(error?{error:error.stack,lastExpression:failedExpression}:{})},null,2));console.log(JSON.stringify({...summary,error:error?.message,errors,output:OUT}));try{await send('Browser.close')}catch{}proc.kill();if(error||errors.length)process.exitCode=1}
