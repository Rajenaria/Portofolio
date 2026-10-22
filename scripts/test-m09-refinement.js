/* M09 visual follow-up: actual UI, synthetic data, isolated Chrome/CDP only. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {launch,ORIGIN,CMS,responseFor}=require('./preview-portfolio'),fixture=require('./fixtures/portfolio-preview/fixture');
const ROOT=path.resolve(__dirname,'..'),OUT=process.argv[2]||fs.mkdtempSync(path.join(os.tmpdir(),'portfolio-m09-refinement-'));
if(path.resolve(OUT)===ROOT||path.resolve(OUT).startsWith(ROOT+path.sep))throw Error('Evidence must remain outside repository');
fs.mkdirSync(OUT,{recursive:true});const results=[],measurements=[],wait=ms=>new Promise(r=>setTimeout(r,ms));let p;
function check(name,value){assert.equal(value,true,name);results.push({name,status:'PASS'});}
async function browser(name,expression){check(name,await p.evaluate(expression));}
async function until(expression){const end=Date.now()+25000;while(Date.now()<end){if(await p.evaluate(expression))return;await wait(80);}throw Error('Timed out: '+expression);}
async function viewport(width,height=900){await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},p.session);await wait(120);}
async function navigate(page='index.html'){await p.send('Page.navigate',{url:ORIGIN+'/'+page},p.session);}
async function home(){await navigate();await until("document.querySelector('#portfolio')&&!document.querySelector('#portfolio').hasAttribute('aria-busy')&&document.documentElement.classList.contains('is-loaded')");}
async function shot(name){await p.evaluate("Promise.all([...document.images].filter(i=>i.complete&&i.naturalWidth).map(i=>i.decode().catch(()=>null)))");await wait(600);const r=await p.send('Page.captureScreenshot',{format:'png'},p.session);fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(r.data,'base64'));}
async function key(key,code){for(const type of ['keyDown','keyUp'])await p.send('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code},p.session);}
async function run(){
 const routes={};const serve=(url,body,type='text/javascript')=>routes[ORIGIN+'/'+url]=()=>({status:200,body,type,kind:'refinement-local-fixture'});
 const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else if(file.endsWith('.js'))serve(path.relative(ROOT,file).replaceAll('\\','/'),fs.readFileSync(file));}};
 walk(path.join(ROOT,'admin/js'));serve('admin/admin.css',fs.readFileSync(path.join(ROOT,'admin/admin.css')),'text/css');
 serve('admin/js/core/supabase.js',`export const supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'fixture-owner-aal2'}}})}};`);
 routes[CMS+'/functions/v1/manage-project']=()=>({status:200,body:'[]',type:'application/json',kind:'fixture-asset-list'});
 serve('refinement-admin.html','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/admin.css"><link rel="stylesheet" href="/css/project-case-study.css"></head><body><main id="app"></main><script type="module">import {createCropEditor} from "/admin/js/modules/projects/crop-editor.js";window.cropFactory=createCropEditor;window.ready=true;</script></body></html>','text/html');
 const options={headless:true,projects:20,_fixtureRoutes:routes};p=await launch(options);
 await until("document.querySelectorAll('#projectGrid .project-card').length===6&&document.documentElement.classList.contains('is-loaded')");
 check('network interception active before application',p.audit.startupProbe==='PASS');
 await browser('desktop three-column grid with six initial cards',"getComputedStyle(projectGrid).display==='grid'&&getComputedStyle(projectGrid).gridTemplateColumns.split(' ').length===3&&!projectLoadMore.hidden");
 await browser('CTA exact label, adjacent unframed arrow and correct route',"[...document.querySelectorAll('.project-link')].every(a=>a.textContent.trim()==='Lihat Project ↗'&&new URL(a.href).pathname==='/project.html'&&getComputedStyle(a).gap==='7px'&&getComputedStyle(a).minHeight==='44px'&&getComputedStyle(a.firstElementChild).borderTopWidth==='0px'&&getComputedStyle(a.firstElementChild).backgroundColor==='rgba(0, 0, 0, 0)')");
 await p.evaluate("document.querySelector('.project-link').focus()");await browser('CTA keyboard-visible focus',"getComputedStyle(document.activeElement).outlineWidth==='3px'");
 const contain=await p.evaluate("(()=>{const c=[...projectGrid.children].find(c=>c.querySelector('img').style.objectFit==='contain'),b=c.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()");
 await p.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:contain.x,y:contain.y},p.session);
 await browser('contain screenshot never gains hover zoom',"[...projectGrid.querySelectorAll('img')].filter(i=>i.style.objectFit==='contain').every(i=>getComputedStyle(i).transform==='matrix(1, 0, 0, 1, 0, 0)')");
 await p.evaluate("projectGrid.scrollIntoView({block:'start',behavior:'instant'});window.scrollBy({top:-160,behavior:'instant'});[...projectGrid.querySelectorAll('img')].forEach(i=>i.loading='eager')");await until("[...projectGrid.querySelectorAll('img')].every(i=>i.complete&&i.naturalWidth>0)");await shot('homepage-projects-desktop');
 await p.evaluate('projectLoadMore.click()');await browser('desktop load more adds six',"projectGrid.children.length===12&&!projectLoadMore.hidden");
 await viewport(800);await browser('tablet retains two columns and desktop limit',"getComputedStyle(projectGrid).gridTemplateColumns.split(' ').length===2&&projectGrid.children.length===12");
 await viewport(390,844);await until('projectGrid.children.length===20');
 await browser('mobile all loaded projects discoverable, no load-more barrier',"projectGrid.children.length===20&&projectLoadMore.hidden&&!projectSwipeHint.hidden&&projectResults.textContent==='20 dari 20 project'");
 await browser('mobile native overflow/snap, next peek and stable widths',"(()=>{const g=projectGrid,s=getComputedStyle(g),c=g.firstElementChild.getBoundingClientRect();return s.display==='flex'&&s.overflowX==='auto'&&s.scrollSnapType==='x mandatory'&&getComputedStyle(g.firstElementChild).scrollSnapAlign==='start'&&c.width<g.clientWidth&&c.width>g.clientWidth*.8&&g.scrollWidth>g.clientWidth&&new Set([...g.children].map(c=>c.getBoundingClientRect().width.toFixed(2))).size===1;})()");
 await browser('rail keyboard focus and vertical touch pan remain native',"projectGrid.tabIndex===0&&getComputedStyle(projectGrid).touchAction==='auto'&&document.documentElement.scrollWidth<=innerWidth+1");
 await browser('rail has no nested vertical scrollbar or entrance transforms',"getComputedStyle(projectGrid).overflowY==='hidden'&&projectGrid.scrollHeight<=projectGrid.clientHeight+1&&[...projectGrid.children].every(c=>getComputedStyle(c).transform==='none')");
 await p.evaluate("projectGrid.scrollIntoView({block:'center',behavior:'instant'});projectGrid.scrollLeft=0");await shot('homepage-projects-mobile');
 await p.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1},p.session);
 const point=await p.evaluate("(()=>{const b=projectGrid.getBoundingClientRect();return {x:b.x+b.width*.75,y:b.y+80};})()");
 await p.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]},p.session);
 for(let i=1;i<=12;i++){await p.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x-i*15,y:point.y+2}]},p.session);await wait(20);}
 await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},p.session);await wait(850);
 await browser('CDP native touch gesture advances and snaps rail',"(()=>{const g=projectGrid;return g.scrollLeft>100&&[...g.children].some(c=>Math.abs(c.offsetLeft-g.firstElementChild.offsetLeft-g.scrollLeft)<3);})()");
 const vertical=await p.evaluate("(()=>{const b=projectGrid.getBoundingClientRect();return {x:b.x+b.width*.5,y:b.y+150,scroll:scrollY};})()");
 await p.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:vertical.x,y:vertical.y}]},p.session);
 for(let i=1;i<=12;i++){await p.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:vertical.x+2,y:vertical.y-i*12}]},p.session);await wait(20);}
 await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},p.session);await wait(700);
 await browser('vertical touch gesture inside rail scrolls the page',`scrollY>${vertical.scroll+50}`);
 await p.evaluate("document.querySelectorAll('#projectFilters button')[1].click()");await wait(150);
 await browser('category change resets scroll and active/count state',"projectGrid.scrollLeft===0&&projectGrid.children.length===10&&document.querySelectorAll('#projectFilters button')[1].getAttribute('aria-pressed')==='true'&&projectResults.textContent==='10 dari 10 project'");
 await p.evaluate('projectGrid.focus()');await key('ArrowRight',39);await wait(700);
 await browser('native arrow-key scrolling reaches more cards',"projectGrid.scrollLeft>0");
 await p.evaluate('projectGrid.lastElementChild.querySelector("a").focus()');await wait(500);
 await browser('last project keyboard link becomes visible',"(()=>{const b=document.activeElement.getBoundingClientRect(),g=projectGrid.getBoundingClientRect();return b.left>=g.left-1&&b.right<=g.right+1;})()");
 await viewport(800);await browser('resize restores desktop limit without losing keyboard focus',"projectGrid.children.length===6&&getComputedStyle(projectGrid).display==='grid'&&document.activeElement===projectGrid");
 await viewport(390,844);await browser('resize back preserves category and exposes all matching cards',"projectGrid.children.length===10&&projectResults.textContent==='10 dari 10 project'");
 for(const count of [0,1,7,1001]){p.tables.projects=fixture.tables({projects:count}).projects;const start=performance.now();await home();await browser('mobile catalog '+count+' complete and bounded',`projectGrid.children.length===${count}&&projectLoadMore.hidden&&document.documentElement.scrollWidth<=innerWidth+1`);measurements.push({scenario:'mobile-'+count,fixtureNavigationAndOpeningMs:Math.round(performance.now()-start)});}
 p.tables.projects=fixture.tables({projects:20}).projects;await home();
 await browser('no project clones, autoplay or old carousel controller',"!document.querySelector('.project-card-clone,.project-carousel-control,#projectCarouselHelp')&&!window.refreshProjectCarousel");
 options.projectError=true;await home();await viewport(800);
 await browser('viewport change preserves data error rather than displaying empty state',"!projectRetry.hidden&&projectResults.textContent.includes('gagal')&&projectGrid.children.length===0&&projectGrid.tabIndex===-1&&projectSwipeHint.hidden");
 options.projectError=false;await p.evaluate('projectRetry.click()');await until('projectGrid.children.length===6');
 await browser('retry after resize restores published catalog',"projectRetry.hidden&&projectResults.textContent==='6 dari 20 project'");
 routes[CMS+'/rest/v1/rpc/project_catalog']=request=>{const response=responseFor(request,{},p.tables);if(response.status!==200)return response;const rows=JSON.parse(response.body);for(const row of rows){row.payload.general.category=('DEMO category '.repeat(8)).slice(0,100);if(row===rows[0]){row.payload.general.title=('DEMO long project title '.repeat(9)).slice(0,180);row.payload.general.summary=('DEMO description '.repeat(30)).slice(0,400);row.payload.legacy.technologies=[{id:null,name:('DEMO technology '.repeat(7)).slice(0,100),icon:''}];}}return {...response,body:JSON.stringify(rows)};};
 for(const width of [1440,800,390]){await viewport(width);await home();await browser('long CMS title/category/technology remains aligned at '+width,"document.documentElement.scrollWidth<=innerWidth+1&&[...projectGrid.querySelectorAll('.project-link')].every(a=>a.getBoundingClientRect().height>=44)&&(()=>{const c=[...projectGrid.children].slice(0,innerWidth>1099?3:innerWidth>650?2:20).map(c=>c.offsetHeight);return Math.max(...c)-Math.min(...c)<=1;})()");}
 delete routes[CMS+'/rest/v1/rpc/project_catalog'];
 // Generate dimension-labelled synthetic screenshot images, never owner content or remote assets.
 await navigate('refinement-admin.html');await until('window.ready===true');
 await p.evaluate(`window.makeImage=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#e7edf5';x.fillRect(0,0,w,h);x.strokeStyle='#0071e3';x.lineWidth=8;x.strokeRect(4,4,w-8,h-8);x.fillStyle='#21354d';x.font=Math.min(w,h)/12+'px sans-serif';x.fillText('DEMO '+w+' × '+h,w*.08,h*.5);return c.toDataURL('image/png');};window.original={id:crypto.randomUUID(),asset_id:crypto.randomUUID(),alt:'DEMO screenshot',crop:{aspect:'card',fit:'cover',x:27,y:63,zoom:1.35,mobile:{aspect:'card',fit:'contain',x:12,y:71,zoom:1}}};window.before=JSON.stringify(window.original);window.output=null;window.crop=window.cropFactory({project:crypto.randomUUID(),placement:window.original,aspect:'card',fixedAspect:true,resolver:()=>window.makeImage(1920,1080),onChange:v=>window.output=v});document.querySelector('#app').append(window.crop.element);`);
 await until("document.querySelector('.m09-crop-viewport img').naturalWidth===1920");
 await browser('admin preview uses shared 16:9 frame and saved crop unchanged',"getComputedStyle(document.querySelector('.m09-crop-viewport figure')).aspectRatio==='16 / 9'&&document.querySelector('.m09-crop-viewport img').style.objectPosition==='27% 63%'&&document.querySelector('.m09-crop-viewport img').style.transform==='scale(1.35)'&&window.output===null&&JSON.stringify(window.original)===window.before");
 await viewport(1440,1000);await shot('admin-card-preview');await viewport(390,844);
 await p.evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Preview desktop / mobile').click()");await wait(80);
 await browser('mobile crop preview uses saved override with no mutation',"document.querySelector('.m09-crop-viewport source').media==='all'&&document.querySelector('.m09-crop-viewport img').style.objectFit==='contain'&&document.querySelector('.m09-crop-viewport img').style.transform==='scale(1)'&&JSON.stringify(window.original)===window.before&&window.output===null");
 await p.evaluate('window.crop.destroy();document.querySelector("#app").replaceChildren();document.querySelector("#app").classList.add("m09-crop-viewport")');
 for(const width of [1440,800,390]){await viewport(width);for(const [w,h]of [[1920,1080],[1366,768],[1600,1000],[1000,1000],[800,1200]])for(const fit of ['contain','cover']){
  await p.evaluate(`(async()=>{window.m?.destroy();const {createMedia}=await import('/js/cms/project-data.js');window.m=createMedia('fixture',{alt:'DEMO screenshot',crop:{aspect:'card',fit:'${fit}',x:30,y:60,zoom:1}},{resolver:()=>window.makeImage(${w},${h})});document.querySelector('#app').replaceChildren(window.m.element);})()`);
  await until(`window.m?.image.naturalWidth===${w}`);
  await browser(`image ${w}x${h} ${fit} viewport ${width} preserves shared frame/fit`,"getComputedStyle(window.m.element).aspectRatio==='16 / 9'&&window.m.image.style.objectFit==='"+fit+"'&&window.m.image.style.transform==='scale(1)'&&document.documentElement.scrollWidth<=innerWidth+1");
 }
 await p.evaluate("(async()=>{window.m.destroy();const {createMedia}=await import('/js/cms/project-data.js');window.m=createMedia('fixture',{alt:'DEMO photograph',crop:{aspect:'card',fit:'cover',x:40,y:60,zoom:1.1}},{resolver:()=>'/assets/images/profile/profil-1-mobile.webp'});document.querySelector('#app').replaceChildren(window.m.element);})()");await until('window.m.image.naturalWidth>0');
 await browser('photograph intentional cover viewport '+width,"window.m.image.style.objectFit==='cover'&&window.m.image.style.objectPosition==='40% 60%'&&window.m.image.style.transform==='scale(1.1)'&&document.documentElement.scrollWidth<=innerWidth+1");
 }
 await navigate('project.html?slug=demo-project-1');await until("document.querySelector('.pcs-architecture-node')");
 await p.evaluate("(async()=>{window.base=(await import('/js/cms/project-data.js').then(m=>m.loadCatalog({slug:'demo-project-1'})))[0];window.render=(await import('/js/cms/project-case-study.js')).renderCaseStudy;window.drawCase=(data,preview=false)=>{window.case?.destroy();const r=document.createElement('main');document.querySelector('.project-case-study').replaceWith(r);window.case=window.render(r,data,{preview,headerElement:document.querySelector('.project-top-nav')});};})()");
 for(const width of [1440,800,390,320]){
  await viewport(width,width<650?844:1000);await p.evaluate('window.drawCase(window.base)');
  await browser('detail width '+width+' no horizontal overflow',"document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll('.pcs-item,.pcs-architecture-node')].every(e=>e.getBoundingClientRect().right<=innerWidth+1)");
  if(width===1440)await browser('desktop sticky sidebar and restrained spacing',"getComputedStyle(document.querySelector('.pcs-sidebar')).position==='sticky'&&getComputedStyle(document.querySelector('.pcs-sidebar')).width==='280px'&&getComputedStyle(document.querySelector('.pcs-section')).paddingTop==='56px'");
  else{await p.evaluate("document.querySelector('.pcs-mobile-toggle').click();document.querySelectorAll('.pcs-toc a')[2].click()");await wait(500);await browser('mobile/tablet TOC closes, focuses target and keeps heading clear '+width,"document.querySelector('.pcs-mobile-toggle').getAttribute('aria-expanded')==='false'&&document.activeElement.classList.contains('pcs-section')&&document.activeElement.getBoundingClientRect().top>=document.querySelector('.pcs-sidebar').getBoundingClientRect().bottom-2");}
  if(width===1440||width===390){await p.evaluate("document.querySelector('.pcs-hero').scrollIntoView({block:'start',behavior:'instant'})");await shot('detail-hero-'+width);}
 }
 for(const scenario of [{name:'minimal',phases:1,features:1,gallery:1,architecture:false,media:false},{name:'long-many',phases:12,features:7,gallery:8,architecture:true,media:true},{name:'empty-optional',phases:0,features:0,gallery:0,architecture:false,media:false}]){
  await p.evaluate(`window.sample=structuredClone(window.base);window.sample.payload.general.summary='DEMO — long description. '.repeat(24).slice(0,400);for(const s of window.sample.payload.sections){let count=({timeline:${scenario.phases},features:${scenario.features},gallery:${scenario.gallery}})[s.type];if(count!==undefined){const first=s.items[0];s.items=Array.from({length:count},(_,i)=>{const item={...structuredClone(first),id:crypto.randomUUID(),title:'DEMO '+s.type+' '+i,description:'DEMO — long content for wrapping. '.repeat(12)};if(item.media)item.media.id=crypto.randomUUID();return item;});}if(s.type==='architecture')s.enabled=${scenario.architecture};if(!${scenario.media})s.items.forEach(i=>i.media=null);}window.drawCase(window.sample);`);
  await browser('CMS '+scenario.name+' counts, missing media and wrapping',`document.querySelectorAll('.pcs-timeline .pcs-item').length===${scenario.phases}&&document.querySelectorAll('.pcs-features .pcs-item').length===${scenario.features}&&document.querySelectorAll('.pcs-gallery .pcs-item').length===${scenario.gallery}&&!!document.querySelector('.pcs-architecture-board')===${scenario.architecture}&&document.documentElement.scrollWidth<=innerWidth+1`);
  if(scenario.name==='empty-optional')await browser('empty optional sections omitted from body and TOC',"!document.querySelector('.pcs-timeline,.pcs-features,.pcs-gallery,.pcs-architecture')&&document.querySelectorAll('.pcs-toc a').length===4");
  const signature="[...document.querySelectorAll('.pcs-hero,.pcs-section')].map(s=>({id:s.id,text:s.textContent,media:[...s.querySelectorAll('figure')].map(f=>({ratio:f.style.aspectRatio,fit:f.querySelector('img').style.objectFit}))}))";
  const publicSections=await p.evaluate(signature);await p.evaluate('window.drawCase(window.sample,true)');
  check('public/admin shared section composition '+scenario.name,JSON.stringify(await p.evaluate(signature))===JSON.stringify(publicSections));
 }
 await p.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},p.session);
 await p.evaluate('window.drawCase(window.base)');
 await browser('detail reduced motion keeps content visible without smooth anchor scrolling',"getComputedStyle(document.documentElement).scrollBehavior==='auto'&&[...document.querySelectorAll('.pcs-section')].every(e=>getComputedStyle(e).opacity==='1'&&getComputedStyle(e).transform==='none')");
 await p.evaluate("document.querySelector('.pcs-gallery').scrollIntoView({block:'center',behavior:'instant'})");await until("document.querySelector('.pcs-gallery .project-media-open')&&!document.querySelector('.pcs-gallery .project-media-open').disabled");
 await p.evaluate("document.querySelector('.pcs-gallery .project-media-open').focus();document.querySelector('.pcs-gallery .project-media-open').click()");await browser('gallery lightbox still opens with focus',"document.querySelector('.pcs-lightbox').open&&document.activeElement.classList.contains('pcs-close')");
 await key('Escape',27);await until("!document.querySelector('.pcs-lightbox')");await browser('gallery Escape restores focus',"document.activeElement.classList.contains('project-media-open')");
 await shot('detail-mobile-reduced-motion');
 await home();await p.evaluate("projectGrid.scrollIntoView({block:'center',behavior:'instant'})");await browser('reduced motion rail remains manually scrollable without reveal',"getComputedStyle(projectGrid).scrollBehavior==='auto'&&[...projectGrid.children].every(c=>getComputedStyle(c).opacity==='1'&&getComputedStyle(c).transform==='none')");
 await shot('homepage-mobile-reduced-motion');
 check('zero real network connections',p.audit.realConnections===0);check('no application runtime errors',p.audit.errors.length===0);
 await p.stop();check('temporary browser profile removed',p.audit.cleanup==='PASS');
 fs.writeFileSync(path.join(OUT,'refinement-results.json'),JSON.stringify({classification:'ISOLATED CHROME / SYNTHETIC CMS; not production verification',passed:results.length,failed:0,results,measurements,audit:p.audit},null,2));console.log(JSON.stringify({passed:results.length,failed:0,output:OUT}));
}
run().catch(async error=>{if(p){try{await shot('failure')}catch{}await p.stop();}fs.writeFileSync(path.join(OUT,'refinement-results.json'),JSON.stringify({passed:results.length,failed:1,results,error:error.stack,audit:p?.audit},null,2));console.error(JSON.stringify({passed:results.length,failed:1,error:error.message,output:OUT}));process.exitCode=1;});
