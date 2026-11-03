import { readTable } from "./client.js";
import { node, projectHeader, projectBottomNavigation, text, sorted, caseData, year, technologies, link, picture, section, paragraphs, technologyCard, uiIcon, button } from "./project-ui.js";
import { deepDive, roadmap } from "./project-case-study.js";
import { gallery } from "./project-gallery.js";
import { enter, revealOnce, timelineProgress } from "./project-motion.js";
import { applyImageCrop } from "./project-cover.js";

const main = document.querySelector("#caseStudyMain");
const jumps = document.querySelector("#caseStudyJumps");
let stopRoadmap = () => {}, entrances = [];
const enteredProjects = new Set();
function disposeMotion() {
  stopRoadmap(); entrances.forEach(animation => animation?.cancel()); entrances=[];
  main.querySelectorAll(".cs-gallery,.cs-tab-panel").forEach(element => element.dispatchEvent(new Event("cs:dispose")));
}
function state(title,message) {
  disposeMotion();
  main.replaceChildren(); jumps.replaceChildren();
  const block = node("div","cs-state"); block.append(node("h1","",title),node("p","cs-copy",message),link("Back to Projects","index.html#portfolio")); main.append(block);
}
function render(project, all) {
  disposeMotion();
  const data = caseData(project), media = sorted(project.project_media).filter(row => row.is_active !== false);
  const {hero,intro,badges,actions,meta} = projectHeader(project);
  hero.id = "detail-overview";
  jumps.replaceChildren(link("Overview","#detail-overview",""));
  main.replaceChildren(badges,hero);
  if (meta.childElementCount) main.append(meta);
  const heroMedia = media.find(row => row.id === data.hero_media_id);
  const cover = heroMedia ? picture(heroMedia) : picture(project,true);
  if (cover) { const image = cover.querySelector("img"); image.loading = "eager"; applyImageCrop(image,data.hero_crop); }
  if (cover) { const banner = node("div","cs-banner"); banner.append(cover); main.append(banner); }
  const about = sorted(project.project_paragraphs).filter(p => text(p.content));
  if (about.length || text(project.project_type)) {
    const block = section("Overview",text(project.about_heading) || "About This Project","detail-about");
    if (text(project.project_type)) block.append(node("p","cs-badge",project.project_type));
    about.forEach(p => paragraphs(block,p.content)); main.append(block);
  }
  const tech = technologies(project);
  if (tech.length) { const block = section("Tech Stack","Tools & Technologies","detail-tech"); const grid = node("div","cs-tech-grid"); grid.append(...tech.map(technologyCard)); block.append(grid); main.append(block); jumps.append(link("Tech Stack","#detail-tech","")); }
  [[deepDive(data),"Architecture"],[roadmap(data,media,undefined,year(project)),"Roadmap"],[gallery(media,project.github_url,{crops:data.gallery_crops}),"Gallery"]].forEach(([block,label]) => {
    if (!block) return;
    main.append(block); jumps.append(link(label,`#${block.id}`,""));
    if (block.id === "detail-gallery") {
      const shortcut = link("Gallery", "#detail-gallery", "cs-button cs-gallery-shortcut");
      shortcut.prepend(uiIcon("gallery")); actions.append(shortcut);
    }
  });
  actions.hidden = actions.childElementCount === 0;
  main.append(projectBottomNavigation(project,all));
  const cleanup=[];
  if (!enteredProjects.has(project.id)) {
    enteredProjects.add(project.id);
    entrances = [badges,intro.querySelector("h1"),intro.querySelector(".cs-intro"),actions,meta]
      .filter(element => element?.isConnected && !element.hidden).map((element,i) => enter(element,i*80,650));
    cleanup.push(revealOnce([...main.querySelectorAll(".cs-banner")],new Set(),element => element,{delay:100,duration:760}));
  }
  cleanup.push(revealOnce([...main.querySelectorAll(".cs-section:not(.cs-gallery) > .cs-section-heading,.cs-tabs")],new Set(),element => element,{duration:600}));
  cleanup.push(revealOnce([...main.querySelectorAll(".cs-tech-card")],new Set(),element => element,{delay:90,duration:700}));
  cleanup.push(revealOnce([...main.querySelectorAll(".cs-roadmap-step")],new Set(),element => element,{onReveal:(step,delay) => {
    enter(step.querySelector(".cs-roadmap-number"),delay,550,{distance:16});
    enter(step.querySelector(".cs-roadmap-copy"),delay+75,700);
    enter(step.querySelector(".cs-roadmap-image"),delay+140,760,{distance:24,scale:.99});
  }}));
  cleanup.push(timelineProgress(main.querySelector(".cs-roadmap-list")));
  cleanup.push(revealOnce([...main.querySelectorAll(".cs-gallery")],new Set(),element => element,{onReveal:(block,delay) => {
    enter(block,delay,700,{distance:16,fromOpacity:1});
    enter(block.querySelector(".cs-section-heading"),delay+80,600,{distance:8,fromOpacity:.8});
    enter(block.querySelector(".cs-gallery-stage"),delay+100,760,{distance:0,scale:.995,fromOpacity:1});
  }}));
  stopRoadmap=() => cleanup.forEach(dispose => dispose());
  document.title = `${project.title} — Rajendra Aria Nismara`;
  const description = text(project.short_description) || `${project.title} — Project case study by Rajendra Aria Nismara.`;
  document.querySelector('meta[name="description"]').content = description;
  [
    ['meta[property="og:title"]', document.title],
    ['meta[property="og:description"]', description],
    ['meta[name="twitter:title"]', document.title],
    ['meta[name="twitter:description"]', description]
  ].forEach(([selector,value]) => { document.querySelector(selector).content = value; });
  // Distinct published case studies keep their slug, dropping tracking params.
  // No generic canonical in initial HTML: it would conflict across projects.
  const url = new URL("https://portofolio-rajenaria.vercel.app/project.html");
  url.searchParams.set("slug",project.slug);
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.append(canonical); }
  canonical.href = url.href;
  let ogUrl = document.querySelector('meta[property="og:url"]');
  if (!ogUrl) { ogUrl = document.createElement("meta"); ogUrl.setAttribute("property","og:url"); document.head.append(ogUrl); }
  ogUrl.content = url.href;
}
async function load() {
  const slug = new URLSearchParams(window.location.search).get("slug") || "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 140) { state("Project not found","This project is not available."); return; }
  // Optional case_study/cover metadata defaults in the renderer; legacy rows
  // need neither the new category registry nor a new column projection.
  const select = "*,project_paragraphs(content,sort_order,created_at),project_media(id,bucket_name,desktop_path,mobile_path,alt_text,sort_order,is_active,created_at),project_technologies(sort_order,created_at,technologies(name,icon_key))";
  const [rows,all] = await Promise.all([
    readTable("projects",`select=${select}&slug=eq.${encodeURIComponent(slug)}&status=eq.published&deleted_at=is.null&limit=1`),
    readTable("projects","select=id,slug,title&status=eq.published&deleted_at=is.null&order=sort_order.asc,created_at.asc")
  ]);
  const project = rows.find(p => p.slug === slug && p.status === "published" && p.deleted_at === null);
  if (!project) { state("Project not found","This project is not available."); return; }
  render(project,all.filter(p => text(p.slug) && text(p.title)));
}
load().catch(() => state("Project could not be loaded","Please refresh the page to try again."));
