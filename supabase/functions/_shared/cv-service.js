import { requestIdentity } from "./request-security.js";

export const MAX_CV_BYTES = 5 * 1024 * 1024;
export const CV_BUCKET = "portfolio-cv";
export const CV_COLUMNS = "cv_version,cv_filename,cv_size_bytes,cv_updated_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADERS = {
  "Cache-Control":"no-store, max-age=0", "CDN-Cache-Control":"no-store", "Surrogate-Control":"no-store",
  "X-Content-Type-Options":"nosniff", "Content-Security-Policy":"sandbox; default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy":"no-referrer", "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-cv-version, x-cv-previous, x-cv-filename"
};
export class CvError extends Error {
  constructor(status, code) { super(code); this.status=status; this.code=code; }
}
const fail = (status,code) => { throw new CvError(status,code); };
const reply = (status, body, extra={}) => new Response(JSON.stringify(body), {
  status, headers:{...HEADERS,"Content-Type":"application/json; charset=utf-8",...extra}
});
export function validFilename(name) {
  return typeof name==="string" && name.length>=5 && name.length<=180 && name.trim()===name &&
    /\.pdf$/i.test(name) && !/[\u0000-\u001f\u007f]/.test(name) && !name.includes("/") && !name.includes(String.fromCharCode(92));
}
export function metadata(row) {
  if (!row) fail(503,"METADATA_UNAVAILABLE");
  const result=Object.fromEntries(CV_COLUMNS.split(",").map(key=>[key,row[key]]));
  if(Object.values(result).every(value=>value===null)) return result;
  if(!UUID.test(result.cv_version||"") || !validFilename(result.cv_filename) ||
      !Number.isInteger(result.cv_size_bytes) || result.cv_size_bytes<1 || result.cv_size_bytes>MAX_CV_BYTES ||
      typeof result.cv_updated_at!=="string" || !Number.isFinite(Date.parse(result.cv_updated_at))) fail(503,"INVALID_METADATA");
  return result;
}
export function validatePdf(bytes) {
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>MAX_CV_BYTES) fail(400,"INVALID_SIZE");
  const head=new TextDecoder().decode(bytes.subarray(0,16));
  if(!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(head)) fail(400,"INVALID_PDF");
  const tail=new TextDecoder().decode(bytes.subarray(Math.max(0,bytes.length-2048)));
  const end=/startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail);
  if(!end) fail(400,"INVALID_PDF");
  const offset=Number(end[1]);
  if(!Number.isSafeInteger(offset)||offset<8||offset>=bytes.length) fail(400,"INVALID_PDF");
  const target=new TextDecoder().decode(bytes.subarray(offset,Math.min(bytes.length,offset+8192)));
  if(!/^xref\s/.test(target)&&!(/^\d+\s+\d+\s+obj\b/.test(target)&&/\/Type\s*\/XRef\b/.test(target))) fail(400,"INVALID_PDF");
  // Bounded signature/trailer/xref validation, not a PDF sanitizer or full parser.
}
export async function readPdfBody(req) {
  if(!/^application\/pdf(?:\s*;|$)/i.test(req.headers.get("content-type")||"")) fail(415,"INVALID_MIME");
  const length=req.headers.get("content-length");
  if(length&&(!/^\d+$/.test(length)||Number(length)>MAX_CV_BYTES)) fail(413,"INVALID_SIZE");
  const reader=req.body?.getReader(); if(!reader) fail(400,"INVALID_SIZE");
  const chunks=[];let total=0,timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new CvError(408,"BODY_TIMEOUT")),10000)});
  try {
    while(true){const part=await Promise.race([reader.read(),deadline]);if(part.done)break;
      total+=part.value.length;if(total>MAX_CV_BYTES)fail(413,"INVALID_SIZE");chunks.push(part.value);}
  } finally {clearTimeout(timer);reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  validatePdf(bytes);return bytes;
}
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("");
const pathFor = version => `cv/${version}.pdf`;
async function readActive(client) {
  const {data,error}=await client.from("profile_content").select(CV_COLUMNS).eq("singleton_key",1).maybeSingle();
  if(error){if(["42703","PGRST204"].includes(error.code)&&/\bcv_/.test(error.message||""))fail(503,"SCHEMA_UNAVAILABLE");fail(503,"METADATA_UNAVAILABLE");}
  return metadata(data);
}
async function objectBytes(client,row) {
  const {data:info,error:infoError}=await client.storage.from(CV_BUCKET).info(pathFor(row.cv_version));
  if(infoError||!info)fail(503,"OBJECT_UNAVAILABLE");
  const {data:blob,error}=await client.storage.from(CV_BUCKET).download(pathFor(row.cv_version));
  if(error||!blob||blob.size!==row.cv_size_bytes||blob.size>MAX_CV_BYTES)fail(503,"OBJECT_UNAVAILABLE");
  const bytes=new Uint8Array(await blob.arrayBuffer());validatePdf(bytes);return bytes;
}
async function verifiedActive(client) {
  const row=await readActive(client);
  if(row.cv_version){await objectBytes(client,row);const current=await readActive(client);
    if(JSON.stringify(current)!==JSON.stringify(row))fail(409,"ACTIVE_CHANGED");}
  return row;
}
async function budget(client,env,req,scope){
  const identity=await requestIdentity(req,env);
  const {data,error}=await client.rpc("consume_cv_budget",{p_scope:scope,p_identity:identity});
  if(error||typeof data!=="boolean")fail(503,"LIMITER_UNAVAILABLE");
  if(!data)fail(429,"RATE_LIMITED");
}
async function owner(authorize,req){if(!await authorize(req.headers.get("authorization")||""))fail(403,"FORBIDDEN");}
function endpoint(run){return async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:HEADERS});
  try{return await run(req)}catch(error){return reply(error instanceof CvError?error.status:503,{code:error instanceof CvError?error.code:"UNCONFIRMED"},error?.status===429?{"Retry-After":"60"}:{})}
};}
export function createManageCvHandler({client,authorize,env}) {
  return endpoint(async req=>{
    if(!["GET","POST"].includes(req.method))fail(405,"METHOD_NOT_ALLOWED");
    await owner(authorize,req);
    await budget(client,env,req,req.method==="POST"?"cv-upload":"cv-download");
    if(req.method==="GET")return reply(200,await verifiedActive(client));
    const version=req.headers.get("x-cv-version"),previous=req.headers.get("x-cv-previous");
    if(!UUID.test(version||"")||(previous!=="none"&&!UUID.test(previous||""))||version===previous)fail(400,"INVALID_VERSION");
    let filename;try{filename=decodeURIComponent(req.headers.get("x-cv-filename")||"")}catch{fail(400,"INVALID_FILENAME")}
    if(!validFilename(filename))fail(400,"INVALID_FILENAME");
    const bytes=await readPdfBody(req),fileHash=await digest(bytes);
    const candidate={cv_version:version,cv_filename:filename,cv_size_bytes:bytes.length,cv_updated_at:new Date().toISOString()};
    let active=await readActive(client);
    // Retry uses one operation UUID. Never overwrite any existing object.
    const priorObject=await client.storage.from(CV_BUCKET).download(pathFor(version));
    if(priorObject.data){
      if(priorObject.data.size>MAX_CV_BYTES||await digest(new Uint8Array(await priorObject.data.arrayBuffer()))!==fileHash)fail(409,"VERSION_CONFLICT");
    }else{
      // Upload failures are ambiguous: retain anything the storage service may have written.
      const {data,error}=await client.storage.from(CV_BUCKET).upload(pathFor(version),new Blob([bytes],{type:"application/pdf"}),{contentType:"application/pdf",cacheControl:"0",upsert:false});
      if(error||!data||data.path!==pathFor(version))fail(503,"UNCONFIRMED");
    }
    const stored=await objectBytes(client,candidate);
    if(await digest(stored)!==fileHash)fail(503,"OBJECT_MISMATCH");
    active=await readActive(client);
    if(active.cv_version===version){
      if(active.cv_filename!==filename||active.cv_size_bytes!==bytes.length)fail(409,"VERSION_CONFLICT");
    }else{
      if(active.cv_version!==(previous==="none"?null:previous))fail(409,"ACTIVE_CHANGED");
      const result=await client.rpc("activate_cv",{p_previous:previous==="none"?null:previous,p_version:version,p_filename:filename,p_size:bytes.length});
      if(result.error)fail(503,"UNCONFIRMED");
      // Ignore the acknowledgement as an authority; reconcile even a zero-row conditional update.
    }
    const confirmed=await verifiedActive(client);
    if(confirmed.cv_version!==version||confirmed.cv_filename!==filename||confirmed.cv_size_bytes!==bytes.length)fail(409,"ACTIVE_CHANGED");
    if(await digest(await objectBytes(client,confirmed))!==fileHash)fail(503,"OBJECT_MISMATCH");
    const final=await readActive(client);if(JSON.stringify(final)!==JSON.stringify(confirmed))fail(409,"ACTIVE_CHANGED");
    return reply(200,final);
  });
}
export function createCvDeliveryHandler({client,env}){
  return endpoint(async req=>{
    if(req.method!=="GET")fail(405,"METHOD_NOT_ALLOWED");
    const url=new URL(req.url),version=url.searchParams.get("v");
    if(!UUID.test(version||"")||[...url.searchParams.keys()].some(key=>key!=="v"))fail(400,"INVALID_VERSION");
    await budget(client,env,req,"cv-download");
    const row=await readActive(client);if(row.cv_version!==version)fail(404,"NOT_ACTIVE");
    const bytes=await objectBytes(client,row),current=await readActive(client);
    if(JSON.stringify(row)!==JSON.stringify(current))fail(404,"NOT_ACTIVE");
    return new Response(bytes,{headers:{...HEADERS,"Content-Type":"application/pdf",
      "Content-Disposition":`attachment; filename="CV.pdf"; filename*=UTF-8''${encodeURIComponent(row.cv_filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`}});
  });
}
