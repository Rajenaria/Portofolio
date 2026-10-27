import { supabaseClient } from "../../core/supabase.js";
import { requireCmsUpgrade } from "../../../../js/cms/backend-compatibility.js";
import { el, append } from "../../core/dom.js";
import { textField } from "../../core/form.js";
import { openModal } from "../../core/modal.js";
import { toast } from "../../core/toast.js";

export const normalizeCategoryName = value => String(value || "").trim().replace(/\s+/gu," ");
const categoryKey = value => normalizeCategoryName(value).toLocaleLowerCase();

export async function loadProjectCategories() {
  const {data,error} = await supabaseClient.from("project_categories")
    .select("id,name,is_active,revision,projects(count)").order("name",{ascending:true});
  if (error) throw error;
  return (data || []).map(row => ({...row,usage:Number(row.projects?.[0]?.count || 0)}));
}

function isRevisionConflict(error) {
  return error?.message === "CATEGORY_CHANGED" &&
    (error?.code === "PT409" || error?.status === 409);
}

function errorMessage(error) {
  const used = String(error?.message || "").match(/CATEGORY_IN_USE:(\d+)/);
  if (used) return `Kategori ini masih digunakan oleh ${used[1]} project. Pindahkan project tersebut ke kategori lain sebelum menghapusnya.`;
  if (error?.code === "23505") return "Nama kategori sudah digunakan. Perbedaan huruf besar/kecil atau spasi tidak membuat kategori baru.";
  if (isRevisionConflict(error)) return "Kategori telah diperbarui di tempat lain. Muat ulang daftar kategori sebelum menyimpan kembali.";
  if (error?.code === "P0002") return "Kategori telah diubah atau dihapus dari sesi lain. Daftar dimuat ulang; periksa kembali sebelum menyimpan.";
  if (error?.code === "23503") return "Kategori masih digunakan oleh project. Muat ulang daftar sebelum mencoba lagi.";
  if (error?.code === "42501") return "Sesi owner dengan MFA diperlukan. Masuk kembali jika sesi sudah berakhir.";
  return "Perubahan kategori belum dapat disimpan. Periksa koneksi dan coba lagi.";
}

function categoryIcon(kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox","0 0 24 24"); svg.setAttribute("aria-hidden","true");
  svg.setAttribute("fill","none"); svg.setAttribute("stroke","currentColor");
  svg.setAttribute("stroke-width","1.8"); svg.setAttribute("stroke-linecap","round"); svg.setAttribute("stroke-linejoin","round");
  const path = document.createElementNS(svg.namespaceURI,"path");
  path.setAttribute("d",kind === "edit" ? "m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5" : "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7");
  svg.append(path); return svg;
}

export function openCategoryManager({onChanged,onClosed}) {
  requireCmsUpgrade();
  const scrollPosition = {left:window.scrollX,top:window.scrollY};
  const opener = document.activeElement;
  const page = document.documentElement;
  if (window.innerWidth > page.clientWidth) page.classList.add("category-modal-gutter");
  page.classList.add("has-category-modal");
  const body = el("div","project-category-manager"); body.lang = "id";
  const help = el("p","form-help","Kelola nama kategori project. Perubahan di sini tidak menyimpan formulir project.");
  const feedback = el("p","field-error"); feedback.setAttribute("role","alert");
  const heading = el("h3","subsection-title","Tambah Kategori");
  const form = el("form","modal-form project-category-form"); form.hidden = true;
  const name = textField({id:"project-category-name",label:"Nama kategori",required:true,maxLength:100,
    help:"Maksimal 100 karakter. Nama harus unik tanpa membedakan huruf besar/kecil atau spasi."});
  const actions = el("div","project-category-actions");
  const submit = el("button","admin-button admin-button-primary","Simpan"); submit.type = "submit";
  const cancel = el("button","admin-button admin-button-secondary","Batal"); cancel.type = "button";
  append(actions,submit,cancel); append(form,heading,name.node,actions);
  const list = el("div","project-category-list");
  const reload = el("button","admin-button admin-button-secondary","Muat Ulang Kategori"); reload.type = "button";
  const add = el("button","admin-button admin-button-secondary","+ Tambah Kategori"); add.type = "button";
  const toolbar = el("div","project-category-actions"); append(toolbar,add,reload);
  append(body,help,feedback,toolbar,form,list);
  let rows = [], editing = null, deleting = null, busy = false, closed = false, revisionConflict = false;

  function reset() { editing = null; revisionConflict = false; submit.disabled = false; name.value = ""; name.setError(""); heading.textContent = "Tambah Kategori"; form.hidden = true; }
  function usageMessage(count) { return `Kategori ini masih digunakan oleh ${count} project. Pindahkan project tersebut ke kategori lain sebelum menghapusnya.`; }
  function render() {
    list.replaceChildren();
    if (!rows.length) list.append(el("p","form-help","Belum ada kategori. Tambahkan kategori pertama melalui formulir di atas."));
    rows.forEach(row => {
      const item = el("div","project-category-row"), copy = el("div","project-category-copy"), tools = el("div","project-category-actions project-category-row-actions");
      append(copy,el("strong","",row.name),el("p","form-help",`${row.usage} project${row.is_active ? "" : " · Nonaktif"}`));
      const rename = el("button","admin-button admin-button-secondary project-category-icon"," "); rename.type = "button"; rename.title = "Ubah Nama"; rename.replaceChildren(categoryIcon("edit"));
      rename.setAttribute("aria-label",`Ubah nama kategori ${row.name}`);
      rename.addEventListener("click",() => {
        revisionConflict = false; submit.disabled = false;
        editing = row; deleting = null; name.value = row.name; name.setError(""); feedback.textContent = "";
        heading.textContent = "Ubah Nama Kategori"; form.hidden = false; render(); name.focus();
      });
      const remove = el("button","admin-button admin-button-secondary project-category-icon is-delete"," "); remove.type = "button"; remove.title = "Hapus Kategori"; remove.replaceChildren(categoryIcon("delete"));
      remove.setAttribute("aria-label",`Hapus kategori ${row.name}`);
      remove.addEventListener("click",() => {
        feedback.textContent = row.usage ? usageMessage(row.usage) : "";
        deleting = row.usage ? null : row.id; render();
        list.querySelector(".project-category-confirm button")?.focus();
      });
      append(tools,rename,remove); append(item,copy,tools);
      if (deleting === row.id) {
        const confirmation = el("div","project-category-confirm");
        const yes = el("button","admin-button admin-button-primary","Hapus Kategori"); yes.type = "button";
        yes.addEventListener("click",() => mutate("delete",row));
        const no = el("button","admin-button admin-button-secondary","Batal"); no.type = "button";
        no.addEventListener("click",() => { deleting = null; render(); });
        append(confirmation,el("p","form-help",`Hapus kategori “${row.name}”? Project tidak akan dihapus.`),yes,no); item.append(confirmation);
      }
      list.append(item);
    });
  }
  async function refresh() {
    rows = await loadProjectCategories();
    if (!closed) render();
  }
  async function mutate(action,row) {
    if (busy || revisionConflict) return;
    name.setError(""); feedback.textContent = "";
    const value = normalizeCategoryName(name.value);
    if (action !== "delete") {
      if (!value || value.length > 100) { name.setError("Isi nama kategori, maksimal 100 karakter."); name.focus(); return; }
      if (rows.some(item => item.id !== row?.id && categoryKey(item.name) === categoryKey(value))) {
        name.setError("Nama kategori sudah digunakan."); name.focus(); return;
      }
    }
    busy = true; body.inert = true; controller.setBusy(true);
    try {
      const {data,error,status} = await supabaseClient.rpc("admin_manage_project_category",{
        p_action:action,p_id:row?.id || null,p_name:action === "delete" ? null : value,p_revision:row?.revision ?? null
      });
      if (error) throw Object.assign(error,{status});
      reset(); deleting = null;
      // The mutation is committed. A failed refresh must not invite duplicate submission.
      try {
        await refresh();
        await onChanged?.({action,previous:row,category:data});
        feedback.textContent = "";
      } catch {
        feedback.textContent = "Kategori sudah tersimpan, tetapi daftar belum dapat dimuat ulang. Gunakan Muat Ulang Kategori; jangan ulangi penambahan.";
      }
      toast(action === "delete" ? "Kategori dihapus." : "Kategori disimpan.");
    } catch (error) {
      feedback.textContent = errorMessage(error);
      if (isRevisionConflict(error)) {
        revisionConflict = true; submit.disabled = true;
      } else if (["P0002","23503","23505"].includes(error?.code)) {
        try { await refresh(); await onChanged?.(); } catch { /* Keep the actionable original error. */ }
      }
    } finally {
      busy = false; body.inert = false; controller.setBusy(false);
      submit.disabled = revisionConflict;
      if (!closed) (form.hidden ? add : name.control).focus();
    }
  }
  form.addEventListener("submit",event => { event.preventDefault(); mutate(editing ? "rename" : "add",editing); });
  add.addEventListener("click",() => { reset(); deleting = null; feedback.textContent = ""; form.hidden = false; render(); name.focus(); });
  cancel.addEventListener("click",() => { reset(); feedback.textContent = ""; add.focus(); });
  reload.addEventListener("click",async () => {
    if (busy) return;
    busy = true; body.inert = true; controller.setBusy(true);
    try {
      await refresh();
      if (editing) {
        const latest = rows.find(row => row.id === editing.id);
        if (!latest) {
          revisionConflict = true; submit.disabled = true;
          feedback.textContent = "Kategori telah dihapus. Batalkan perubahan dan pilih kategori lain.";
          return;
        }
        editing = latest;
      }
      revisionConflict = false; submit.disabled = false;
      await onChanged?.(); feedback.textContent = "";
    }
    catch { feedback.textContent = "Daftar kategori belum dapat dimuat. Periksa koneksi dan coba lagi."; }
    finally { busy = false; body.inert = false; controller.setBusy(false); submit.disabled = revisionConflict; if (!closed) reload.focus(); }
  });
  const controller = openModal({title:"Kelola Kategori",body,
    actions:[{label:"Tutup",variant:"secondary",onClick:ctl => ctl.requestClose("button")}],
    onRequestClose:() => !busy,onClosed:() => {
      closed = true;
      page.classList.remove("has-category-modal","category-modal-gutter");
      window.scrollTo({...scrollPosition,behavior:"instant"});
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({preventScroll:true});
      onClosed?.();
    }});
  controller.dialog.classList.add("project-category-dialog");
  busy = true; body.inert = true; controller.setBusy(true);
  refresh().catch(() => { feedback.textContent = "Daftar kategori belum dapat dimuat. Gunakan Muat Ulang Kategori."; })
    .finally(() => { busy = false; body.inert = false; controller.setBusy(false); if (!closed) (form.hidden ? add : name.control).focus(); });
  return controller;
}
