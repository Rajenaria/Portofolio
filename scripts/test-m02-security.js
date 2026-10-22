/* Offline M02 tests: node --experimental-vm-modules scripts/test-m02-security.js
   Real handlers/modules, synthetic clients and network denied. SQL concurrency
   is NOT executed here: the limiter double models serialized admission only. */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const ROOT = path.resolve(__dirname, "..");
const results = [];
const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");
const ID = "00000000-0000-4000-8000-000000000001";
const FILE = `certificates/${ID}.pdf`;
const tick = () => new Promise(resolve => setImmediate(resolve));

function runtime(extra = {}, overrides = {}) {
  const events = new Map();
  const win = {
    addEventListener: (name, fn) => events.set(name, [...(events.get(name) || []), fn]),
    removeEventListener: (name, fn) => events.set(name, (events.get(name) || []).filter(f => f !== fn)),
    localStorage: { getItem: () => null, setItem: () => {} }, setTimeout, clearTimeout,
    location: { hostname: "localhost", href: "http://localhost/", hash: "#/a" },
    history: { replaceState: (_, __, hash) => { win.location.hash = hash; } }, scrollTo() {}
  };
  const context = vm.createContext({ console: { log() {}, warn() {}, error() {} },
    Request, Response, Headers, Blob, URL, TextEncoder, TextDecoder, Uint8Array,
    crypto: webcrypto, AbortController, setTimeout, clearTimeout,
    fetch: () => { throw new Error("NETWORK DENIED"); },
    window: win, document: { documentElement: { setAttribute() {} }, querySelectorAll: () => [] },
    ...extra });
  const modules = new Map();
  function moduleFor(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    const relative = path.relative(ROOT, file).replaceAll("\\", "/");
    const source = overrides[relative] ?? fs.readFileSync(file, "utf8");
    const module = new vm.SourceTextModule(source, { context, identifier: file });
    modules.set(file, module);
    return module;
  }
  async function load(file) {
    const module = moduleFor(path.join(ROOT, file));
    if (module.status === "unlinked") await module.link((name, parent) => {
      if (name.startsWith("npm:")) return new vm.SyntheticModule(["createClient"], function () {
        this.setExport("createClient", extra.createClient);
      }, { context });
      return moduleFor(path.resolve(path.dirname(parent.identifier), name));
    });
    if (module.status !== "evaluated") await module.evaluate();
    return module.namespace;
  }
  return { load, context, win, events, modules };
}

async function test(name, run) {
  try { await run(); results.push({ name, status: "PASS" }); }
  catch (error) { results.push({ name, status: "FAIL", error: error.stack }); }
}

function limiterClient() {
  const admitted = new Map();
  return { admitted, rpc: async (_, { p_scope, p_identity }) => {
    const key = `${p_scope}:${p_identity}`;
    const count = admitted.get(key) || 0;
    const allowed = count < (p_scope === "guestbook" ? 3 : 60);
    if (allowed) admitted.set(key, count + 1);
    await tick();
    return { data: allowed, error: null };
  } };
}
const env = name => ({ RATE_LIMIT_PEPPER: "synthetic-only-pepper" })[name];

async function certificateFixture(options = {}) {
  let reads = 0, downloads = 0;
  const row = { status: "published", deleted_at: null, document_bucket: "portfolio-documents",
    document_path: FILE, document_type: "pdf", ...options.row };
  const client = { ...limiterClient(), from: () => ({ select() { return this; }, eq() { return this; },
    async maybeSingle() {
      reads++;
      if (options.readError) return { error: new Error("private database detail") };
      return { data: options.absent ? null : reads > 1 && options.changed ? { ...row, ...options.changed } : row };
    } }), storage: { from: () => ({ download: async () => {
      downloads++;
      return options.downloadError ? { error: new Error("secret storage detail") } :
        { data: new Blob(["%PDF-synthetic fixture"], { type: "application/pdf" }) };
    } }) } };
  if (options.rateError) client.rpc = async () => ({ error: new Error("private RPC detail") });
  if (options.rateDeny) client.rpc = async () => ({ data: false });
  const r = runtime();
  const { createDocumentHandler } = await r.load("supabase/functions/certificate-document/handler.js");
  return { handle: createDocumentHandler({ client, env }), counts: () => ({ reads, downloads }) };
}

(async () => {
  for (const [name, row, status] of [
    ["draft", { status: "draft" }, 404], ["hidden-maps-to-draft", { status: "draft" }, 404],
    ["archived", { status: "archived" }, 404], ["trash", { deleted_at: "2026-01-01" }, 404],
    ["published", {}, 200], ["wrong-bucket", { document_bucket: "portfolio-media" }, 404],
    ["path-traversal", { document_path: "../other.pdf" }, 404],
    ["type-mismatch", { document_type: "webp" }, 404], ["empty-reference", { document_path: null }, 404]
  ]) await test(`certificate/${name}`, async () => {
    const f = await certificateFixture({ row });
    const response = await f.handle(new Request(`https://fixture.invalid/?id=${ID}`));
    assert.equal(response.status, status);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    if (status !== 200) assert.equal(f.counts().downloads, 0);
    else { assert.equal(f.counts().reads, 2); assert.match(await response.text(), /synthetic/); }
  });
  for (const [name, options, status] of [
    ["not-found", { absent: true }, 404], ["database-failure", { readError: true }, 503],
    ["storage-failure", { downloadError: true }, 503], ["limiter-failure", { rateError: true }, 503],
    ["limited", { rateDeny: true }, 429], ["hide-during-fetch", { changed: { status: "draft" } }, 404],
    ["replace-during-fetch", { changed: { document_path: FILE.replace("0001.pdf", "0002.pdf") } }, 404]
  ]) await test(`certificate/${name}`, async () => {
    const f = await certificateFixture(options);
    const res = await f.handle(new Request(`https://fixture.invalid/?id=${ID}`));
    assert.equal(res.status, status); assert.doesNotMatch(await res.text(), /secret|private|RPC/);
  });
  for (const [method, query, status] of [["POST", `id=${ID}`, 405], ["GET", "id=bad", 400],
    ["GET", `id=${ID}&path=other`, 400], ["OPTIONS", "", 204]]) {
    await test(`certificate/request-${method}-${query}`, async () => {
      const f = await certificateFixture();
      assert.equal((await f.handle(new Request(`https://fixture.invalid/?${query}`, { method }))).status, status);
    });
  }
  await test("certificate/download-is-bytes-not-signed-redirect", async () => {
    const f = await certificateFixture();
    const res = await f.handle(new Request(`https://fixture.invalid/?id=${ID}&download`));
    assert.equal(res.status, 200); assert.equal(res.headers.get("location"), null);
    assert.match(res.headers.get("content-disposition"), /^attachment/);
  });

  let guestHandler;
  const comments = [];
  const guestClient = { ...limiterClient(), from: table => {
    assert.equal(table, "comments");
    return { insert(row) { comments.push(row); return this; }, select() { return this; },
      single: async () => ({ data: { id: "synthetic", status: comments.at(-1).status } }) };
  } };
  const guestEnv = name => ({ SUPABASE_URL: "http://fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-only",
    RATE_LIMIT_PEPPER: "synthetic-only-pepper" })[name];
  const r = runtime({ Deno: { env: { get: guestEnv }, serve: fn => { guestHandler = fn; } },
    createClient: () => guestClient });
  await r.load("supabase/functions/submit-comment/index.ts");
  const request = (body, headers = {}) => new Request("https://fixture.invalid/submit-comment", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body
  });
  await test("guestbook/40-parallel-UA-and-untrusted-IP-changes-admit-only-three-MODEL", async () => {
    const responses = await Promise.all(Array.from({ length: 40 }, (_, i) => guestHandler(
      request(JSON.stringify({ name: "Visitor", message: "Thank you for sharing your work." }),
        { "user-agent": `agent-${i}`, "x-forwarded-for": `192.0.2.${i}` }))));
    assert.equal(responses.filter(res => res.status === 201).length, 3);
    assert.equal(responses.filter(res => res.status === 429).length, 37);
    assert.equal(comments.length, 3); assert.equal(comments[0].status, "approved");
  });
  for (const [name, body, headers, status] of [
    ["invalid-json", "{", {}, 400], ["null", "null", {}, 400], ["array", "[]", {}, 400],
    ["coerced-types", '{"name":{},"message":123}', {}, 400],
    ["too-short", '{"name":"V","message":"ok"}', {}, 400],
    ["oversized-stream", " ".repeat(8193), {}, 413],
    ["oversized-length", "{}", { "content-length": "10000" }, 413],
    ["wrong-content-type", "{}", { "content-type": "text/plain" }, 415]
  ]) await test(`guestbook/${name}`, async () => {
    assert.equal((await guestHandler(request(body, headers))).status, status);
  });
  for (const [name, message, expected] of [["blocked", "fuck", 422],
    ["pending", "https://one.example https://two.example", 201]]) await test(`guestbook/moderation-${name}`, async () => {
    guestClient.admitted.clear();
    const res = await guestHandler(request(JSON.stringify({ name: "Visitor", message })));
    assert.equal(res.status, expected); assert.equal(comments.at(-1).status, name);
  });
  await test("guestbook/limiter-failure-fails-closed", async () => {
    const original = guestClient.rpc; guestClient.rpc = async () => ({ error: "synthetic" });
    const count = comments.length;
    const res = await guestHandler(request('{"name":"Visitor","message":"Hello there"}'));
    assert.equal(res.status, 500); assert.equal(comments.length, count);
    assert.doesNotMatch(await res.text(), /synthetic|RPC|service/); guestClient.rpc = original;
  });

  await test("identity/trusted-header-UA-independent-and-untrusted-fallback", async () => {
    const secure = await r.load("supabase/functions/_shared/request-security.js");
    const headers = { "x-real-ip": "192.0.2.1", "user-agent": "one" };
    const trusted = key => key === "TRUSTED_PROXY_IP_HEADER" ? "x-real-ip" : env(key);
    const first = await secure.requestIdentity(new Request("https://fixture.invalid", { headers }), trusted);
    const second = await secure.requestIdentity(new Request("https://fixture.invalid", {
      headers: { ...headers, "user-agent": "two" } }), trusted);
    assert.equal(first, second);
    const chain = await secure.requestIdentity(new Request("https://fixture.invalid", {
      headers: { "x-real-ip": "192.0.2.1, 192.0.2.2" } }), trusted);
    const missing = await secure.requestIdentity(new Request("https://fixture.invalid"), trusted);
    assert.equal(chain, missing); assert.notEqual(first, missing);
  });

  const documentSource = read("admin/js/core/document-storage.js")
    .replace(/^import .*;\r?\n/gm, "").replace(/\bexport /g, "");
  for (const mode of ["success", "verify-fails", "commit-rejected", "commit-ack-lost", "commit-readback-fails"]) {
    await test(`replacement/${mode}`, async () => {
      const objects = new Set([FILE]); let reference = FILE;
      const context = vm.createContext({ crypto: webcrypto, t: key => key,
        MediaStorageError: class extends Error { constructor(message, code) { super(message); this.code = code; } },
        supabaseClient: { storage: { from: () => ({
          upload: async path => { objects.add(path); return { data: { path } }; },
          info: async path => mode === "verify-fails" ? { error: "synthetic" } : { data: { path } }
        }) } },
        removeObjects: async (_, paths) => { for (const path of paths) {
          assert.notEqual(path, reference, "Deletion of a referenced object"); objects.delete(path);
        } return { failed: [] }; }
      });
      vm.runInContext(documentSource + ";globalThis.replace=replaceDocument;", context);
      const outcome = await context.replace({ file: new Blob(["fixture"]), type: "pdf",
        previous: { bucket: "portfolio-documents", path: FILE }, commit: async ({ path }) => {
          if (mode === "commit-rejected") throw new Error("synthetic reject");
          reference = path;
          if (["commit-ack-lost", "commit-readback-fails"].includes(mode)) throw new Error("synthetic uncertain");
        } }).then(() => "success", error => error.code);
      assert.equal(outcome, mode === "success" ? "success" : mode === "verify-fails" ? "VERIFY_FAILED" : "COMMIT_UNCONFIRMED");
      assert(objects.has(reference)); assert(objects.has(FILE));
    });
  }

  await test("guard/clean-cancel-confirm-release-and-beforeunload", async () => {
    const rt = runtime(); const guard = await rt.load("admin/js/core/navigation-guard.js");
    let dirty = false, allow = false, calls = 0;
    const release = guard.registerNavigationGuard(() => dirty, async () => { calls++; return allow; });
    assert.equal(await guard.requestLeave(), true); assert.equal(calls, 0);
    dirty = true; assert.equal(await guard.requestLeave(), false); assert.equal(dirty, true);
    allow = true; assert.equal(await guard.requestLeave(), true);
    let warned = false; rt.events.get("beforeunload")[0]({ preventDefault: () => { warned = true; } });
    assert.equal(warned, true); release(); assert.equal(guard.hasUnsavedChanges(), false);
  });
  await test("guard/overlapping-navigation-does-not-open-another-prompt", async () => {
    const rt = runtime(), guard = await rt.load("admin/js/core/navigation-guard.js");
    let settle; guard.registerNavigationGuard(() => true, () => new Promise(resolve => { settle = resolve; }));
    const first = guard.requestLeave(); assert.equal(await guard.requestLeave(), false);
    settle(false); assert.equal(await first, false);
  });
  await test("guard/language-cancel-preserves-language-and-confirm-notifies-approved-reload", async () => {
    const rt = runtime(); const lang = await rt.load("admin/js/core/i18n.js");
    const guard = await rt.load("admin/js/core/navigation-guard.js");
    let allowed = false, notified = 0;
    guard.registerNavigationGuard(() => true, () => allowed);
    lang.onLanguageChange((code, options) => { assert.equal(options.guardApproved, true); notified++; });
    const original = lang.getLanguage(), next = original === "id" ? "en" : "id";
    await lang.setLanguage(next); assert.equal(lang.getLanguage(), original); assert.equal(notified, 0);
    allowed = true; await lang.setLanguage(next); assert.equal(lang.getLanguage(), next); assert.equal(notified, 1);
  });
  await test("guard/router-hash-cancel-reload-confirm-and-clean-navigation", async () => {
    const rt = runtime(); const { createRouter } = await rt.load("admin/js/core/router.js");
    const guard = await rt.load("admin/js/core/navigation-guard.js");
    let dirty = true, allowed = false, mounts = [];
    guard.registerNavigationGuard(() => dirty, () => allowed);
    const router = createRouter({ container: { firstChild: null }, defaultRoute: "a",
      routes: ["a", "b"].map(name => ({ name, render: async () => { mounts.push(name); } })) });
    router.start(); await tick(); assert.equal(router.getActiveRoute(), "a");
    rt.win.location.hash = "#/b"; await rt.events.get("hashchange")[0]();
    assert.equal(router.getActiveRoute(), "a"); assert.equal(rt.win.location.hash, "#/a");
    assert.equal(await router.reload(), false); assert.equal(mounts.length, 1);
    allowed = true; assert.equal(await router.reload(), true); assert.equal(mounts.length, 2);
    dirty = false; rt.win.location.hash = "#/b"; await rt.events.get("hashchange")[0]();
    assert.equal(router.getActiveRoute(), "b"); router.stop();
  });

  await test("SQL/static-service-only-lock-before-count-and-insert-NOT-runtime", () => {
    const sql = read("supabase/migrations/20261019010000_m02_request_budgets.sql");
    assert(sql.indexOf("pg_advisory_xact_lock") < sql.indexOf("select count(*)"));
    assert(sql.indexOf("select count(*)") < sql.indexOf("insert into app_private.request_budget_events"));
    assert.match(sql, /revoke all on function[^;]+from public, anon, authenticated/);
    assert.match(sql, /grant execute[^;]+to service_role/);
  });
  await test("privacy/static-private-bucket-no-anonymous-raw-access-no-minimum-trigger", () => {
    const sql = read("supabase/migrations/20261019011000_m02_certificate_privacy.sql");
    assert.match(sql, /set public = false/); assert.match(sql, /as restrictive for select/);
    assert.match(sql, /drop trigger if exists certificates_minimum_published/);
    assert.match(read("supabase/config.toml"), /\[storage.buckets.portfolio-documents\]\r?\npublic = false/);
    assert.doesNotMatch(read("admin/js/core/document-storage.js"), /createSignedUrl|getPublicUrl/);
  });
  const summary = { total: results.length, passed: results.filter(r => r.status === "PASS").length,
    failed: results.filter(r => r.status === "FAIL").length };
  console.log(JSON.stringify({ summary, limitations: ["No PostgreSQL/RLS/Storage server was contacted.",
    "Parallel admission uses a serialized double, not proof of database concurrency."], results }, null, 2));
  if (summary.failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
