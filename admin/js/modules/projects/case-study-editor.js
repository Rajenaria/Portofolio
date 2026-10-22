import { el } from '../../core/dom.js';
import { textField,textareaField,checkboxField,selectField } from '../../core/form.js';
import { projectCommand,createDraftMediaResolver,sameProjectPayload } from '../../core/project-client.js';
import { confirmDialog } from '../../core/modal.js';
import { id,SECTION_TYPES,SECTION_LABELS,cropDefault } from '../../../../js/cms/project-data.js';
import { createCropEditor } from './crop-editor.js';
import { openCaseStudyPreview } from './case-study-preview.js';
export function createCaseStudyEditor({data,technologies=[],onBack,onSaved=()=>{}}){
 const root=el('div','m09-editor'),bar=el('div','page-actions'),status=el('p','form-help'),fields=el('div','m09-editor-fields');status.setAttribute('role','status');
 let record=data.project,draft=data.draft,payload=structuredClone(draft.payload),saved=JSON.stringify(payload),busy=false,pending=null,destroyed=false,childViews=[],activeTab='general';
 const media=createDraftMediaResolver(),mediaViews=new Map(),storageKey='portfolio-project-operation:'+record.id;
 try{const prior=JSON.parse(sessionStorage.getItem(storageKey));if(prior?.operation)pending=prior;}catch{}
 function uploadsPending(){return [...mediaViews.values()].some(v=>v.isBusy?.());}
 function dirty(){return JSON.stringify(payload)!==saved||uploadsPending();}
 function button(label,fn,parent=bar){const b=el('button','admin-button',label);b.type='button';if(label==='↑'||label==='↓')b.setAttribute('aria-label',label==='↑'?'Pindahkan item ke atas':'Pindahkan item ke bawah');b.addEventListener('click',fn);parent.append(b);return b;}
 function notice(message){status.textContent=message;}
 function describe(){notice(`Draft v${draft.draft_version} · Published v${record.publication_version} (${record.status}) · ${dirty()?'Perubahan lokal belum disimpan':'Working draft tersimpan'}${pending?' · Operasi belum terkonfirmasi':''}`);publish.disabled=!!pending;save.disabled=!!pending;}
 function publicationReadback(next){
  const conflict=next.draft.draft_version!==draft.draft_version||!sameProjectPayload(next.draft.payload,draft.payload);
  record=next.project;if(!conflict)draft=next.draft;pending=null;sessionStorage.removeItem(storageKey);
  if(conflict)notice('Commit publikasi ditemukan; draft berubah di sesi lain. Perubahan lokal dan token revisi lama dipertahankan. Gunakan Reload Draft sebelum melanjutkan.');else describe();
 }
 function changed(){describe();}
 async function guard(fn){if(busy)return;busy=true;root.setAttribute('aria-busy','true');for(const b of bar.querySelectorAll('button'))b.disabled=true;try{await fn();}catch(e){notice(`${e.code||e.message||'UNCONFIRMED'}. Tidak ada sukses yang dikonfirmasi; periksa atau rekonsiliasi sebelum retry.`);}finally{busy=false;root.removeAttribute('aria-busy');for(const b of bar.querySelectorAll('button'))b.disabled=false;if(pending){save.disabled=true;publish.disabled=true;}}}
 const back=button('← Projects',()=>onBack());
 const save=button('Save Draft',()=>guard(async()=>{
  if(uploadsPending()){notice('Selesaikan atau rekonsiliasi upload terlebih dahulu.');return;}
  const candidate=structuredClone(payload),expected=draft.draft_version;
  try{const next=await projectCommand({action:'save',id:record.id,expected,publication:record.publication_version,payload:candidate});if(next.draft.draft_version!==expected+1)throw Error('UNCONFIRMED');draft=next.draft;record=next.project;saved=JSON.stringify(candidate);describe();onSaved();}
  catch(e){if(e.ambiguous||!e.code){pending={action:'save',expected,candidate};notice('Save belum terkonfirmasi. Gunakan Rekonsiliasi; jangan mengirim ulang secara buta.');}throw e;}
 }));
 const preview=button('Preview Draft',()=>openCaseStudyPreview(record.id,structuredClone(payload)));
 const publish=button('Publish Draft',()=>guard(async()=>{
  if(dirty()){notice('Simpan perubahan sebagai Working Draft sebelum Publish.');return;}
  const op={action:'publish',id:record.id,expected:draft.draft_version,publication:record.publication_version,operation:id()};pending=op;sessionStorage.setItem(storageKey,JSON.stringify(op));
  try{const result=await projectCommand({...op,payload:draft.payload});if(result.state!=='committed')throw Error('UNCONFIRMED');const next=await projectCommand({action:'read',id:record.id});if(next.project.published_revision_id!==result.revision_id||next.project.publication_version!==result.publication_version)throw Error('UNCONFIRMED');publicationReadback(next);onSaved();}catch(e){if(!e.ambiguous&&e.code&&e.code!=='UNCONFIRMED'){pending=null;sessionStorage.removeItem(storageKey);}throw e;}
 }));
 button('Rekonsiliasi',()=>guard(async()=>{
  if(!pending){notice('Tidak ada operasi pending. Reload draft hanya setelah menyimpan perubahan lokal.');return;}
  const next=await projectCommand({action:'read',id:record.id});
  if(pending.action==='save'){
   if(next.draft.draft_version===pending.expected+1&&sameProjectPayload(next.draft.payload,pending.candidate)){draft=next.draft;record=next.project;saved=JSON.stringify(pending.candidate);pending=null;describe();}
   else if(next.draft.draft_version===pending.expected){pending=null;notice('Save tidak terkonfirmasi tersimpan. Perubahan lokal dipertahankan; Save dapat dicoba lagi.');}
   else notice('Konflik revisi: perubahan lokal dipertahankan. Buka ulang draft setelah menyalin perubahan yang dibutuhkan.');
   return;
  }
  const result=await projectCommand({action:'operation',id:record.id,operation:pending.operation});
  if(result.state==='committed'){publicationReadback(next);onSaved();}
  else notice('Commit belum ditemukan. Gunakan Retry Operation dengan operation ID yang sama; tidak ada file yang dihapus.');
 }));
 button('Retry Operation',()=>guard(async()=>{
  if(!pending||pending.action==='save'){notice('Gunakan Rekonsiliasi terlebih dahulu.');return;}
  const result=await projectCommand({...pending,payload:draft.payload});
  if(result.state==='committed'){const next=await projectCommand({action:'read',id:record.id});publicationReadback(next);onSaved();}
 }));
 button('Reload Draft',()=>guard(async()=>{
  if(pending){notice('Rekonsiliasi operasi pending terlebih dahulu.');return;}
  if(uploadsPending()){notice('Selesaikan atau rekonsiliasi upload terlebih dahulu.');return;}
  if(dirty()&&!await confirmDialog({title:'Reload Working Draft?',lines:['Perubahan lokal yang belum disimpan akan diganti oleh draft terbaru.'],confirmLabel:'Reload Draft',cancelLabel:'Batal'}))return;
  const next=await projectCommand({action:'read',id:record.id});record=next.project;draft=next.draft;payload=structuredClone(draft.payload);saved=JSON.stringify(payload);for(const view of mediaViews.values())view.destroy();mediaViews.clear();draw();describe();
 }));
 const tabs=el('div','m09-editor-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Bagian editor');
 for(const [key,label]of [['general','General / Hero'],['sections','Case Study Sections'],['legacy','Legacy Content']]){const b=button(label,()=>{activeTab=key;draw();},tabs);b.dataset.tab=key;}
 function field(parent,object,key,label,{long=false,options,number=false,max=20000}={}){
  const fid='m09-'+id(),f=options?selectField({id:fid,label,options:options.map(v=>typeof v==='string'?{value:v,label:v}:v),value:object[key]||''}):long?textareaField({id:fid,label,value:object[key]||'',maxLength:max,rows:4}):textField({id:fid,label,value:String(object[key]??''),maxLength:max});
  if(number)f.control.type='number';f.control.addEventListener('input',()=>{object[key]=number?Number(f.control.value):f.control.value;changed();});parent.append(f.node);return f;
 }
 function crop(parent,object,key,aspect){const cacheKey=(object.id||'project')+':'+key;let v=mediaViews.get(cacheKey);if(!v){v=createCropEditor({project:record.id,placement:object[key],aspect,fixedAspect:object===payload,resolver:media.resolve,onChange:value=>{object[key]=value;changed();}});mediaViews.set(cacheKey,v);}childViews.push(v);parent.append(v.element);}
 function reorder(array,index,delta){const to=index+delta;if(to<0||to>=array.length)return;[array[index],array[to]]=[array[to],array[index]];changed();draw();}
 function duplicateItem(item){const copy=structuredClone(item);copy.id=id();if(copy.media)copy.media.id=id();return copy;}
 function draw(){
  childViews=[];fields.replaceChildren();for(const b of tabs.children)b.setAttribute('aria-pressed',String(b.dataset.tab===activeTab));
  if(activeTab==='general'){
   const g=payload.general;for(const [key,label,max]of [['title','Project title',180],['slug','Slug',140],['category','Category',100],['summary','Short summary',400],['role','Role',180],['period','Project period',120],['stage','Project status label',140],['github_url','Repository URL',2048],['demo_url','Demo URL',2048],['sort_order','Sort order',12]]){const f=field(fields,g,key,label,{max,long:key==='summary',number:key==='sort_order'});if(key==='slug'&&record.published_at)f.control.disabled=true;}
   const featured=checkboxField({id:'m09-featured',label:'Featured project',checked:g.featured});featured.control.addEventListener('change',()=>{g.featured=featured.control.checked;changed();});fields.append(featured.node);
   crop(fields,payload,'cover','card');crop(fields,payload,'hero','hero');
  }else if(activeTab==='legacy'){
   fields.append(el('p','form-help','Konten asli dipertahankan. Perubahan disimpan sebagai draft; halaman legacy existing tidak ditimpa.'));
   payload.legacy||={paragraphs:[],technologies:[]};
   fields.append(el('p','form-help','Field judul/intro legacy dapat dikosongkan untuk memakai General title/summary. Konten asli tetap tersimpan dalam snapshot sebelumnya.'));
   for(const [key,label,max]of [['title_main','Legacy detail title',180],['title_highlight','Legacy title highlight',180],['intro','Legacy detail introduction',20000],['heading','Legacy about heading',220]])field(fields,payload.legacy,key,label,{long:key==='intro',max});
   for(let index=0;index<payload.legacy.paragraphs.length;index++){const wrap=el('div','admin-section'),holder={text:payload.legacy.paragraphs[index]},f=field(wrap,holder,'text','Paragraph '+(index+1),{long:true});f.control.addEventListener('input',()=>payload.legacy.paragraphs[index]=holder.text);button('Hapus paragraph',()=>{payload.legacy.paragraphs.splice(index,1);changed();draw();},wrap);fields.append(wrap);}
   button('Tambah paragraph',()=>{payload.legacy.paragraphs.push('');changed();draw();},fields);
   fields.append(el('p','form-help','Teknologi legacy: '+payload.legacy.technologies.map(t=>t.name).join(', ')));
  }else{
   const add=el('select');add.setAttribute('aria-label','Tambah section');add.append(new Option('Tambah section…',''));for(const type of SECTION_TYPES.filter(t=>!payload.sections.some(s=>s.type===t)))add.append(new Option(SECTION_LABELS[type],type));
   add.addEventListener('change',()=>{if(!add.value)return;payload.sections.push({id:id(),type:add.value,title:SECTION_LABELS[add.value],enabled:true,text:'',secondary:'',items:[],...(add.value==='architecture'?{layout:'layered',edges:[]}:{} )});changed();draw();});fields.append(add);
   for(const [index,s]of payload.sections.entries()){
    const box=el('section','admin-section m09-section-editor');box.dataset.sectionId=s.id;box.append(el('h2','',SECTION_LABELS[s.type]));
    const actions=el('div','page-actions');box.append(actions);button('↑ Section',()=>reorder(payload.sections,index,-1),actions);button('↓ Section',()=>reorder(payload.sections,index,1),actions);button('Hapus section',()=>{payload.sections.splice(index,1);changed();draw();},actions);
    const enabled=checkboxField({id:'enabled-'+s.id,label:'Section visible setelah publish',checked:s.enabled});enabled.control.addEventListener('change',()=>{s.enabled=enabled.control.checked;changed();});box.append(enabled.node);field(box,s,'title','Section title',{max:160});field(box,s,'text',s.type==='challenge'?'Challenge':'Introduction / reflections',{long:true});if(s.type==='challenge')field(box,s,'secondary','Solution',{long:true});
    if(s.type==='architecture')field(box,s,'layout','Architecture preset',{options:['layered','linear']});
    for(const [n,item]of s.items.entries()){
     const itemBox=el('fieldset','m09-item-editor');itemBox.draggable=true;itemBox.dataset.itemId=item.id;itemBox.append(el('legend','',`${n+1}. ${item.title||'Item'}`));
     itemBox.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',s.id+':'+item.id);});itemBox.addEventListener('dragover',e=>e.preventDefault());itemBox.addEventListener('drop',e=>{e.preventDefault();const [sid,iid]=e.dataTransfer.getData('text/plain').split(':');if(sid!==s.id)return;const from=s.items.findIndex(i=>i.id===iid);if(from<0)return;const [moving]=s.items.splice(from,1);s.items.splice(n,0,moving);changed();draw();});
     const tools=el('div','page-actions');itemBox.append(tools);button('↑',()=>reorder(s.items,n,-1),tools);button('↓',()=>reorder(s.items,n,1),tools);button('Duplikat',()=>{s.items.splice(n+1,0,duplicateItem(item));changed();draw();},tools);button('Hapus item',()=>{s.items.splice(n,1);if(s.edges)s.edges=s.edges.filter(e=>e.source!==item.id&&e.target!==item.id);for(const other of payload.sections)for(const i of other.items)if(i.media?.phase_id===item.id)i.media.phase_id=null;changed();draw();},tools);
     const visible=checkboxField({id:'visible-'+item.id,label:'Item visible setelah publish',checked:item.enabled!==false});visible.control.addEventListener('change',()=>{item.enabled=visible.control.checked;changed();});itemBox.append(visible.node);
     field(itemBox,item,'title','Title',{max:180});field(itemBox,item,'description','Description',{long:true,max:12000});field(itemBox,item,'notes','Technical notes / rationale',{long:true,max:12000});field(itemBox,item,'category','Category',{max:120});
     if(s.type==='decisions'){
      const select=el('select');select.setAttribute('aria-label','Teknologi existing');select.append(new Option('Pilih teknologi existing',''));for(const t of technologies)select.append(new Option(t.name,t.id));select.value=item.technology_id||'';select.addEventListener('change',()=>{const t=technologies.find(t=>t.id===select.value);item.technology_id=t?.id||null;if(t)item.title=t.name;changed();draw();});itemBox.append(select);
     }
     const tags={value:(item.technologies||[]).join(', ')},tagField=field(itemBox,tags,'value','Technology labels (pisahkan koma)',{max:1600});tagField.control.addEventListener('input',()=>{item.technologies=tags.value.split(',').map(v=>v.trim()).filter(Boolean);});
     field(itemBox,item,'url','Supporting URL',{max:2048});if(['features','gallery'].includes(s.type))field(itemBox,item,'layout','Card layout',{options:['normal','wide','portrait']});
     if(s.type==='features')field(itemBox,item,'icon','Icon preset',{options:['','code','cpu','database','layers','globe','shield','tool']});
     crop(itemBox,item,'media',s.type==='gallery'?'landscape':'card');
     if(item.media){field(itemBox,item.media,'description','Media description',{long:true,max:4000});field(itemBox,item.media,'category','Media category',{max:120});const phases=payload.sections.find(x=>x.type==='timeline')?.items||[];const f=field(itemBox,item.media,'phase_id','Related phase',{options:[{value:'',label:'Tidak terkait'},...phases.map(p=>({value:p.id,label:p.title||p.id}))]});f.control.addEventListener('change',()=>{if(!f.control.value)item.media.phase_id=null;});}
     box.append(itemBox);
    }
    button('Tambah item',()=>{s.items.push({id:id(),title:'',description:'',notes:'',category:'',technologies:[],media:null,...(s.type==='features'||s.type==='gallery'?{layout:'normal'}:{})});changed();draw();},box);
    if(s.type==='architecture'){
     for(const [n,edge]of (s.edges||[]).entries()){const edgeBox=el('fieldset','m09-edge-editor');edgeBox.append(el('legend','','Connection '+(n+1)));const options=s.items.map(i=>({value:i.id,label:i.title||i.id}));field(edgeBox,edge,'source','Source',{options});field(edgeBox,edge,'target','Destination',{options});field(edgeBox,edge,'type','Relationship',{options:['data','control','dependency']});button('Hapus connection',()=>{s.edges.splice(n,1);changed();draw();},edgeBox);box.append(edgeBox);}
     button('Tambah connection',()=>{if(s.items.length<2){notice('Tambahkan minimal dua node terlebih dahulu.');return;}s.edges.push({id:id(),source:s.items[0].id,target:s.items[1].id,type:'data'});changed();draw();},box);
    }
    fields.append(box);
   }
  }
  const liveKeys=new Set(['project:cover','project:hero',...payload.sections.flatMap(s=>s.items.map(i=>i.id+':media'))]);
  for(const [key,view]of mediaViews)if(!liveKeys.has(key)&&!view.isBusy()){view.destroy();mediaViews.delete(key);}
 }
 const beforeUnload=e=>{if(dirty()||pending||busy){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
 root.append(bar,status,tabs,fields);draw();describe();
 return {element:root,isDirty:()=>dirty()||!!pending||busy,destroy(){destroyed=true;for(const view of mediaViews.values())view.destroy();mediaViews.clear();media.destroy();window.removeEventListener('beforeunload',beforeUnload);}};
}
