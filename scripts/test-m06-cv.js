/* Offline real-handler tests. No database, credentials or network access.
   node --experimental-vm-modules scripts/test-m06-cv.js */
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const {webcrypto}=require("node:crypto");
const ROOT=path.resolve(__dirname,"..");
const OLD="00000000-0000-4000-8000-000000000001",NEW="00000000-0000-4000-8000-000000000002",OTHER="00000000-0000-4000-8000-000000000003";
function makePdf(mark="A",size=0){
  let body=`%PDF-1.4\n% ${mark}\n1 0 obj\n<< /Type /Catalog >>\nendobj\n`;
  if(size)body+=" ".repeat(Math.max(0,size-body.length-150));
  const offset=Buffer.byteLength(body);return Buffer.from(body+`xref\n0 2\n0000000000 65535 f \n0000000015 00000 n \ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`);
}
function runtime(extra={}){
 const context=vm.createContext({console:{log(){},error(){},warn(){}},Request,Response,Headers,Blob,File,URL,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,
  crypto:webcrypto,AbortController,AbortSignal,setTimeout,clearTimeout,fetch(){throw Error("NETWORK DENIED")},...extra});
 const modules=new Map();
 const moduleFor=file=>{file=path.resolve(file);if(modules.has(file))return modules.get(file);
  const mod=new vm.SourceTextModule(fs.readFileSync(file,"utf8"),{context,identifier:file});modules.set(file,mod);return mod;};
 async function load(file){const mod=moduleFor(path.join(ROOT,file));if(mod.status==='unlinked')await mod.link((name,parent)=>{
  if(name.startsWith('npm:'))return new vm.SyntheticModule(['createClient'],function(){this.setExport('createClient',extra.createClient)},{context});
  return moduleFor(path.resolve(path.dirname(parent.identifier),name));});if(mod.status!=='evaluated')await mod.evaluate();return mod.namespace;}
 return {load,context};
}
function fixture(fault,options={}){
 const pdf=makePdf(),objects=new Map([[`cv/${OLD}.pdf`,new Blob([pdf],{type:'application/pdf'})]]);
 const state={row:options.empty?{cv_version:null,cv_filename:null,cv_size_bytes:null,cv_updated_at:null}:{cv_version:OLD,cv_filename:'Old.pdf',cv_size_bytes:pdf.length,cv_updated_at:'2026-10-19T00:00:00Z'},
  fault,consumed:false,reads:0,activated:false,writes:0,uploads:0,budgets:0,deleted:[]};
 const hit=name=>{if(state.fault===name&&!state.consumed){state.consumed=true;return true}return false};
 const client={from(table){assert.equal(table,'profile_content');const q={select(){return q},eq(){return q},async maybeSingle(){state.reads++;
  if(hit('schema'))return {error:{code:'42703',message:'column cv_version missing'}};
  if(hit('read')||(state.activated&&hit('confirm-read')))return {error:{code:'TEST'}};
  return {data:structuredClone(state.row)};}};return q},
  async rpc(name,args){
   if(name==='consume_cv_budget'){state.budgets++;if(hit('limiter-error'))return {error:'offline'};return {data:!hit('limited')}}
   assert.equal(name,'activate_cv');state.writes++;
   if(hit('commit-reject'))return {error:'rejected'};
   if(hit('zero-rows'))return {data:[]};
   if(state.row.cv_version!==args.p_previous)return {data:[]};
   state.row={cv_version:args.p_version,cv_filename:args.p_filename,cv_size_bytes:args.p_size,cv_updated_at:new Date().toISOString()};state.activated=true;
   if(hit('commit-ack-lost'))return {error:'lost acknowledgement'};
   return {data:[structuredClone(state.row)]};
  },storage:{from(bucket){assert.equal(bucket,'portfolio-cv');return {
   async upload(file,blob,settings){state.uploads++;assert.equal(settings.upsert,false);assert.equal(settings.contentType,'application/pdf');
    if(hit('upload-reject'))return {error:'rejected'};
    if(objects.has(file))return {error:'already exists'};
    objects.set(file,hit('corrupt-upload')?new Blob([makePdf('B')],{type:'application/pdf'}):blob);
    if(hit('upload-ack-lost'))return {error:'lost acknowledgement'};
    return {data:{path:file}};
   },async info(file){if(hit('info'))return {error:'unavailable'};return objects.has(file)?{data:{path:file}}:{error:'missing'}},
   async download(file){if((state.activated&&hit('confirm-object'))||((state.uploads>0||options.delivery)&&hit('download')))return {error:'unavailable'};
    if(options.delivery&&hit('delivery-race'))state.row={...state.row,cv_version:OTHER};
    return objects.has(file)?{data:objects.get(file)}:{error:'missing'};},
   async remove(files){state.deleted.push(...files);throw Error('Deletion forbidden in CV lifecycle')}
  }}}};
 const env=name=>name==='RATE_LIMIT_PEPPER'?'SYNTHETIC-LOCAL-PEPPER':undefined;
 const authorize=async auth=>auth==='Bearer owner-aal2';
 return {client,state,objects,pdf,env,authorize};
}
function upload(file=makePdf(),headers={}){return new Request('http://localhost/functions/v1/manage-cv',{method:'POST',headers:{authorization:'Bearer owner-aal2','content-type':'application/pdf','x-cv-version':NEW,'x-cv-previous':OLD,'x-cv-filename':'New.pdf',...headers},body:file})}
const get=(version=OLD)=>new Request(`http://localhost/functions/v1/cv-document?v=${version}`);
async function run(){
 const api=await runtime().load('supabase/functions/_shared/cv-service.js');const results=[];
 async function test(name,fn){try{await fn();results.push({name,status:'PASS'})}catch(error){results.push({name,status:'FAIL',error:error.stack})}}
 await test('valid-PDF-signature-trailer-xref',()=>api.validatePdf(new Uint8Array(makePdf())));
 for(const file of [Buffer.alloc(0),Buffer.from('not PDF'),Buffer.from('%PDF-1.4\nheader only'),Buffer.from(makePdf().toString().replace('%%EOF','badEND')),
  Buffer.from(makePdf().toString().replace(/startxref\n\d+/, 'startxref\n9999999'))])await test('reject-invalid-PDF-'+file.length,()=>assert.throws(()=>api.validatePdf(new Uint8Array(file))));
 for(const filename of ['CV.pdf','CV FINAL.PDF','Curriculum vitae.pdf'])await test('valid-filename-'+filename,()=>assert(api.validFilename(filename)));
 for(const filename of ['x.txt','../CV.pdf','a\\CV.pdf','bad\r\nCV.pdf','x'.repeat(181)+'.pdf'])await test('reject-filename-'+JSON.stringify(filename),()=>assert(!api.validFilename(filename)));
 await test('schema-complete-or-all-null',()=>{assert(api.metadata({cv_version:null,cv_filename:null,cv_size_bytes:null,cv_updated_at:null}));assert.throws(()=>api.metadata({cv_version:NEW}));});
 for(const authorization of ['', 'Bearer owner-aal1','Bearer non-owner','Bearer forged'])await test('reject-auth-'+authorization,async()=>{const f=fixture();const response=await api.createManageCvHandler(f)(upload(makePdf(),{authorization}));assert.equal(response.status,403);assert.equal(f.state.uploads,0);});
 for(const [name,file,headers,status] of [
  ['wrong-mime',makePdf(),{'content-type':'image/png'},415],['wrong-extension',makePdf(),{'x-cv-filename':'CV.png'},400],['empty',Buffer.alloc(0),{},400],
  ['signature-spoof',Buffer.from('%PDF-1.4\nnot a document'),{},400],['oversize-header',makePdf(),{'content-length':'5242881'},413],
  ['oversize-bytes',Buffer.alloc(5242881),{},413],['invalid-version',makePdf(),{'x-cv-version':'bad'},400],['invalid-previous',makePdf(),{'x-cv-previous':'bad'},400],
  ['path-in-filename',makePdf(),{'x-cv-filename':'a%2FCV.pdf'},400],['invalid-encoding',makePdf(),{'x-cv-filename':'%QQ'},400]]){
  await test(name,async()=>{const f=fixture();const r=await api.createManageCvHandler(f)(upload(file,headers));assert.equal(r.status,status);assert.equal(f.state.row.cv_version,OLD);assert.equal(f.state.uploads,0)});
 }
 for(const [fault,status] of [['schema',503],['read',503],['limited',429],['limiter-error',503],['upload-reject',503],['upload-ack-lost',503],['info',503],['download',503],['corrupt-upload',503],['commit-reject',503],['zero-rows',409],['commit-ack-lost',503],['confirm-read',503],['confirm-object',503]]){
  await test('replacement-'+fault,async()=>{const f=fixture(fault);const r=await api.createManageCvHandler(f)(upload());assert.equal(r.status,status,await r.text());assert(f.objects.has(`cv/${OLD}.pdf`));assert(f.objects.has(`cv/${f.state.row.cv_version}.pdf`));assert.equal(f.state.deleted.length,0);assert.equal(f.state.row.cv_version,f.state.activated?NEW:OLD)});
 }
 await test('normal-replacement-confirmed-no-old-delete',async()=>{const f=fixture();const r=await api.createManageCvHandler(f)(upload());assert.equal(r.status,200);assert.equal((await r.json()).cv_version,NEW);assert.equal(f.objects.size,2);assert.equal(f.state.writes,1);});
 await test('first-upload-from-empty',async()=>{const f=fixture(null,{empty:true});const r=await api.createManageCvHandler(f)(upload(makePdf(),{'x-cv-previous':'none'}));assert.equal(r.status,200);assert.equal(f.state.row.cv_version,NEW)});
 for(const fault of ['upload-ack-lost','commit-reject','commit-ack-lost','confirm-read','confirm-object'])await test('retry-reconciles-'+fault,async()=>{
  const f=fixture(fault),handler=api.createManageCvHandler(f);const first=await handler(upload());assert.notEqual(first.status,200);const second=await handler(upload());assert.equal(second.status,200,await second.text());assert.equal(f.objects.size,2);assert.equal(f.state.row.cv_version,NEW);assert.equal(f.state.deleted.length,0);
 });
 await test('same-version-different-bytes-denied',async()=>{const f=fixture();f.objects.set(`cv/${NEW}.pdf`,new Blob([makePdf('B')]));const r=await api.createManageCvHandler(f)(upload());assert.equal(r.status,409);assert.equal(f.state.row.cv_version,OLD)});
 await test('competing-uploads-conditional-admission-model',async()=>{const f=fixture(),handler=api.createManageCvHandler(f);const r=await Promise.all([handler(upload()),handler(upload(makePdf(),{'x-cv-version':OTHER}))]);assert.equal(r.filter(x=>x.status===200).length,1);assert.equal(r.filter(x=>x.status===409).length,1);assert.equal(f.objects.size,3);});
 await test('active-download-attachment-no-store-and-exact-bytes',async()=>{const f=fixture(null,{delivery:true}),r=await api.createCvDeliveryHandler(f)(get());assert.equal(r.status,200);assert(r.headers.get('content-disposition').startsWith('attachment'));assert(r.headers.get('cache-control').includes('no-store'));assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await r.arrayBuffer()),f.pdf)});
 for(const [name,fault,version,status] of [['old-version',null,NEW,404],['invalid-version',null,'bad',400],['race','delivery-race',OLD,404],['download','download',OLD,503],['read','read',OLD,503],['rate','limited',OLD,429]])await test('delivery-'+name,async()=>{const f=fixture(fault,{delivery:true}),r=await api.createCvDeliveryHandler(f)(get(version));assert.equal(r.status,status);assert(r.headers.get('cache-control').includes('no-store'))});
 await test('management-read-verifies-active-object',async()=>{const f=fixture(),r=await api.createManageCvHandler(f)(new Request('http://localhost/manage',{headers:{authorization:'Bearer owner-aal2'}}));assert.equal(r.status,200);assert.deepEqual(Object.keys(await r.json()).sort(),['cv_version','cv_filename','cv_size_bytes','cv_updated_at'].sort())});
 await test('raw-CV-path-or-secret-never-in-management-response',async()=>{const f=fixture(),r=await api.createManageCvHandler(f)(upload());const body=await r.text();assert(!body.includes('portfolio-cv'));assert(!body.includes('cv/'));assert(!body.includes('service_role'))});
 for(const token of ['owner-aal2','owner-aal1','non-owner','invalid'])await test('entrypoint-verifies-user-and-database-owner-AAL2-'+token,async()=>{
  const f=fixture(),callbacks=[];const rt=runtime({Deno:{env:{get:name=>({SUPABASE_URL:'http://local.invalid',SUPABASE_SERVICE_ROLE_KEY:'SYNTHETIC-SERVER',SUPABASE_ANON_KEY:'SYNTHETIC-ANON',RATE_LIMIT_PEPPER:'SYNTHETIC-PEPPER'}[name])},serve:fn=>callbacks.push(fn)},createClient:(url,key,options)=>key==='SYNTHETIC-SERVER'?f.client:{auth:{getUser:async jwt=>jwt==='invalid'?{error:'invalid'}:{data:{user:{id:'synthetic-owner'}}}},rpc:async()=>({data:options.global.headers.Authorization==='Bearer owner-aal2'})}});
  await rt.load('supabase/functions/manage-cv/index.ts');const r=await callbacks[0](upload(makePdf(),{authorization:'Bearer '+token}));assert.equal(r.status,token==='owner-aal2'?200:403);
 });

 await test('body-deadline-does-not-wait-for-uncooperative-cancel',async()=>{
  const bounded=await runtime({setTimeout:(fn)=>setTimeout(fn,5)}).load('supabase/functions/_shared/cv-service.js');
  const stream=new ReadableStream({pull(){return new Promise(()=>{})},cancel(){return new Promise(()=>{})}});
  const req=new Request('http://local.invalid',{method:'POST',headers:{'content-type':'application/pdf'},body:stream,duplex:'half'});
  await assert.rejects(()=>bounded.readPdfBody(req),error=>error.code==='BODY_TIMEOUT');
 });
 await test('chunked-body-enforces-size-without-content-length',async()=>{
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(5242881));controller.close()}});
  const req=new Request('http://local.invalid',{method:'POST',headers:{'content-type':'application/pdf'},body:stream,duplex:'half'});
  await assert.rejects(()=>api.readPdfBody(req),error=>error.code==='INVALID_SIZE');
 });
 await test('public-preflight-has-no-storage-access',async()=>{const f=fixture(),r=await api.createCvDeliveryHandler(f)(new Request('http://local.invalid',{method:'OPTIONS'}));assert.equal(r.status,204);assert.equal(f.state.reads,0);assert.equal(f.state.budgets,0)});
 await test('delivery-limiter-fails-closed',async()=>{const f=fixture('limiter-error'),r=await api.createCvDeliveryHandler(f)(get());assert.equal(r.status,503);assert.equal(f.state.reads,0)});
 await test('PDF-xref-stream-form-supported',()=>{const pdf=makePdf().toString();const offset=pdf.indexOf('xref\n');api.validatePdf(new Uint8Array(Buffer.from(pdf.slice(0,offset)+'2 0 obj\n<< /Type /XRef /Size 3 >>\nstream\nsynthetic\nendstream\nendobj\nstartxref\n'+offset+'\n%%EOF\n')))});

 await test('public-entrypoint-needs-no-user-token-or-anon-client',async()=>{
  const f=fixture(),callbacks=[];const rt=runtime({Deno:{env:{get:name=>({SUPABASE_URL:'http://local.invalid',SUPABASE_SERVICE_ROLE_KEY:'SYNTHETIC-SERVER',RATE_LIMIT_PEPPER:'SYNTHETIC-PEPPER'}[name])},serve:fn=>callbacks.push(fn)},createClient:()=>f.client});
  await rt.load('supabase/functions/cv-document/index.ts');const r=await callbacks[0](get());assert.equal(r.status,200);assert(r.headers.get('content-disposition').startsWith('attachment'));
 });
 await test('SQL-static-boundaries-not-runtime',()=>{const sql=fs.readFileSync(path.join(ROOT,'supabase/migrations/20261019030000_m06_cv_management.sql'),'utf8');assert.equal((sql.match(/add column /g)||[]).length,4);assert(sql.includes("coalesce(auth.role(), '') <> 'service_role'"));assert(sql.includes('cv_version is not distinct from p_previous'));assert(sql.includes('5242880'));assert(!/create table|portfolio-documents|consume_request_budget\(/i.test(sql));assert(sql.includes('as restrictive for insert'));assert(sql.includes('as restrictive for update'));assert(sql.includes('as restrictive for delete'));});
 const summary={passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length};console.log(JSON.stringify({summary,results,limitations:['No real PostgreSQL/RLS/Storage; concurrency is a serialized CAS double, not proof of database locking.','PDF structural checks are bounded and do not sanitize PDF content.']},null,2));if(summary.failed)process.exitCode=1;
}
module.exports={runtime,fixture,makePdf,upload,get,OLD,NEW,OTHER};
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1});
