/* Actual frontend/admin modules + actual Edge handlers; all backend responses are synthetic. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {launch,ORIGIN,CMS}=require('./preview-portfolio'),fixture=require('./fixtures/portfolio-preview/fixture'),{snapshot}=require('./fixtures/portfolio-preview/project-snapshots'),{backend}=require('./fixtures/portfolio-preview/project-backend');
const {moduleAt}=require('./test-m09-contract');
const ROOT=path.resolve(__dirname,'..'),OUT=process.argv[2]||fs.mkdtempSync(path.join(os.tmpdir(),'portfolio-m09-browser-'));
if(path.resolve(OUT).startsWith(ROOT+path.sep)||path.resolve(OUT)===ROOT)throw Error('Evidence must be outside repository');fs.mkdirSync(OUT,{recursive:true});
const results=[],metrics=[],wait=ms=>new Promise(r=>setTimeout(r,ms));let p;
function check(name,value){assert.equal(value,true,name);results.push({name,status:'PASS'});}
async function until(expression){const end=Date.now()+20000;while(Date.now()<end){if(await p.evaluate(expression))return;await wait(80);}throw Error('Timed out: '+expression);}
async function checkBrowser(name,expression){check(name,await p.evaluate(expression));}
async function navigate(page='index.html'){await p.send('Page.navigate',{url:ORIGIN+'/'+page},p.session);}
async function shot(name){const r=await p.send('Page.captureScreenshot',{format:'png'},p.session);fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(r.data,'base64'));}
async function key(name){const n={Enter:13,Escape:27,Tab:9,ArrowRight:39}[name];for(const type of ['keyDown','keyUp'])await p.send('Input.dispatchKeyEvent',{type,key:name,code:name,windowsVirtualKeyCode:n,nativeVirtualKeyCode:n,...(type==='keyDown'&&name==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})},p.session);}
async function run(){
 const sm=await moduleAt(path.join(ROOT,'supabase/functions/_shared/project-service.js'));await sm.evaluate();const api=sm.namespace;
 const im=await moduleAt(path.join(ROOT,'supabase/functions/_shared/project-image.js'));const img=im.namespace;
 const initial=snapshot(fixture.tables().projects[0]),f=backend(initial),bytes=new Uint8Array(fs.readFileSync(path.join(ROOT,'assets/images/projects/web.webp'))),hash=await img.sha256(bytes);
 const components={};for(const c of ['original','desktop','mobile']){const m={...img.inspectImage(bytes,'image/webp',c!=='original'),hash,path:`${initial.id}/${initial.id}/${c}.webp`};components[c]=m;f.state.objects.set('portfolio-project-assets|'+m.path,new Blob([bytes],{type:'image/webp'}));}
 f.state.assets.set(initial.id,{id:initial.id,project_id:initial.id,state:'ready',components,provenance:'original-upload'});
 const runtime={client:f.client,authorize:async auth=>auth==='Bearer fixture-owner-aal2'?'00000000-0000-4000-8000-000000000001':null,env:k=>k==='RATE_LIMIT_PEPPER'?'synthetic-local-only':undefined};
 const manage=api.createProjectHandler(runtime),asset=api.createProjectAssetHandler(runtime);
 const routes={};
 function textRoute(relative,body,type='text/javascript'){routes[ORIGIN+'/'+relative]=()=>({status:200,body,type,kind:'m09-isolated-fixture'});}
 const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const name=path.join(dir,e.name);if(e.isDirectory())walk(name);else if(name.endsWith('.js'))files.push(name);}}walk(path.join(ROOT,'admin/js'));
 for(const file of files)textRoute(path.relative(ROOT,file).split(path.sep).join('/'),fs.readFileSync(file));
 textRoute('admin/admin.css',fs.readFileSync(path.join(ROOT,'admin/admin.css')),'text/css');
 textRoute('admin/js/core/supabase.js',`export const supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'fixture-owner-aal2'}}})}};`);
 textRoute('m09-admin.html','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/admin.css"><link rel="stylesheet" href="/css/project-case-study.css"></head><body><main id="app"></main><div id="admin-modal-root"></div><div id="admin-toast-root"></div><script type="module" src="/m09-admin-bootstrap.js"></script></body></html>','text/html');
 textRoute('m09-admin-bootstrap.js',`import {createCaseStudyEditor} from '/admin/js/modules/projects/case-study-editor.js';import {projectCommand} from '/admin/js/core/project-client.js';import {createCropEditor} from '/admin/js/modules/projects/crop-editor.js';import {createDraftMediaResolver} from '/admin/js/core/project-client.js';window.__reopen=async()=>{window.__editor?.destroy();const data=await projectCommand({action:'read',id:'${initial.id}'});window.__data=data;window.__editor=createCaseStudyEditor({data,onBack(){},technologies:[{id:'00000000-0000-4000-8000-000000000055',name:'Fixture technology'}]});document.querySelector('#app').replaceChildren(window.__editor.element);};window.__command=projectCommand;window.__cropFactory=createCropEditor;window.__resolver=createDraftMediaResolver;await window.__reopen();window.__ready=true;`);
 for(const [name,handler]of [['manage-project',manage],['project-asset',asset]])routes[CMS+'/functions/v1/'+name]=async request=>{
  const req=new Request(request.url,{method:request.method,headers:request.headers,...(request.method==='POST'?{body:request.postData||''}:{})});
  const r=await handler(req);return {status:r.status,body:Buffer.from(await r.arrayBuffer()),type:r.headers.get('content-type')||'application/json',kind:'m09-handler-fixture'};
 };
 const options={headless:true,projects:8,_fixtureRoutes:routes};p=await launch(options);
 await until("document.documentElement.classList.contains('is-loaded')&&document.querySelectorAll('#projectGrid .project-card').length===6");
 check('network interception active before app',p.audit.startupProbe==='PASS');
 await checkBrowser('initial six compact project cards',"document.querySelectorAll('#projectGrid .project-card').length===6&&!document.querySelector('#projectLoadMore').hidden");
 await checkBrowser('grid desktop 3 columns no horizontal overflow',"getComputedStyle(document.querySelector('#projectGrid')).display==='grid'&&getComputedStyle(document.querySelector('#projectGrid')).gridTemplateColumns.split(' ').length===3&&document.querySelector('#projectGrid').scrollWidth<=document.querySelector('#projectGrid').clientWidth+1");
 await checkBrowser('no project carousel controls/clones',"!document.querySelector('.project-card-clone,.project-carousel-control,#projectCarouselHelp')&&!window.refreshProjectCarousel");
 await checkBrowser('thumbnail 16:9 and responsive variant',"[...document.querySelectorAll('#projectGrid figure')].every(e=>getComputedStyle(e).aspectRatio==='16 / 9')&&document.querySelector('#projectGrid source').media==='(max-width: 650px)'");
 await checkBrowser('accessible dynamic category filters',"document.querySelectorAll('#projectFilters button').length===3&&document.querySelector('#projectFilters button').getAttribute('aria-pressed')==='true'");
 await p.evaluate("document.querySelector('#projectLoadMore').click()");
 await checkBrowser('load more shows all eight',"document.querySelectorAll('#projectGrid .project-card').length===8&&document.querySelector('#projectLoadMore').hidden");
 await p.evaluate("document.querySelectorAll('#projectFilters button')[1].click()");
 await checkBrowser('filter works across complete catalog',"document.querySelectorAll('#projectGrid .project-card').length===4&&document.querySelectorAll('#projectFilters button')[1].getAttribute('aria-pressed')==='true'");
 await checkBrowser('certification and hero preserved',"document.querySelectorAll('.cert-slot').length===8&&document.querySelectorAll('.hero-photo-card').length===3");
 await shot('homepage-desktop');
 for(const count of [0,1,6,7,20,1001]){
  p.tables.projects=fixture.tables({projects:count}).projects;const start=performance.now();await navigate();
  await until("document.querySelector('#portfolio')&&!document.querySelector('#portfolio').hasAttribute('aria-busy')&&document.documentElement.classList.contains('is-loaded')");
  const total=await p.evaluate("document.querySelectorAll('#projectGrid .project-card').length");check(`catalog ${count} initial count`,total===Math.min(6,count));
  check(`catalog ${count} count feedback complete`,await p.evaluate(`document.querySelector('#projectResults').textContent.includes(${JSON.stringify(count===0?'Belum ada':String(count)+' project')})`));
  metrics.push({scenario:'homepage-'+count,fixtureNavigationAndOpeningMs:Math.round(performance.now()-start)});
 }
 p.tables.projects=fixture.tables().projects;
 options.projectLegacy=true;await navigate();await until("document.querySelectorAll('#projectGrid .project-card').length===6");
 await checkBrowser('confirmed legacy schema retains M04 cover metadata',"[...document.querySelectorAll('#projectGrid img')].some(e=>e.style.objectFit==='contain')");
 await navigate('project.html?slug=demo-project-1');await until("document.querySelector('.pcs-hero h1')");
 await checkBrowser('legacy project renders only genuine stored content',"document.querySelector('.pcs-hero h1').textContent==='DEMO Project 1'&&!document.querySelector('.pcs-architecture-board')&&document.querySelector('.pcs-summary').textContent.includes('detail sintetis')");
 options.projectLegacy=false;options.projectMissingRpc=true;await navigate();await until("document.querySelector('#projectRetry')&&!document.querySelector('#projectRetry').hidden");
 await checkBrowser('partial versioned-schema rollout never falls back to legacy data',"document.querySelectorAll('#projectGrid .project-card').length===0&&document.querySelector('#projectResults').textContent.includes('gagal')");
 options.projectMissingRpc=false;
 options.projectError=true;await navigate();await until("document.querySelector('#projectRetry')&&!document.querySelector('#projectRetry').hidden");
 await checkBrowser('data failure distinct from empty and stale fallback',"document.querySelector('#projectResults').textContent.includes('gagal')&&document.querySelectorAll('#projectGrid .project-card').length===0");
 options.projectError=false;await p.evaluate("document.querySelector('#projectRetry').click()");await until("document.querySelectorAll('#projectGrid .project-card').length===6");check('retry recovers catalog',true);
 await navigate('project.html?slug=demo-project-1');await until("document.querySelector('.pcs-architecture-node')");
 await checkBrowser('prototype sections rendered by shared renderer',"document.querySelectorAll('.pcs-section').length===7&&document.querySelector('.pcs-sidebar')&&document.querySelectorAll('.pcs-toc a').length===8");
 await checkBrowser('sticky sidebar desktop',"getComputedStyle(document.querySelector('.pcs-sidebar')).position==='sticky'&&getComputedStyle(document.querySelector('.pcs-sidebar')).width==='280px'");
 await p.evaluate("document.querySelectorAll('.pcs-architecture-node')[1].focus()");await key('Enter');
 await checkBrowser('architecture keyboard selects panel',"document.querySelectorAll('.pcs-architecture-node')[1].getAttribute('aria-expanded')==='true'&&[...document.querySelectorAll('.pcs-architecture-panel')].filter(p=>!p.hidden).length===1");
 await checkBrowser('graph connections numeric and text alternative',"document.querySelectorAll('.pcs-connections path').length===2&&!document.querySelector('.pcs-connections path').getAttribute('d').includes('%')&&document.querySelectorAll('.pcs-relationships li').length===2");
 await p.evaluate("document.querySelector('.pcs-notes summary').click()");await wait(100);
 await checkBrowser('technical notes expanded semantics',"document.querySelector('.pcs-notes').open&&document.querySelector('.pcs-notes summary').getAttribute('aria-expanded')==='true'");
 await until("document.querySelector('.project-media-open')&&!document.querySelector('.project-media-open').disabled");
 await p.evaluate("document.querySelector('.project-media-open').focus();document.querySelector('.project-media-open').click()");
 await checkBrowser('native lightbox modal open with close focus',"document.querySelector('.pcs-lightbox').open&&document.activeElement.classList.contains('pcs-close')");
 await key('Escape');await wait(100);await checkBrowser('lightbox Escape closes and restores focus',"!document.querySelector('.pcs-lightbox')&&document.activeElement.classList.contains('project-media-open')");
 await shot('detail-desktop');
 for(const [width,height,columns]of [[800,1000,2],[390,844,1]]){
  await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},p.session);await navigate();await until(`document.querySelectorAll('#projectGrid .project-card').length===${width<=650?8:6}`);
  await checkBrowser('responsive project layout '+width,`getComputedStyle(document.querySelector('#projectGrid')).${width<=650?"display==='flex'":"gridTemplateColumns.split(' ').length==="+columns}&&document.documentElement.scrollWidth<=innerWidth+1`);
  await navigate('project.html?slug=demo-project-1');await until("document.querySelector('.pcs-mobile-toggle')");await p.evaluate("document.querySelector('.pcs-mobile-toggle').click()");
  await checkBrowser('mobile TOC and detail no clipping '+width,"document.querySelector('.pcs-mobile-toggle').getAttribute('aria-expanded')==='true'&&document.documentElement.scrollWidth<=innerWidth+1");
  await shot('detail-'+width);
 }
 await p.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},p.session);
 await navigate('project.html?slug=demo-project-1');await until("document.querySelector('.pcs-section')");await checkBrowser('reduced motion leaves content visible',"[...document.querySelectorAll('.pcs-section')].every(e=>getComputedStyle(e).opacity==='1'&&getComputedStyle(e).transform==='none')");
 await p.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},p.session);
 await navigate('m09-admin.html');await until('window.__ready===true');
 await checkBrowser('actual admin editor loads and starts clean',"!window.__editor.isDirty()&&document.querySelector('.m09-editor')!==null");
 await p.evaluate("const x=[...document.querySelectorAll('.form-field')].find(e=>e.querySelector('label')?.textContent==='Project title').querySelector('input');x.value='DEMO WORKING DRAFT ONLY';x.dispatchEvent(new Event('input',{bubbles:true}));");
 await checkBrowser('local edits tracked dirty',"window.__editor.isDirty()");
 await p.evaluate("[...document.querySelectorAll('.page-actions button')].find(b=>b.textContent==='Save Draft').click()");await until("!document.querySelector('.m09-editor').hasAttribute('aria-busy')");
 check('save draft leaves public revision unchanged',f.state.revisions.get(initial.revision_id).general.title===initial.payload.general.title&&f.state.draft.payload.general.title==='DEMO WORKING DRAFT ONLY');
 await checkBrowser('successful save clean only after readback',"!window.__editor.isDirty()&&document.querySelector('.m09-editor>p').textContent.includes('Draft v1')");
 await p.evaluate('window.__reopen()');await checkBrowser('reopen saved draft retains title',"[...document.querySelectorAll('input')].some(i=>i.value==='DEMO WORKING DRAFT ONLY')");
 await p.evaluate("[...document.querySelectorAll('.page-actions button')].find(b=>b.textContent==='Preview Draft').click()");await until("document.querySelector('.m09-preview .pcs-hero h1')");
 await checkBrowser('shared preview renderer contains working draft',"document.querySelector('.m09-preview .pcs-hero h1').textContent==='DEMO WORKING DRAFT ONLY'");
 await p.evaluate("window.__hashBefore=location.hash;document.querySelectorAll('.m09-preview .pcs-toc a')[1].click()");
 await checkBrowser('preview TOC does not change admin route',"location.hash===window.__hashBefore&&document.querySelector('.m09-preview')!==null");
 await until("document.querySelector('.m09-preview .project-media-open')&&!document.querySelector('.m09-preview .project-media-open').disabled");
 await p.evaluate("document.querySelector('.m09-preview .project-media-open').click()");await key('Escape');await wait(100);
 await checkBrowser('nested lightbox Escape preserves admin preview',"document.querySelector('.m09-preview')!==null&&!document.querySelector('.pcs-lightbox')");
 await p.evaluate("[...document.querySelectorAll('.modal-footer button')].find(b=>b.textContent==='Tutup').click()");
 await p.evaluate("[...document.querySelectorAll('.page-actions button')].find(b=>b.textContent==='Publish Draft').click()");await until("!document.querySelector('.m09-editor').hasAttribute('aria-busy')");
 check('admin publish activates saved revision',f.state.project.title==='DEMO WORKING DRAFT ONLY'&&f.state.project.publication_version===2);
 await p.evaluate("(()=>{const x=[...document.querySelectorAll('.form-field')].find(e=>e.querySelector('label')?.textContent==='Project title').querySelector('input');x.value='DEMO AMBIGUOUS SAVE';x.dispatchEvent(new Event('input',{bubbles:true}));})()");
 f.state.faults.add('save-ack');await p.evaluate("[...document.querySelectorAll('.page-actions button')].find(b=>b.textContent==='Save Draft').click()");await until("!document.querySelector('.m09-editor').hasAttribute('aria-busy')");
 await checkBrowser('ambiguous save keeps dirty/pending guard',"window.__editor.isDirty()&&[...document.querySelectorAll('.page-actions button')].find(b=>b.textContent==='Save Draft').disabled");
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;f.state.draft.payload=canonical(f.state.draft.payload);
 await p.evaluate("[...document.querySelectorAll('.page-actions button')].find(b=>b.textContent==='Rekonsiliasi').click()");await until("!document.querySelector('.m09-editor').hasAttribute('aria-busy')");
 await checkBrowser('save reconciliation tolerates JSONB key order',"!window.__editor.isDirty()");
 f.state.faults.add('activate-ack');await p.evaluate("[...document.querySelectorAll('.page-actions button')].find(b=>b.textContent==='Publish Draft').click()");await until("!document.querySelector('.m09-editor').hasAttribute('aria-busy')");
 await checkBrowser('ambiguous publish retains pending operation',"window.__editor.isDirty()&&sessionStorage.getItem('portfolio-project-operation:'+window.__data.project.id)!==null");
 await p.evaluate("[...document.querySelectorAll('.page-actions button')].find(b=>b.textContent==='Rekonsiliasi').click()");await until("!document.querySelector('.m09-editor').hasAttribute('aria-busy')");
 await checkBrowser('publish operation reconciles without duplicate activation',"!window.__editor.isDirty()&&sessionStorage.getItem('portfolio-project-operation:'+window.__data.project.id)===null");
 check('idempotent reconciliation keeps publication version',f.state.project.publication_version===3);
 f.state.faults.add('concurrent-save-after-activate');await p.evaluate("[...document.querySelectorAll('.page-actions button')].find(b=>b.textContent==='Publish Draft').click()");await until("!document.querySelector('.m09-editor').hasAttribute('aria-busy')");
 await checkBrowser('concurrent draft readback does not silently replace revision token',"document.querySelector('.m09-editor>p').textContent.includes('draft berubah di sesi lain')");
 await p.evaluate("(()=>{const x=[...document.querySelectorAll('.form-field')].find(e=>e.querySelector('label')?.textContent==='Project title').querySelector('input');x.value='STALE LOCAL EDIT';x.dispatchEvent(new Event('input',{bubbles:true}));[...document.querySelectorAll('.page-actions button')].find(b=>b.textContent==='Save Draft').click();})()");await until("!document.querySelector('.m09-editor').hasAttribute('aria-busy')");
 check('stale editor cannot overwrite concurrent draft',f.state.draft.payload.general.title==='CONCURRENT DRAFT CHANGE');
 await p.evaluate("[...document.querySelectorAll('.page-actions button')].find(b=>b.textContent==='Reload Draft').click()");await until("document.querySelector('.modal-footer')!==null");await p.evaluate("[...document.querySelectorAll('.modal-footer button')].find(b=>b.textContent==='Reload Draft').click()");await until("!document.querySelector('.m09-editor').hasAttribute('aria-busy')");
 await checkBrowser('explicit reload restores coherent payload and version',"!window.__editor.isDirty()&&[...document.querySelectorAll('input')].some(i=>i.value==='CONCURRENT DRAFT CHANGE')");
 await p.evaluate("[...document.querySelectorAll('.m09-editor-tabs button')].find(b=>b.dataset.tab==='sections').click()");
 await checkBrowser('all structured section editors available',"document.querySelectorAll('.m09-section-editor').length===7&&document.querySelectorAll('.m09-edge-editor').length===2");
 const phaseId=await p.evaluate("document.querySelector('.m09-section-editor[data-section-id] .m09-item-editor')?.dataset.itemId");
 await p.evaluate("const section=[...document.querySelectorAll('.m09-section-editor')].find(e=>e.querySelector('h2').textContent==='Development Journey');[...section.querySelector('.m09-item-editor .page-actions').children].find(b=>b.textContent==='↓').click()");
 await checkBrowser('phase reorder retains stable ID',`document.querySelectorAll('.m09-section-editor .m09-item-editor')[1].dataset.itemId===${JSON.stringify(phaseId)}`);
 await shot('admin-sections');
 // Crop geometry and destination preview use the production component independently of CMS form placement.
 await p.evaluate(`window.__cropValue=null;window.__media=window.__resolver();window.__crop=window.__cropFactory({project:'${initial.id}',placement:window.__data.draft.payload.cover,aspect:'card',resolver:window.__media.resolve,onChange:v=>window.__cropValue=v});document.querySelector('#app').replaceChildren(window.__crop.element);`);
 await until("document.querySelector('.m09-crop-viewport img').naturalWidth>0");
 await checkBrowser('draft media preview uses Blob URL',"document.querySelector('.m09-crop-viewport img').currentSrc.startsWith('blob:')");
 await p.evaluate("(()=>{const z=document.querySelector('input[type=number][max=\"3\"]');z.value='2';z.dispatchEvent(new Event('input'));const x=document.querySelector('input[type=number][max=\"100\"]');x.value='25';x.dispatchEvent(new Event('input'));})()");
 await checkBrowser('zoom/focal geometry persisted from UI',"window.__cropValue.crop.zoom===2&&window.__cropValue.crop.x===25&&document.querySelector('.m09-crop-viewport img').style.transform==='scale(2)'");
 await p.evaluate("document.querySelector('.m09-crop-viewport').focus()");await key('ArrowRight');
 await checkBrowser('crop viewport keyboard reposition',"window.__cropValue.crop.x===26");
 const box=await p.evaluate("(()=>{const e=document.querySelector('.m09-crop-viewport');e.scrollIntoView({block:'center',behavior:'instant'});const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()");
 await p.send('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x,y:box.y,button:'left',clickCount:1},p.session);
 await p.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.x+20,y:box.y+10,button:'left',buttons:1},p.session);
 await p.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x+20,y:box.y+10,button:'left',clickCount:1},p.session);
 await checkBrowser('crop drag repositions actual image geometry',"window.__cropValue.crop.x!==26||window.__cropValue.crop.y!==50");
 await p.evaluate("const f=document.querySelector('select');const fit=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='contain'));fit.value='contain';fit.dispatchEvent(new Event('change'));");
 await checkBrowser('contain resets zoom and preserves full image',"window.__cropValue.crop.fit==='contain'&&window.__cropValue.crop.zoom===1&&document.querySelector('.m09-crop-viewport img').style.objectFit==='contain'");
 await p.evaluate("const checkbox=document.querySelector('input[type=checkbox]');checkbox.checked=true;checkbox.dispatchEvent(new Event('change'));const zoom=document.querySelector('input[type=number][max=\"3\"]');");
 await checkBrowser('mobile override selects mobile source even on desktop',"window.__cropValue.crop.mobile.fit==='contain'&&document.querySelector('.m09-crop-viewport source').media==='all'");
 await p.evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Reset crop').click()");
 await checkBrowser('reset affects selected mobile placement only',"window.__cropValue.crop.mobile.zoom===1&&window.__cropValue.crop.mobile.x===50&&window.__cropValue.crop.fit==='contain'&&window.__data.draft.payload.hero.crop.zoom===1");
 metrics.push(await p.evaluate(`(async()=>{const {renderCaseStudy}=await import('/js/cms/project-case-study.js');const sample={id:'${initial.id}',payload:window.__data.draft.payload};const target=document.createElement('div');document.body.append(target);const times=[];for(let i=0;i<5;i++){const start=performance.now(),r=renderCaseStudy(target,sample,{preview:true,resolver:window.__media.resolve});times.push(performance.now()-start);r.destroy();}target.remove();return {scenario:'shared-case-study-render',synchronousRenderMs:times};})()`));
 await shot('admin-crop');
 await p.evaluate('window.__crop.destroy();window.__media.destroy();window.__editor.destroy()');
 check('no real network connections',p.audit.realConnections===0);
 check('no application runtime exceptions',p.audit.errors.length===0);
 await p.stop();check('temporary profile cleaned',p.audit.cleanup==='PASS');
 fs.writeFileSync(path.join(OUT,'browser-results.json'),JSON.stringify({classification:'FIXTURE VERIFIED',passed:results.length,failed:0,results,metrics,audit:p.audit},null,2));console.log(JSON.stringify({passed:results.length,failed:0,output:OUT}));
}
run().catch(async error=>{if(p){try{await shot('failure')}catch{}try{fs.writeFileSync(path.join(OUT,'failure-diagnostic.json'),JSON.stringify(await p.evaluate("({body:document.body.textContent.slice(-3000),status:document.querySelector('.m09-editor>p')?.textContent})"),null,2))}catch{}await p.stop();}fs.writeFileSync(path.join(OUT,'browser-results.json'),JSON.stringify({passed:results.length,failed:1,results,error:error.stack,audit:p?.audit},null,2));console.error(JSON.stringify({passed:results.length,failed:1,error:error.message,output:OUT}));process.exitCode=1;});
