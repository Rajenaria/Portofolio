import { el, append } from "../../core/dom.js";
import { textField, textareaField } from "../../core/form.js";
import { resolveMediaUrl } from "../../core/media-storage.js";
import { openCropEditor } from "./crop-editor.js";
import { PROJECT_DETAIL_FRAME_RATIO } from "../../../../js/cms/project-cover.js";

let sequence = 0;
const isObject = value => value && typeof value === "object" && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));

export function createCaseStudyEditor({ value, getMedia, getCoverUrl, onChange }) {
  const model = clone(isObject(value) ? value : {});
  const root = el("section","admin-subsection cs-admin-editor");
  root.lang = "id";
  const error = el("p","cs-admin-error"); error.setAttribute("role","alert");
  const mediaFields = new Set();
  const groups = new Set([root]);
  const contains = element => [...groups].some(group => group.contains(element));
  append(root,el("h3","subsection-title","Detail Teknis"),el("p","form-help","Opsional. Bagian yang kosong tidak tampil pada Halaman Project. Tambahkan, sunting, atau ubah urutan isi sesuai kebutuhan."),error);
  function group(title,help) {
    const block = el("div","cs-admin-group"); append(block,el("h4","form-subheading",title));
    if (help) append(block,el("p","form-help",help)); append(root,block); groups.add(block); return block;
  }
  function get(path) { return path.reduce((current,key) => current?.[key],model); }
  function set(path,next) {
    let target = model;
    path.slice(0,-1).forEach(key => { if (!isObject(target[key])) target[key] = {}; target = target[key]; });
    target[path.at(-1)] = next;
  }
  function field(parent,label,current,update,options = {}) {
    const make = options.long ? textareaField : textField;
    const control = make({id:`project-case-${++sequence}`,label,value:typeof current === "string" ? current : "",maxLength:options.limit || (options.long ? 6000 : 240),rows:options.long ? 3 : undefined,required:options.required});
    if (options.year) { control.control.type = "number"; control.control.min = "1900"; control.control.max = "2199"; control.control.step = "1"; }
    control.control.addEventListener("input",() => { update(control.value.trim()); onChange(); });
    append(parent,control.node); return control;
  }
  function fixed(parent,path,label,options) { field(parent,label,get(path),value => set(path,value),options); }
  const overview = group("Hero dan Metadata");
  append(overview,el("p","form-help","Opsional. Status pengerjaan dan hasil utama tampil pada Hero; keduanya tidak mengubah status publikasi."));
  fixed(overview,["delivery_status"],"Status Pengerjaan (opsional)",{limit:100});
  fixed(overview,["key_outcome"],"Hasil Utama (opsional)",{long:true,limit:600});
  const architecture = group("Arsitektur Sistem");
  fixed(architecture,["architecture","summary"],"Ringkasan arsitektur",{long:true});
  const problem = group("Masalah dan Solusi");
  fixed(problem,["problem","challenge"],"Tantangan",{long:true});
  fixed(problem,["problem","solution"],"Solusi",{long:true});

  function mediaSelect(parent,row,key = "media_id",cropKey = "crop") {
    const wrap = el("div","form-field"), label = el("label","form-label","Gambar dokumentasi (opsional)"), select = el("select","admin-select");
    select.id = `project-case-${++sequence}`; label.htmlFor = select.id;
    function refresh() {
      const selected = row[key] || ""; select.replaceChildren();
      const option = el("option",null,key === "hero_media_id" ? "Gunakan Gambar Cover" : "Tanpa gambar"); option.value = ""; select.append(option);
      const media = getMedia().filter(item => item.id && item.isActive !== false);
      media.forEach((item,index) => { const option = el("option",null,item.altText || `Gambar dokumentasi ${index+1}`); option.value = item.id; select.append(option); });
      if (selected && !media.some(item => item.id === selected)) {
        const missing = el("option",null,"Gambar tidak tersedia; pilih gambar aktif lain"); missing.value = selected; select.append(missing);
      }
      select.value = selected;
    }
    refresh(); mediaFields.add({select,refresh});
    select.addEventListener("focus",refresh);
    select.addEventListener("change",() => { row[key] = select.value || null; row[cropKey] = {x:50,y:50}; onChange(); });
    const crop = el("button","admin-button admin-button-secondary","Atur Posisi"); crop.type = "button";
    crop.addEventListener("click",async () => {
      const item = getMedia().find(item => item.id === row[key]);
      const url = item ? item.pendingPreviewUrl || await resolveMediaUrl(item.bucket,item.desktopPath) : key === "hero_media_id" ? await getCoverUrl() : null;
      if (!url) { error.textContent = "Pilih atau unggah gambar terlebih dahulu."; return; }
      openCropEditor({url,value:row[cropKey],ratio:PROJECT_DETAIL_FRAME_RATIO,onSave:value => { row[cropKey] = value; onChange(); }});
    });
    if (key === "hero_media_id") label.textContent = "Gambar Hero (opsional)";
    append(wrap,label,select,crop,el("p","form-help",key === "hero_media_id" ? "Tampil di bagian atas Halaman Project. Pilih gambar aktif dari Galeri Project atau gunakan cover. Posisi gambar diatur terpisah dari kartu beranda." : "Pilih gambar aktif dari Galeri Project untuk tahapan ini. Posisi gambar diatur terpisah untuk setiap bingkai.")); append(parent,wrap);
  }
  mediaSelect(overview,model,"hero_media_id","hero_crop");
  function repeat(parent,path,label,definitions,{images = false} = {}) {
    const host = el("div"), heading = el("h4","form-subheading",label), add = el("button","admin-button admin-button-secondary",`Tambah ${label}`);
    add.type = "button"; append(parent,heading,host,add);
    const rows = () => Array.isArray(get(path)) ? get(path) : [];
    function render(focusIndex = -1) {
      host.replaceChildren();
      for (const entry of mediaFields) if (!contains(entry.select)) mediaFields.delete(entry);
      rows().forEach((row,index) => {
        const item = el("div","cs-admin-repeat"), head = el("div","cs-admin-repeat-head"), actions = el("div","cs-admin-repeat-actions");
        append(head,el("h4",null,`${label} ${index+1}`),actions); append(item,head);
        [["Naik",-1],["Turun",1],["Hapus",0]].forEach(([name,direction]) => {
          const control = el("button","admin-button admin-button-secondary",name); control.type = "button";
          control.setAttribute("aria-label",`${name}: ${label} ${index+1}`);
          control.disabled = direction === -1 ? index === 0 : direction === 1 ? index === rows().length-1 : false;
          control.addEventListener("click",() => {
            const next = rows().slice();
            if (!direction) next.splice(index,1); else [next[index],next[index+direction]] = [next[index+direction],next[index]];
            set(path,next); render(Math.max(0,Math.min(next.length-1,index+direction))); onChange();
            if (!next.length) add.focus();
          }); append(actions,control);
        });
        definitions.forEach(([key,label,options]) => field(item,label,row[key],value => { row[key] = value; },options));
        if (images) mediaSelect(item,row);
        append(host,item);
      });
      add.disabled = rows().length >= 30;
      if (focusIndex >= 0) host.children[focusIndex]?.querySelector("input,textarea,select")?.focus();
    }
    add.addEventListener("click",() => { set(path,[...rows(),{}]); render(rows().length-1); onChange(); });
    render();
  }
  const title = ["title","Judul",{required:true}], description = ["description","Deskripsi",{long:true}];
  repeat(architecture,["architecture","nodes"],"Lapisan Arsitektur",[title,description]);
  repeat(group("Cara Kerja"),["how_it_works"],"Langkah Kerja",[title,description]);
  repeat(problem,["problem","impacts"],"Dampak Utama",[["text","Dampak Utama",{long:true,required:true,limit:1000}]]);
  repeat(group("Fitur Utama"),["features"],"Fitur",[title,description]);
  const roadmapElement = group("Roadmap","Opsional. Nomor mengikuti urutan tahapan. Judul wajib diisi pada setiap tahapan yang ditambahkan; kolom lainnya opsional.");
  repeat(roadmapElement,["roadmap"],"Tahapan",[title,["date","Tahun (opsional)",{year:true}],description,["deliverable","Hasil Tahapan (opsional)",{limit:600}]],{images:true});
  roadmapElement.remove();

  function validate() {
    error.textContent = "";
    const controls = new Set([...root.querySelectorAll("input,textarea,select"),...overview.querySelectorAll("input,textarea,select"),...roadmapElement.querySelectorAll("input,textarea,select")]);
    for (const control of controls) {
      if (!control.checkValidity() || (control.required && !control.value.trim())) {
        error.textContent = "Lengkapi kolom wajib sebelum menyimpan."; control.focus(); control.reportValidity(); return false;
      }
    }
    const active = new Set(getMedia().filter(item => item.id && item.isActive !== false).map(item => item.id));
    if ((model.hero_media_id && !active.has(model.hero_media_id)) || (model.roadmap || []).some(step => step.media_id && !active.has(step.media_id))) {
      error.textContent = "Hero atau roadmap memakai gambar yang dihapus atau dinonaktifkan. Pilih gambar aktif lain sebelum menyimpan.";
      error.scrollIntoView({block:"center"}); return false;
    }
    return true;
  }
  return {
    element:root,
    metadata:overview,
    roadmapElement,
    getGalleryCrop:id => model.gallery_crops?.[id],
    setGalleryCrop(id,value) { model.gallery_crops = {...model.gallery_crops,[id]:value}; onChange(); },
    getValue:() => { const result = clone(model); if (Array.isArray(result.architecture?.nodes)) result.architecture.nodes = result.architecture.nodes.map((row,index) => ({...row,layer:`Layer ${String(index+1).padStart(2,"0")}`})); return result; },
    validate,
    refreshMedia() { for (const entry of mediaFields) if (contains(entry.select)) entry.refresh(); },
    setBusy(busy) { root.inert = overview.inert = roadmapElement.inert = busy; },
    destroy() { mediaFields.clear(); groups.clear(); root.replaceChildren(); overview.replaceChildren(); roadmapElement.replaceChildren(); }
  };
}
