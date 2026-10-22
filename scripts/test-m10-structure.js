/* Static/source preservation checks, not runtime security verification.
   node --experimental-vm-modules scripts/test-m10-structure.js BASELINE_DIR */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '.');
assert(OUT !== ROOT && !OUT.startsWith(ROOT + path.sep), 'External baseline required');
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json')));
const results = [];
const check = (name, pass) => {
  results.push({ name, status: pass ? 'PASS' : 'FAIL' });
  assert(pass, name);
};
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const before = file => fs.readFileSync(path.join(OUT, 'before', file), 'utf8');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
try {
  check('All pre-M10 tracked and untracked baseline files still exist',
    Object.keys(manifest).every(file => fs.existsSync(path.join(ROOT, file))));
  const allowed = new Set(['README.md', 'PROJECT.md', 'js/cms/projects.js',
    'admin/js/modules/projects/list-view.js', 'projects/project-football-club.html', 'projects/project-ecommerce.html',
    'scripts/test-m09-upload-browser.js']);
  check('Only explicitly scoped existing files differ from fresh baseline',
    Object.entries(manifest).every(([file, digest]) => allowed.has(file) || hash(file) === digest));
  for (const [label, prefix] of [['Backend and migrations', 'supabase/'], ['Assets', 'assets/']]) {
    check(label + ' byte-identical to pre-refactor source',
      Object.entries(manifest).filter(([file]) => file.startsWith(prefix)).every(([file, digest]) => hash(file) === digest));
  }
  check('Deployment and dependency manifests unchanged',
    ['vercel.json', '.vercelignore', 'package.json', 'package-lock.json', 'requirements.txt'].every(file => hash(file) === manifest[file]));
  for (const file of ['project-football-club.html', 'project-ecommerce.html']) {
    const relative = 'projects/' + file, old = before(relative);
    const style = old.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    check(file + ': extracted CSS exact contents', read('css/project-legacy.css') === style[1]);
    check(file + ': HTML unchanged apart from style-to-link substitution',
      read(relative) === old.replace(style[0], '<link rel="stylesheet" href="../css/project-legacy.css">'));
  }
  check('Legacy extraction has no relative URL rebasing', !/url\(/i.test(read('css/project-legacy.css')));
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const relative = dir + '/' + entry.name;
      if (entry.isDirectory()) walk(relative);
      else if (relative.endsWith('.js')) files.push(relative);
    }
  }
  walk('js'); walk('admin/js');
  const context = vm.createContext({});
  function resolveImport(file, specifier) {
    assert(specifier.startsWith('.') || specifier.startsWith('/'), 'Unexpected global/module dependency: ' + file);
    const target = specifier.startsWith('/') ? path.resolve(ROOT, '.' + specifier)
      : path.resolve(ROOT, path.dirname(file), specifier);
    assert(target.startsWith(ROOT + path.sep) && fs.existsSync(target), 'Unresolved import: ' + file);
    const actual = path.relative(ROOT, target).replaceAll('\\', '/');
    let cursor = ROOT;
    for (const part of actual.split('/')) {
      assert(fs.readdirSync(cursor).includes(part), 'Import case mismatch: ' + file);
      cursor = path.join(cursor, part);
    }
  }
  for (const file of files) {
    const source = read(file);
    const mod = new vm.SourceTextModule(source, { context, identifier: file });
    for (const specifier of mod.dependencySpecifiers) {
      resolveImport(file, specifier);
    }
    for (const match of source.matchAll(/\bimport\(\s*(['"])([^'"]+)\1\s*\)/g)) resolveImport(file, match[2]);
  }
  check('All ' + files.length + ' public/admin JS files parse; static and literal dynamic imports resolve with exact path case', true);
  for (const file of ['index.html', 'project.html', 'admin/index.html',
    'projects/project-football-club.html', 'projects/project-ecommerce.html']) {
    for (const match of read(file).matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
      const url = new URL(match[1], 'http://static.local/' + file);
      if (url.origin === 'http://static.local' && /\.(js|css)$/.test(url.pathname))
        resolveImport(file, decodeURIComponent(url.pathname));
    }
  }
  check('Local script/stylesheet references resolve for all five current and legacy entries', true);
  // Compare untouched operational regions rather than reconstructing the refactor.
  const list = read('admin/js/modules/projects/list-view.js').replaceAll('\r\n', '\n');
  const oldList = before('admin/js/modules/projects/list-view.js').replaceAll('\r\n', '\n');
  check('Admin list load/render/status workflow preserved verbatim',
    list.slice(list.indexOf('export function'), list.indexOf('  async function publish(row)'))
      === oldList.slice(oldList.indexOf('export function'), oldList.indexOf('  function publishBlockers(row)')));
  check('Admin list publish/hide/archive/trash handlers preserved verbatim',
    list.slice(list.indexOf('  async function publish(row)'), list.indexOf('  // Keep the existing deferred action'))
      === oldList.slice(oldList.indexOf('  async function publish(row)'), oldList.indexOf('  /*\n    Permanent delete')));
  check('Admin list deferred-delete action unchanged',
    list.slice(list.indexOf('  async function permanentlyDelete()'), list.indexOf('  async function move()'))
      === oldList.slice(oldList.indexOf('  async function permanentlyDelete()'), oldList.indexOf('  function typedDeleteConfirm')));
  check('Admin list reorder/destroy/listener teardown unchanged',
    list.slice(list.indexOf('  async function move()')) === oldList.slice(oldList.indexOf('  async function move()')));
  fs.writeFileSync(path.join(OUT, 'structure-results.json'), JSON.stringify({ classification: 'STATIC REVIEWED',
    passed: results.length, failed: 0, results, parsedFiles: files.length }, null, 2));
  console.log(JSON.stringify({ passed: results.length, failed: 0, parsedFiles: files.length }));
} catch (error) {
  fs.writeFileSync(path.join(OUT, 'structure-results.json'), JSON.stringify({ results, error: error.stack }, null, 2));
  console.error(error.message);
  process.exitCode = 1;
}
