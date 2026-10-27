import { node, text, object, section, paragraphs, technologyCard, projectHeader, projectBottomNavigation, year, uiIcon } from "../../../../js/cms/project-ui.js";
import { card } from "../../../../js/cms/projects-grid.js";
import { applyImageCrop } from "../../../../js/cms/project-cover.js";
import { deepDive, roadmap } from "../../../../js/cms/project-case-study.js";
import { gallery } from "../../../../js/cms/project-gallery.js";
import { openModal } from "../../core/modal.js";
import { supabaseClient } from "../../core/supabase.js";

// Reuse public renderers with signed/pending URLs, never a second mock layout.
export function openProjectPreview(data) {
  const body = node("div","project-preview"), host = node("div");
  body.lang = "id";
  body.append(node("p","form-help","Pratinjau memakai nilai formulir yang belum disimpan, tanpa menyimpan atau menerbitkan data. Tab dan galeri dapat digunakan; tautan navigasi dan tautan keluar dinonaktifkan."),host);
  const study = object(data.caseStudy);
  const media = (data.documentation || []).filter(row => row.url).map((row,index) => ({...row,alt_text:row.altText,is_active:row.isActive !== false,sort_order:index}));
  const project = {detail_title_main:data.detail_title_main,detail_title_highlight:data.detail_title_highlight,id:data.id,title:data.title || "Untitled Project",slug:data.slug || "",card_category:data.cardCategory,short_description:data.shortDescription,featured:data.featured,project_date:data.projectDate,detail_intro:data.detailIntro,role:data.role,case_study:study,demo_url:data.demoUrl,github_url:data.githubUrl,project_technologies:(data.technologies || []).map((value,index) => ({sort_order:index,technologies:typeof value === "string" ? {name:value} : value}))};
  function resolve(row, cover = false) {
    const url = cover ? data.coverUrl : row.url; if (!url) return null;
    const picture = node("picture","cs-adaptive-image"), image = node("img"); image.alt = cover ? data.coverAlt || "" : row.alt_text || ""; image.loading = "eager"; image.draggable = false;
    image.addEventListener("load",() => { image.style.setProperty("--cs-image-width",`${image.naturalWidth}px`); image.style.setProperty("--cs-image-height",`${image.naturalHeight}px`); });
    image.addEventListener("error",() => { image.hidden = true; picture.classList.add("is-unavailable"); picture.setAttribute("role","img"); picture.setAttribute("aria-label","Image unavailable"); });
    image.src = url;
    picture.append(image);
    if (cover) applyImageCrop(image,{x:data.cover_position_x,y:data.cover_position_y});
    return picture;
  }
  let closed = false;
  function dispose() { closed = true; host.querySelectorAll(".cs-gallery,.cs-tab-panel").forEach(element => element.dispatchEvent(new Event("cs:dispose"))); }
  function placeholder(message) {
    const note = node("p","project-preview-empty",message); note.lang = "id"; return note;
  }
  function emptySection(label,title,message) {
    const block = section(label,title); block.append(placeholder(message)); return block;
  }
  function disableLinks(element) {
    element.querySelectorAll("a").forEach(anchor => { anchor.removeAttribute("href"); anchor.setAttribute("aria-disabled","true"); });
  }
  function show() {
    host.append(node("h3","project-preview-label","Kartu Beranda"));
    const wrap = node("div","cs-projects project-preview-card"); wrap.id = "portfolio"; wrap.lang = "en";
    const grid = node("div","cs-grid"); grid.append(card(project,{resolvePicture:resolve})); wrap.append(grid); host.append(wrap);
    host.append(node("h3","project-preview-label","Halaman Project"));
    const page = node("div","cs-page"), main = node("div","cs-detail cs-container"); main.id = "caseStudyMain"; page.append(main); host.append(page);
    page.lang = "en";
    const {hero,badges,actions,meta} = projectHeader(project); main.append(badges,hero);
    if (meta.childElementCount) main.append(meta);
    const heroMedia = media.find(row => row.id === study.hero_media_id && row.is_active);
    const visual = heroMedia ? resolve(heroMedia) : resolve(project,true);
    const banner = node("div","cs-banner");
    if (visual) { applyImageCrop(visual.querySelector("img"),study.hero_crop); banner.append(visual); }
    else banner.append(placeholder("Gambar Hero belum dipilih. Unggah cover atau pilih gambar Hero dari Galeri Project."));
    main.append(banner);
    if ((data.paragraphs || []).length || text(data.projectType)) {
      const about = section("Overview",data.aboutHeading || "About This Project","detail-about");
      if (text(data.projectType)) about.append(node("p","cs-badge",data.projectType));
      (data.paragraphs || []).forEach(row => paragraphs(about,row.content)); main.append(about);
    }
    if (project.project_technologies.length) {
      const tech = section("Tech Stack","Tools & Technologies","detail-tech"), grid = node("div","cs-tech-grid");
      project.project_technologies.forEach(row => grid.append(technologyCard(row.technologies))); tech.append(grid); main.append(tech);
    } else main.append(emptySection("Tech Stack","Tools & Technologies","Belum ada teknologi yang dipilih."));
    main.append(
      deepDive(study) || emptySection("Technical Breakdown","Under the Hood","Detail Teknis belum diisi. Bagian kosong tidak tampil pada website publik."),
      roadmap(study,media,resolve,year(project)) || emptySection("Roadmap","Project Milestones","Belum ada tahapan. Tambahkan tahapan pada editor Roadmap."),
      gallery(media,data.githubUrl,{resolvePicture:resolve,crops:study.gallery_crops}) || emptySection("Gallery","Project Documentation","Belum ada gambar aktif. Tambahkan gambar pada Galeri Project.")
    );
    const galleryBlock = main.querySelector(".cs-gallery");
    if (galleryBlock) { const shortcut = node("button","cs-button","Gallery"); shortcut.type = "button"; shortcut.addEventListener("click",() => galleryBlock.scrollIntoView({block:"start"})); actions.append(shortcut); }
    actions.hidden = !actions.childElementCount;
    const navigation = projectBottomNavigation(project); main.append(navigation);
    if (data.status === "published" && data.id) {
      // Read only published neighbours through the existing authenticated Admin client.
      // The draft/form model stays in this modal and is never fetched publicly.
      supabaseClient.from("projects").select("id,slug,title").eq("status","published").is("deleted_at",null)
        .order("sort_order",{ascending:true}).order("created_at",{ascending:true})
        .then(({data:rows,error}) => {
          if (closed) return;
          if (error) { main.append(placeholder("Navigasi Next belum dapat dimuat. Isi formulir tetap utuh.")); return; }
          const updated = projectBottomNavigation(project,(rows || []).filter(row => text(row.slug) && text(row.title)));
          disableLinks(updated); navigation.replaceWith(updated);
        }).catch(() => { if (!closed) main.append(placeholder("Navigasi Next belum dapat dimuat. Isi formulir tetap utuh.")); });
    } else main.append(placeholder("Next hanya tampil untuk project yang sudah diterbitkan dan memiliki project berikutnya."));
  }
  host.addEventListener("click",event => { if (event.target.closest("a")) event.preventDefault(); });
  const ctl = openModal({title:"Pratinjau Lengkap",body,actions:[{label:"Tutup Pratinjau",variant:"secondary",onClick:ctl => ctl.requestClose("button")}],onRequestClose:() => {
    const dialog = host.querySelector("dialog[open]"); if (dialog) { dialog.close(); return false; } return true;
  },onClosed:dispose});
  ctl.dialog.classList.add("project-preview-dialog");
  const close = node("button","admin-button admin-button-secondary","Tutup Pratinjau"); close.type = "button";
  close.addEventListener("click",() => ctl.requestClose("button")); ctl.dialog.querySelector(".modal-header").append(close);
  try { show(); disableLinks(host); } catch (error) { ctl.close(); throw error; }
  return ctl;
}
