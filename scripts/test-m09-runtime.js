// TypeScript syntax stripping and actual runtime authorization with a local SDK double; no Deno/network.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module'),{moduleAt}=require('./test-m09-contract');
const ROOT=path.resolve(__dirname,'..'),results=[];
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
async function runtime(mode='owner-aal2',missing=false){
 const calls=[];const createClient=(url,key,options)=>{calls.push({url,key,options});return key==='fixture-service'?{isServer:true}:{auth:{getUser:async jwt=>({data:{user:['invalid','expired'].includes(mode)?null:{id:'00000000-0000-4000-8000-000000000001'}},error:['invalid','expired'].includes(mode)?Error('synthetic'):null})},rpc:async name=>({data:mode==='owner-aal2',error:mode==='permission-error'?Error('synthetic'):null})};};
 const context=vm.createContext({Deno:{env:{get:name=>missing?undefined:({SUPABASE_URL:'http://127.0.0.1:54321',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',SUPABASE_ANON_KEY:'fixture-anon'}[name])}},fetch:()=>{throw Error('Network prohibited');},AbortSignal});
 const sdk=new vm.SyntheticModule(['createClient'],function(){this.setExport('createClient',createClient);},{context});
 const module=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(path.join(ROOT,'supabase/functions/_shared/project-runtime.ts'),'utf8')),{context});await module.link(()=>sdk);await module.evaluate();return {factory:module.namespace.projectRuntime,calls};
}
(async()=>{
 for(const mode of ['invalid','expired','owner-aal1','non-owner','permission-error'])await test('runtime denies '+mode,async()=>{const r=await runtime(mode);assert.equal(await r.factory().authorize('Bearer synthetic-token'),null);});
 await test('runtime owner+AAL2 returns validated user ID',async()=>{const r=await runtime();assert.equal(await r.factory().authorize('Bearer synthetic-token'),'00000000-0000-4000-8000-000000000001');});
 await test('runtime rejects missing/malformed bearer',async()=>{const r=await runtime(),api=r.factory();for(const value of ['','synthetic-token','Basic anything'])assert.equal(await api.authorize(value),null);assert.equal(r.calls.length,1);});
 await test('runtime missing configuration fails closed',async()=>{const r=await runtime('owner-aal2',true);assert.throws(()=>r.factory());});
 await test('server SDK uses non-persistent auth and bounded fetch',async()=>{const r=await runtime();r.factory();assert.equal(r.calls[0].options.auth.persistSession,false);assert.equal(r.calls[0].options.auth.autoRefreshToken,false);assert.equal(typeof r.calls[0].options.global.fetch,'function');});
 const m=await moduleAt(path.join(ROOT,'supabase/functions/_shared/project-image.js'));await m.evaluate();
 await test('body read times out even with uncooperative cancellation',async()=>{const req=new Request('http://fixture',{method:'POST',duplex:'half',body:new ReadableStream({pull(){return new Promise(()=>{});},cancel(){return new Promise(()=>{});}})});const start=performance.now();await assert.rejects(()=>m.namespace.boundedBytes(req,100,15),/BODY_TIMEOUT/);assert(performance.now()-start<1000);});
 await test('streamed body size bounded without Content-Length',async()=>{const req=new Request('http://fixture',{method:'POST',duplex:'half',body:new ReadableStream({start(c){c.enqueue(new Uint8Array(100));c.close();}})});await assert.rejects(()=>m.namespace.boundedBytes(req,10,100),/TOO_LARGE/);});
 console.log(JSON.stringify({classification:'FIXTURE VERIFIED / TS SYNTAX ONLY; not Deno typecheck or real Auth',passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results}));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
