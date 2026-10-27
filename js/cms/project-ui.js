import { publicMediaUrl, safeExternalUrl } from "./client.js";
import { applyImageCrop } from "./project-cover.js";
export function node(tag, className = "", text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  return element;
}
export const text = value => typeof value === "string" ? value.trim() : "";
export const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
export const list = value => Array.isArray(value) ? value : [];
export const sorted = rows => [...list(rows)].sort((a,b) => (Number(a.sort_order)||0)-(Number(b.sort_order)||0) || String(a.created_at||"").localeCompare(String(b.created_at||"")));
export const href = slug => `project.html?${new URLSearchParams({slug})}`;
export const category = project => text(object(project.project_category).name) || text(project.card_category) || "Uncategorized";
export const caseData = project => object(project.case_study);
export const displayYear = value => text(value).match(/\b(?:19|20|21)\d{2}\b/)?.[0] || "";
export const year = project => displayYear(project.project_date) || displayYear(caseData(project).timeline);
export const technologies = project => sorted(project.project_technologies).map(row => row.technologies).filter(value => value && text(value.name));
export function button(label, action, className = "cs-button") {
  const element = node("button",className,label); element.type = "button";
  element.addEventListener("click",action); return element;
}
export function link(label, url, className = "cs-button", external = false) {
  const element = node("a",className,label); element.href = url;
  if (external) { element.target = "_blank"; element.rel = "noopener noreferrer"; }
  return element;
}
export function projectBottomNavigation(project, all = []) {
  const navigation = node("nav","cs-next"); navigation.setAttribute("aria-label","Project navigation");
  const arrow = () => {
    const icon = document.createElementNS("http://www.w3.org/2000/svg","svg"), path = document.createElementNS("http://www.w3.org/2000/svg","path");
    icon.setAttribute("viewBox","0 0 24 24"); icon.setAttribute("class","cs-next-arrow"); icon.setAttribute("aria-hidden","true");
    icon.setAttribute("fill","none"); icon.setAttribute("stroke","currentColor"); icon.setAttribute("stroke-width","1.6");
    icon.setAttribute("stroke-linecap","round"); icon.setAttribute("stroke-linejoin","round");
    path.setAttribute("d","M4 12h16 M14 6l6 6-6 6"); icon.append(path); return icon;
  };
  const back = link("","index.html#portfolio","cs-next-back");
  back.append(arrow(),node("span","","Back")); navigation.append(back);
  const position = all.findIndex(row => row.id === project.id);
  const next = all.length > 1 && position !== -1 ? all[(position+1)%all.length] : null;
  if (next) {
    const anchor = link("",href(next.slug),"cs-next-link"); anchor.title = next.title;
    anchor.append(node("span","","Next"),arrow()); navigation.append(anchor);
  }
  return navigation;
}
export function paragraphs(parent, value) {
  text(value).split(/\n\s*\n/).filter(Boolean).forEach(p => parent.append(node("p","cs-copy",p)));
}
export function picture(row, cover = false) {
  const bucket = cover ? row.cover_bucket : row.bucket_name;
  const desktop = publicMediaUrl(bucket,cover ? row.cover_desktop_path : row.desktop_path);
  if (!desktop) return null;
  const mobile = publicMediaUrl(bucket,cover ? row.cover_mobile_path : row.mobile_path);
  const element = node("picture","cs-adaptive-image"), source = node("source"), image = node("img");
  const loaded = () => {
    if (!image.naturalWidth || !image.naturalHeight) return;
    // Use the selected responsive source's dimensions, including after resize.
    image.style.setProperty("--cs-image-width",`${image.naturalWidth}px`);
    image.style.setProperty("--cs-image-height",`${image.naturalHeight}px`);
    image.hidden = false; element.classList.remove("is-unavailable");
    element.removeAttribute("role"); element.removeAttribute("aria-label");
  };
  image.addEventListener("load",loaded);
  image.addEventListener("error",() => {
    image.hidden = true; element.classList.add("is-unavailable");
    element.setAttribute("role","img");
    element.setAttribute("aria-label",image.alt ? `${image.alt} — Image unavailable` : "Image unavailable");
  });
  source.media = "(max-width: 650px)"; source.srcset = mobile || desktop; source.type = "image/webp";
  image.alt = text(cover ? row.cover_alt : row.alt_text);
  image.loading = cover ? "eager" : "lazy"; image.decoding = "async"; image.draggable = false;
  element.append(source,image); image.src = desktop;
  if (image.complete) loaded();
  if (cover) applyImageCrop(image,{x:row.cover_position_x,y:row.cover_position_y});
  return element;
}
export function section(label, title, id) {
  const element = node("section","cs-section"); if (id) element.id = id;
  const heading = node("div","cs-section-heading"), copy = node("div","cs-heading-copy");
  copy.append(node("p","cs-eyebrow",label),node("h2","",title)); heading.append(copy); element.append(heading);
  return element;
}
export function externalActions(project) {
  const wrap = node("div","cs-actions");
  [["Live Demo",project.demo_url],["GitHub / Source Code",project.github_url]].forEach(([label,value]) => {
    const url = safeExternalUrl(value);
    if (url) { const action = link("",url,label === "Live Demo" ? "cs-button cs-button-primary" : "cs-button cs-button-github",true);
      if (label !== "Live Demo") action.append(uiIcon("github"));
      action.append(node("span","",label)); if (label === "Live Demo") action.append(uiIcon("external")); wrap.append(action);
    }
  });
  return wrap;
}
const ICONS = {figma:"logos:figma",python:"logos:python",javascript:"logos:javascript-1",html5:"logos:html-5",css3:"logos:css-3",nodejs:"logos:nodejs-icon",react:"logos:react",opencv:"logos:opencv",arduino:"logos:arduino",mysql:"logos:mysql",git:"logos:git-icon",github:"logos:github-icon",docker:"logos:docker-icon",vscode:"logos:visual-studio-code",photoshop:"logos:adobe-photoshop",illustrator:"logos:adobe-illustrator",canva:"logos:canva",c:"logos:c",cpp:"logos:c-plusplus"};
// Shared Hero markup for the public page and unsaved Admin previews.
export function projectHeader(project) {
  const data = caseData(project), hero = node("header","cs-hero"), intro = node("div"), badges = node("div","cs-badges"), actions = externalActions(project);
  badges.append(node("span","cs-badge cs-badge-category",category(project)),node("span","cs-badge cs-badge-status",text(data.delivery_status) || "Published"));
  if (project.featured) badges.append(node("span","cs-badge cs-badge-featured","Featured Case Study"));
  const title = [project.detail_title_main,project.detail_title_highlight].map(text).filter(Boolean).join(" ") || project.title;
  intro.append(node("h1","",title));
  if (text(project.detail_intro) || text(project.short_description)) intro.append(node("p","cs-intro",text(project.detail_intro) || project.short_description));
  hero.append(intro,actions); hero.id = "detail-overview";
  const meta = node("dl","cs-meta");
  [["Year",year(project)],["Status",text(data.delivery_status) || "Published"],["Role",project.role],["Key Outcome",data.key_outcome]].forEach(([label,value]) => {
    if (!text(value)) return;
    const entry = node("div",label === "Key Outcome" ? "cs-outcome" : ""); entry.append(node("dt","",label),node("dd","",text(value))); meta.append(entry);
  });
  meta.style.setProperty("--cs-meta-columns",String(meta.childElementCount)); meta.dataset.columns = String(meta.childElementCount);
  return {hero,intro,badges,actions,meta};
}
export function technologyCard(technology) {
  const card = node("div","cs-tech-card"), icon = node("span","cs-tech-icon");
  const key = text(technology.icon_key), id = ICONS[key] || key;
  const name = technology.name.toLowerCase();
  const tone = /esp|pcb|arduino|hardware|adc|kicad/.test(name) ? "emerald" : /vision|yolo|opencv|tensorflow/.test(name) ? "indigo" : /python|sql|database|mqtt/.test(name) ? "amber" : /figma|ui\/ux|design/.test(name) ? "rose" : "blue";
  icon.classList.add(`cs-icon-${tone}`);
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    const [prefix,name] = id.split(":"); const image = node("img");
    image.src = `https://api.iconify.design/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`;
    image.alt = ""; image.loading = "lazy";
    image.addEventListener("error",() => { icon.textContent = technology.name.slice(0,2).toUpperCase(); },{once:true});
    icon.append(image);
  } else icon.textContent = technology.name.slice(0,2).toUpperCase();
  card.append(icon,node("span","",technology.name)); return card;
}

const UI_ICONS = {"github": "M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z", "fullscreen": "M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5", "pause": "M8 5v14 M16 5v14", "play": "M7 4l14 8-14 8z", "external": "M14 3h7v7 M21 3L10 14 M10 3H3v18h18v-7", "gallery": "M3 3h18v18H3z M3 16l6-6 6 6 3-3 3 3 M15 7h.01", "architecture": "M3 3h18v5H3z M3 12h7v9H3z M14 12h7v9h-7z", "how_it_works": "M13 2L4 14h7l-1 8 10-12h-7z", "problem": "M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6z M8 12l3 3 5-6", "features": "M12 3l2 6 6 3-6 2-2 7-2-7-7-2 7-3z"};
export function uiIcon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg","svg"), path = document.createElementNS("http://www.w3.org/2000/svg","path");
  svg.setAttribute("viewBox","0 0 24 24"); svg.setAttribute("class","cs-ui-icon"); svg.setAttribute("aria-hidden","true");
  svg.setAttribute("fill",name === "github" ? "currentColor" : "none");
  if (name !== "github") { svg.setAttribute("stroke","currentColor"); svg.setAttribute("stroke-width","1.8"); svg.setAttribute("stroke-linecap","round"); svg.setAttribute("stroke-linejoin","round"); }
  path.setAttribute("d",UI_ICONS[name] || UI_ICONS.external); svg.append(path); return svg;
}
