/* Developer-only visual equivalence. All requests use M07 fail-closed fixtures.
   node --experimental-vm-modules scripts/test-m10-equivalence.js OUT before|after
   Capture `before` before changing application source. OUT must be outside repo.
   Animations/transitions are frozen only for screenshots; live motion is covered
   by the existing regression scripts. No screenshot tolerance is applied. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch, ORIGIN, CMS } = require('./preview-portfolio');
const fixture = require('./fixtures/portfolio-preview/fixture');
const { snapshot } = require('./fixtures/portfolio-preview/project-snapshots');
const { backend } = require('./fixtures/portfolio-preview/project-backend');
const { moduleAt } = require('./test-m09-contract');
const ROOT = path.resolve(__dirname, '..');
const phase = process.argv[3], OUT = path.resolve(process.argv[2] || '.');
assert(['before', 'after'].includes(phase), 'Expected before or after');
assert(OUT !== ROOT && !OUT.startsWith(ROOT + path.sep), 'Evidence outside repo');
const DIR = path.join(OUT, phase);
fs.mkdirSync(DIR, { recursive: true });
const results = [], captures = [];
let p;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function check(name, pass) {
  results.push({ name, status: pass ? 'PASS' : 'FAIL' });
  assert(pass, name);
}
async function until(expression) {
  const end = Date.now() + 25000;
  while (Date.now() < end) {
    if (await p.evaluate(expression)) return;
    await wait(100);
  }
  throw Error('Timeout: ' + expression);
}
async function viewport(width, height = 900) {
  await p.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false
  }, p.session);
}
async function navigate(page, ready) {
  await p.send('Page.navigate', { url: ORIGIN + '/' + page }, p.session);
  await until(ready);
  await p.evaluate(`(()=>{const s=document.createElement('style');
    s.textContent='*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}';
    document.head.append(s);})()`);
}
async function capture(name, selector) {
  await p.evaluate(`(async()=>{const target=document.querySelector(${JSON.stringify(selector)});
    target.scrollIntoView({block:'start',behavior:'instant'});
    for(const i of document.images)i.loading='eager';
    await document.fonts.ready;
    await Promise.all([...document.images].map(i=>i.decode().catch(()=>null)));})()`);
  await wait(1000);
  const metrics = await p.evaluate(`(()=>{const target=document.querySelector(${JSON.stringify(selector)});
    const rect=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]};
    const props=['display','position','gridTemplateColumns','gap','padding','margin','fontFamily','fontSize','lineHeight','color','backgroundColor','objectFit','objectPosition','aspectRatio','overflowX','overflowY','transform'];
    return {viewport:[innerWidth,innerHeight],target:rect(target),nodes:[target,...target.querySelectorAll('*')].map(e=>{
      const s=getComputedStyle(e);return {tag:e.tagName,classes:e.className,text:e.children.length?null:e.textContent,
        rect:rect(e),style:Object.fromEntries(props.map(k=>[k,s[k]]))};})};})()`);
  captures.push({ name, metrics });
  const screenshot = await p.send('Page.captureScreenshot', { format: 'png' }, p.session);
  fs.writeFileSync(path.join(DIR, name + '.png'), Buffer.from(screenshot.data, 'base64'));
  if (phase === 'after') {
    const baseline = JSON.parse(fs.readFileSync(path.join(OUT, 'before', 'results.json')));
    check(name + ' exact geometry/computed styles',
      JSON.stringify(metrics) === JSON.stringify(baseline.captures.find(c => c.name === name)?.metrics));
    // Decode locally in the isolated browser; no PNG library or network required.
    const before = fs.readFileSync(path.join(OUT, 'before', name + '.png')).toString('base64');
    const diff = await p.evaluate(`(async()=>{const decode=async data=>{
      const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
      const x=c.getContext('2d');x.drawImage(img,0,0);return {w:c.width,h:c.height,p:x.getImageData(0,0,c.width,c.height).data};};
      const a=await decode(${JSON.stringify(before)}),b=await decode(${JSON.stringify(screenshot.data)});
      let pixels=0;if(a.w!==b.w||a.h!==b.h)return -1;
      for(let i=0;i<a.p.length;i+=4)if(a.p[i]!==b.p[i]||a.p[i+1]!==b.p[i+1]||a.p[i+2]!==b.p[i+2]||a.p[i+3]!==b.p[i+3])pixels++;
      return pixels;})()`);
    captures[captures.length - 1].differentPixels = diff;
    check(name + ' exact screenshot pixels', diff === 0);
  }
}
async function run() {
  const mod = await moduleAt(path.join(ROOT, 'supabase/functions/_shared/project-service.js'));
  await mod.evaluate();
  const initial = snapshot(fixture.tables().projects[0]), f = backend(initial);
  const runtime = {
    client: f.client,
    authorize: async auth => auth === 'Bearer fixture-owner-aal2' ? initial.id : null,
    env: key => key === 'RATE_LIMIT_PEPPER' ? 'synthetic-local-only' : undefined
  };
  const routes = {};
  const serve = (relative, body, type = 'text/javascript') => {
    routes[ORIGIN + '/' + relative] = () => ({ status: 200, body, type, kind: 'm10-local-fixture' });
  };
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith('.js')) serve(path.relative(ROOT, file).replaceAll('\\', '/'), fs.readFileSync(file));
    }
  }
  walk(path.join(ROOT, 'admin/js'));
  serve('admin/admin.css', fs.readFileSync(path.join(ROOT, 'admin/admin.css')), 'text/css');
  serve('admin/js/core/supabase.js', `export const supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'fixture-owner-aal2'}}})}};`);
  serve('m10-admin.html', `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="/admin/admin.css"><link rel="stylesheet" href="/css/project-case-study.css">
    <main id="app"></main><div id="admin-modal-root"></div><div id="admin-toast-root"></div>
    <script type="module" src="/m10-admin.js"></script>`, 'text/html');
  serve('m10-admin.js', `import {createCaseStudyEditor} from '/admin/js/modules/projects/case-study-editor.js';
    import {createCropEditor} from '/admin/js/modules/projects/crop-editor.js';
    import {projectCommand} from '/admin/js/core/project-client.js';
    const data=await projectCommand({action:'read',id:'${initial.id}'});
    window.editor=createCaseStudyEditor({data,onBack(){},technologies:[]});
    document.querySelector('#app').append(editor.element);
    window.openCrop=()=>{editor.destroy();const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;
      const x=canvas.getContext('2d');x.fillStyle='#e7edf5';x.fillRect(0,0,1920,1080);x.fillStyle='#21354d';x.font='90px sans-serif';x.fillText('DEMO 1920 x 1080',160,500);
      window.crop=createCropEditor({project:'${initial.id}',placement:data.draft.payload.cover,aspect:'card',fixedAspect:true,resolver:()=>canvas.toDataURL(),onChange(){}});
      document.querySelector('#app').replaceChildren(crop.element);};window.ready=true;`);
  for (const [name, handler] of [
    ['manage-project', mod.namespace.createProjectHandler(runtime)],
    ['project-asset', mod.namespace.createProjectAssetHandler(runtime)]
  ]) routes[CMS + '/functions/v1/' + name] = async request => {
    const r = await handler(new Request(request.url, { method: request.method, headers: request.headers,
      ...(request.method === 'POST' ? { body: request.postData || '' } : {}) }));
    return { status: r.status, body: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') || 'application/json', kind: 'm10-synthetic-backend' };
  };
  // Only these two exact legacy routes, for this test. Launcher whitelist unchanged.
  for (const file of ['project-football-club.html', 'project-ecommerce.html'])
    serve('projects/' + file, fs.readFileSync(path.join(ROOT, 'projects', file)), 'text/html');
  p = await launch({ headless: true, projects: 8, _fixtureRoutes: routes });
  check('isolation active before navigation', p.audit.startupProbe === 'PASS');
  const homeReady = "document.documentElement.classList.contains('is-loaded')&&document.querySelector('#projectGrid')?.children.length===6";
  for (const [width, height] of [[1440, 900], [800, 900], [390, 844]]) {
    await viewport(width, height);
    await navigate('index.html', homeReady.replace('===6', width === 390 ? '===8' : '===6'));
    if (width === 1440) await capture('homepage-desktop', '#home');
    await capture('projects-' + width, '#portfolio');
  }
  for (const width of [1440, 390]) {
    await viewport(width, width === 390 ? 844 : 900);
    await navigate('project.html?slug=demo-project-1', "!!document.querySelector('.pcs-hero h1')");
    await capture('detail-' + width, '.pcs-layout');
  }
  await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, p.session);
  await viewport(390, 844);
  await navigate('index.html', homeReady.replace('===6', '===8'));
  await capture('projects-reduced-motion', '#portfolio');
  await viewport(1440);
  await navigate('m10-admin.html', 'window.ready===true');
  await capture('admin-editor', '#app');
  await p.evaluate('window.openCrop()');
  await until("document.querySelector('.m09-crop-viewport img')?.naturalWidth>0");
  await capture('admin-crop', '#app');
  for (const file of ['project-football-club.html', 'project-ecommerce.html']) {
    for (const width of [1440, 390]) {
      await viewport(width, width === 390 ? 844 : 900);
      await navigate('projects/' + file, "document.readyState==='complete'&&!!document.querySelector('h1')");
      await capture(file.replace('.html', '') + '-' + width, 'body');
    }
  }
  check('no real connections', p.audit.realConnections === 0);
  check('no launcher errors', p.audit.errors.length === 0);
  await p.stop();
  check('temporary browser profile cleaned', p.audit.cleanup === 'PASS');
  save();
  console.log(JSON.stringify({ phase, passed: results.length, screenshots: captures.length, output: DIR }));
}
function save(error) {
  fs.writeFileSync(path.join(DIR, 'results.json'), JSON.stringify({ phase, classification: 'FIXTURE VERIFIED',
    results, captures, audit: p?.audit, ...(error ? { error: error.stack } : {}) }, null, 2));
}
run().catch(async error => {
  if (p) await p.stop();
  save(error);
  console.error(error.message);
  process.exitCode = 1;
});
