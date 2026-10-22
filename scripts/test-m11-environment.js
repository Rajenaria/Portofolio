/* Local-only contract/artifact tests. No modules make network requests.
   node scripts/test-m11-environment.js EXTERNAL_OUTPUT_DIRECTORY */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const contract = require('../js/environment');
const { prepare, cspFor } = require('./prepare-environment');
const fixture = require('./fixtures/portfolio-preview/fixture');
const ROOT = path.resolve(__dirname, '..'), OUT = path.resolve(process.argv[2] || '.');
assert(OUT !== ROOT && !OUT.startsWith(ROOT + path.sep), 'External output required');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL' }); throw error; }
}
const loopback = 'http://127.0.0.1:47832';
const base = fixture.environmentConfig(loopback);
const hosted = { ...base, deploymentId: 'synthetic-staging', environment: 'staging',
  frontendOrigins: ['https://staging.example.invalid'], projectRef: 'aaaaaaaaaaaaaaaaaaaa',
  backendOrigin: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co' };
const clone = value => structuredClone(value);
function denied(name, change, origin = loopback, seed = base) {
  test(name, () => assert.throws(() => contract.validateConfig({ ...clone(seed), ...change }, origin),
    error => error.message === contract.message && !!error.code));
}
function context(document = base, origin = loopback) {
  const ctx = vm.createContext({ URL, location: { origin }, PORTFOLIO_DEPLOYMENT: clone(document) });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/environment.js'), 'utf8'), ctx);
  return ctx;
}
try {
  test('fixture explicit loopback accepted', () => assert.equal(contract.validateConfig(base, loopback).environment, 'fixture'));
  test('local requires explicit input', () => assert.equal(contract.validateConfig({ ...base, environment: 'local' }, loopback).url, base.backendOrigin));
  test('staging explicit non-production target accepted without a request', () => assert.equal(contract.validateConfig(hosted, hosted.frontendOrigins[0]).projectRef, hosted.projectRef));
  test('preview explicit distinct target accepted', () => assert.equal(contract.validateConfig({ ...hosted, environment: 'preview' }, hosted.frontendOrigins[0]).environment, 'preview'));
  denied('unknown hostname cannot resolve any backend', {}, 'https://unknown.example.invalid');
  denied('arbitrary Vercel Preview cannot resolve production', {}, 'https://unknown-preview.vercel.app');
  denied('empty hostname file protocol rejected', {}, 'null');
  denied('missing input fails closed', { backendOrigin: undefined });
  test('null deployment fails closed', () => assert.throws(() => contract.validateConfig(null, loopback)));
  denied('missing key no fallback', { publishableKey: '' });
  denied('server secret never accepted as public key', { publishableKey: 'sb_secret_SYNTHETIC_DO_NOT_USE' });
  denied('JWT cannot masquerade as publishable input', { publishableKey: 'eyJ.SYNTHETIC.token' });
  denied('unknown credential fields rejected', { serviceRoleKey: 'SYNTHETIC_ONLY' });
  denied('unknown schema rejected', { schemaVersion: 2 });
  denied('unknown environment rejected', { environment: 'automatic' });
  denied('missing owner rejected', { ownerUserId: '' });
  denied('wildcard host rejected', { frontendOrigins: ['https://*.vercel.app'] }, 'https://branch.vercel.app');
  denied('duplicate origins rejected', { frontendOrigins: [loopback, loopback] });
  denied('frontend path rejected', { frontendOrigins: [loopback + '/admin'] });
  denied('backend path rejected', { backendOrigin: base.backendOrigin + '/rest/v1' });
  denied('backend query rejected', { backendOrigin: base.backendOrigin + '?target=other' });
  denied('backend credentials rejected', { backendOrigin: 'http://synthetic:synthetic@127.0.0.1:54321' });
  denied('loopback local profile cannot point to production', { backendOrigin: 'https://hldacuppejztqzqaejsi.supabase.co', projectRef: 'hldacuppejztqzqaejsi' });
  denied('fixture cannot use external backend', { backendOrigin: hosted.backendOrigin });
  denied('fixture cannot be deployed on hosted frontend', { frontendOrigins: hosted.frontendOrigins }, hosted.frontendOrigins[0]);
  denied('staging cannot use known production project', { projectRef: 'hldacuppejztqzqaejsi', backendOrigin: 'https://hldacuppejztqzqaejsi.supabase.co' }, hosted.frontendOrigins[0], hosted);
  denied('preview cannot use known production project', { environment: 'preview', projectRef: 'hldacuppejztqzqaejsi', backendOrigin: 'https://hldacuppejztqzqaejsi.supabase.co' }, hosted.frontendOrigins[0], hosted);
  denied('staging project ref must match URL', { projectRef: 'bbbbbbbbbbbbbbbbbbbb' }, hosted.frontendOrigins[0], hosted);
  denied('hosted backend requires HTTPS', { backendOrigin: hosted.backendOrigin.replace('https:', 'http:') }, hosted.frontendOrigins[0], hosted);
  denied('hosted environment cannot activate on localhost', { frontendOrigins: [loopback] }, loopback, hosted);
  denied('production candidate stays inactive pending owner approval', { environment: 'production', frontendOrigins: ['https://portofolio-rajenaria.vercel.app'], projectRef: 'hldacuppejztqzqaejsi', backendOrigin: 'https://hldacuppejztqzqaejsi.supabase.co' }, 'https://portofolio-rajenaria.vercel.app', hosted);
  test('public and admin resolve one record', () => {
    const c = context(), publicConfig = c.PortfolioEnvironment.requireEnvironment();
    const adminConfig = c.PortfolioEnvironment.requireEnvironment({ url: publicConfig.url, key: publicConfig.key, owner: publicConfig.owner });
    assert.equal(adminConfig.deploymentId, publicConfig.deploymentId);
  });
  for (const [field, value] of [['url', hosted.backendOrigin], ['key', 'sb_publishable_SYNTHETIC_DIFFERENT'], ['owner', '00000000-0000-4000-8000-000000000099']]) {
    test('consumer mismatch rejected: ' + field, () => assert.throws(() => context().PortfolioEnvironment.requireEnvironment({ [field]: value }), error => error.code === 'ENVIRONMENT_MISMATCH'));
  }
  test('input mutation after first read rejected', () => { const c = context(); c.PortfolioEnvironment.requireEnvironment(); c.PORTFOLIO_DEPLOYMENT.deploymentId = 'changed'; assert.throws(() => c.PortfolioEnvironment.requireEnvironment()); });
  test('replacement input after first read rejected', () => { const c = context(); c.PortfolioEnvironment.requireEnvironment(); c.PORTFOLIO_DEPLOYMENT = clone(base); assert.throws(() => c.PortfolioEnvironment.requireEnvironment()); });
  test('error contains no key or backend value', () => { const c = context(null), status = c.PortfolioEnvironment.status(); assert(!status.ok && status.config === null && !JSON.stringify(status).includes(base.publishableKey) && !JSON.stringify(status).includes(base.backendOrigin)); });
  test('default source config has no credentials and is inactive', () => {
    const c = vm.createContext({ URL, location: { origin: loopback } });
    for (const f of ['environment-config.js', 'environment.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), c);
    assert(!c.PortfolioEnvironment.status().ok); assert.equal(c.PORTFOLIO_DEPLOYMENT, null);
  });
  test('production artifact rejected before directory creation', () => {
    const out = path.join(OUT, 'must-not-exist');
    assert.throws(() => prepare({ ...hosted, environment: 'production' }, out)); assert(!fs.existsSync(out));
  });
  for (const [name, input] of [['empty-origins', { ...base, frontendOrigins: [] }], ['null-input', null]]) {
    test(name + ' artifact rejected before directory creation', () => {
      const out = path.join(OUT, name);
      assert.throws(() => prepare(input, out)); assert(!fs.existsSync(out));
    });
  }
  for (const input of [base, hosted]) {
    const target = path.join(OUT, input.environment + '-artifact');
    test(input.environment + ' artifact prepared locally', () => assert.equal(prepare(input, target).environment, input.environment));
    test(input.environment + ' artifact contains no docs, SQL, tooling or secrets', () => {
      for (const f of ['docs', 'scripts', 'supabase', '.env', '.git', 'package.json']) assert(!fs.existsSync(path.join(target, f)));
    });
    test(input.environment + ' artifact config resolves exact intended origin', () => {
      const c = vm.createContext({ URL, location: { origin: input.frontendOrigins[0] } });
      for (const f of ['environment-config.js', 'environment.js']) vm.runInContext(fs.readFileSync(path.join(target, 'js', f), 'utf8'), c);
      assert.equal(c.PortfolioEnvironment.requireEnvironment().url, input.backendOrigin);
    });
    test(input.environment + ' existing output is never overwritten', () => assert.throws(() => prepare(input, target)));
    const headers = JSON.parse(fs.readFileSync(path.join(target, 'vercel.json')));
    test(input.environment + ' headers have no production or wildcard Supabase', () => {
      const s = JSON.stringify(headers); assert(!s.includes('hldacuppejztqzqaejsi') && !s.includes('*.supabase.co'));
      for (const route of ['/', '/index.html', '/project.html', '/admin', '/admin/(.*)']) {
        const csp = headers.headers.find(r => r.source === route).headers.find(h => h.key === 'Content-Security-Policy').value;
        assert(csp.includes(input.backendOrigin));
      }
    });
    test(input.environment + ' meta CSP agrees with header target', () => {
      for (const file of ['index.html', 'project.html', 'admin/index.html']) {
        const html = fs.readFileSync(path.join(target, file), 'utf8');
        assert(html.match(/<meta http-equiv="Content-Security-Policy"/g).length === 1);
        const policy = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)[1];
        assert(policy.includes(input.backendOrigin)); assert(!policy.includes('frame-ancestors'));
      }
    });
    test(input.environment + ' headers/routes/cache safeguards retained', () => {
      const all = JSON.stringify(headers);
      for (const name of ['X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'Strict-Transport-Security', 'X-Frame-Options', 'X-Robots-Tag']) assert(all.includes(name));
      assert.equal(headers.cleanUrls, false); assert.equal(headers.trailingSlash, false);
      assert.equal(headers.headers.find(r => r.source === '/js/environment-config.js').headers[0].value, 'no-store');
    });
  }
  test('raw default CSP has no backend allowlist', () => {
    const s = JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'))));
    assert(!s.includes('supabase.co') && !s.includes('127.0.0.1:54321') && !s.includes('*.vercel.app'));
  });
  test('CSP needs no websocket or broad network wildcard', () => assert(!cspFor({ backendOrigin: hosted.backendOrigin }).includes('wss:')));
  console.log(JSON.stringify({ passed: results.length, failed: 0, output: OUT }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  fs.writeFileSync(path.join(OUT, 'environment-results.json'), JSON.stringify({ classification: 'LOCAL / STATIC VERIFIED; no cloud requests',
    passed: results.filter(r => r.status === 'PASS').length, failed: results.filter(r => r.status === 'FAIL').length, results }, null, 2));
}
