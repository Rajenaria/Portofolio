/* Synthetic transaction/Storage adapter for actual Edge handlers. NOT a PostgreSQL/RLS emulator proof. */
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function backend(initial){
 const state={project:{id:initial.id,slug:initial.payload.general.slug,title:initial.payload.general.title,status:'published',deleted_at:null,published_at:'2026-01-01',publication_version:1,published_revision_id:initial.revision_id},draft:{project_id:initial.id,draft_version:0,base_publication_version:1,payload:clone(initial.payload)},revisions:new Map([[initial.revision_id,clone(initial.payload)]]),assets:new Map(),operations:new Map(),objects:new Map(),faults:new Set(),budget:true,counts:{}};
 function fault(name){if(state.faults.delete(name))throw Error('Synthetic '+name);}
 function read(){return {project:clone(state.project),draft:clone(state.draft)};}
 const client={
  from(){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:clone(state.project),error:null};}};},
  storage:{from(bucket){return {
   async info(path){try{fault('info');const blob=state.objects.get(bucket+'|'+path);return blob?{data:{size:blob.size}}:{error:Error('not found')};}catch(error){return {error};}},
   async upload(path,bytes){try{fault('upload');const key=bucket+'|'+path;if(state.objects.has(key))throw Error('exists');state.objects.set(key,new Blob([bytes]));fault('upload-ack');return {data:{path},error:null};}catch(e){return {data:null,error:e};}},
   async download(path){try{fault('download');const data=state.objects.get(bucket+'|'+path);return data?{data,error:null}:{error:Error('not found')};}catch(e){return {error:e};}}
  };}},
  async rpc(name,a){try{
   state.counts[name]=(state.counts[name]||0)+1;
   if(name==='consume_project_budget')return {data:state.budget};
   if(name==='project_admin_catalog')return {data:[{...clone(state.project),draft_version:state.draft.draft_version}]};
   if(name==='project_assets_for_owner')return {data:[...state.assets.values()].filter(x=>x.project_id===a.p_project).map(clone)};
   if(name==='project_asset_delivery'){
    const asset=state.assets.get(a.p_asset),payload=state.revisions.get(state.project.published_revision_id);
    const placements=[payload.cover,payload.hero,...payload.sections.filter(s=>s.enabled).flatMap(s=>s.items.filter(i=>i.enabled!==false).map(i=>i.media))].filter(Boolean);
    return {data:state.project.status==='published'&&!state.project.deleted_at&&a.p_project===state.project.id&&placements.some(p=>p.asset_id===a.p_asset)?clone(asset?.components[a.p_variant])||null:null};
   }
   if(name==='project_asset_command'){
    let asset=state.assets.get(a.p_asset);
    if(a.p_component){
     if(!asset){asset={id:a.p_asset,project_id:a.p_project,state:'uploading',components:{},provenance:a.p_legacy?'legacy-derivative-only':'original-upload'};state.assets.set(a.p_asset,asset);}
     if(asset.project_id!==a.p_project)throw Error('ASSET_CONFLICT');
     if(asset.components[a.p_component]&&JSON.stringify(asset.components[a.p_component])!==JSON.stringify(a.p_metadata))throw Error('ASSET_CONFLICT');
     asset.components[a.p_component]=clone(a.p_metadata);if((asset.provenance==='legacy-derivative-only'?['desktop','mobile']:['original','desktop','mobile']).every(k=>asset.components[k]))asset.state='ready';
    }
    fault('asset-ack');return {data:clone(asset)||null};
   }
   if(name==='project_published_for_owner')return {data:clone(state.revisions.get(state.project.published_revision_id))};
   if(name!=='project_command')throw Error('unknown RPC');
   if(a.p_id!==state.project.id&&a.p_action!=='create')throw Error('NOT_FOUND');
   if(a.p_action==='create'){state.project={id:a.p_id,title:'Project baru',status:'draft',publication_version:0,published_at:null,published_revision_id:null};state.draft={project_id:a.p_id,draft_version:0,base_publication_version:0,payload:clone(initial.payload)};return {data:read()};}
   if(a.p_action==='read'){fault('readback');return {data:read()};}
   if(a.p_action==='operation')return {data:clone(state.operations.get(a.p_operation)?.result)||{state:'not_committed'}};
   if(a.p_action==='save'){
    fault('save');if(a.p_expected!==state.draft.draft_version||a.p_publication!==state.project.publication_version)throw Error('REVISION_CONFLICT');
    state.draft.payload=clone(a.p_payload);state.draft.draft_version++;fault('save-ack');return {data:read()};
   }
   const binding=JSON.stringify(a),old=state.operations.get(a.p_operation);
   if(old){if(binding!==old.binding)throw Error('OPERATION_CONFLICT');return {data:clone(old.result)};}
   if(a.p_publication!==state.project.publication_version)throw Error('PUBLICATION_CONFLICT');
   fault('before-activate');
   if(a.p_action==='publish'){
    if(a.p_expected!==state.draft.draft_version||state.draft.base_publication_version!==a.p_publication)throw Error('REVISION_CONFLICT');
    if(JSON.stringify(a.p_payload)!==JSON.stringify(state.draft.payload))throw Error('PAYLOAD_CONFLICT');
    const rid=a.p_operation;state.revisions.set(rid,clone(a.p_payload));state.project.published_revision_id=rid;state.project.published_at||='2026-01-01';state.project.title=a.p_payload.general.title;state.project.slug=a.p_payload.general.slug;state.project.status='published';state.project.deleted_at=null;
   }else if(a.p_action==='show'){state.project.status='published';state.project.deleted_at=null;}
   else{state.project.status=a.p_action==='archive'?'archived':'draft';if(a.p_action==='trash')state.project.deleted_at='2026-01-01';if(a.p_action==='restore')state.project.deleted_at=null;}
   state.project.publication_version++;state.draft.base_publication_version=state.project.publication_version;
   const result={state:'committed',operation_id:a.p_operation,revision_id:state.project.published_revision_id,publication_version:state.project.publication_version,status:state.project.status,deleted_at:state.project.deleted_at};
   state.operations.set(a.p_operation,{binding,result});if(state.faults.delete('concurrent-save-after-activate')){state.draft.payload.general.title='CONCURRENT DRAFT CHANGE';state.draft.draft_version++;}fault('activate-ack');return {data:clone(result)};
  }catch(error){return {data:null,error};}}
 };
 return {state,client};
}
module.exports={backend};
