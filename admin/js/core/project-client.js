import { supabaseClient } from './supabase.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { processImage } from './image-processor.js';
export class ProjectClientError extends Error {
 constructor(code,ambiguous=false){super(code);this.code=code;this.ambiguous=ambiguous;}
}
export function sameProjectPayload(a,b){
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
}
async function decode(response){try{return await response.json();}catch{throw new ProjectClientError('UNCONFIRMED',true);}}
async function request(endpoint,{method='POST',body,headers={}}={}){
 const auth=await supabaseClient.auth.getSession(),token=auth.data?.session?.access_token;
 if(auth.error||!token)throw new ProjectClientError('FORBIDDEN');
 try{
  const r=await fetch(`${SUPABASE_URL}/functions/v1/${endpoint}`,{method,body,cache:'no-store',signal:AbortSignal.timeout(60000),headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`,...headers}});
  if(!r.ok){const data=await r.json().catch(()=>null);throw new ProjectClientError(data?.code||'UNCONFIRMED',r.status>=500);}
  return r;
 }catch(e){if(e instanceof ProjectClientError)throw e;throw new ProjectClientError('UNCONFIRMED',true);}
}
const assetLists=new Map();
export async function projectCommand(args){
 if(args.action==='assets'){
  const cached=assetLists.get(args.id);if(cached&&cached.until>Date.now())return cached.promise;
  const promise=request('manage-project',{body:JSON.stringify(args),headers:{'Content-Type':'application/json'}}).then(decode);
  assetLists.set(args.id,{until:Date.now()+10000,promise});promise.catch(()=>assetLists.delete(args.id));return promise;
 }
 const r=await request('manage-project',{body:JSON.stringify(args),headers:{'Content-Type':'application/json'}});return decode(r);
}
export function createDraftMediaResolver(){
 const urls=new Map();let destroyed=false;
 return {async resolve(project,placement,variant){
   if(!placement.asset_id){const {mediaSource}=await import('../../../js/cms/project-data.js');return mediaSource(project,placement,variant);}
   const key=placement.asset_id+':'+variant;
   if(!urls.has(key))urls.set(key,request(`project-asset?project=${encodeURIComponent(project)}&asset=${placement.asset_id}&variant=${variant}`,{method:'GET'}).then(r=>r.blob()).then(blob=>{if(destroyed)throw new Error('Closed');return URL.createObjectURL(blob);}));
   return urls.get(key);
  },destroy(){destroyed=true;for(const promise of urls.values())promise.then(url=>URL.revokeObjectURL(url)).catch(()=>{});urls.clear();}};
}
export async function downloadProjectOriginal(project,asset){
 const response=await request(`project-asset?project=${encodeURIComponent(project)}&asset=${encodeURIComponent(asset)}&variant=original`,{method:'GET'});
 const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='project-original.'+({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[blob.type]||'bin');link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
// Reuse the M01 processor, variant sizes, immutable paths, exact verification and no ambiguous cleanup.
// Retrying the SAME pending upload uses the same UUID and bytes; the server checks hashes before reuse.
let activeUploads=0;const uploadQueue=[];
function drainUploads(){while(activeUploads<2&&uploadQueue.length){const job=uploadQueue.shift();activeUploads++;job().finally(()=>{activeUploads--;drainUploads();});}}
export function uploadProjectAsset(project,file,assetId=crypto.randomUUID()){
 return new Promise((resolve,reject)=>{uploadQueue.push(async()=>{try{resolve(await performProjectAssetUpload(project,file,assetId));}catch(e){reject(e);}});drainUploads();});
}
async function performProjectAssetUpload(project,file,assetId){
 const desktop=await processImage(file,{maxDimension:2000}),mobile=await processImage(file,{maxDimension:1200});
 let result;
 for(const [component,part] of [['original',file],['desktop',desktop.optimized.file],['mobile',mobile.optimized.file]]){
  const r=await request('project-asset',{body:part,headers:{'Content-Type':part.type,'X-Project-Id':project,'X-Asset-Id':assetId,'X-Component':component,'X-Filename':encodeURIComponent(part.name)}});result=await r.json();
  if(result.id!==assetId||result.component!==component||!result.hash)throw new ProjectClientError('UPLOAD_UNCONFIRMED',true);
 }
 if(result.state!=='ready')throw new ProjectClientError('UPLOAD_UNCONFIRMED',true);
 assetLists.delete(project);
 return assetId;
}
