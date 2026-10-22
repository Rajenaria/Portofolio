// Real browser File -> M01 processor -> M09 client -> actual Edge handler. Storage/database stay synthetic.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {launch,ORIGIN,CMS}=require('./preview-portfolio'),{moduleAt}=require('./test-m09-contract'),fixture=require('./fixtures/portfolio-preview/fixture'),{snapshot}=require('./fixtures/portfolio-preview/project-snapshots'),{backend}=require('./fixtures/portfolio-preview/project-backend');
const ROOT=path.resolve(__dirname,'..'),OUT=process.argv[2]||fs.mkdtempSync(path.join(os.tmpdir(),'portfolio-m09-upload-browser-'));
if(path.resolve(OUT).startsWith(ROOT+path.sep)||path.resolve(OUT)===ROOT)throw Error('Evidence must be outside repository');fs.mkdirSync(OUT,{recursive:true});let p;
const results=[],wait=ms=>new Promise(r=>setTimeout(r,ms));function check(name,value){assert.equal(value,true,name);results.push({name,status:'PASS'});}
async function until(expression){const end=Date.now()+30000;while(Date.now()<end){if(await p.evaluate(expression))return;await wait(80);}throw Error('Timeout: '+expression);}
(async()=>{
 const m=await moduleAt(path.join(ROOT,'supabase/functions/_shared/project-service.js'));await m.evaluate();const initial=snapshot(fixture.tables().projects[0]),f=backend(initial),runtime={client:f.client,authorize:async h=>h==='Bearer fixture-owner-aal2'?'00000000-0000-4000-8000-000000000001':null,env:k=>k==='RATE_LIMIT_PEPPER'?'synthetic-local-only':undefined};
 const manage=m.namespace.createProjectHandler(runtime),asset=m.namespace.createProjectAssetHandler(runtime),routes={},routing=[];
 const add=(file,body,type='text/javascript')=>routes[ORIGIN+'/'+file]=()=>({body,type,status:200,kind:'m09-upload-fixture'});
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else if(file.endsWith('.js'))add(path.relative(ROOT,file).split(path.sep).join('/'),fs.readFileSync(file));}}walk(path.join(ROOT,'admin/js'));
 add('admin/admin.css',fs.readFileSync(path.join(ROOT,'admin/admin.css')),'text/css');
 add('admin/js/core/supabase.js',`export const supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'fixture-owner-aal2'}}})}};`);
 add('upload-fixture.html','<!doctype html><html><head><link rel="stylesheet" href="/admin/admin.css"></head><body><main id="app"></main><div id="admin-modal-root"></div><script type="module" src="/upload-fixture.js"></script></body></html>','text/html');
 add('upload-fixture.js',`import {createCaseStudyEditor} from '/admin/js/modules/projects/case-study-editor.js';import {projectCommand} from '/admin/js/core/project-client.js';const data=await projectCommand({id:'${initial.id}',action:'read'});window.__editor=createCaseStudyEditor({data,onBack(){}});document.querySelector('#app').append(window.__editor.element);window.__ready=true;`);
 for(const [name,handler]of [['manage-project',manage],['project-asset',asset]])routes[CMS+'/functions/v1/'+name]=async req=>{
  let body=req.postData||'';if(req.postDataEntries?.some(e=>e.bytes))body=Buffer.concat(req.postDataEntries.map(e=>Buffer.from(e.bytes||'','base64')));
  routing.push({endpoint:name,method:req.method,binaryEntries:!!req.postDataEntries?.length});
  const response=await handler(new Request(req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body}:{})}));
  return {status:response.status,type:response.headers.get('content-type')||'application/json',body:Buffer.from(await response.arrayBuffer()),kind:'m09-upload-handler-fixture'};
 };
 p=await launch({headless:true,_fixtureRoutes:routes});await p.send('Page.navigate',{url:ORIGIN+'/upload-fixture.html'},p.session);await until('window.__ready===true');
 const dom=await p.send('DOM.getDocument',{},p.session),input=await p.send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'input[type=file]'},p.session);
 const originalFile=path.join(ROOT,'assets/images/projects/web.webp'),originalBytes=fs.readFileSync(originalFile);
 await p.send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[originalFile]},p.session);
 // The card editor has destination help before its upload status. Check the
 // verified-upload message within that editor, not the first help paragraph.
 await until("[...document.querySelector('.m09-crop-editor').querySelectorAll('.form-help')].some(e=>e.textContent.includes('Asset terverifikasi'))");
 check('actual browser upload original and both generated derivatives',f.state.assets.size===1);
 const a=[...f.state.assets.values()][0];check('registry ready only after three components',a.state==='ready'&&Object.keys(a.components).length===3);
 check('original bytes retained exactly',Buffer.from(await f.state.objects.get('portfolio-project-assets|'+a.components.original.path).arrayBuffer()).equals(originalBytes));
 check('desktop processor bounds',Math.max(a.components.desktop.width,a.components.desktop.height)<=2000&&a.components.desktop.size<=5*1048576);
 check('mobile processor bounds',Math.max(a.components.mobile.width,a.components.mobile.height)<=1200&&a.components.mobile.size<=5*1048576);
 check('derivatives are WebP and paths independent',a.components.desktop.mime==='image/webp'&&a.components.mobile.mime==='image/webp'&&a.components.desktop.path!==a.components.mobile.path);
 check('upload does not change published snapshot',f.state.project.published_revision_id===initial.revision_id);
 check('upload placement participates in unsaved guard',await p.evaluate('window.__editor.isDirty()'));
 await p.evaluate("window.__coverNode=document.querySelector('.m09-crop-editor');document.querySelector('[data-tab=sections]').click();document.querySelector('[data-tab=general]').click()");
 check('same crop component survives tab switches',await p.evaluate("document.querySelector('.m09-crop-editor')===window.__coverNode"));
 check('pending uploaded placement retained across tabs',await p.evaluate("[...document.querySelector('.m09-crop-editor').querySelectorAll('.form-help')].some(e=>e.textContent.includes('Asset terverifikasi'))&&window.__editor.isDirty()"));
 await p.evaluate("[...document.querySelectorAll('.page-actions button')].find(b=>b.textContent==='Save Draft').click()");await until("!document.querySelector('.m09-editor').hasAttribute('aria-busy')");
 check('new asset placement saved to private draft',f.state.draft.payload.cover.asset_id===a.id);
 check('save readback clears dirty without publishing',await p.evaluate('!window.__editor.isDirty()')&&f.state.project.publication_version===1);
 let timer;const downloaded=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Private original download timed out')),15000);p.on('Browser.downloadProgress',event=>{if(event.state==='completed')resolve();});});
 await p.evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Unduh original (private)').click()");await downloaded;clearTimeout(timer);
 const files=fs.readdirSync(p.downloads).filter(name=>!name.endsWith('.crdownload'));
 check('private original downloads through authenticated UI',files.length===1);
 check('downloaded original matches retained source bytes',fs.readFileSync(path.join(p.downloads,files[0])).equals(originalBytes));
 const r=await p.send('Page.captureScreenshot',{format:'png'},p.session);fs.writeFileSync(path.join(OUT,'uploaded-private-crop.png'),Buffer.from(r.data,'base64'));
 check('all upload requests intercepted; no real connections',p.audit.realConnections===0&&p.audit.errors.length===0);
 await p.evaluate('window.__editor.destroy()');await p.stop();check('temporary profile cleaned',p.audit.cleanup==='PASS');
 fs.writeFileSync(path.join(OUT,'upload-browser-results.json'),JSON.stringify({classification:'FIXTURE VERIFIED; actual browser encoder/actual Edge handler, synthetic backend',passed:results.length,failed:0,results,components:a.components,routing,audit:p.audit},null,2));console.log(JSON.stringify({passed:results.length,failed:0,output:OUT}));
})().catch(async error=>{if(p){try{fs.writeFileSync(path.join(OUT,'diagnostic.json'),JSON.stringify({body:await p.evaluate('document.body.textContent.slice(-1500)')}));}catch{}await p.stop();}fs.writeFileSync(path.join(OUT,'upload-browser-results.json'),JSON.stringify({passed:results.length,failed:1,results,error:error.stack,audit:p?.audit},null,2));console.error(JSON.stringify({passed:results.length,failed:1,error:error.message,output:OUT}));process.exitCode=1;});
