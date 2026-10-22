/* Shared browser/Node contract. No fetch, secrets, hostname fallback or SDK.
   A client configuration is deployment input, not an authorization boundary:
   real authorization remains in Auth, owner+AAL2, RLS and Edge handlers. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else if (!Object.hasOwn(root, 'PortfolioEnvironment')) {
    Object.defineProperty(root, 'PortfolioEnvironment', { value: factory(root) });
  }
})(globalThis, function (root) {
  'use strict';
  const MESSAGE = 'Konfigurasi layanan belum tersedia atau tidak sesuai. Hubungi pemilik situs.';
  const PRODUCTION_PROJECT_REF = 'hldacuppejztqzqaejsi';
  // Candidate portofolio-rajenaria.vercel.app is NOT owner-confirmed production.
  // Populating this list requires a later, explicit owner approval.
  const APPROVED_PRODUCTION_ORIGINS = Object.freeze([]);
  const FIELDS = ['schemaVersion', 'deploymentId', 'environment', 'frontendOrigins',
    'backendOrigin', 'projectRef', 'publishableKey', 'ownerUserId'];
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
  let firstSignature = null, firstDocument = null;

  function fail(code) {
    const error = new Error(MESSAGE);
    error.code = code;
    throw error;
  }
  function origin(value) {
    if (typeof value !== 'string') fail('INVALID_ORIGIN');
    let url;
    try { url = new URL(value); } catch { fail('INVALID_ORIGIN'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash || url.origin !== value || value.includes('*')) fail('INVALID_ORIGIN');
    return url;
  }
  function validateConfig(input, pageOrigin) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== FIELDS.length || FIELDS.some(key => !Object.hasOwn(input, key))) fail('UNCONFIGURED');
    if (input.schemaVersion !== 1 || !/^[a-zA-Z0-9-]{1,80}$/.test(input.deploymentId || '') ||
      !['local', 'fixture', 'staging', 'preview', 'production'].includes(input.environment)) fail('INVALID_CONFIG');
    if (!Array.isArray(input.frontendOrigins) || !input.frontendOrigins.length || input.frontendOrigins.length > 20 ||
      new Set(input.frontendOrigins).size !== input.frontendOrigins.length) fail('INVALID_ORIGINS');
    const pages = input.frontendOrigins.map(origin), backend = origin(input.backendOrigin);
    const page = origin(pageOrigin);
    if (!input.frontendOrigins.includes(page.origin)) fail('HOST_NOT_ALLOWED');
    if (!/^sb_publishable_[A-Za-z0-9_-]{12,}$/.test(input.publishableKey || '') ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.ownerUserId || '')) fail('INVALID_PUBLIC_IDENTITY');
    const local = ['local', 'fixture'].includes(input.environment);
    if (local) {
      if (input.projectRef !== 'local' || !LOOPBACK.has(backend.hostname) ||
        pages.some(url => !LOOPBACK.has(url.hostname))) fail('LOCAL_TARGET_REQUIRED');
    } else {
      if (backend.protocol !== 'https:' || backend.port ||
        !/^[a-z0-9]{20}$/.test(input.projectRef || '') ||
        backend.hostname !== input.projectRef + '.supabase.co' ||
        pages.some(url => url.protocol !== 'https:' || LOOPBACK.has(url.hostname))) fail('HOSTED_TARGET_REQUIRED');
      if (input.environment !== 'production' && input.projectRef === PRODUCTION_PROJECT_REF) fail('PRODUCTION_TARGET_DENIED');
      if (input.environment === 'production' && (input.projectRef !== PRODUCTION_PROJECT_REF ||
        pages.some(url => !APPROVED_PRODUCTION_ORIGINS.includes(url.origin)))) fail('PRODUCTION_APPROVAL_REQUIRED');
    }
    // localhost never becomes production/staging merely because input was copied.
    if (!local && LOOPBACK.has(page.hostname)) fail('HOSTED_PAGE_REQUIRED');
    return Object.freeze({ deploymentId: input.deploymentId, environment: input.environment,
      url: backend.origin, key: input.publishableKey, owner: input.ownerUserId,
      frontendOrigins: Object.freeze([...input.frontendOrigins]), projectRef: input.projectRef });
  }
  function requireEnvironment(expected) {
    const document = root.PORTFOLIO_DEPLOYMENT;
    const value = validateConfig(document, root.location?.origin);
    const signature = JSON.stringify(value);
    if (firstSignature !== null && (firstSignature !== signature || firstDocument !== document)) fail('ENVIRONMENT_MISMATCH');
    firstSignature = signature;
    firstDocument = document;
    if (expected && ['url', 'key', 'owner', 'deploymentId', 'environment'].some(key =>
      Object.hasOwn(expected, key) && expected[key] !== value[key])) fail('ENVIRONMENT_MISMATCH');
    return value;
  }
  function status() {
    try { return Object.freeze({ ok: true, config: requireEnvironment() }); }
    catch (error) { return Object.freeze({ ok: false, config: null, code: error.code || 'UNCONFIGURED', message: MESSAGE }); }
  }
  function configScript(input) {
    // Generator uses only validated fields; never serialize an arbitrary env file.
    validateConfig(input, input?.frontendOrigins?.[0]);
    input.frontendOrigins.forEach(page => validateConfig(input, page));
    const serialized = JSON.stringify(input).replace(/</g, '\\u003c');
    return `(function(root){const value=${serialized};if(Object.hasOwn(root,'PORTFOLIO_DEPLOYMENT')){if(JSON.stringify(root.PORTFOLIO_DEPLOYMENT)!==JSON.stringify(value))throw new Error(${JSON.stringify(MESSAGE)});return;}Object.defineProperty(root,'PORTFOLIO_DEPLOYMENT',{value});})(globalThis);\n`;
  }
  return Object.freeze({ validateConfig, requireEnvironment, status, configScript, message: MESSAGE });
});
