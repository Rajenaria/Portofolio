import { node, button, section, picture, text, sorted, link, uiIcon } from "./project-ui.js";
import { publicMediaUrl, safeExternalUrl } from "./client.js";
import { reducedMotion } from "./project-motion.js";
import { applyImageCrop } from "./project-cover.js";

function installAutoplay(root, stage, dialog, controls, counter, advance) {
  const controller=new AbortController(), options={signal:controller.signal};
  let timer=null, disposed=false, connected=false, paused=false, keyboardMode=false, playRequested=false, advancing=false, pressWasPlaying=false;
  const pointers=new Set();
  function reason() {
    if (!root.isConnected) return "detached";
    if (paused) return "manual";
    if (reducedMotion.matches) return "reduced-motion";
    if (document.hidden) return "hidden-tab";
    if (dialog.open) return "fullscreen";
    const box=stage.getBoundingClientRect();
    if (box.bottom<=0 || box.top>=window.innerHeight || box.right<=0 || box.left>=window.innerWidth) return "offscreen";
    if (pointers.size) return "interaction";
    if (!playRequested && keyboardMode && root.contains(document.activeElement)) return "keyboard";
    return "playing";
  }
  const toggle=button("",() => {
    if (pressWasPlaying || reason()==="playing") { paused=true; playRequested=false; }
    else { paused=false; playRequested=true; keyboardMode=false; }
    pressWasPlaying=false;
    reset();
  },"cs-button cs-icon-button");
  toggle.addEventListener("pointerdown",() => { pressWasPlaying=reason()==="playing"; },options);
  toggle.addEventListener("keydown",event => { if (["Enter"," "].includes(event.key)) pressWasPlaying=reason()==="playing"; },options);
  function clear() { clearTimeout(timer); timer=null; }
  function sync() {
    if (disposed) return;
    const state=reason(), playing=state==="playing";
    // Do not destroy/recreate the icon or restart a running countdown on every event.
    if (root.dataset.autoplayState!==state) {
      root.dataset.autoplayState=state;
      toggle.replaceChildren(uiIcon(playing ? "pause" : "play"));
      toggle.setAttribute("aria-label",playing ? "Pause gallery autoplay" : "Play gallery autoplay");
      const detail={keyboard:"Keyboard focus is inside the gallery",fullscreen:"Fullscreen is open","reduced-motion":"Reduced motion is enabled",manual:"Paused by you"};
      toggle.title=(playing ? "Pause gallery autoplay" : "Play gallery autoplay")+(detail[state] ? " ? "+detail[state] : "");
    }
    toggle.disabled=reducedMotion.matches;
    counter.setAttribute("aria-live",playing ? "off" : "polite");
    if (!playing) { clear(); return; }
    if (timer!==null || advancing) return;
    timer=setTimeout(async () => {
      timer=null;
      if (disposed || reason()!=="playing") { sync(); return; }
      advancing=true;
      try { await advance(); }
      finally { advancing=false; sync(); }
    },3000);
  }
  function reset() { clear(); sync(); }
  const observer=typeof IntersectionObserver==="function" ? new IntersectionObserver(sync,{threshold:[0,.01,.25,.5,1]}) : null;
  observer?.observe(stage);
  const removal=new MutationObserver(() => {
    if (root.isConnected) { if (!connected) { connected=true; sync(); } }
    else if (connected) dispose();
  });
  removal.observe(document.body,{childList:true,subtree:true});
  function dispose() {
    if (disposed) return;
    disposed=true; clear(); observer?.disconnect(); removal.disconnect(); controller.abort();
    if (dialog.open) { dialog.close(); document.documentElement.classList.remove("cs-lightbox-open"); }
  }
  // A stationary or moving cursor does not stop the numbered slide sequence.
  // Pointer presses pause it below; release restarts the three-second countdown.
  document.addEventListener("pointerdown",() => { if (keyboardMode) { keyboardMode=false; sync(); } },options);
  document.addEventListener("keydown",event => {
    if (["Tab","ArrowLeft","ArrowRight","Home","End","Enter"," "].includes(event.key)) {
      keyboardMode=true; if (root.contains(event.target) && event.target!==toggle) playRequested=false; sync();
    }
  },options);
  root.addEventListener("focusin",sync,options);
  root.addEventListener("focusout",() => queueMicrotask(sync),options);
  root.addEventListener("pointerdown",event => {
    pointers.add(event.pointerId);
    if (!toggle.contains(event.target)) playRequested=false;
    sync();
  },options);
  const release=event => { if (pointers.delete(event.pointerId)) reset(); };
  document.addEventListener("pointerup",release,options);
  document.addEventListener("pointercancel",release,options);
  root.addEventListener("lostpointercapture",release,options);
  // Release events can be lost when the browser loses focus during a drag.
  window.addEventListener("blur",() => { pointers.clear(); sync(); },options);
  window.addEventListener("focus",sync,options);
  document.addEventListener("visibilitychange",() => {
    if (document.hidden) pointers.clear();
    sync();
  },options);
  window.addEventListener("resize",sync,options);
  // Passive scroll checks cover cached pages and visibility changes between IO thresholds.
  let scrollFrame=0;
  window.addEventListener("scroll",() => { if (!scrollFrame) scrollFrame=requestAnimationFrame(() => { scrollFrame=0; sync(); }); },{...options,passive:true});
  controller.signal.addEventListener("abort",() => cancelAnimationFrame(scrollFrame),{once:true});
  dialog.addEventListener("close",reset,options);
  reducedMotion.addEventListener("change",sync,options);
  root.addEventListener("cs:dispose",dispose,{...options,once:true});
  controls.prepend(toggle); sync();
  return {reset,dispose,eligible:() => !disposed && reason()==="playing"};
}

export function gallery(rows, repositoryUrl, {resolvePicture = picture,crops = {}} = {}) {
  const slides = sorted(rows).filter(row => row.is_active !== false && (resolvePicture !== picture ? row.url : publicMediaUrl(row.bucket_name,row.desktop_path)));
  if (!slides.length) return null;
  const root = section("Documentation","Project Gallery","detail-gallery"); root.classList.add("cs-gallery");
  const controls = node("div","cs-actions"), counter = node("span","cs-gallery-counter"); counter.setAttribute("aria-live","polite");
  const stage = node("div","cs-gallery-stage"); stage.setAttribute("role","region"); stage.setAttribute("aria-label","Project documentation gallery");
  const caption = node("p","cs-gallery-caption"), dots = node("div","cs-gallery-dots"), captionBar = node("div","cs-gallery-caption-bar"), slideBadge = node("span","cs-slide-badge");
  dots.setAttribute("aria-label","Select documentation image");
  const dialog = node("dialog","cs-lightbox"), lightbox = node("div","cs-lightbox-content"), full = node("div","cs-lightbox-image");
  dialog.setAttribute("aria-label","Project documentation fullscreen viewer");
  let index = 0, desired = 0, navigationRequest = 0, origin = null, start = null, suppressClick = false, autoplay = null;
  const countText = () => `${String(index+1).padStart(2,"0")} / ${String(slides.length).padStart(2,"0")}`;
  function updateFull() {
    if (!dialog.open) return;
    full.replaceChildren(resolvePicture(slides[index]));
    const image = full.querySelector("img"); image.loading = "eager";
    fullCaption.textContent = `${countText()} — ${text(slides[index].alt_text) || "Project documentation"}`;
  }
  function warm(target) {
    for (let offset=-2;offset<=2;offset++) cards[(target+offset+slides.length)%slides.length].querySelector("img").loading="eager";
  }
  function ready(target) {
    const image=cards[target].querySelector("img");
    return new Promise(resolve => {
      let timeout;
      const finish=() => { clearTimeout(timeout); image.removeEventListener("load",loaded); image.removeEventListener("error",finish); resolve(image.complete); };
      const loaded=() => {
        if (image.decode) image.decode().then(finish,finish);
        else finish();
      };
      timeout=setTimeout(finish,4000);
      if (image.complete) loaded();
      else { image.addEventListener("load",loaded,{once:true}); image.addEventListener("error",finish,{once:true}); }
    });
  }
  async function show(target, automatic = false) {
    const request=++navigationRequest;
    desired=(target+slides.length)%slides.length; const nextIndex=desired;
    if (!automatic) autoplay?.reset();
    warm(nextIndex);
    if (!await ready(nextIndex) || request!==navigationRequest || !root.isConnected || (automatic && !autoplay?.eligible())) return false;
    const previousIndex=index; index=nextIndex;
    render(previousIndex); updateFull();
    if (!automatic) autoplay?.reset();
    return true;
  }
  function open() { origin = document.activeElement; dialog.showModal(); autoplay?.reset(); updateFull(); close.focus(); }
  function shut() { dialog.close(); }
  dialog.addEventListener("close",() => { document.documentElement.classList.remove("cs-lightbox-open"); origin?.focus({preventScroll:true}); });
  const close = button("Close ✕",shut), fullCaption = node("p","cs-gallery-caption");
  const fullControls = node("div","cs-actions");
  const fullPrev = button("← Previous",() => show(desired-1)), fullNext = button("Next →",() => show(desired+1));
  fullPrev.disabled = fullNext.disabled = slides.length < 2; fullControls.append(fullPrev,fullNext);
  lightbox.append(close,full,fullCaption,fullControls); dialog.append(lightbox);
  dialog.addEventListener("click",event => { if (event.target === dialog) shut(); });
  dialog.addEventListener("keydown",event => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); show(desired+(event.key === "ArrowRight" ? 1 : -1)); }
  });
  const expand = button("",() => { document.documentElement.classList.add("cs-lightbox-open"); open(); },"cs-button cs-icon-button");
  expand.append(uiIcon("fullscreen")); expand.setAttribute("aria-label","Open fullscreen gallery"); expand.title="Open fullscreen gallery";
  const previous = button("←",() => show(desired-1)), next = button("→",() => show(desired+1));
  previous.setAttribute("aria-label","Previous documentation image"); next.setAttribute("aria-label","Next documentation image");
  previous.disabled = next.disabled = slides.length < 2;
  const navigation = node("div","cs-gallery-navigation"); navigation.append(previous,counter,next); controls.append(expand,navigation); root.firstChild.append(controls);
  const cards = slides.map((row,i) => {
    const card = node("button","cs-gallery-slide"); card.type = "button";
    card.setAttribute("aria-label",text(row.alt_text) || `Documentation image ${i+1}`);
    const visual = resolvePicture(row); applyImageCrop(visual.querySelector("img") || visual,crops?.[row.id]); card.append(visual);
    card.addEventListener("click",() => {
      if (suppressClick) { suppressClick = false; return; }
      if (i === index) { document.documentElement.classList.add("cs-lightbox-open"); open(); } else show(i);
    });
    stage.append(card); return card;
  });
  const indicators = slides.map((row,i) => {
    const control = button("",() => show(i),"cs-gallery-dot");
    control.append(node("span","",String(i+1).padStart(2,"0")));
    control.setAttribute("aria-label",`Show documentation image ${i+1}`); dots.append(control); return control;
  });
  function render(previousIndex = index) {
    cards.forEach((card,i) => {
      let offset = i-index;
      if (offset > slides.length/2) offset -= slides.length;
      if (offset < -slides.length/2) offset += slides.length;
      const active = offset === 0;
      card.classList.toggle("is-active",active); card.classList.toggle("is-before",offset < 0); card.classList.toggle("is-after",offset > 0);
      card.classList.toggle("is-distant",Math.abs(offset)>1); card.tabIndex = active ? 0 : -1;
      card.setAttribute("aria-hidden",String(Math.abs(offset)>1)); card.inert = Math.abs(offset)>1;
      card.style.zIndex = active ? "3" : i===previousIndex ? "2" : "1";
      indicators[i].setAttribute("aria-current",active ? "true" : "false");
    });
    slideBadge.textContent = `SLIDE ${index+1}`; counter.textContent = countText(); caption.textContent = text(slides[index].alt_text) || `Documentation image ${index+1}`;
    const current = indicators[index];
    const left = current.offsetLeft-dots.offsetLeft, right = left+current.offsetWidth;
    if (left < dots.scrollLeft) dots.scrollLeft = left;
    else if (right > dots.scrollLeft+dots.clientWidth) dots.scrollLeft = right-dots.clientWidth;
  }
  stage.addEventListener("keydown",event => {
    if (["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) {
      event.preventDefault(); show(event.key === "Home" ? 0 : event.key === "End" ? slides.length-1 : desired+(event.key === "ArrowRight" ? 1 : -1)).then(changed => { if (changed) cards[index].focus({preventScroll:true}); });
    }
  });
  stage.addEventListener("pointerdown",event => {
    suppressClick = false; if (event.isPrimary === false || event.button > 0) return;
    start = {x:event.clientX,y:event.clientY,id:event.pointerId};
  });
  stage.addEventListener("pointermove",event => {
    if (!start || event.pointerId !== start.id) return;
    const dx = Math.abs(event.clientX-start.x), dy = Math.abs(event.clientY-start.y);
    if (dx > 10 && dx > dy && !stage.hasPointerCapture(event.pointerId)) stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener("pointerup",event => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX-start.x, dy = event.clientY-start.y; start = null;
    if (Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy)) { suppressClick = true; show(desired+(dx<0 ? 1 : -1)); }
  });
  stage.addEventListener("pointercancel",() => { start = null; });
  captionBar.append(slideBadge,caption,dots); root.append(stage,captionBar,dialog);
  const url = safeExternalUrl(repositoryUrl);
  if (url) {
    const footer = node("div","cs-gallery-repository"), address = node("span","cs-repository-url",new URL(url).host+new URL(url).pathname);
    const identity = node("div","cs-repository-identity"), mark = node("span","cs-repository-mark");
    const action = link("GitHub / Source Code \u2192",url,"cs-button cs-repository-action",true);
    mark.append(uiIcon("github")); identity.append(mark,address); action.prepend(uiIcon("github")); footer.append(identity,action); root.append(footer);
  }
  render(); warm(0);
  if (slides.length>1) autoplay=installAutoplay(root,stage,dialog,controls,counter,() => show(index+1,true));
  return root;
}
