/* Static artifact preparation only: no install, SQL, network or deployment.
   node scripts/prepare-environment.js external-config.json NEW_EXTERNAL_DIRECTORY
   Inputs contain public deployment fields only; errors never echo their values. */
const fs = require('node:fs');
const path = require('node:path');
const contract = require('../js/environment.js');
const ROOT = fs.realpathSync(path.resolve(__dirname, '..'));
const ENTRIES = ['index.html', 'project.html', 'admin/index.html',
  'projects/project-football-club.html', 'projects/project-ecommerce.html'];

function cspFor({ backendOrigin = '', admin = false, legacy = false } = {}) {
  const backend = backendOrigin ? ' ' + backendOrigin : '';
  const script = admin ? "'self'" : "'self' https://code.iconify.design";
  const style = admin ? "'self'" : legacy ? "'self' 'unsafe-inline'" : "'self' https://cdn.jsdelivr.net 'unsafe-inline'";
  return `default-src ${admin ? "'none'" : "'self'"}; script-src ${script}; style-src ${style}; font-src 'self'${admin ? '' : ' https://cdn.jsdelivr.net'}; img-src 'self' data:${admin ? ' blob:' : ''}${legacy ? '' : backend} https://api.iconify.design; connect-src 'self'${legacy ? '' : backend} https://api.iconify.design; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action ${admin || legacy ? "'none'" : "'self'"}; object-src 'none'`;
}
function withMeta(html, csp) {
  // frame-ancestors belongs in the HTTP header; browsers ignore it in a meta tag.
  const meta = csp.replace(/; frame-ancestors 'none'/, '');
  return html.replace(/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content="[^"]*"\s*\/?\s*>/gi, '')
    .replace(/<head\b[^>]*>/i, match => match + '\n  <meta http-equiv="Content-Security-Policy" content="' + meta + '">');
}
function headersFor(base, backendOrigin = '') {
  const result = structuredClone(base);
  for (const rule of result.headers) for (const header of rule.headers) {
    if (header.key.toLowerCase() === 'content-security-policy') {
      header.value = cspFor({ backendOrigin, admin: rule.source.startsWith('/admin'), legacy: rule.source.startsWith('/projects/') });
    }
  }
  result.headers = result.headers.filter(rule => rule.source !== '/js/environment-config.js');
  result.headers.push({ source: '/js/environment-config.js', headers: [{ key: 'Cache-Control', value: 'no-store' }] });
  return result;
}
function prepare(input, output) {
  const script = contract.configScript(input); // Validate BEFORE any filesystem mutation.
  const target = path.resolve(output), parent = fs.realpathSync(path.dirname(target));
  if (target === ROOT || target.startsWith(ROOT + path.sep) || parent === ROOT || parent.startsWith(ROOT + path.sep) || fs.existsSync(target))
    throw Error('Use a new directory outside the repository.');
  const files = [];
  function collect(relative) {
    const file = path.join(ROOT, relative), stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw Error('Symlinks are not permitted in an artifact.');
    if (stat.isDirectory()) for (const name of fs.readdirSync(file)) collect(path.join(relative, name));
    else if (stat.isFile()) files.push(relative);
  }
  for (const relative of ['index.html', 'project.html', 'projects', 'css', 'js', 'assets', 'admin', 'vercel.json', '.vercelignore']) collect(relative);
  fs.mkdirSync(target);
  for (const relative of files) {
    const dest = path.join(target, relative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(ROOT, relative), dest);
  }
  fs.writeFileSync(path.join(target, 'js/environment-config.js'), script);
  const headers = headersFor(JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'))), input.backendOrigin);
  fs.writeFileSync(path.join(target, 'vercel.json'), JSON.stringify(headers, null, 2) + '\n');
  for (const file of ENTRIES) {
    const dest = path.join(target, file);
    fs.writeFileSync(dest, withMeta(fs.readFileSync(dest, 'utf8'), cspFor({ backendOrigin: input.backendOrigin,
      admin: file.startsWith('admin/'), legacy: file.startsWith('projects/') })));
  }
  return { directory: target, environment: input.environment, deploymentId: input.deploymentId, files: files.length };
}
if (require.main === module) {
  try {
    if (process.argv.length !== 4) throw Error('Expected external config and new output directory.');
    const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    console.log(JSON.stringify(prepare(input, process.argv[3])));
  } catch {
    console.error('Artifact tidak dibuat/selesai: periksa kontrak publik dan direktori tujuan baru. Jangan deploy output yang gagal.');
    process.exitCode = 1;
  }
}
module.exports = { cspFor, withMeta, headersFor, prepare };
