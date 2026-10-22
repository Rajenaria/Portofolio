/* Actual admin entry/router/auth/forms, synthetic SDK and backend only.
   NOT proof of real login, JWT, MFA, RLS or Storage authorization.
   node --experimental-vm-modules scripts/test-m10-admin.js EXTERNAL_OUTPUT */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launch, ORIGIN, CMS } = require('./preview-portfolio');
const { moduleAt } = require('./test-m09-contract');
const { snapshot } = require('./fixtures/portfolio-preview/project-snapshots');
const { backend } = require('./fixtures/portfolio-preview/project-backend');
const fixture = require('./fixtures/portfolio-preview/fixture');
const ROOT = path.resolve(__dirname, '..'), OUT = path.resolve(process.argv[2] || '.');
assert(OUT !== ROOT && !OUT.startsWith(ROOT + path.sep), 'External output required');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
let p;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(expression) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    if (await p.evaluate(expression)) return;
    await wait(80);
  }
  throw Error('Timeout: ' + expression);
}
async function check(name, expression) {
  const pass = typeof expression === 'string' ? await p.evaluate(expression) : expression;
  results.push({ name, status: pass ? 'PASS' : 'FAIL' });
  assert(pass, name);
}
async function submit(password = 'fixture-password') {
  await p.evaluate(`document.querySelector('#email').value='owner@example.invalid';document.querySelector('#password').value=${JSON.stringify(password)};
    document.querySelector('#login-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
}
async function run() {
  const mod = await moduleAt(path.join(ROOT, 'supabase/functions/_shared/project-service.js'));
  await mod.evaluate();
  const initial = snapshot(fixture.tables().projects[0]), f = backend(initial);
  const owner = '00000000-0000-4000-8000-000000000001';
  const handler = mod.namespace.createProjectHandler({ client: f.client,
    authorize: async auth => auth === 'Bearer fixture-owner-aal2' ? owner : null,
    env: key => key === 'RATE_LIMIT_PEPPER' ? 'synthetic-local-only' : undefined });
  const routes = {};
  const serve = (file, body, type = 'text/javascript') => {
    routes[ORIGIN + '/' + file] = () => ({ status: 200, body, type, kind: 'm10-admin-fixture' });
  };
  function walk(dir) {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const file = dir + '/' + entry.name;
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith('.js')) serve(file, fs.readFileSync(path.join(ROOT, file)));
    }
  }
  walk('admin/js');
  for (const [file, type] of [['admin/index.html', 'text/html'], ['admin/admin.css', 'text/css'],
    ['admin/admin.js', 'text/javascript'], ['admin/vendor/supabase-js-2.112.3.js', 'text/javascript']])
    serve(file, fs.readFileSync(path.join(ROOT, file)), type);
  serve('admin/js/core/config.js', `export const environmentStatus={ok:true},SUPABASE_URL='${CMS}',SUPABASE_PUBLISHABLE_KEY='fixture-only',OWNER_USER_ID='${owner}',IS_LOCAL_ADMIN=true;`);
  serve('admin/js/core/supabase.js', `
    const state=window.__auth={user:null,aal:'aal1',nonOwner:false,callback:null,challengeError:false};
    const auth={
      getUser:async()=>({data:{user:state.user}}),
      getSession:async()=>({data:{session:state.user?{access_token:'fixture-owner-'+state.aal}:null}}),
      signInWithPassword:async({password})=>{if(password!=='fixture-password')return {error:{message:'synthetic invalid'}};
        state.user={id:state.nonOwner?'00000000-0000-4000-8000-000000000099':'${owner}'};state.aal='aal1';return {error:null};},
      signOut:async()=>{state.user=null;state.callback?.('SIGNED_OUT');return {error:null}},
      onAuthStateChange:callback=>{state.callback=callback;return {data:{subscription:{unsubscribe(){}}}}},
      mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:state.aal,nextLevel:'aal2'}}),
        listFactors:async()=>({data:{totp:[{id:'fixture-factor'}]}}),
        challenge:async()=>state.challengeError?{error:{message:'synthetic challenge failure'}}:{data:{id:'fixture-challenge'}},
        verify:async({code})=>{if(code!=='123456')return {error:{message:'synthetic invalid code'}};state.aal='aal2';return {error:null};}}
    };
    const from=table=>{const q=new Proxy({}, {get(_,key){if(key==='then')return resolve=>resolve({data:[],error:null,count:0});return ()=>q;}});return q;};
    export const configurationStatus={ok:true};export const supabaseClient={auth,from};`);
  routes[CMS + '/functions/v1/manage-project'] = async request => {
    const r = await handler(new Request(request.url, { method: request.method, headers: request.headers,
      ...(request.method === 'POST' ? { body: request.postData || '' } : {}) }));
    return { status: r.status, body: Buffer.from(await r.arrayBuffer()),
      type: r.headers.get('content-type') || 'application/json', kind: 'm10-synthetic-handler' };
  };
  p = await launch({ headless: true, _fixtureRoutes: routes });
  await p.send('Page.navigate', { url: ORIGIN + '/admin/index.html' }, p.session);
  await until("window.__auth&&!document.querySelector('#login-screen').hidden");
  await check('anonymous login screen with privileged shell hidden', "document.querySelector('#admin-screen').hidden");
  await submit('invalid');
  await until("document.querySelector('#login-error').textContent.length>0");
  await check('invalid password remains on login', "!document.querySelector('#login-screen').hidden&&document.querySelector('#admin-screen').hidden");
  await p.evaluate("document.querySelector('#remember-me').checked=false");
  await submit();
  await until("!document.querySelector('#mfa-challenge-screen').hidden");
  await check('password sign-in requires MFA before shell', "document.querySelector('#admin-screen').hidden");
  await check('remember off uses session persistence', "localStorage.getItem('portfolio-admin.persist')==='session'");
  await p.evaluate("document.querySelector('#mfa-code').value='000000';document.querySelector('#mfa-submit-button').click()");
  await until("document.querySelector('#mfa-error').textContent.length>0");
  await check('invalid TOTP keeps privileged shell hidden', "document.querySelector('#admin-screen').hidden");
  await p.evaluate("document.querySelector('#mfa-code').value='123456';document.querySelector('#mfa-submit-button').click()");
  await until("!document.querySelector('#admin-screen').hidden&&!!document.querySelector('.kpi-grid')");
  await check('owner synthetic AAL2 mounts real dashboard', "document.querySelector('#auth-layout').hidden");
  await p.evaluate("location.hash='#/projects'");
  await until("!!document.querySelector('.admin-table-projects tbody tr')");
  await check('actual router loads project list through server gateway', "document.querySelector('.admin-table-projects').textContent.includes('DEMO Project 1')");
  await p.evaluate("(()=>{const s=document.querySelector('#project-search');s.value='missing-synthetic';s.dispatchEvent(new Event('input'));})()");
  await check('project search empty result retains toolbar', "!document.querySelector('.admin-table-projects')&&!!document.querySelector('#project-search')");
  await p.evaluate("(()=>{const s=document.querySelector('#project-search');s.value='';s.dispatchEvent(new Event('input'));document.querySelector('.row-actions button').click();})()");
  await check('row menu opens with keyboard focus', "document.querySelector('.row-actions button').getAttribute('aria-expanded')==='true'&&document.activeElement.classList.contains('row-menu-item')");
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, p.session);
  await check('Escape closes menu and restores trigger focus', "!document.querySelector('.row-menu')&&document.activeElement.getAttribute('aria-expanded')==='false'");
  await p.evaluate("document.querySelector('.row-actions button').click();document.querySelector('.row-menu-item').click()");
  await until("!!document.querySelector('.m09-editor')");
  await check('Edit opens actual Working Draft editor', "document.querySelector('.m09-editor').textContent.includes('Save Draft')");
  await p.evaluate("location.hash='#/dashboard'");
  await until("!document.querySelector('.m09-editor')&&!!document.querySelector('.kpi-grid')");
  await check('clean editor navigation tears down project view', "!document.querySelector('.project-list-view')");
  await p.evaluate("window.__auth.callback('SIGNED_OUT')");
  await until("!document.querySelector('#login-screen').hidden");
  await check('session loss hides privileged shell and removes dashboard', "document.querySelector('#admin-screen').hidden&&!document.querySelector('.kpi-grid')");
  await p.evaluate("window.__auth.nonOwner=true");
  await submit();
  await until("!document.querySelector('#login-screen').hidden&&window.__auth.user===null");
  await check('non-owner synthetic sign-in is signed out', "document.querySelector('#admin-screen').hidden");
  await check('isolation before app and no real connections', p.audit.startupProbe === 'PASS' && p.audit.realConnections === 0);
  await check('no launcher errors', p.audit.errors.length === 0);
  await p.stop();
  await check('temporary profile cleaned', p.audit.cleanup === 'PASS');
  save();
  console.log(JSON.stringify({ passed: results.length, failed: 0, output: OUT }));
}
function save(error) {
  fs.writeFileSync(path.join(OUT, 'admin-results.json'), JSON.stringify({ classification: 'FIXTURE VERIFIED',
    passed: results.filter(r => r.status === 'PASS').length, failed: error ? 1 : 0,
    results, audit: p?.audit, ...(error ? { error: error.stack } : {}) }, null, 2));
}
run().catch(async error => {
  if (p) await p.stop();
  save(error);
  console.error(error.message);
  process.exitCode = 1;
});
