// Authoritative authoring validation. Only trusted server callers may activate snapshots.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SECTION_TYPES = ['challenge','timeline','architecture','features','decisions','gallery','reflections'];
export const ASPECTS = ['card','hero','square','landscape','portrait','source'];
export class ProjectError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const fail = code => { throw new ProjectError(code); };
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('INVALID_TEXT');
}
function keys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) fail('INVALID_SHAPE');
}
function array(value, max) { if (!Array.isArray(value) || value.length > max) fail('INVALID_LIST'); }
function url(value) { if (!value) return; try { if (!['http:','https:'].includes(new URL(value).protocol)) fail('INVALID_URL'); } catch { fail('INVALID_URL'); } }
function number(value, min, max, integer = false) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail('INVALID_NUMBER');
}
export function validateCrop(crop) {
  keys(crop, ['fit','aspect','x','y','zoom','mobile']);
  if (!['cover','contain'].includes(crop.fit) || !ASPECTS.includes(crop.aspect)) fail('INVALID_CROP');
  number(crop.x,0,100); number(crop.y,0,100); number(crop.zoom,1,3);
  if (crop.fit === 'contain' && crop.zoom !== 1) fail('CONTAIN_ZOOM');
  if (crop.mobile != null) {
    keys(crop.mobile,['fit','aspect','x','y','zoom']);
    validateCrop(crop.mobile);
  }
}
export function validateProject(payload, { publish = false } = {}) {
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 512 * 1024) fail('PAYLOAD_TOO_LARGE');
  keys(payload,['schema_version','general','cover','hero','sections','legacy']);
  if (payload.schema_version !== 1) fail('INVALID_SCHEMA');
  keys(payload.general,['title','slug','category','summary','role','period','stage','github_url','demo_url','featured','sort_order']);
  const g = payload.general;
  for (const [key,max] of Object.entries({title:180,slug:140,category:100,summary:400,role:180,period:120,stage:140,github_url:2048,demo_url:2048})) text(g[key],max,publish && ['title','slug','category','summary'].includes(key));
  if (g.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.slug)) fail('INVALID_SLUG');
  if (typeof g.featured !== 'boolean') fail('INVALID_FEATURED');
  number(g.sort_order,-100000,100000,true); url(g.github_url); url(g.demo_url);
  const ids = new Set(), placements = [];
  const id = value => { if (!UUID.test(value || '') || ids.has(value)) fail('INVALID_ID'); ids.add(value); };
  const placement = (p,visible=true) => {
    if (p == null) return;
    keys(p,['id','asset_id','legacy','alt','caption','description','category','phase_id','crop']); id(p.id);
    text(p.alt,250,publish&&visible); text(p.caption || '',300); text(p.description || '',4000); text(p.category || '',120);
    if (p.phase_id != null && !UUID.test(p.phase_id)) fail('INVALID_PHASE');
    validateCrop(p.crop);
    if (p.asset_id) { if (!UUID.test(p.asset_id) || p.legacy) fail('INVALID_ASSET'); }
    else {
      keys(p.legacy,['id','bucket','desktop','mobile']);
      if (!(publish&&visible?['portfolio-media']:['portfolio-media','portfolio-staging']).includes(p.legacy.bucket) || !['desktop','mobile'].every(k => typeof p.legacy[k] === 'string' && /^[a-zA-Z0-9_./ -]+$/.test(p.legacy[k]) && !p.legacy[k].includes('..') && !p.legacy[k].startsWith('/'))) fail('INVALID_LEGACY');
    }
    placements.push(p);
  };
  placement(payload.cover); placement(payload.hero);
  for(const [p,aspect] of [[payload.cover,'card'],[payload.hero,'hero']])if(p&&(p.crop.aspect!==aspect||(p.crop.mobile&&p.crop.mobile.aspect!==aspect)))fail('DESTINATION_ASPECT');
  array(payload.sections,7);
  const types = new Set(), phases = new Set();
  for (const s of payload.sections) {
    keys(s,['id','type','title','enabled','items','text','secondary','layout','edges']); id(s.id);
    if (!SECTION_TYPES.includes(s.type) || types.has(s.type) || typeof s.enabled !== 'boolean') fail('INVALID_SECTION'); types.add(s.type);
    text(s.title,160); text(s.text || '',20000); text(s.secondary || '',20000);
    if (s.layout && !['linear','layered'].includes(s.layout)) fail('INVALID_LAYOUT');
    array(s.items, s.type === 'gallery' ? 128 : s.type === 'decisions' ? 64 : 32);
    const nodeIds = new Set();
    for (const item of s.items) {
      keys(item,['id','title','description','notes','category','technology_id','icon','layout','media','technologies','url','enabled']); id(item.id); nodeIds.add(item.id);
      if(item.enabled!=null&&typeof item.enabled!=='boolean')fail('INVALID_VISIBILITY');
      if (s.type === 'timeline') phases.add(item.id);
      text(item.title,180,publish && s.enabled && item.enabled!==false); text(item.description || '',12000); text(item.notes || '',12000); text(item.category || '',120);
      if (item.technology_id && !UUID.test(item.technology_id)) fail('INVALID_TECHNOLOGY');
      if (item.icon && !['code','cpu','database','layers','globe','shield','tool'].includes(item.icon)) fail('INVALID_ICON');
      if (item.layout && !['normal','wide','portrait'].includes(item.layout)) fail('INVALID_LAYOUT');
      text(item.url || '',2048); url(item.url);
      array(item.technologies || [],16); for (const label of item.technologies || []) text(label,100);
      placement(item.media,s.enabled && item.enabled!==false);
      if (publish && s.enabled && item.enabled!==false && s.type === 'gallery' && !item.media) fail('MISSING_MEDIA');
    }
    if (s.type === 'architecture') {
      array(s.edges || [],128);
      for (const edge of s.edges || []) {
        keys(edge,['id','source','target','type']); id(edge.id);
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target || !['data','control','dependency'].includes(edge.type)) fail('INVALID_EDGE');
      }
    } else if (s.edges?.length) fail('INVALID_EDGE');
    if (publish && s.enabled && !s.items.some(i=>i.enabled!==false) && !s.text?.trim()) fail('EMPTY_SECTION');
    if (publish && s.enabled && s.type === 'challenge' && (!s.text?.trim() || !s.secondary?.trim())) fail('INCOMPLETE_CHALLENGE');
  }
  if (payload.legacy) {
    keys(payload.legacy,['paragraphs','technologies','intro','heading','title_main','title_highlight']); array(payload.legacy.paragraphs,128); array(payload.legacy.technologies,128);
    for(const [key,max] of [['intro',20000],['heading',220],['title_main',180],['title_highlight',180]])if(payload.legacy[key]!=null)text(payload.legacy[key],max);
    for (const p of payload.legacy.paragraphs) text(p,20000);
    for (const t of payload.legacy.technologies) { keys(t,['id','name','icon']); if (t.id && !UUID.test(t.id)) fail('INVALID_TECHNOLOGY'); text(t.name,100); text(t.icon || '',120); }
  }
  for (const p of placements) if (p.phase_id && !phases.has(p.phase_id)) fail('INVALID_PHASE');
  if (publish && !payload.cover) fail('MISSING_COVER');
  return payload;
}
export function projectPlacements(payload, visibleOnly = false) {
  return [payload.cover,payload.hero,...payload.sections.filter(s => !visibleOnly || s.enabled).flatMap(s => s.items.filter(i=>!visibleOnly||i.enabled!==false).map(i => i.media))].filter(Boolean);
}
