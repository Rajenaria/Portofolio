import { node, text, list, object, section, paragraphs, picture, displayYear, uiIcon } from "./project-ui.js";
import { swapContent } from "./project-motion.js";
import { applyImageCrop } from "./project-cover.js";
let sequence = 0;
function cards(rows, ordered = false, gridClass = "cs-feature-grid") {
  const grid = node("div",gridClass);
  list(rows).forEach((row,index) => {
    const item = object(row), card = node("article","cs-info-card");
    if (ordered || text(item.layer)) card.append(node("span","cs-step-number",text(item.layer) || String(index+1).padStart(2,"0")));
    if (text(item.title)) card.append(node("h3","",item.title));
    paragraphs(card,item.description); grid.append(card);
  });
  return grid;
}
export function deepDive(data) {
  const architecture = object(data.architecture), problem = object(data.problem);
  const available = [
    ["architecture","Architecture", text(architecture.summary) || list(architecture.nodes).length],
    ["how_it_works","How It Works",list(data.how_it_works).length],
    ["problem","Problem & Solution",text(problem.challenge) || text(problem.solution) || list(problem.impacts).length],
    ["features","Features",list(data.features).length]
  ].filter(item => item[2]);
  if (!available.length) return null;
  const root = section("System Breakdown","Architecture, Challenges & How It Works","detail-deepdive");
  const tabs = node("div","cs-tabs"), panel = node("div","cs-tab-panel");
  const prefix = `cs-tabs-${++sequence}`; panel.id = prefix+"-panel"; panel.setAttribute("role","tabpanel"); panel.tabIndex = 0;
  tabs.setAttribute("role","tablist"); tabs.setAttribute("aria-label","Project deep dive");
  let controls = [];
  let selectedIndex = -1;
  const publicMotion=document.body.classList.contains("cs-page");
  function updateIndicator() {
    if (!publicMotion || selectedIndex<0) return;
    const active=controls[selectedIndex];
    tabs.style.setProperty("--cs-tab-x",`${active.offsetLeft}px`);
    tabs.style.setProperty("--cs-tab-width",String(active.offsetWidth));
  }
  function select(index, focus = false) {
    if (index === selectedIndex) { if (focus) controls[index].focus(); return; }
    selectedIndex = index;
    controls.forEach((control,i) => { control.setAttribute("aria-selected",String(i===index)); control.tabIndex = i===index ? 0 : -1; });
    updateIndicator();
    if (focus) controls[index].focus();
    panel.setAttribute("aria-labelledby",controls[index].id);
    const content = node("div","cs-tab-content"), key = available[index][0];
    if (key === "architecture") { paragraphs(content,architecture.summary); content.append(cards(architecture.nodes,false,"cs-architecture-grid")); }
    if (key === "how_it_works") content.append(cards(data.how_it_works,true,"cs-step-grid"));
    if (key === "features") content.append(cards(data.features));
    if (key === "problem") {
      const grid = node("div","cs-problem-grid");
      [["The Challenge",problem.challenge,"cs-challenge"],["The Solution",problem.solution,"cs-solution"]].forEach(([title,value,style]) => {
        if (!text(value)) return;
        const card = node("article",`cs-info-card ${style}`); card.append(node("h3","",title)); paragraphs(card,value); grid.append(card);
      });
      content.append(grid);
      const impacts = node("ul","cs-impact-list");
      list(problem.impacts).forEach(item => { const value = text(object(item).text); if (value) impacts.append(node("li","",value)); });
      if (impacts.childElementCount) content.append(impacts);
    }
    if (publicMotion) swapContent(panel,content);
    else panel.replaceChildren(content);
  }
  controls = available.map(([key,label],index) => {
    const control = node("button","cs-tab",label); control.type = "button"; control.id = `${prefix}-${key}`;
    control.prepend(uiIcon(key));
    control.setAttribute("role","tab"); control.setAttribute("aria-controls",panel.id);
    control.addEventListener("click",() => select(index));
    control.addEventListener("keydown",event => {
      const target = {ArrowRight:(index+1)%available.length,ArrowLeft:(index-1+available.length)%available.length,Home:0,End:available.length-1}[event.key];
      if (target !== undefined) { event.preventDefault(); select(target,true); }
    });
    tabs.append(control); return control;
  });
  const frame = node("div","cs-deep-dive"); frame.append(tabs,panel); root.append(frame); select(0);
  if (publicMotion && typeof ResizeObserver === "function") {
    tabs.classList.add("cs-tabs-gliding");
    const observer=new ResizeObserver(updateIndicator);
    observer.observe(tabs); controls.forEach(control => observer.observe(control));
    panel.addEventListener("cs:dispose",() => observer.disconnect(),{once:true});
  }
  return root;
}
export function roadmap(data, media, resolvePicture = picture, projectYear = "") {
  const steps = list(data.roadmap); if (!steps.length) return null;
  const root = section("Roadmap","Project Milestones","detail-roadmap");
  root.firstChild.append(node("span","cs-badge",`${steps.length} ${steps.length === 1 ? "step" : "steps"}`));
  const timeline = node("ol","cs-roadmap-list");
  steps.forEach((value,index) => {
    const step = object(value), item = node("li","cs-roadmap-step"), card = node("article","cs-roadmap-card");
    const body = node("div","cs-roadmap-copy"), meta = node("div","cs-actions");
    meta.append(node("span","cs-step-number",`Step ${String(index+1).padStart(2,"0")}`));
    if (displayYear(step.date) || projectYear) meta.append(node("span","cs-muted",displayYear(step.date) || projectYear));
    body.append(meta,node("h3","",text(step.title))); paragraphs(body,step.description);
    if (text(step.deliverable)) { const footer = node("div","cs-deliverable-row"); footer.append(node("span","cs-deliverable",step.deliverable)); body.append(footer); }
    card.append(body);
    const row = list(media).find(image => image.id === step.media_id && image.is_active !== false);
    const visual = row ? resolvePicture(row) : null;
    if (visual) applyImageCrop(visual.querySelector("img") || visual,step.crop);
    if (visual) { card.classList.add("has-image"); const wrap = node("div","cs-roadmap-image"); const frame = node("div","cs-roadmap-frame"); frame.append(visual); wrap.append(frame); card.append(wrap); }
    item.append(node("span","cs-roadmap-number",String(index+1).padStart(2,"0")),card); timeline.append(item);
  });
  root.append(timeline); return root;
}
