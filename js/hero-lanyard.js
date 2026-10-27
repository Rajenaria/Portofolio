/* Lanyard-style Hero: original CSS/SVG implementation, not a React/physics port.
 * One CMS photo, a curved strap, and a fixed-step pendulum/slack-rope simulation.
 * No uploads, textures, external dependencies, or CMS mutations. */
export const LANYARD_SETTINGS = Object.freeze({
  gravity: 1, damping: .5, elasticity: .5, breeze: .5, mass: 1,
  gravityPixels: 1200, ropeStiffness: 200, ropeDamping: 14, airDamping: .35,
  angularDamping: 1.2, maxAngle: .105, limitStiffness: 100,
  liftFraction: .065, stretchFraction: .045,
  introLiftFraction: .055, introAngle: .028, introTransfer: .0011,
  introImpulse: .22, introScrollGuard: .85,
  dragAngle: .065, dragGain: .34, dragLiftFraction: .017,
  dragStiffness: 45, dragDamping: 8, handStiffness: 180, handDamping: 16,
  hoverAngle: .026, hoverStiffness: 7, hoverDamping: 1.4,
  inputSmoothing: .065, tiltStiffness: 22, tiltDamping: 5,
  throwTransfer: .18, throwMemory: .12, keyboardImpulse: .085,
  windSeconds: 2.8, windTorque: .035,
  maxScrollVelocity: 1800, scrollSmoothing: .09, scrollDecay: .12,
  scrollGain: .00014, scrollImpulse: .09, scrollCooldown: .12,
  scrollBudget: .15, scrollRecovery: .18, mobileScroll: .15,
  fixedStep: 1/120, maxDelta: .05
});
const instances = new WeakMap();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const channels = ['x', 'y', 'roll', 'tiltX', 'tiltY'];
const tilts = ['tiltX', 'tiltY'];
const windValue = n => { const v=Math.sin(n*127.1+23.4)*43758.5453; return (v-Math.floor(v))*2-1; };

export function mountHeroLanyard(stage = document.querySelector('[data-hero-lanyard]')) {
  if (!stage) return null;
  if (instances.has(stage)) return instances.get(stage);
  const card = stage.querySelector('.hero-lanyard-card');
  const strap = stage.querySelector('.hero-lanyard-strap');
  if (!card || !strap) return null;
  const paths = [...strap.querySelectorAll('path')];
  const hero = stage.closest('#home');
  const navbar = document.getElementById('mainNav');
  const metal = card.querySelector('.hero-lanyard-metal');
  const image = card.querySelector('img');
  let hasPhoto = Boolean(image?.complete && image.naturalWidth);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 650px)');
  const tablet = matchMedia('(max-width: 1050px)');
  card.disabled = motion.matches;
  const events = new AbortController();
  const options = { passive: true, signal: events.signal };
  const settings = LANYARD_SETTINGS;
  const staticIntro = motion.matches || mobile.matches;
  const state = { x: 0, y: 0, roll: 0, tiltX: 0, tiltY: 0 };
  const velocity = { x: 0, y: 0, roll: 0, tiltX: 0, tiltY: 0 };
  const target = { x: 0, y: 0, roll: 0, tiltX: 0, tiltY: 0 };
  const filtered = { x: 0, y: 0, roll: 0, tiltX: 0, tiltY: 0 };
  let width = 1, height = 1, cardTop = 0, visible = false, suspended = false, disposed = false;
  let topReach = 0, anchorY = -16, cardCenter = 0, hookX = 0, hookY = -17, eyeHalf = 3;
  let perspective = 1000, geometryDirty = false;
  let raf = 0, last = 0, clock = 0, drag = null, accumulator = 0;
  let stretch = 0, ropeLength = 1, maxAngle = .1, lift = 0, travel = 0, maskDirty = false;
  let hovering = false, keyboardHeld = false;
  let introStarted = staticIntro, introTension = staticIntro, introComplete = staticIntro, introAt = 0;
  const gravity = settings.gravity * settings.gravityPixels;
  const ropeStiffness = settings.ropeStiffness / (.7 + settings.elasticity*.6);
  const ropeDamping = settings.ropeDamping * (.65 + settings.damping*.7);
  const slack = -gravity*settings.mass/ropeStiffness;
  const scroll = { y:window.scrollY, at:0, velocity:0, pending:false, eventAt:0, cooldown:0, budget:0 };
  const intensity = () => mobile.matches ? .45 : tablet.matches ? .65 : 1;
  const photoReady = () => Boolean(image?.complete && image.naturalWidth);
  const canRun = () => !disposed && visible && !suspended && !motion.matches && !document.hidden && photoReady() &&
    !document.documentElement.classList.contains('is-loading');

  function constrain() {
    if (Math.abs(state.roll) > maxAngle) {
      state.roll = clamp(state.roll,-maxAngle,maxAngle);
      if (state.roll*velocity.roll > 0) velocity.roll *= -.1;
    }
    if (stretch < -lift || stretch > travel) {
      stretch = clamp(stretch,-lift,travel);
      if ((stretch === travel && velocity.y > 0) || (stretch === -lift && velocity.y < 0)) velocity.y *= -.1;
    }
    state.x = -ropeLength*Math.sin(state.roll);
    state.y = stretch+ropeLength*(Math.cos(state.roll)-1);
  }
  function paint() {
    constrain();
    const degrees = state.roll * 180 / Math.PI;
    card.style.transform = `translate3d(${state.x.toFixed(2)}px,${state.y.toFixed(2)}px,0) rotateZ(${degrees.toFixed(3)}deg) rotateY(${state.tiltY.toFixed(2)}deg) rotateX(${state.tiltX.toFixed(2)}deg)`;
    if (card.style.opacity !== '1') card.style.opacity = '1';
    if (photoReady()) hasPhoto=true;
    const visibility=hasPhoto ? 'visible' : 'hidden';
    if (card.style.visibility !== visibility) card.style.visibility=visibility;
    const anchor = width * .5, spread = width * .034;
    const bend = state.x * .15;
    const bow = Math.max(0,slack-stretch)*.25;
    const left = attachmentPoint(-eyeHalf), right = attachmentPoint(eyeHalf);
    // Both curves start above the Hero header and terminate inside the metal
    // eye. Endpoints use the same 3D transform/perspective as the moving card.
    const segment = (x, end, side) => {
      const drop = Math.max(1, end.y-anchorY);
      return `M ${x} ${anchorY} C ${x+bend+side*bow} ${anchorY+drop*.38} ${end.x+Math.sin(state.roll)*28} ${end.y-Math.cos(state.roll)*28} ${end.x} ${end.y}`;
    };
    const d = `${segment(anchor-spread,left,-1)} ${segment(anchor+spread,right,1)}`;
    paths.forEach(path => path.setAttribute('d', d));
  }
  function attachmentPoint(offset) {
    // Match rotateZ * rotateY * rotateX around the card's top-center origin.
    const x = hookX+offset, y = hookY;
    const rx = state.tiltX*Math.PI/180, ry = state.tiltY*Math.PI/180;
    const yy = y*Math.cos(rx), zz = y*Math.sin(rx);
    const xx = x*Math.cos(ry)+zz*Math.sin(ry);
    const z = -x*Math.sin(ry)+zz*Math.cos(ry);
    const px = cardCenter+state.x+xx*Math.cos(state.roll)-yy*Math.sin(state.roll);
    const py = cardTop+state.y+xx*Math.sin(state.roll)+yy*Math.cos(state.roll);
    const scale = perspective/(perspective-z);
    return { x:width*.5+(px-width*.5)*scale, y:height*.5+(py-height*.5)*scale };
  }
  function measure() {
    width = Math.max(1, stage.clientWidth);
    height = Math.max(1, stage.clientHeight);
    cardTop = card.offsetTop;
    cardCenter = card.offsetLeft+card.offsetWidth*.5;
    if (metal) {
      hookX = metal.offsetLeft+metal.offsetWidth*.5-card.offsetWidth*.5;
      hookY = metal.offsetTop+metal.clientTop+3;
      eyeHalf = Math.max(1,Math.min(3,metal.clientWidth*.25));
    }
    perspective = parseFloat(getComputedStyle(stage).perspective) || 1000;
    const stageBox = stage.getBoundingClientRect(), heroBox = (hero || stage).getBoundingClientRect();
    const navBox = navbar?.getBoundingClientRect();
    topReach = Math.max(0,stageBox.top-heroBox.top);
    const navHeight = navBox?.height || 0;
    anchorY = -topReach-Math.max(8,navHeight*.25);
    ropeLength = Math.max(40,cardTop+hookY-anchorY);
    const room = Math.max(1,Math.min(card.offsetLeft,width-card.offsetLeft-card.offsetWidth)-8);
    maxAngle = Math.min(settings.maxAngle*intensity(),Math.asin(clamp(room/(ropeLength+card.offsetHeight),0,1)));
    lift = Math.max(0,Math.min(height*settings.liftFraction*intensity(),cardTop-4));
    travel = Math.max(0,Math.min(height*settings.stretchFraction*intensity(),height-cardTop-card.offsetHeight-8));
    stage.style.setProperty('--lanyard-top-reach', `${topReach}px`);
    strap.setAttribute('viewBox', `0 ${-topReach} ${width} ${height+topReach}`);
    updateHeaderMask();
    if (!introStarted && photoReady()) beginIntro();
    paint();
  }
  function updateHeaderMask() {
    const heroBox = (hero || stage).getBoundingClientRect(), navBox = navbar?.getBoundingClientRect();
    const navHeight = navBox?.height || 0;
    const eyeY = topReach+cardTop+hookY;
    const headerEnd = Math.max(0,(navBox?.bottom ?? heroBox.top)-heroBox.top);
    const hideUntil = Math.max(0,Math.min(headerEnd-navHeight*.24,eyeY-24));
    const revealAt = Math.max(hideUntil+1,Math.min(headerEnd+navHeight*.1,eyeY-8));
    stage.style.setProperty('--lanyard-hide-until', `${hideUntil}px`);
    stage.style.setProperty('--lanyard-reveal-at', `${revealAt}px`);
  }
  function stop() {
    cancelAnimationFrame(raf); raf = 0; last = 0; accumulator = 0;
    stage.classList.remove('is-motion-active');
  }
  function wake() {
    if (!raf && canRun()) {
      stage.classList.add('is-motion-active');
      raf = requestAnimationFrame(frame);
    }
  }
  function addAngularImpulse(impulse) {
    // Bound added energy, not the scroll-driven angle. Gravity remains in charge.
    const room = Math.max(0,Math.cos(state.roll)-Math.cos(maxAngle*.96));
    const speed = Math.sqrt(2*gravity/ropeLength*room);
    velocity.roll = clamp(velocity.roll+impulse/settings.mass,-speed,speed);
  }
  function beginIntro() {
    introStarted=true; introAt=clock;
    stretch = -Math.min(height*settings.introLiftFraction*intensity(),lift*.9);
    state.roll = -Math.min(settings.introAngle*intensity(),maxAngle*.4);
    velocity.y=0; velocity.roll=0;
  }
  function windNoise(time) {
    const t=time/settings.windSeconds, i=Math.floor(t), f=t-i, blend=f*f*(3-2*f);
    const a=windValue(i);
    return a+(windValue(i+1)-a)*blend;
  }
  function simulate(dt) {
    clock += dt;
    const follow=1-Math.exp(-dt/settings.inputSmoothing);
    channels.forEach(key=>{filtered[key]+=(target[key]-filtered[key])*follow;});
    const extension=Math.max(0,stretch-slack);
    if (!introTension && extension>0) {
      introTension=true;
      addAngularImpulse(Math.min(settings.introImpulse,Math.max(0,velocity.y)*settings.introTransfer)*intensity());
    }
    if (introTension && clock-introAt>=settings.introScrollGuard) introComplete=true;
    const tension=extension>0 ? Math.max(0,ropeStiffness*extension+ropeDamping*velocity.y) : 0;
    let fall=gravity-tension/settings.mass-settings.airDamping*velocity.y;
    if (drag || keyboardHeld) fall+=settings.handStiffness*(filtered.y-stretch)-settings.handDamping*velocity.y;
    velocity.y+=fall*dt; stretch+=velocity.y*dt;
    let torque=-gravity/ropeLength*Math.sin(state.roll)-settings.angularDamping*(.6+settings.damping*.8)*velocity.roll;
    if (drag || keyboardHeld) torque+=settings.dragStiffness*(filtered.roll-state.roll)-settings.dragDamping*velocity.roll;
    else if (hovering) torque+=settings.hoverStiffness*(filtered.roll-state.roll)-settings.hoverDamping*velocity.roll;
    else if (!mobile.matches) torque+=windNoise(clock)*settings.windTorque*settings.breeze*intensity()/settings.mass;
    const edge=Math.max(0,Math.abs(state.roll)-maxAngle*.8);
    if (edge>0) torque-=Math.sign(state.roll)*edge*settings.limitStiffness;
    velocity.roll+=torque*dt; state.roll+=velocity.roll*dt;
    for (const key of tilts) {
      velocity[key]+=((filtered[key]-state[key])*settings.tiltStiffness-settings.tiltDamping*velocity[key])*dt;
      state[key]+=velocity[key]*dt;
    }
    constrain();
  }
  function clearScroll() {
    scroll.y=window.scrollY; scroll.at=0; scroll.velocity=0; scroll.pending=false;
    scroll.cooldown=0; scroll.budget=0;
  }
  function applyScroll(dt, now) {
    scroll.cooldown=Math.max(0,scroll.cooldown-dt);
    scroll.budget=Math.max(0,scroll.budget-settings.scrollRecovery*dt);
    if (now-scroll.eventAt>50) scroll.velocity*=Math.exp(-dt/settings.scrollDecay);
    if (!scroll.pending || scroll.cooldown>0 || !introComplete || drag || keyboardHeld) return;
    scroll.pending=false;
    const budget=Math.max(0,settings.scrollBudget-scroll.budget);
    const impulse=clamp(scroll.velocity*settings.scrollGain,-settings.scrollImpulse,settings.scrollImpulse)*intensity()*(mobile.matches?settings.mobileScroll:1);
    const bounded=clamp(impulse,-budget,budget);
    if (Math.abs(bounded)<.001) return;
    addAngularImpulse(bounded); scroll.budget+=Math.abs(bounded); scroll.cooldown=settings.scrollCooldown;
  }
  function onScroll() {
    maskDirty=true;
    const now=performance.now(), y=window.scrollY, delta=y-scroll.y;
    const dt=scroll.at && now-scroll.at<250 ? Math.max(1/240,(now-scroll.at)/1000) : 1/60;
    scroll.y=y; scroll.at=now;
    if (!canRun() || !introComplete || drag) {
      scroll.velocity=0; scroll.pending=false;
      if (motion.matches && visible && !document.hidden) { updateHeaderMask(); maskDirty=false; }
      wake(); return;
    }
    if (delta) {
      const raw=clamp(delta/dt,-settings.maxScrollVelocity,settings.maxScrollVelocity);
      if (raw*scroll.velocity<0) scroll.velocity=0;
      scroll.velocity+=(raw-scroll.velocity)*(1-Math.exp(-dt/settings.scrollSmoothing));
      scroll.eventAt=now; scroll.pending=true;
    }
    wake();
  }
  function frame(now) {
    raf=0;
    if (!stage.isConnected) { api.destroy(); return; }
    if (!canRun()) { stop(); return; }
    if (geometryDirty) { geometryDirty=false; maskDirty=false; measure(); }
    else if (maskDirty) { maskDirty=false; updateHeaderMask(); }
    if (!introStarted) beginIntro();
    if (last && now-last<1000/(mobile.matches?30:60)-1) { wake(); return; }
    const dt=last ? Math.min((now-last)/1000,settings.maxDelta) : 1/60;
    last=now; applyScroll(dt,now); accumulator+=dt;
    while (accumulator>=settings.fixedStep) { simulate(settings.fixedStep); accumulator-=settings.fixedStep; }
    paint();
    const settled=Math.abs(state.roll)<.0002 && Math.abs(velocity.roll)<.0002 &&
      Math.abs(stretch)<.02 && Math.abs(velocity.y)<.02 &&
      tilts.every(key=>Math.abs(state[key])<.015&&Math.abs(velocity[key])<.015);
    if (mobile.matches && !drag && !keyboardHeld && !hovering && !scroll.pending && introComplete && settled) stop(); else wake();
  }
  function resetTargets() { channels.forEach(key => { target[key]=0; }); }
  function release(throwMomentum = false) {
    const held = drag; drag = null;
    if (throwMomentum === true && held) {
      const age=Math.max(0,(performance.now()-held.at)/1000);
      addAngularImpulse(held.speed*settings.throwTransfer*Math.exp(-age/settings.throwMemory));
    }
    hovering=false; keyboardHeld=false;
    card.removeAttribute('data-dragging'); resetTargets();
    if (held && card.hasPointerCapture(held.id)) card.releasePointerCapture(held.id);
    wake();
  }
  card.addEventListener('pointerdown', event => {
    if (motion.matches || event.button > 0 || event.isPrimary === false) return;
    hovering=false; keyboardHeld=false; clearScroll();
    drag = { id:event.pointerId, x:event.clientX, y:event.clientY, startX:state.x, startY:stretch,
      at:performance.now(), angle:state.roll, speed:0 };
    card.setPointerCapture(event.pointerId);
    card.dataset.dragging = 'true'; card.focus({preventScroll:true}); wake();
  }, options);
  stage.addEventListener('pointermove', event => {
    if (motion.matches || event.isPrimary === false) return;
    if (drag) {
      if (event.pointerId !== drag.id) return;
      const weight = intensity();
      const range=ropeLength*Math.sin(settings.dragAngle*weight);
      target.x = clamp(drag.startX+(event.clientX-drag.x)*settings.dragGain*weight,-range,range);
      target.y = clamp(drag.startY+(event.clientY-drag.y)*.2*weight,-height*settings.dragLiftFraction*weight,height*settings.dragLiftFraction*weight);
      target.roll = -Math.atan2(target.x,ropeLength);
      target.tiltY = target.x/Math.max(1,range)*3*weight;
      const now=performance.now(), dt=Math.max(1/240,(now-drag.at)/1000);
      const speed=clamp((target.roll-drag.angle)/dt,-1.5,1.5);
      drag.speed+=(speed-drag.speed)*(1-Math.exp(-dt/.05));
      drag.at=now; drag.angle=target.roll;
    } else if (event.pointerType === 'mouse') {
      const box = card.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
        hovering=false; resetTargets(); wake(); return;
      }
      const x = clamp((event.clientX-box.left)/box.width-.5, -.5, .5);
      const y = clamp((event.clientY-box.top)/box.height-.5, -.5, .5);
      const weight = intensity();
      hovering=true;
      target.roll = -x*settings.hoverAngle*weight;
      target.tiltY = x*4*weight; target.tiltX = -y*2*weight;
    } else return;
    wake();
  }, options);
  stage.addEventListener('pointerleave', () => { if (!drag) { hovering=false; resetTargets(); wake(); } }, options);
  card.addEventListener('pointerup', () => release(true), options);
  card.addEventListener('pointercancel', release, options);
  card.addEventListener('lostpointercapture', release, options);
  window.addEventListener('blur', release, options);
  card.addEventListener('keydown', event => {
    if (motion.matches) return;
    if (event.key === 'Escape') { release(); return; }
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(event.key)) return;
    event.preventDefault();
    keyboardHeld=true; hovering=false;
    target.x = event.key === 'ArrowLeft' ? -width*.025*intensity() : event.key === 'ArrowRight' ? width*.025*intensity() : 0;
    target.y = event.key === 'ArrowUp' ? -height*.01*intensity() : event.key === 'ArrowDown' ? height*.01*intensity() : 0;
    target.roll = clamp(-Math.atan2(target.x,ropeLength),-maxAngle*.7,maxAngle*.7);
    if (event.key === 'Enter' || event.key === ' ') addAngularImpulse(settings.keyboardImpulse*intensity());
    wake();
  }, {signal:events.signal});
  card.addEventListener('keyup', () => { keyboardHeld=false; resetTargets(); wake(); }, options);
  card.addEventListener('blur', release, options);
  card.addEventListener('dragstart', event => event.preventDefault(), {signal:events.signal});
  function syncMotion() {
    release();
    card.disabled = motion.matches;
    if (motion.matches) {
      stop(); stretch=0; introStarted=introTension=introComplete=true; clearScroll();
      channels.forEach(key => { state[key]=0; velocity[key]=0; filtered[key]=0; }); paint();
    } else wake();
  }
  const resize = new ResizeObserver(entries => {
    if (entries.some(entry=>entry.target!==navbar)) geometryDirty=true;
    maskDirty=true;
    if (canRun()) wake(); else {
      if (geometryDirty) measure(); else updateHeaderMask();
      geometryDirty=false; maskDirty=false;
    }
  });
  resize.observe(stage);
  if (hero) resize.observe(hero);
  if (navbar) resize.observe(navbar);
  window.addEventListener('scroll', onScroll, options);
  const intersection = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    if (canRun()) { clearScroll(); wake(); } else { clearScroll(); release(); stop(); }
  });
  intersection.observe(stage);
  const loader = new MutationObserver(() => {
    if (!document.documentElement.classList.contains('is-loading')) { loader.disconnect(); wake(); }
  });
  loader.observe(document.documentElement, {attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange', () => {
    clearScroll();
    if (document.hidden) { release(); stop(); } else wake();
  }, {signal:events.signal});
  motion.addEventListener('change', syncMotion);
  function syncLayout() { release(); measure(); wake(); }
  mobile.addEventListener('change', syncLayout);
  tablet.addEventListener('change', syncLayout);
  window.addEventListener('pagehide', event => {
    if (event.persisted) { suspended=true; clearScroll(); release(); stop(); } else api.destroy();
  }, options);
  window.addEventListener('pageshow', () => { suspended=false; clearScroll(); geometryDirty=true; wake(); }, options);
  if (image) {
    image.addEventListener('load', () => { measure(); wake(); }, {signal:events.signal});
    image.addEventListener('error', () => { paint(); stop(); }, {signal:events.signal});
  }
  const api = { destroy() {
    if (disposed) return;
    disposed=true; release(); stop(); events.abort();
    resize.disconnect(); intersection.disconnect(); loader.disconnect();
    motion.removeEventListener('change', syncMotion);
    mobile.removeEventListener('change', syncLayout); tablet.removeEventListener('change', syncLayout);
    instances.delete(stage);
  }};
  instances.set(stage, api); measure(); wake();
  return api;
}
mountHeroLanyard();
