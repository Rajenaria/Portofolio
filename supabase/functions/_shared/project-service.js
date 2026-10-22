import { UUID, validateProject, projectPlacements, ProjectError } from './project-contract.js';
import { requestIdentity } from './request-security.js';
import { inspectImage, boundedBytes, sha256 } from './project-image.js';
const BUCKET='portfolio-project-assets';
const HEADERS={'Cache-Control':'no-store, max-age=0','CDN-Cache-Control':'no-store','Surrogate-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-project-id,x-asset-id,x-component,x-filename'};
function response(status,data){return new Response(JSON.stringify(data),{status,headers:{...HEADERS,'Content-Type':'application/json'}});}
async function rpc(client,name,args){
 const r=await client.rpc(name,args);
 if(r.error){
  const message=String(r.error.message||'');
  if(r.error.code==='23505')throw new ProjectError(/projects_slug/.test(message)?'SLUG_CONFLICT':'REVISION_CONFLICT',409);
  if(['23503','23514','22001'].includes(r.error.code))throw new ProjectError('VALIDATION_FAILED',400);
  if(/CONFLICT|SLUG_LOCKED|IMMUTABLE_ASSET/.test(message))throw new ProjectError('REVISION_CONFLICT',409);
  if(/NOT_FOUND/.test(message))throw new ProjectError('NOT_FOUND',404);
  if(/FORBIDDEN/.test(message))throw new ProjectError('FORBIDDEN',403);
  if(/^(INVALID_[A-Z_]+|INCOMPLETE|NEVER_PUBLISHED|ASSET_NOT_READY)$/.test(message))throw new ProjectError(message,400);
  throw new ProjectError('UNCONFIRMED',503);
 }
 return r.data;
}
async function budget(client,req,env,upload){const identity=await requestIdentity(req,env);if(!await rpc(client,'consume_project_budget',{p_identity:identity,p_upload:upload}))throw new ProjectError('RATE_LIMITED',429);}
async function verifyAsset(client,asset,remaining=128*1048576){
  if(!asset||asset.state!=='ready')throw new ProjectError('ASSET_NOT_READY');
  const size=Object.values(asset.components).reduce((n,m)=>n+(Number(m.size)||0),0);
  if(size>remaining)throw new ProjectError('MEDIA_BUDGET_EXCEEDED');
  for(const component of (asset.provenance==='legacy-derivative-only'?['desktop','mobile']:['original','desktop','mobile'])){
    const m=asset.components[component];if(!m?.path||!m.hash)throw new ProjectError('ASSET_NOT_READY');
    const r=await client.storage.from(BUCKET).download(m.path);
    if(r.error||!r.data||r.data.size!==m.size||await sha256(new Uint8Array(await r.data.arrayBuffer()))!==m.hash)throw new ProjectError('MEDIA_UNCONFIRMED',503);
  }
  return size;
}
async function confirmStoredAsset(client,asset){
 if(!asset||asset.state!=='ready')throw new ProjectError('MEDIA_UNCONFIRMED',503);
 for(const component of (asset.provenance==='legacy-derivative-only'?['desktop','mobile']:['original','desktop','mobile'])){
  const metadata=asset.components[component],r=await client.storage.from(BUCKET).info(metadata.path);
  if(r.error||!r.data||(r.data.size!=null&&r.data.size!==metadata.size))throw new ProjectError('MEDIA_UNCONFIRMED',503);
 }
}
async function confirmLegacyMedia(client,payload){
 const paths=new Set();for(const placement of projectPlacements(payload,true))if(placement.legacy){
  if(placement.legacy.bucket!=='portfolio-media')throw new ProjectError('INVALID_LEGACY');
  paths.add(placement.legacy.desktop);paths.add(placement.legacy.mobile);
 }
 if(paths.size>128)throw new ProjectError('MEDIA_BUDGET_EXCEEDED');
 let bytes=0;for(const path of paths){
  const r=await client.storage.from('portfolio-media').info(path),size=r.data?.size??r.data?.metadata?.size??0;
  if(r.error||!r.data||size>5*1048576)throw new ProjectError('MEDIA_UNCONFIRMED',503);bytes+=size;
 }
 if(bytes>128*1048576)throw new ProjectError('MEDIA_BUDGET_EXCEEDED');
 return bytes;
}
export function createProjectHandler({client,authorize,env}){return async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 if(req.method!=='POST')return response(405,{code:'METHOD_NOT_ALLOWED'});
 try{
  const actor=await authorize(req.headers.get('authorization')||'');if(!UUID.test(actor||''))throw new ProjectError('FORBIDDEN',403);
  await budget(client,req,env,false);
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')||''))throw new ProjectError('INVALID_CONTENT_TYPE',415);
  let b;try{b=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBytes(req,540000)));}catch(e){if(e instanceof ProjectError)throw e;throw new ProjectError('INVALID_JSON');}
  if(!b||typeof b!=='object'||Array.isArray(b))throw new ProjectError('INVALID_JSON');
  if(b.action==='adopt'){
    if(!UUID.test(b.id||'')||!UUID.test(b.asset||'')||!UUID.test(b.legacy_id||''))throw new ProjectError('INVALID_ASSET');
    const cover=b.legacy_id===b.id;
    const r=await client.from(cover?'projects':'project_media').select(cover?'cover_bucket,cover_desktop_path,cover_mobile_path':'bucket_name,desktop_path,mobile_path').eq('id',b.legacy_id).eq(cover?'id':'project_id',b.id).maybeSingle();
    if(r.error||!r.data)throw new ProjectError('INVALID_LEGACY');
    const bucket=cover?r.data.cover_bucket:r.data.bucket_name,desktop=cover?r.data.cover_desktop_path:r.data.desktop_path,mobile=(cover?r.data.cover_mobile_path:r.data.mobile_path)||desktop;
    if(!['portfolio-media','portfolio-staging'].includes(bucket)||!desktop||!mobile)throw new ProjectError('INVALID_LEGACY');
    let asset;
    for(const [component,path] of [['desktop',desktop],['mobile',mobile]]){
      if(path.includes('..')||path.startsWith('/'))throw new ProjectError('INVALID_LEGACY');
      const old=await client.storage.from(bucket).download(path);if(old.error||!old.data||old.data.size>5*1048576)throw new ProjectError('MEDIA_UNCONFIRMED',503);
      const bytes=new Uint8Array(await old.data.arrayBuffer()),metadata=inspectImage(bytes,'image/webp',true);metadata.hash=await sha256(bytes);metadata.path=`${b.id}/${b.asset}/${component}.webp`;
      const store=client.storage.from(BUCKET),before=await store.download(metadata.path);
      if(before.error){const saved=await store.upload(metadata.path,bytes,{upsert:false,contentType:'image/webp',cacheControl:'0'});if(saved.error)throw new ProjectError('UPLOAD_UNCONFIRMED',503);}
      const confirmed=await store.download(metadata.path);if(confirmed.error||!confirmed.data||await sha256(new Uint8Array(await confirmed.data.arrayBuffer()))!==metadata.hash)throw new ProjectError('UPLOAD_UNCONFIRMED',503);
      asset=await rpc(client,'project_asset_command',{p_actor:actor,p_project:b.id,p_asset:b.asset,p_component:component,p_metadata:metadata,p_legacy:true});
    }
    if(asset?.state!=='ready')throw new ProjectError('UPLOAD_UNCONFIRMED',503);
    return response(200,{id:asset.id,state:'ready',provenance:'legacy-derivative-only'});
  }
  if(b.action==='list'){
    if(b.after!=null&&!UUID.test(b.after))throw new ProjectError('INVALID_CURSOR');
    return response(200,await rpc(client,'project_admin_catalog',{p_actor:actor,p_after:b.after||null}));
  }
  if(!UUID.test(b.id||'')||!['create','read','assets','save','publish','show','hide','archive','trash','restore','operation'].includes(b.action))throw new ProjectError('INVALID_ACTION');
  if(b.action==='assets')return response(200,await rpc(client,'project_assets_for_owner',{p_actor:actor,p_project:b.id}));
  if(['save','publish'].includes(b.action))validateProject(b.payload,{publish:b.action==='publish'});
  for(const key of ['expected','publication'])if(b[key]!=null&&(!Number.isSafeInteger(b[key])||b[key]<0))throw new ProjectError('INVALID_VERSION');
  if(['publish','show','hide','archive','trash','restore','operation'].includes(b.action)&&!UUID.test(b.operation||''))throw new ProjectError('INVALID_OPERATION');
  const args={p_actor:actor,p_action:b.action,p_id:b.id,p_expected:b.expected||0,p_publication:b.publication||0,p_payload:b.payload||null,p_operation:b.operation||null};
  // Show uses the LAST PUBLISHED payload, never the saved working draft.
  if(b.action==='show'){
    const r=await client.rpc('project_published_for_owner',{p_actor:actor,p_id:b.id});if(r.error||!r.data)throw new ProjectError('NO_PUBLISHED_VERSION');
    validateProject(r.data,{publish:true});args.p_payload=r.data;
  }
  const prepared=[];
  if(['publish','show'].includes(b.action)){
    const legacyBytes=await confirmLegacyMedia(client,args.p_payload);
    for(const technology of new Set(args.p_payload.sections.flatMap(s=>s.items.map(i=>i.technology_id)).filter(Boolean))){
      const r=await client.from('technologies').select('id').eq('id',technology).maybeSingle();
      if(r.error||!r.data)throw new ProjectError('INVALID_TECHNOLOGY');
    }
    let remaining=128*1048576-legacyBytes;
    const assetIds=new Set(projectPlacements(args.p_payload,true).map(p=>p.asset_id).filter(Boolean));if(assetIds.size>64)throw new ProjectError('MEDIA_BUDGET_EXCEEDED');
    for(const id of assetIds){
      const asset=await rpc(client,'project_asset_command',{p_actor:actor,p_project:b.id,p_asset:id});if(asset?.project_id!==b.id)throw new ProjectError('INVALID_ASSET');remaining-=await verifyAsset(client,asset,remaining);prepared.push(asset);
    }
  }
  const data=await rpc(client,'project_command',args);
  for(const asset of prepared)await confirmStoredAsset(client,asset);
  if(['publish','show'].includes(b.action))await confirmLegacyMedia(client,args.p_payload);
  if(b.action==='operation'&&data?.state==='committed'){
    const current=await rpc(client,'project_command',{p_actor:actor,p_action:'read',p_id:b.id});
    if(current.project.status==='published'&&!current.project.deleted_at){
      const published=await rpc(client,'project_published_for_owner',{p_actor:actor,p_id:b.id});
      await confirmLegacyMedia(client,published);
      const ids=new Set(projectPlacements(published,true).map(p=>p.asset_id).filter(Boolean));
      for(const id of ids){const asset=await rpc(client,'project_asset_command',{p_actor:actor,p_project:b.id,p_asset:id});await confirmStoredAsset(client,asset);}
    }
  }
  if(['save','publish','show'].includes(b.action)){
    const confirmed=await rpc(client,'project_command',{p_actor:actor,p_action:'read',p_id:b.id});
    if(b.action==='save'&&(confirmed.draft.draft_version!==b.expected+1||JSON.stringify(confirmed.draft.payload)!==JSON.stringify(data.draft.payload)))throw new ProjectError('UNCONFIRMED',503);
    if(b.action!=='save'&&(confirmed.project.publication_version!==data.publication_version||confirmed.project.published_revision_id!==data.revision_id))throw new ProjectError('UNCONFIRMED',503);
  }
  return response(200,data);
 }catch(e){return response(e.status||503,{code:e.code||'UNCONFIRMED'});}
};}
export function createProjectAssetHandler({client,authorize,env}){return async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 try{
  const actor=await authorize(req.headers.get('authorization')||'');if(!UUID.test(actor||''))throw new ProjectError('FORBIDDEN',403);
  await budget(client,req,env,req.method==='POST');
  const u=new URL(req.url),project=req.headers.get('x-project-id')||u.searchParams.get('project'),id=req.headers.get('x-asset-id')||u.searchParams.get('asset'),component=req.headers.get('x-component')||u.searchParams.get('variant');
  if(!UUID.test(project||'')||!UUID.test(id||'')||!['original','desktop','mobile'].includes(component))throw new ProjectError('INVALID_ASSET');
  if(req.method==='GET'){
    const a=await rpc(client,'project_asset_command',{p_actor:actor,p_project:project,p_asset:id});const m=a?.components?.[component];if(!m||a.project_id!==project)throw new ProjectError('NOT_FOUND',404);
    const r=await client.storage.from(BUCKET).download(m.path);if(r.error||!r.data)throw new ProjectError('UNAVAILABLE',503);
    return new Response(r.data,{headers:{...HEADERS,'Content-Type':m.mime,'Content-Disposition':component==='original'?'attachment; filename="original-image"':'inline'}});
  }
  if(req.method!=='POST')throw new ProjectError('METHOD_NOT_ALLOWED',405);
  const projectRead=await client.from('projects').select('id').eq('id',project).maybeSingle();
  if(projectRead.error||!projectRead.data)throw new ProjectError('NOT_FOUND',404);
  const mime=req.headers.get('content-type')||'',filename=decodeURIComponent(req.headers.get('x-filename')||'');
  const extensions={'image/jpeg':/\.jpe?g$/i,'image/png':/\.png$/i,'image/webp':/\.webp$/i};if(!extensions[mime]?.test(filename))throw new ProjectError('INVALID_FILE');
  const bytes=await boundedBytes(req,(component==='original'?15:5)*1048576),metadata=inspectImage(bytes,mime,component!=='original');
  if(component!=='original'&&Math.max(metadata.width,metadata.height)>(component==='desktop'?2000:1200))throw new ProjectError('DERIVATIVE_DIMENSIONS');
  metadata.hash=await sha256(bytes);metadata.path=`${project}/${id}/${component}.${mime==='image/png'?'png':mime==='image/jpeg'?'jpg':'webp'}`;
  const store=client.storage.from(BUCKET),existing=await store.download(metadata.path);
  if(existing.error){const r=await store.upload(metadata.path,bytes,{contentType:mime,upsert:false,cacheControl:'0'});if(r.error)throw new ProjectError('UPLOAD_UNCONFIRMED',503);}
  else if(await sha256(new Uint8Array(await existing.data.arrayBuffer()))!==metadata.hash)throw new ProjectError('IMMUTABLE_ASSET',409);
  const saved=await store.download(metadata.path);if(saved.error||!saved.data||saved.data.size!==bytes.length||await sha256(new Uint8Array(await saved.data.arrayBuffer()))!==metadata.hash)throw new ProjectError('UPLOAD_UNCONFIRMED',503);
  const asset=await rpc(client,'project_asset_command',{p_actor:actor,p_project:project,p_asset:id,p_component:component,p_metadata:metadata});
  return response(200,{id:asset.id,state:asset.state,component,hash:metadata.hash});
 }catch(e){return response(e.status||503,{code:e.code||'UNCONFIRMED'});}
};}
export function createProjectMediaHandler({client,env}){return async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 if(req.method!=='GET')return response(405,{code:'METHOD_NOT_ALLOWED'});
 try{
  const u=new URL(req.url),p=u.searchParams.get('project'),a=u.searchParams.get('asset'),variant=u.searchParams.get('variant')||'desktop';
  if(!UUID.test(p||'')||!UUID.test(a||'')||!['desktop','mobile'].includes(variant)||[...u.searchParams.keys()].some(k=>!['project','asset','variant'].includes(k)))throw new ProjectError('INVALID_REQUEST');
  await budget(client,req,env,false);
  const args={p_project:p,p_asset:a,p_variant:variant},metadata=await rpc(client,'project_asset_delivery',args);
  if(!metadata)throw new ProjectError('NOT_FOUND',404);
  const r=await client.storage.from(BUCKET).download(metadata.path);
  if(r.error||!r.data||r.data.size>5*1048576||r.data.size!==metadata.size)throw new ProjectError('UNAVAILABLE',503);
  const current=await rpc(client,'project_asset_delivery',args);
  if(!current||current.hash!==metadata.hash||current.path!==metadata.path)throw new ProjectError('NOT_FOUND',404);
  return new Response(r.data,{headers:{...HEADERS,'Content-Type':'image/webp','Content-Disposition':'inline'}});
 }catch(e){return response(e.status||503,{code:e.code||'UNAVAILABLE'});}
};}
