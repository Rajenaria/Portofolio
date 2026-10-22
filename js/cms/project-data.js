import { readProjectRpc, readTable, publicMediaUrl, CMS_URL } from './client.js';
import { normalizeCover } from './project-cover.js';
export const id = () => crypto.randomUUID();
export const SECTION_TYPES=['challenge','timeline','architecture','features','decisions','gallery','reflections'];
export const SECTION_LABELS={challenge:'Challenge & Solution',timeline:'Development Journey',architecture:'System Architecture',features:'Key Capabilities',decisions:'Engineering Decisions',gallery:'Project Artifacts',reflections:'Results & Reflections'};
export const cropDefault=(aspect='card')=>({fit:'cover',aspect,x:50,y:50,zoom:1});
export function emptyProject(){return {schema_version:1,general:{title:'',slug:'',category:'',summary:'',role:'',period:'',stage:'',github_url:'',demo_url:'',featured:false,sort_order:0},cover:null,hero:null,sections:[],legacy:{paragraphs:[],technologies:[]}};}
export function legacyPayload(row){
 const p=emptyProject(),g=p.general;Object.assign(g,{title:row.title||'',slug:row.slug||'',category:row.card_category||'',summary:row.short_description||row.detail_intro||'',role:row.role||'',period:row.project_date||'',stage:row.project_type||'',github_url:row.github_url||'',demo_url:row.demo_url||'',featured:!!row.featured,sort_order:row.sort_order||0});
 const old=normalizeCover(row);
 if(publicMediaUrl(row.cover_bucket,row.cover_desktop_path))p.cover={id:row.id||id(),asset_id:null,legacy:{id:row.id||null,bucket:row.cover_bucket,desktop:row.cover_desktop_path,mobile:row.cover_mobile_path||row.cover_desktop_path},alt:row.cover_alt||g.title,crop:{fit:old.cover_fit,aspect:'card',x:old.cover_position_x,y:old.cover_position_y,zoom:1}};
 if(p.cover)p.hero={...structuredClone(p.cover),id:id(),crop:cropDefault('hero')};
 p.legacy.paragraphs=[...(row.project_paragraphs||[])].sort((a,b)=>a.sort_order-b.sort_order).map(x=>x.content);
 Object.assign(p.legacy,{intro:row.detail_intro||'',heading:row.about_heading||'',title_main:row.detail_title_main||'',title_highlight:row.detail_title_highlight||''});
 p.legacy.technologies=(row.project_technologies||[]).map(x=>({id:x.technology_id||x.technologies?.id||null,name:x.technologies?.name||'',icon:x.technologies?.icon_key||''})).filter(x=>x.name);
 const media=(row.project_media||[]).filter(m=>m.is_active&&publicMediaUrl(m.bucket_name,m.desktop_path));
 if(media.length)p.sections.push({id:id(),type:'gallery',title:SECTION_LABELS.gallery,enabled:true,text:'',secondary:'',items:media.map(m=>({id:id(),title:m.alt_text||g.title,description:'',media:{id:m.id||id(),asset_id:null,legacy:{id:m.id,bucket:m.bucket_name,desktop:m.desktop_path,mobile:m.mobile_path||m.desktop_path},alt:m.alt_text||g.title,crop:cropDefault('landscape')}}))});
 return p;
}
export function assertSnapshot(row){
 if(!row||!row.id||row.payload?.schema_version!==1||typeof row.payload.general?.title!=='string'||!Array.isArray(row.payload.sections)||!Array.isArray(row.payload.legacy?.paragraphs||[]))throw new Error('Invalid project snapshot');return row;
}
export async function loadCatalog({slug=null}={}){
 const rows=[],seen=new Set();let after=null;
 try{
  for(let page=0;page<100;page++){
   const batch=await readProjectRpc({p_after:after,p_limit:100,p_slug:slug});
   for(const row of batch){assertSnapshot(row);if(seen.has(row.id))throw new Error('Catalog pagination did not advance');seen.add(row.id);rows.push(row);}
   if(batch.length<100)return rows.sort((a,b)=>a.payload.general.sort_order-b.payload.general.sort_order||a.id.localeCompare(b.id));
   after=batch.at(-1).id;
  }
  throw new Error('Catalog exceeds safe page budget');
 }catch(error){
  if(error.code!=='LEGACY_SCHEMA'||rows.length)throw error;
  let legacyConfirmed=false;
  try{await readTable('projects','select=id,published_revision_id&limit=1',{cache:'no-store'});}
  catch(probe){if(probe.code==='LEGACY_PROJECT_SCHEMA')legacyConfirmed=true;else throw probe;}
  if(!legacyConfirmed)throw new Error('Snapshot API missing on a versioned schema');
  // Confirmed old schema only. Network errors never reveal another data source.
  for(let offset=0;offset<10000;offset+=100){
   const batch=await readTable('projects','select=*,project_paragraphs(*),project_media(*),project_technologies(*,technologies(*))&status=eq.published&deleted_at=is.null&order=id.asc&limit=100&offset='+offset+(slug?'&slug=eq.'+encodeURIComponent(slug):''),{cache:'no-store'});
   for(const row of batch)if(row.status==='published'&&row.deleted_at===null)rows.push({id:row.id,revision_id:null,publication_version:0,payload:legacyPayload(row)});
   if(batch.length<100)return rows.sort((a,b)=>a.payload.general.sort_order-b.payload.general.sort_order);
  }
  throw new Error('Legacy catalog exceeds safe page budget');
 }
}
export function mediaSource(projectId,placement,variant='desktop'){
 if(placement?.asset_id)return `${CMS_URL}/functions/v1/project-media?project=${encodeURIComponent(projectId)}&asset=${encodeURIComponent(placement.asset_id)}&variant=${variant}`;
 return placement?.legacy?publicMediaUrl(placement.legacy.bucket,placement.legacy[variant]):null;
}
export const categoryKey=value=>String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('id');
export function categories(rows){const map=new Map();for(const row of rows){const label=row.payload.general.category.trim(),key=categoryKey(label);if(key&&!map.has(key))map.set(key,label);}return [...map].sort((a,b)=>a[1].localeCompare(b[1]));}
export function applyCrop(image,crop=cropDefault(),mobile=false){
 const c=mobile&&crop.mobile?crop.mobile:crop;
 const x=Number.isFinite(c.x)?Math.max(0,Math.min(100,c.x)):50,y=Number.isFinite(c.y)?Math.max(0,Math.min(100,c.y)):50;
 const fit=c.fit==='contain'?'contain':'cover',zoom=fit==='contain'?1:Number.isFinite(c.zoom)?Math.max(1,Math.min(3,c.zoom)):1;
 Object.assign(image.style,{objectFit:fit,objectPosition:`${x}% ${y}%`,transform:`scale(${zoom})`,transformOrigin:`${x}% ${y}%`});image.dataset.coverFit=fit;
}
// Presentation preset only: stored fit, focal point, zoom and mobile crop remain intact.
export function aspectRatio(aspect,mobile=false){return {card:'16 / 9',hero:mobile?'4 / 3':'21 / 9',square:'1',landscape:'4 / 3',portrait:'3 / 4',source:'auto'}[aspect]||'16 / 9';}
export function cropDrag(crop,width,height,imageWidth,imageHeight,dx,dy){
 const scale=(crop.fit==='contain'?Math.min:Math.max)(width/imageWidth,height/imageHeight)*(crop.fit==='contain'?1:crop.zoom);
 const shift=(position,delta,space)=>Math.abs(space)<.01?position:Math.max(0,Math.min(100,position+delta*100/space));
 return {x:shift(crop.x,dx,width-imageWidth*scale),y:shift(crop.y,dy,height-imageHeight*scale)};
}
export function createMedia(projectId,placement,{resolver=mediaSource,aspect,onOpen}={}){
 const frame=document.createElement('figure');frame.className='project-media-frame';
 const picture=document.createElement('picture'),source=document.createElement('source'),image=document.createElement('img');
 source.media='(max-width: 650px)';source.type='image/webp';image.alt=placement?.alt||'';image.loading='lazy';image.decoding='async';
 picture.append(source,image);frame.append(picture);
 let forcedMobile=null;
 const match=matchMedia('(max-width: 650px)'),update=()=>{const mobile=forcedMobile??match.matches,crop=mobile&&placement?.crop?.mobile?placement.crop.mobile:placement?.crop,preset=aspect||crop?.aspect;source.media=forcedMobile===null?'(max-width: 650px)':mobile?'all':'not all';applyCrop(image,placement?.crop,mobile);frame.style.aspectRatio=preset==='source'&&image.naturalWidth?`${image.naturalWidth} / ${image.naturalHeight}`:aspectRatio(preset,mobile);};
 image.addEventListener('load',update);
 update();match.addEventListener('change',update);
 Promise.all(['desktop','mobile'].map(v=>resolver(projectId,placement,v))).then(([desktop,mobile])=>{if(desktop)image.src=desktop;if(mobile)source.srcset=mobile;}).catch(()=>{image.removeAttribute('src');frame.dataset.error='true';});
 if(onOpen){const button=document.createElement('button');button.type='button';button.disabled=true;button.className='project-media-open';button.setAttribute('aria-label','Perbesar '+image.alt);image.addEventListener('load',()=>button.disabled=false);image.addEventListener('error',()=>button.disabled=true);button.addEventListener('click',()=>onOpen(image.currentSrc||image.src,image.alt));frame.append(button);}
 if(placement?.caption){const caption=document.createElement('figcaption');caption.textContent=placement.caption;frame.append(caption);}
 return {element:frame,image,setViewport(mobile){forcedMobile=mobile;update();},destroy(){match.removeEventListener('change',update);}};
}
