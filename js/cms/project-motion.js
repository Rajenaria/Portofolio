// Progressive enhancement: the default DOM is always visible.
export const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const running = new Set();
const entrances = new WeakMap();
reducedMotion.addEventListener("change",() => {
  if (reducedMotion.matches) running.forEach(animation => animation.cancel());
});
export function enter(element, delay = 0, duration = 650, {distance=22,scale=1,fromOpacity=0} = {}) {
  if (!element?.animate || reducedMotion.matches) return null;
  entrances.get(element)?.cancel();
  const animation = element.animate([
    {opacity:fromOpacity,translate:`0 ${distance}px`,scale},{opacity:1,translate:"0 0",scale:1}
  ],{duration,delay,easing:"cubic-bezier(.22,1,.36,1)",fill:"backwards"});
  running.add(animation);
  entrances.set(element,animation);
  animation.finished.then(() => running.delete(animation),() => running.delete(animation));
  return animation;
}
const panels = new WeakMap();
export function swapContent(panel, content) {
  let state = panels.get(panel);
  if (!state) {
    state = {animation:null,width:0,version:0}; panels.set(panel,state);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (Math.abs(width-state.width)>1) { state.width=width; panel.style.minHeight=""; }
    }) : null;
    observer?.observe(panel);
    panel.addEventListener("cs:dispose",() => { state.version++; observer?.disconnect(); state.animation?.cancel(); },{once:true});
  }
  const old=panel.firstElementChild;
  state.animation?.cancel();
  if (!old || reducedMotion.matches || !content.animate || !panel.isConnected) { panel.replaceChildren(content); return; }
  old.getAnimations().forEach(animation => animation.cancel());
  panel.style.minHeight = `${panel.getBoundingClientRect().height}px`;
  // Keep the panel populated: fading the outgoing content to zero caused a
  // white dip between tabs. Only soften the incoming content, never blank it.
  panel.replaceChildren(content);
  state.animation=enter(content,0,320,{distance:6,fromOpacity:.78});

}
export function revealOnce(elements, seen = new Set(), key = element => element, {delay=0,duration=700,onReveal} = {}) {
  if (!("IntersectionObserver" in window) || reducedMotion.matches) return () => {};
  const observer = new IntersectionObserver(entries => {
    let stagger = 0;
    entries.forEach(entry => {
      if (!entry.isIntersecting || entry.intersectionRatio<.12) return;
      observer.unobserve(entry.target);
      const id = key(entry.target);
      if (seen.has(id)) return;
      seen.add(id);
      const offset=delay+Math.min(stagger++,3)*85;
      if (onReveal) onReveal(entry.target,offset);
      else enter(entry.target,offset,duration,{fromOpacity:.35});
    });
  },{threshold:.12,rootMargin:"0px 0px -24px 0px"});
  elements.forEach(element => { if (!seen.has(key(element))) observer.observe(element); });
  return () => observer.disconnect();
}

// Progress is painted only while the timeline is near the viewport. Scroll
// events schedule one rAF read/write pass; no persistent animation loop.
export function timelineProgress(list) {
  if (!list || !("IntersectionObserver" in window)) return () => {};
  const steps=[...list.querySelectorAll(".cs-roadmap-step")];
  if (steps.length<2) return () => {};
  const controller=new AbortController(), options={signal:controller.signal};
  let visible=false, frame=0;
  function paint() {
    frame=0;
    if (!visible || reducedMotion.matches || !list.isConnected) return;
    const readingLine=window.innerHeight*.6;
    const boxes=steps.map(step => step.getBoundingClientRect());
    boxes.slice(0,-1).forEach((box,i) => {
      const start=box.top+28, end=boxes[i+1].top;
      const fraction=Math.max(0,Math.min(1,(readingLine-start)/Math.max(1,end-start)));
      steps[i].style.setProperty("--cs-timeline-progress",String(fraction));
    });
    list.classList.add("cs-timeline-progress");
  }
  function schedule() { if (visible && !frame && !document.hidden && !reducedMotion.matches) frame=requestAnimationFrame(paint); }
  const observer=new IntersectionObserver(entries => { visible=entries[0].isIntersecting; schedule(); },{rootMargin:"100px 0px"});
  observer.observe(list);
  window.addEventListener("scroll",schedule,{...options,passive:true});
  window.addEventListener("resize",schedule,options);
  document.addEventListener("visibilitychange",schedule,options);
  reducedMotion.addEventListener("change",() => {
    if (reducedMotion.matches) list.classList.remove("cs-timeline-progress");
    else schedule();
  },options);
  const sizeObserver=typeof ResizeObserver==="function" ? new ResizeObserver(schedule) : null;
  steps.forEach(step => sizeObserver?.observe(step));
  return () => { controller.abort(); observer.disconnect(); sizeObserver?.disconnect(); cancelAnimationFrame(frame); list.classList.remove("cs-timeline-progress"); };
}
