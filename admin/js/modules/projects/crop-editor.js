import { el } from '../../core/dom.js';
import { createMedia,cropDefault,id,cropDrag } from '../../../../js/cms/project-data.js';
import { uploadProjectAsset,projectCommand,downloadProjectOriginal } from '../../core/project-client.js';
export function createCropEditor({project,placement,aspect='card',fixedAspect=false,resolver,onChange}){
 const root=el('fieldset','m09-crop-editor'),legend=el('legend','',`Media / Crop — ${aspect}`);root.append(legend);
 if(aspect==='card')root.append(el('p','form-help','Frame homepage 16:9. Pilih contain untuk screenshot utuh; cover untuk crop yang disengaja. Pengaturan tersimpan tetap digunakan.'));
 let value=placement?structuredClone(placement):null,preview=null,pending=null,mobile=false;
 const status=el('p','form-help'),viewport=el('div','m09-crop-viewport'),controls=el('div','form-grid');
 const upload=el('input');upload.type='file';upload.accept='image/jpeg,image/png,image/webp';upload.setAttribute('aria-label','Upload original image');
 const retry=el('button','admin-button','Retry upload');retry.type='button';retry.hidden=true;
 const cancelUpload=el('button','admin-button','Batalkan pilihan upload pending');cancelUpload.type='button';cancelUpload.hidden=true;cancelUpload.addEventListener('click',()=>{if(upload.disabled)return;pending=null;retry.hidden=true;cancelUpload.hidden=true;upload.value='';status.textContent='Pilihan upload dibatalkan. Referensi media sebelumnya dan file remote tetap dipertahankan.';});
 const adopt=el('button','admin-button','Import legacy variants (original tidak tersedia)');adopt.type='button';adopt.hidden=!value?.legacy;
 let adoptionId=null;
 adopt.addEventListener('click',async()=>{if(!value?.legacy)return;adopt.disabled=true;adoptionId||=id();try{const a=await projectCommand({action:'adopt',id:project,asset:adoptionId,legacy_id:value.legacy.id||project});value={...value,asset_id:a.id};delete value.legacy;status.textContent='Derivative legacy disalin dan diverifikasi; original tidak direkayasa. File lama dipertahankan.';adopt.hidden=true;paint();emit();}catch{status.textContent='Import belum terkonfirmasi. Retry menggunakan asset ID yang sama; file tetap dipertahankan.';}finally{adopt.disabled=false;}});
 const existing=el('select');existing.setAttribute('aria-label','Pilih asset project yang sudah ada');existing.append(new Option('Pilih asset existing',''));
 const refreshAssets=async()=>{try{const assets=await projectCommand({action:'assets',id:project});existing.replaceChildren(new Option('Pilih asset existing',''));for(const a of assets)if(a.state==='ready')existing.append(new Option(a.id,a.id));}catch{status.textContent='Daftar asset belum tersedia.';}};
 existing.addEventListener('change',()=>{if(existing.value){value={id:value?.id||id(),asset_id:existing.value,alt:value?.alt||'',crop:value?.crop||cropDefault(aspect)};paint();emit();}});
 function active(){return mobile?(value.crop.mobile||value.crop):value.crop;}
 function emit(){onChange(value?structuredClone(value):null);}
 function change(key,next){if(!value)return;if(mobile&&!value.crop.mobile)value.crop.mobile={...value.crop,mobile:undefined};const c=active();c[key]=next;if(c.fit==='contain')c.zoom=1;paint(false);emit();}
 const fields={};
 function field(key,label,type,options){const wrap=el('label','form-field',label),input=el(type==='select'?'select':'input');if(type==='select')for(const option of options)input.append(new Option(option,option));else input.type=type;wrap.append(input);controls.append(wrap);fields[key]=input;return input;}
 const fit=field('fit','Fit','select',['cover','contain']);fit.addEventListener('change',()=>change('fit',fit.value));
 const ratio=field('aspect','Aspect ratio','select',fixedAspect?[aspect]:['card','hero','square','landscape','portrait','source']);ratio.addEventListener('change',()=>change('aspect',ratio.value));
 for(const key of ['x','y','zoom']){const input=field(key,key.toUpperCase(),'number');input.min=key==='zoom'?1:0;input.max=key==='zoom'?3:100;input.step=key==='zoom'?.05:1;input.addEventListener('input',()=>{const n=Number(input.value);if(Number.isFinite(n)&&n>=Number(input.min)&&n<=Number(input.max))change(key,n);});}
 const alt=field('alt','Alt text','text');alt.maxLength=250;alt.addEventListener('input',()=>{if(value){value.alt=alt.value;emit();}});
 const caption=field('caption','Caption','text');caption.maxLength=300;caption.addEventListener('input',()=>{if(value){value.caption=caption.value;emit();}});
 const override=el('input');override.type='checkbox';const overrideLabel=el('label','','Override crop mobile');overrideLabel.prepend(override);override.addEventListener('change',()=>{if(!value)return;if(!override.checked)delete value.crop.mobile;else value.crop.mobile={...value.crop};mobile=override.checked;paint();emit();});
 const mode=el('button','admin-button','Preview desktop / mobile');mode.type='button';mode.addEventListener('click',()=>{mobile=!mobile;paint();});
 const reset=el('button','admin-button','Reset crop');reset.type='button';reset.addEventListener('click',()=>{if(!value)return;if(mobile)value.crop.mobile=cropDefault(aspect);else value.crop={...cropDefault(aspect),...(value.crop.mobile?{mobile:value.crop.mobile}:{})};paint();emit();});
 const remove=el('button','admin-button','Lepas media');remove.type='button';remove.addEventListener('click',()=>{value=null;paint();emit();});
 const original=el('button','admin-button','Unduh original (private)');original.type='button';original.addEventListener('click',async()=>{if(!value?.asset_id)return;try{await downloadProjectOriginal(project,value.asset_id);}catch{status.textContent='Original tidak tersedia atau akses gagal. Asset legacy tidak dianggap memiliki original.';}});
 async function runUpload(){if(!pending)return;retry.hidden=true;upload.disabled=true;cancelUpload.hidden=false;cancelUpload.disabled=true;status.textContent='Memproses dan memverifikasi original + desktop/mobile…';try{const asset=await uploadProjectAsset(project,pending.file,pending.id);value={id:value?.id||id(),asset_id:asset,alt:value?.alt||pending.file.name,crop:value?.crop||cropDefault(aspect)};pending=null;status.textContent='Asset terverifikasi; simpan draft untuk menyimpan penempatan.';paint();emit();refreshAssets();}catch(e){status.textContent=`${e.code||'UNCONFIRMED'}: file dipertahankan. Retry menggunakan versi yang sama.`;retry.hidden=false;}finally{upload.disabled=false;cancelUpload.disabled=false;cancelUpload.hidden=!pending;}}
 upload.addEventListener('change',()=>{if(upload.files[0]){pending={file:upload.files[0],id:id()};runUpload();}});retry.addEventListener('click',runUpload);
 function paint(rebuild=true){
  controls.hidden=!value;overrideLabel.hidden=!value;adopt.hidden=!value?.legacy;original.hidden=!value?.asset_id;
  if(value){const c=active();for(const key of ['fit','aspect','x','y','zoom'])fields[key].value=c[key];fields.zoom.disabled=c.fit==='contain';alt.value=value.alt||'';caption.value=value.caption||'';override.checked=!!value.crop.mobile;}
  if(rebuild){preview?.destroy();viewport.replaceChildren();if(value){preview=createMedia(project,value,{resolver});viewport.append(preview.element);}}
  if(preview&&value){preview.setViewport(mobile);const c=active();import('../../../../js/cms/project-data.js').then(({applyCrop,aspectRatio})=>{applyCrop(preview.image,c);preview.element.style.aspectRatio=aspectRatio(c.aspect,mobile);});}
  viewport.classList.toggle('is-mobile',mobile);mode.setAttribute('aria-pressed',String(mobile));
 }
 let drag=null;
 viewport.tabIndex=0;viewport.setAttribute('aria-label','Crop viewport. Gunakan tombol panah atau angka X/Y untuk posisi.');
 viewport.addEventListener('pointerdown',e=>{if(!value||e.button!==0)return;drag={x:e.clientX,y:e.clientY,c:{...active()}};viewport.setPointerCapture(e.pointerId);e.preventDefault();});
 viewport.addEventListener('pointermove',e=>{if(!drag||!preview?.image.naturalWidth)return;const box=preview.element.getBoundingClientRect(),next=cropDrag(drag.c,box.width,box.height,preview.image.naturalWidth,preview.image.naturalHeight,e.clientX-drag.x,e.clientY-drag.y);change('x',next.x);change('y',next.y);});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])viewport.addEventListener(event,()=>drag=null);
 viewport.addEventListener('keydown',e=>{if(!value||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const key=['ArrowLeft','ArrowRight'].includes(e.key)?'x':'y',delta=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1;change(key,Math.max(0,Math.min(100,active()[key]+delta)));});
 root.append(upload,retry,cancelUpload,adopt,existing,mode,overrideLabel,viewport,controls,reset,remove,original,status);paint();refreshAssets();
 return {element:root,isBusy:()=>upload.disabled||adopt.disabled||!!pending,destroy(){preview?.destroy();}};
}
