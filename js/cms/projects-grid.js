import { readTable } from "./client.js";
import { node, text, category, year, technologies, href, link, button, picture } from "./project-ui.js";
import { enter, reducedMotion, revealOnce } from "./project-motion.js";
const root = document.querySelector("#portfolio.cs-projects");
const PAGE_SIZE = 3;
const mobile = window.matchMedia("(max-width: 767px)");
let projects = [], selected = null, page = 1, loaded = false, pageAnimation = null;
const stateKey = "portfolio-projects-filter-v22";
try { const saved = JSON.parse(sessionStorage.getItem(stateKey) || "null"); selected = typeof saved?.category === "string" ? saved.category : null; } catch {}
function remember() { try { sessionStorage.setItem(stateKey,JSON.stringify({category:selected})); } catch {} }
const revealed = new Set();
if (root) revealOnce([...root.querySelectorAll(".cs-header,.cs-filter-bar")],new Set(),element => element,{duration:600});
let stopReveals = () => {};
function reveal(grid, pageChange) {
  stopReveals();
  pageAnimation?.cancel(); pageAnimation = null;
  if (pageChange) {
    grid.querySelectorAll(".cs-project-card").forEach(element => revealed.add(element.dataset.projectId));
    pageAnimation = enter(grid,0,280,{distance:10,fromOpacity:.7});
    return;
  }
  stopReveals = revealOnce([...grid.querySelectorAll(".cs-project-card")],revealed,element => element.dataset.projectId);
}
export function card(project, {resolvePicture = picture} = {}) {
  const article = node("article","cs-project-card");
  article.dataset.projectId = project.id;
  const anchor = link("",href(project.slug),"cs-card-link");
  const cover = node("div","cs-card-cover"); const image = resolvePicture(project,true);
  if (image) { image.querySelector("img").loading = "lazy"; cover.append(image); }
  else cover.append(node("span","cs-cover-empty","Project preview"));
  const badges = node("div","cs-card-badges"), categoryLabel = node("span","cs-badge",category(project));
  categoryLabel.title = category(project); badges.append(categoryLabel);
  if (project.featured) badges.append(node("span","cs-badge cs-badge-featured","Featured"));
  const content = node("div","cs-card-body"), title = node("h3","",project.title);
  title.title = project.title; content.append(badges,title);
  const summary = node("p","cs-card-summary",text(project.short_description));
  summary.title = summary.textContent; content.append(summary);
  const footer = node("div","cs-card-footer"), chips = node("div","cs-chips");
  const names = [...new Set(technologies(project).map(t => t.name))];
  names.slice(0,3).forEach(name => { const chip = node("span","cs-chip",name); chip.title = name; chips.append(chip); });
  if (names.length > 3) { const extra = node("span","cs-chip cs-chip-overflow",`+${names.length-3}`); extra.title = names.slice(3).join(", "); chips.append(extra); }
  const action = node("div","cs-card-action"); action.append(node("span","cs-muted",year(project)),node("span","cs-card-cta","View Project →"));
  footer.append(chips,action); content.append(footer); anchor.append(cover,content); article.append(anchor); return article;
}
function pagination(total) {
  const host = root.querySelector("#projects-pagination");
  host.replaceChildren(); host.hidden = !mobile.matches || total <= 1;
  if (host.hidden) return;
  const control = (label,target,description) => {
    const item = button(label,event => {
      if (target === page) return;
      page = target; render(true);
      // The clicked button was replaced; retain keyboard focus on this page.
      if (event.detail === 0) host.querySelector('[aria-current="page"]')?.focus({preventScroll:true});
    },"cs-page-control");
    item.setAttribute("aria-label",description); item.setAttribute("aria-controls","projects-grid");
    return item;
  };
  const previous = control("\u2190",page-1,"Previous projects page"); previous.disabled = page === 1; host.append(previous);
  // At most five number/ellipsis slots, even with many CMS projects.
  const numbers = total <= 5 ? Array.from({length:total},(_,i) => i+1)
    : page <= 3 ? [1,2,3,null,total]
    : page >= total-2 ? [1,null,total-2,total-1,total]
    : [1,null,page,null,total];
  numbers.forEach(value => {
    if (value === null) { const gap = node("span","cs-page-gap","\u2026"); gap.setAttribute("aria-hidden","true"); host.append(gap); return; }
    const item = control(String(value),value,`Projects page ${value}`);
    if (value === page) item.setAttribute("aria-current","page");
    host.append(item);
  });
  const next = control("\u2192",page+1,"Next projects page"); next.disabled = page === total; host.append(next);
}
function render(pageChange = false) {
  remember();
  const filtered = selected === null ? projects : projects.filter(p => category(p) === selected);
  const totalPages = Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  page = Math.max(1,Math.min(page,totalPages));
  const start = mobile.matches ? (page-1)*PAGE_SIZE : 0;
  const visible = mobile.matches ? filtered.slice(start,start+PAGE_SIZE) : filtered;
  const grid = root.querySelector("#projects-grid");
  const focused = grid.contains(document.activeElement) ? document.activeElement.closest(".cs-project-card")?.dataset.projectId : null;
  const navbar = document.querySelector("#mainNav");
  const inset = Math.max(0,navbar?.getBoundingClientRect().bottom || 0)+16;
  const scrollBack = pageChange && grid.getBoundingClientRect().top < inset;
  grid.replaceChildren(...visible.map(card));
  reveal(grid,pageChange);
  if (!filtered.length) grid.append(node("p","cs-empty","No published projects are available in this category."));
  root.querySelector("#projects-count").textContent = mobile.matches && filtered.length
    ? `Showing ${start+1}\u2013${start+visible.length} of ${filtered.length} projects`
    : `Showing ${visible.length} of ${filtered.length} projects`;
  pagination(totalPages);
  root.querySelector("#projects-category").value = selected ?? "";
  root.querySelectorAll(".cs-filter").forEach(filter => filter.setAttribute("aria-pressed",String(filter.dataset.category === (selected ?? ""))));
  if (focused) {
    const card = [...grid.querySelectorAll(".cs-project-card")].find(element => element.dataset.projectId === focused);
    (card?.querySelector("a") || grid).focus({preventScroll:true});
  }
  if (scrollBack) {
    window.scrollTo({top:Math.max(0,window.scrollY+grid.getBoundingClientRect().top-inset),behavior:reducedMotion.matches ? "instant" : "smooth"});
  }
}
function setCategory(value) { selected = value; page = 1; render(); }
function filters() {
  const host = root.querySelector("#projects-filters"); host.replaceChildren();
  const dropdown = root.querySelector("#projects-category"); dropdown.replaceChildren();
  [[null,"All Projects"],...[...new Set(projects.map(category))].map(c => [c,c])].forEach(([value,label]) => {
    const count = value === null ? projects.length : projects.filter(p => category(p) === value).length;
    const option = node("option","",`${label} (${count})`); option.value = value ?? ""; dropdown.append(option);
    const control = button("",() => setCategory(value),"cs-filter");
    control.append(node("span","",label),node("span","cs-filter-count",count));
    control.dataset.category = value ?? ""; control.setAttribute("aria-controls","projects-grid"); host.append(control);
  });
  dropdown.disabled = false;
}
async function load() {
  // Legacy card_category is authoritative too; no new registry/FK required.
  const rows = await readTable("projects","select=*,project_technologies(sort_order,created_at,technologies(name))&status=eq.published&deleted_at=is.null&order=sort_order.asc,created_at.asc");
  projects = rows.filter(p => p.status === "published" && p.deleted_at === null && text(p.slug) && text(p.title));
  if (selected !== null && !projects.some(p => category(p) === selected)) selected = null;
  loaded = true; filters(); render();
}
if (root) {
  root.querySelector("#projects-category").addEventListener("change",event => setCategory(event.target.value || null));
  mobile.addEventListener("change",() => { page = 1; if (loaded) render(); });
  load().catch(() => {
    root.querySelector("#projects-grid").replaceChildren(node("p","cs-empty","Projects could not be loaded. Please refresh the page to try again."));
    root.querySelector("#projects-count").textContent = "Projects unavailable";
    root.querySelector("#projects-pagination").hidden = true;
  }).finally(() => window.portfolioReady?.mark("projects"));
}
