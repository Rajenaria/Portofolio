/* Original frontend/admin + synthetic configuration/guestbook only.
   Native Chrome/CDP guard precedes navigation. No live Auth/API/Storage.
   node scripts/test-m11-environment-browser.js EXTERNAL_OUTPUT */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launch, ORIGIN, CMS } = require('./preview-portfolio');
const fixture = require('./fixtures/portfolio-preview/fixture');
const contract = require('../js/environment');
const { cspFor } = require('./prepare-environment');
const ROOT = path.resolve(__dirname, '..'), OUT = path.resolve(process.argv[2] || '.');
assert(OUT !== ROOT && !OUT.startsWith(ROOT + path.sep), 'External output required');
fs.mkdirSync(OUT, { recursive: true });
const results = [], requests = [], runtimeErrors = [];
let p, mode = 'valid', responseStatus = 429;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(expression) {
  const end = Date.now() + 20000;
  while (Date.now() < end) { if (await p.evaluate(expression)) return; await wait(80); }
  throw Error('Timeout: ' + expression);
}
async function check(name, value) {
  const pass = typeof value === 'string' ? await p.evaluate(value) : value;
  results.push({ name, status: pass ? 'PASS' : 'FAIL' }); assert(pass, name);
}
async function navigate(page = 'index.html') {
  await p.send('Page.navigate', { url: ORIGIN + '/' + page }, p.session);
  await until(page.startsWith('admin/') ? "!!document.querySelector('#login-screen')&&!document.querySelector('#login-screen').hidden" : "document.documentElement.classList.contains('is-loaded')&&!!window.PortfolioEnvironment");
}
async function submit() {
  await p.evaluate("document.querySelector('#guestbookName').value='DEMO User';document.querySelector('#guestbookMessage').value='Pesan demonstrasi lokal aman';document.querySelector('#guestbookForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
  await until("!document.querySelector('#guestbookSubmit').disabled");
}
async function run() {
  const routes = {};
  routes[ORIGIN + '/js/environment-config.js'] = () => {
    const input = mode === 'missing' ? null : mode === 'invalid' ? { ...fixture.environmentConfig(ORIGIN), backendOrigin: 'https://backend.example.invalid' } : fixture.environmentConfig(ORIGIN);
    const body = input === null ? fs.readFileSync(path.join(ROOT, 'js/environment-config.js'))
      : mode === 'invalid' ? `if(!Object.hasOwn(globalThis,'PORTFOLIO_DEPLOYMENT'))Object.defineProperty(globalThis,'PORTFOLIO_DEPLOYMENT',{value:${JSON.stringify(input)}});`
      : contract.configScript(input);
    return { status: 200, body, type: 'text/javascript', kind: 'm11-config-fixture' };
  };
  routes[CMS + '/functions/v1/submit-comment'] = request => {
    if (request.method === 'OPTIONS') return { status: 204, body: '', type: 'text/plain', kind: 'm11-synthetic-preflight' };
    assert.equal(request.method, 'POST');
    const body = JSON.parse(request.postData || '{}');
    requests.push({ origin: new URL(request.url).origin, body, contentType: request.headers['Content-Type'] || request.headers['content-type'] });
    return { status: responseStatus, type: 'application/json', kind: 'm11-synthetic-guestbook', body: JSON.stringify({ success: responseStatus === 200, message: responseStatus === 200 ? 'DEMO diterima' : 'DEMO request dibatasi' }) };
  };
  function serve(file, type) {
    routes[ORIGIN + '/' + file] = () => {
      let body = fs.readFileSync(path.join(ROOT, file), 'utf8');
      if (file === 'admin/js/core/config.js' && mode === 'mismatch')
        body = body.replace("export const SUPABASE_URL = config?.url || '';", "export const SUPABASE_URL = 'https://mismatch.example.invalid';");
      if (file.startsWith('admin/vendor/')) body += `\nwindow.__sdkCreated=0;window.supabase={...window.supabase,createClient(...args){window.__sdkCreated++;return globalThis.__createClient(...args)}};`;
      // Preserve the real SDK function while counting instantiations, not requests.
      if (file.startsWith('admin/vendor/')) body = body.replace('window.__sdkCreated=0;', 'globalThis.__createClient=window.supabase.createClient;window.__sdkCreated=0;');
      return { status: 200, body, type, kind: 'm11-original-admin',
        ...(file.endsWith('.html') ? { headers: [{ name: 'Content-Security-Policy', value: cspFor({ backendOrigin: CMS, admin: file.startsWith('admin/') }) }] } : {}) };
    };
  }
  const walk = dir => { for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const file = dir + '/' + entry.name;
    if (entry.isDirectory()) walk(file); else if (file.endsWith('.js')) serve(file, 'text/javascript');
  } };
  walk('admin/js');
  for (const [file, type] of [['index.html', 'text/html'], ['admin/index.html', 'text/html'], ['admin/admin.css', 'text/css'],
    ['admin/admin.js', 'text/javascript'], ['admin/vendor/supabase-js-2.112.3.js', 'text/javascript']]) serve(file, type);
  p = await launch({ headless: true, _fixtureRoutes: routes, beforeNavigate: async page => {
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__fetches=[];window.__csp=[];const originalFetch=window.fetch;window.fetch=function(input,init){const u=new URL(typeof input==='string'?input:input.url,location.href);window.__fetches.push({origin:u.origin,path:u.pathname});return originalFetch.call(this,input,init)};document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.effectiveDirective));` }, page.session);
  } });
  p.on('Runtime.exceptionThrown', event => runtimeErrors.push({ mode, message: (event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || 'exception').replace(/sb_publishable_[A-Za-z0-9_-]+/g, '[PUBLIC_KEY]') }));
  await until("document.querySelector('#projectGrid')?.children.length===6&&document.body.textContent.includes('DEMO Pengunjung')");
  await check('explicit fixture public CMS renders original grid', "window.PortfolioEnvironment.status().config.environment==='fixture'");
  await check('all initial application fetches use local synthetic API', "window.__fetches.length>0&&window.__fetches.every(x=>x.origin==='http://127.0.0.1:54321')");
  await check('guestbook GET retains approved filter and fixture comment', "document.querySelector('#guestbookCommentsList').textContent.includes('DEMO Pengunjung')");
  await submit();
  await check('guestbook POST retains exactly name/message schema', requests.length === 1 && Object.keys(requests[0].body).sort().join(',') === 'message,name');
  await check('guestbook POST target remains synthetic local API', requests[0].origin === CMS);
  await check('guestbook POST retains JSON content type', requests[0].contentType === 'application/json');
  await check('429 retains user content and shows failure', "document.querySelector('#guestbookMessage').value==='Pesan demonstrasi lokal aman'&&document.querySelector('#guestbookStatus').textContent.includes('DEMO request dibatasi')");
  responseStatus = 200; await submit();
  await check('confirmed success resets form and preserves response behavior', "document.querySelector('#guestbookMessage').value===''&&document.querySelector('#guestbookStatus').textContent.includes('DEMO diterima')");
  const before = requests.length;
  await p.evaluate("window.PORTFOLIO_DEPLOYMENT.deploymentId='changed';document.querySelector('#guestbookName').value='DEMO User';document.querySelector('#guestbookMessage').value='Pesan demonstrasi lokal aman';document.querySelector('#guestbookForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
  await until("!document.querySelector('#guestbookSubmit').disabled");
  await check('runtime mismatch blocks subsequent guestbook POST before network', requests.length === before);
  await check('mismatch error does not disclose key or endpoint', "document.querySelector('#guestbookStatus').textContent.includes('Konfigurasi')&&!document.querySelector('#guestbookStatus').textContent.includes('sb_publishable_')");
  for (const scenario of ['missing', 'invalid']) {
    mode = scenario; await navigate();
    await check(scenario + ' input disables guestbook with understandable message', "document.querySelector('#guestbookSubmit').disabled&&document.querySelector('#guestbookStatus').textContent.includes('Konfigurasi')");
    await check(scenario + ' input causes zero application API requests', "window.__fetches.length===0");
    await check(scenario + ' certificate failure settles without a stale loading state', "document.querySelector('#certificates').textContent.includes('Sertifikat belum dapat dimuat')");
    await check(scenario + ' input cannot use static CV as network-error fallback', "[...document.querySelectorAll('[data-cv-download]')].every(a=>!a.hasAttribute('href'))");
    await navigate('admin/index.html');
    await check(scenario + ' admin does not instantiate real SDK/Auth', "window.__sdkCreated===0&&document.querySelector('#login-submit').disabled&&document.querySelector('#login-error').textContent.includes('Konfigurasi')");
    await check(scenario + ' admin causes zero API requests', "window.__fetches.length===0");
  }
  mode = 'mismatch'; await navigate('admin/index.html');
  await check('public/admin config mismatch blocked before real SDK creation', "window.__sdkCreated===0&&document.querySelector('#login-submit').disabled&&window.__fetches.length===0");
  mode = 'valid'; await navigate('admin/index.html');
  await check('explicit valid environment permits real SDK and login screen', "window.__sdkCreated===1&&!document.querySelector('#login-submit').disabled");
  await check('admin and public resolve the same fixture identity', "window.PortfolioEnvironment.requireEnvironment().deploymentId==='isolated-fixture'&&window.PortfolioEnvironment.requireEnvironment().owner==='00000000-0000-4000-8000-000000000001'");
  await navigate();
  await p.evaluate("fetch('https://blocked.example.invalid/probe').catch(()=>null)");
  await until("window.__csp.includes('connect-src')");
  await check('actual meta and HTTP CSP reject unknown network target', "window.__csp.includes('connect-src')");
  await check('CSP has no production or wildcard Supabase allowlist', "!document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]').content.includes('hldacuppejztqzqaejsi')&&!document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]').content.includes('*.supabase.co')");
  await check('network interception enabled before application', p.audit.startupProbe === 'PASS');
  await check('zero real outbound connections', p.audit.realConnections === 0);
  await check('no isolation failures', p.audit.errors.length === 0);
  await p.stop(); await check('temporary profile cleanup', p.audit.cleanup === 'PASS');
  save(); console.log(JSON.stringify({ passed: results.length, failed: 0, output: OUT }));
}
function save(error) {
  fs.writeFileSync(path.join(OUT, 'browser-results.json'), JSON.stringify({ classification: 'FIXTURE VERIFIED; actual UI, synthetic SDK targets/backend',
    passed: results.filter(r => r.status === 'PASS').length, failed: error ? 1 : 0, results, requests, runtimeErrors, audit: p?.audit,
    ...(error ? { error: error.stack } : {}) }, null, 2));
}
run().catch(async error => {
  if (p) { try { fs.writeFileSync(path.join(OUT, 'failure-state.json'), JSON.stringify(await p.evaluate("({body:document.body.textContent.slice(-1400),fetches:window.__fetches})"))); } catch {} await p.stop(); }
  save(error); console.error(error.message); process.exitCode = 1;
});
