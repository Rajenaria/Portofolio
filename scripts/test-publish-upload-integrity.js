/*
  Offline integrity regression checks. Run: node scripts/test-publish-upload-integrity.js
  Uses the real Storage helpers and project-editor lifecycle functions with an
  in-memory Supabase double; the SDK contract check uses a mocked fetch.
  No credentials or network requests are used.
*/
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const mediaSource = read("admin/js/core/media-storage.js")
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/\bexport /g, "");
const editorSource = read("admin/js/modules/projects/editor-view.js");

function section(start, end) {
  const first = editorSource.indexOf(start);
  const last = editorSource.indexOf(end, first + start.length);
  assert(first >= 0 && last > first, "Editor test boundary was not found.");
  return editorSource.slice(first, last);
}

const lifecycleSource = section("  let publishRecoveryNeeded", "  async function save(");
const publishSource = section("  async function publish()", "  function refreshStatusUi()");
const saveSource = section("  async function save(", "  function applyServerState(");
const persistSource = section("  async function persistMedia(", "  let publishRecoveryNeeded");

const results = [];
const pairOf = row => ({
  bucket: row.bucket_name, desktopPath: row.desktop_path, mobilePath: row.mobile_path
});
const copy = value => JSON.parse(JSON.stringify(value));

function fixture(faults = [], options = {}) {
  const activeFaults = new Set(faults);
  const consumed = new Set();
  const events = [];
  const objects = new Map();
  const activeDeletes = [];
  let serial = 0;
  let reads = 0;
  let statusWrites = 0;
  let phase = "";
  const bucket = options.public ? "portfolio-media" : "portfolio-staging";
  const cover = {
    bucket,
    desktopPath: "projects/p/cover/original-desktop.webp",
    mobilePath: "projects/p/cover/original-mobile.webp"
  };
  const db = {
    project: {
      id: "p", status: "draft", published_at: null, updated_at: "initial",
      deleted_at: null, cover_bucket: cover.bucket,
      cover_desktop_path: cover.desktopPath, cover_mobile_path: cover.mobilePath
    },
    media: [1, 2].map(i => ({
      id: "g" + i, project_id: "p", bucket_name: bucket,
      desktop_path: "projects/p/gallery" + i + "/original-desktop.webp",
      mobile_path: "projects/p/gallery" + i + "/original-mobile.webp",
      alt_text: "", sort_order: i, is_active: true
    }))
  };
  const dbCover = () => ({
    bucket: db.project.cover_bucket,
    desktopPath: db.project.cover_desktop_path,
    mobilePath: db.project.cover_mobile_path
  });
  const references = () => [dbCover(), ...db.media.map(pairOf)]
    .flatMap(p => [p.desktopPath, p.mobilePath].filter(Boolean).map(k => p.bucket + "|" + k));
  for (const key of references()) objects.set(key, new Blob(["synthetic WebP"]));
  for (let i = 0; i < (options.count || 0); i++) {
    objects.set("portfolio-media|items/" + (options.order || "aaa") + i + ".webp", {});
  }
  function fails(name) {
    if (activeFaults.has(name) && !consumed.has(name)) {
      consumed.add(name);
      events.push("FAIL:" + name);
      return true;
    }
    return false;
  }
  function category(key) {
    return key.includes("/cover/") ? "cover" : key.includes("/gallery1/") ? "gallery1" : "gallery2";
  }
  function error(name) { return { data: null, error: new Error("synthetic " + name) }; }

  const client = {
    storage: {
      from: storageBucket => ({
        async upload(key, file) {
          const kind = key.endsWith("-mobile.webp") ? "mobile" : "desktop";
          if (fails("upload-" + kind)) return error("upload");
          if (objects.has(storageBucket + "|" + key)) return error("collision");
          objects.set(storageBucket + "|" + key, file);
          return { data: { path: key }, error: null };
        },
        async info(key) {
          events.push("info:" + storageBucket + "|" + key);
          if (fails("info") || fails("info-" + category(key))) return error("info");
          if (activeFaults.has("missing-mobile") && key.endsWith("-mobile.webp")) {
            return error("missing mobile");
          }
          return objects.has(storageBucket + "|" + key)
            ? { data: { id: "synthetic", name: key }, error: null }
            : error("missing object");
        },
        async list() { throw new Error("Directory listing must not be used."); },
        async copy(from, to, opts) {
          const label = category(from) + "-" + (from.endsWith("-mobile.webp") ? "mobile" : "desktop");
          if (fails("copy-" + label) || activeFaults.has("copy-hard-" + label)) {
            return error("copy");
          }
          if (!objects.has(storageBucket + "|" + from)) return error("source missing");
          if (objects.has(opts.destinationBucket + "|" + to)) return error("collision");
          objects.set(opts.destinationBucket + "|" + to, objects.get(storageBucket + "|" + from));
          if (fails("copy-ack-lost")) return error("copy acknowledgement");
          return { data: { path: to }, error: null };
        },
        async download(key) {
          if ([...activeFaults].some(f => f.startsWith("copy-hard-"))) return error("download");
          return objects.has(storageBucket + "|" + key)
            ? { data: objects.get(storageBucket + "|" + key), error: null }
            : error("download source missing");
        },
        async remove(paths) {
          const kind = storageBucket === "portfolio-staging" ? "staging" : "public";
          if (fails("cleanup-" + kind) || fails("cleanup-" + kind + "-" + category(paths[0]))) {
            return error("cleanup");
          }
          for (const key of paths) {
            const full = storageBucket + "|" + key;
            if (references().includes(full)) activeDeletes.push(full);
            objects.delete(full);
          }
          return { data: paths, error: null };
        },
        getPublicUrl: key => ({ data: { publicUrl: "https://offline.invalid/" + key } })
      })
    },
    from(table) {
      let patch = null;
      let operation = "select";
      let single = false;
      let projection = "";
      const filters = {};
      const q = {
        select(columns) { projection = columns; return q; },
        update(value) { operation = "update"; patch = value; return q; },
        insert(value) { operation = "insert"; patch = value; return q; },
        delete() { operation = "delete"; return q; },
        eq(key, value) { filters[key] = value; return q; },
        is(key, value) { filters[key] = value; return q; },
        match(values) { Object.assign(filters, values); return q; },
        order() { return q; },
        maybeSingle() { single = true; return q; },
        then(resolve, reject) { return execute().then(resolve, reject); }
      };
      async function execute() {
        const rows = table === "projects" ? [db.project] : db.media;
        let found = rows.filter(row => Object.entries(filters).every(([key, value]) => row[key] === value));
        if (operation === "select") {
          if (table === "projects") {
            reads++;
            phase = reads === 1 ? "initial" : reads === 2 ? "ready" : "confirm";
          }
          if (fails("read-" + phase) ||
              (statusWrites > 0 && activeFaults.has("read-after-status"))) return error("read");
          const data = copy(found);
          return { data: single ? data[0] || null : data, error: null };
        }
        let label = "save-parent";
        if (patch?.status) label = "status";
        else if (patch?.cover_bucket) {
          label = patch.cover_bucket === "portfolio-staging" ? "rollback-cover" : "cover-update";
        } else if (patch?.bucket_name) {
          label = (patch.bucket_name === "portfolio-staging" ? "rollback-" : "") +
            (filters.id === "g1" ? "gallery1" : "gallery2") +
            (patch.bucket_name === "portfolio-staging" ? "" : "-update");
        }
        if (operation === "insert") label = "gallery-insert";
        const ackLost = fails(label + "-ack-lost");
        if (!ackLost && fails(label)) return error(label);
        if (operation === "insert") {
          const row = { id: "inserted-" + (++serial), ...patch };
          db.media.push(row); found = [row];
        } else if (operation === "delete") {
          db.media = db.media.filter(row => !found.includes(row));
        } else {
          for (const row of found) Object.assign(row, patch);
        }
        if (patch?.status && found.length) statusWrites++;
        if (ackLost) return error("acknowledgement lost");
        return { data: copy(found), error: null };
      }
      return q;
    }
  };

  let stored = { ...cover };
  let pending = options.coverPending ? {
    desktopFile: new File(["synthetic"], "desktop.webp"),
    mobileFile: new File(["synthetic"], "mobile.webp")
  } : null;
  let items = db.media.map(row => ({
    id: row.id, altText: "", sortOrder: row.sort_order,
    isActive: true, pendingFiles: null
  }));
  const snapshot = () => JSON.stringify(items.map(row => [
    row.id, row.altText, row.sortOrder, row.isActive, Boolean(row.pendingFiles)
  ]));
  const ctx = {
    console: { error() {} }, File, Blob, URL, Date,
    crypto: { randomUUID: () => "fresh-" + (++serial) },
    fetch() { throw new Error("Network is forbidden."); },
    supabaseClient: client,
    state: { id: "p", status: "draft", publishedAt: null },
    busy: false, loadedMedia: copy(db.media),
    baselineMedia: snapshot(),
    coverField: {
      getStored: () => stored ? { ...stored } : null,
      setStored: value => { stored = value ? { ...value } : null; },
      commit: value => { stored = { ...value }; pending = null; },
      hasPending: () => Boolean(pending),
      getPendingFiles: () => pending
    },
    documentationManager: {
      snapshot, getItems: () => items, getRemoved: () => [],
      setSavedMedia(rows) {
        items = rows.map(row => ({
          id: row.id, altText: row.alt_text || "", sortOrder: row.sort_order,
          isActive: row.is_active !== false, pendingFiles: null
        }));
      }
    },
    setBusy: value => { ctx.busy = value; },
    toast: (message, level) => events.push("toast:" + level + ":" + message),
    t: key => key, refreshStatusUi() {}, syncSlugLock() {},
    resetBaseline: () => { ctx.baselineMedia = snapshot(); },
    onSaved: null,
    validate: () => !fails("validate"),
    currentValues: () => ({}), slugLocked: () => true,
    persistParagraphs: async () => { if (fails("paragraphs")) throw Error("paragraphs"); },
    persistTechnologies: async () => { if (fails("technologies")) throw Error("technologies"); },
    applyServerState: row => {
      ctx.state.status = row.status;
      ctx.state.publishedAt = row.published_at;
    },
    resetBaselineFormOnly() {}, friendlyError: () => "synthetic error",
    heading: { textContent: "" }, fields: { title: { value: "Synthetic project" } },
    trimmed: value => value.trim(), firstSaveMessage: () => "saved",
    targetBucket: () => ctx.state.status === "published" ? "portfolio-media" : "portfolio-staging",
    reloadMedia: async () => {
      if (fails("reload-media")) throw Error("reload media");
      ctx.loadedMedia = copy(db.media);
      ctx.documentationManager.setSavedMedia(ctx.loadedMedia);
    }
  };
  vm.createContext(ctx);
  vm.runInContext(mediaSource, ctx);
  vm.runInContext(lifecycleSource + persistSource + saveSource + publishSource, ctx);
  return {
    ctx, db, objects, events, activeDeletes,
    missing: () => references().filter(key => !objects.has(key)),
    heal() { activeFaults.clear(); },
    reopen() {
      ctx.state.status = db.project.status;
      ctx.state.publishedAt = db.project.published_at;
      ctx.coverField.setStored(dbCover());
      pending = null;
      ctx.loadedMedia = copy(db.media);
      ctx.documentationManager.setSavedMedia(ctx.loadedMedia);
      ctx.baselineMedia = snapshot();
      vm.runInContext("publishRecoveryNeeded = false", ctx);
    }
  };
}

async function test(name, run) {
  try {
    await run();
    results.push({ name, status: "PASS" });
  } catch (error) {
    results.push({ name, status: "FAIL", error: error.stack });
  }
}

function intact(f) {
  assert.deepEqual(f.activeDeletes, [], "Cleanup deleted an active object.");
  assert.deepEqual(f.missing(), [], "A database reference has no object.");
  assert.equal(f.ctx.busy, false, "Editor remained busy.");
}

(async () => {
  const faultCases = [
    [],
    ["save-parent"], ["paragraphs"], ["technologies"], ["reload-media"],
    ...["cover", "gallery1", "gallery2"].flatMap(name =>
      ["desktop", "mobile"].map(variant => ["copy-hard-" + name + "-" + variant])),
    ...["cover", "gallery1", "gallery2"].map(name => ["info-" + name]),
    ["cover-update"], ["gallery1-update"], ["gallery2-update"],
    ["gallery2-update", "rollback-cover"], ["gallery2-update", "rollback-gallery1"],
    ["status"],
    ...["cover", "gallery1", "gallery2"].map(name => ["cleanup-staging-" + name]),
    ["gallery1-update", "cleanup-public"],
    ["copy-hard-gallery1-mobile", "cleanup-public"],
    ["read-initial"], ["read-ready"], ["read-confirm"], ["status", "read-after-status"],
    ["cover-update-ack-lost"], ["gallery1-update-ack-lost"], ["gallery2-update-ack-lost"],
    ["status-ack-lost"], ["status-ack-lost", "read-after-status"],
    ["copy-ack-lost"], ["copy-cover-mobile"]
  ];
  for (const faults of faultCases) {
    for (const reopen of [false, true]) {
      await test("publish/" + (faults.join("+") || "normal") + "/retry-" +
        (reopen ? "reopened" : "same-editor"), async () => {
        const f = fixture(faults);
        await f.ctx.publish();
        intact(f);
        f.heal();
        if (reopen) f.reopen();
        await f.ctx.publish();
        intact(f);
        assert.equal(f.db.project.status, "published", "Healthy retry did not publish.");
        assert.equal(f.ctx.state.status, "published", "Editor did not reconcile publication.");
      });
    }
  }

  for (const count of [0, 100, 125, 1000]) {
    for (const order of ["aaa", "zzz"]) {
      for (const fault of [null, "upload-desktop", "upload-mobile", "info", "missing-mobile"]) {
        await test("upload/" + count + "/" + order + "/" + (fault || "normal"), async () => {
          const f = fixture(fault ? [fault] : [], { count, order });
          const old = [...f.objects.keys()];
          const upload = () => f.ctx.uploadVariantPair({
            directory: "items",
            desktopFile: new File(["synthetic"], "desktop.webp"),
            mobileFile: new File(["synthetic"], "mobile.webp")
          });
          if (fault) await assert.rejects(upload);
          else {
            const result = await upload();
            assert(f.objects.has(result.bucket + "|" + result.desktopPath));
            assert(f.objects.has(result.bucket + "|" + result.mobilePath));
          }
          assert(old.every(key => f.objects.has(key)), "Old files were removed.");
          assert.deepEqual(f.activeDeletes, []);
        });
      }
    }
  }

  for (const missing of ["desktop", "mobile", "both", "neither"]) {
    await test("pair/" + missing, async () => {
      const f = fixture([], { public: true });
      const pair = {
        bucket: f.db.project.cover_bucket,
        desktopPath: f.db.project.cover_desktop_path,
        mobilePath: f.db.project.cover_mobile_path
      };
      if (missing === "desktop" || missing === "both") f.objects.delete(pair.bucket + "|" + pair.desktopPath);
      if (missing === "mobile" || missing === "both") f.objects.delete(pair.bucket + "|" + pair.mobilePath);
      if (missing === "neither") await f.ctx.verifyVariantPair(pair);
      else await assert.rejects(() => f.ctx.verifyVariantPair(pair));
    });
  }

  await test("publish/missing-existing-public-object", async () => {
    const f = fixture([], { public: true });
    f.objects.delete("portfolio-media|" + f.db.project.cover_mobile_path);
    await f.ctx.publish();
    assert.equal(f.db.project.status, "draft");
    assert(!f.events.some(event => event === "toast:success:projEditor.published"));
  });

  await test("promotion/collision-does-not-delete-existing-object", async () => {
    const f = fixture();
    const desktopPath = "projects/p/cover/fresh-1-desktop.webp";
    const mobilePath = "projects/p/cover/fresh-1-mobile.webp";
    Object.assign(f.db.media[0], {
      bucket_name: "portfolio-media", desktop_path: desktopPath, mobile_path: mobilePath
    });
    for (const key of [desktopPath, mobilePath]) f.objects.set("portfolio-media|" + key, {});
    await f.ctx.publish();
    intact(f);
    f.heal();
    await f.ctx.publish();
    intact(f);
    assert.equal(f.db.project.status, "published");
  });

  await test("SDK/info-uses-exact-object-path-with-mock-fetch", async () => {
    const sdkContext = vm.createContext({
      console, URL, URLSearchParams, Headers, Request, Response, AbortController,
      TextEncoder, TextDecoder, setTimeout, clearTimeout, queueMicrotask,
      crypto: require("node:crypto").webcrypto,
      WebSocket: class { constructor() { throw new Error("Network is forbidden."); } },
      fetch() { throw new Error("Network is forbidden."); }
    });
    vm.runInContext(read("admin/vendor/supabase-js-2.112.3.js"), sdkContext);
    const { createClient } = sdkContext.supabase;
    const requests = [];
    const client = createClient("http://127.0.0.1:54321", "offline-placeholder", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (url, options) => {
        requests.push({ url: String(url), method: options.method });
        return new Response(JSON.stringify({ id: "synthetic", name: "folder/mobile.webp" }), {
          status: 200, headers: { "Content-Type": "application/json" }
        });
      } }
    });
    const result = await client.storage.from("portfolio-media").info("folder/mobile.webp");
    assert.equal(result.error, null);
    assert.equal(result.data.id, "synthetic");
    assert.equal(requests.length, 1);
    assert.equal(new URL(requests[0].url).pathname,
      "/storage/v1/object/info/portfolio-media/folder/mobile.webp");
    assert.equal(requests[0].method, "GET");
  });

  for (const commit of ["success", "reject", "ack-lost", "cleanup-fails"]) {
    await test("replacement/" + commit, async () => {
      const f = fixture(commit === "cleanup-fails" ? ["cleanup-public"] : [], { public: true });
      const previous = {
        bucket: f.db.project.cover_bucket,
        desktopPath: f.db.project.cover_desktop_path,
        mobilePath: f.db.project.cover_mobile_path
      };
      const replace = () => f.ctx.replaceMedia({
        directory: "projects/p/cover",
        desktopFile: new File(["synthetic"], "desktop.webp"),
        mobileFile: new File(["synthetic"], "mobile.webp"), previous,
        commit: async next => {
          if (commit !== "reject") Object.assign(f.db.project, {
            cover_bucket: next.bucket, cover_desktop_path: next.desktopPath,
            cover_mobile_path: next.mobilePath
          });
          if (commit === "reject" || commit === "ack-lost") throw Error(commit);
        }
      });
      if (commit === "reject" || commit === "ack-lost") {
        await assert.rejects(replace);
        assert(f.objects.has(previous.bucket + "|" + previous.desktopPath));
      } else {
        const result = await replace();
        assert.equal(Boolean(result.cleanupWarning), commit === "cleanup-fails");
      }
      intact(f);
    });
  }

  for (const fault of ["cover-update-ack-lost", "cover-update", "info"]) {
    await test("save/cover-replacement/" + fault, async () => {
      const f = fixture([fault], { coverPending: true });
      await f.ctx.save({ forPublish: true });
      intact(f);
      f.heal();
      f.reopen();
      await f.ctx.publish();
      intact(f);
      assert.equal(f.db.project.status, "published");
    });
  }

  const summary = {
    total: results.length,
    passed: results.filter(row => row.status === "PASS").length,
    failed: results.filter(row => row.status === "FAIL").length
  };
  console.log(JSON.stringify({ summary, results }, null, 2));
  if (summary.failed) process.exitCode = 1;
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

