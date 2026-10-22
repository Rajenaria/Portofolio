import { createMedia,SECTION_LABELS } from './project-data.js';
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
const safeUrl=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}};
const ICONS={code:'</>',cpu:'▣',database:'▤',layers:'▱',globe:'◎',shield:'◇',tool:'⌘'};
// One renderer for public snapshots and authenticated draft preview; no global shell styles.
export function renderCaseStudy(root,snapshot,{resolver,nextProject,preview=false,headerElement}={}){
 const p=snapshot.payload,g=p.general,disposers=[],media=[];let destroyed=false,frame=0;
 root.replaceChildren();root.classList.add('project-case-study');
 if(headerElement){const offset=()=>root.style.setProperty('--pcs-top',headerElement.getBoundingClientRect().height+'px');offset();const observer=new ResizeObserver(offset);observer.observe(headerElement);disposers.push(()=>observer.disconnect());}
 const progress=node('div','pcs-reading-progress');progress.setAttribute('aria-hidden','true');root.append(progress);
 const layout=node('div','pcs-layout'),aside=node('aside','pcs-sidebar'),mobile=node('button','pcs-mobile-toggle','Daftar isi');mobile.type='button';mobile.setAttribute('aria-expanded','false');
 const nav=node('nav','pcs-toc');nav.setAttribute('aria-label','Bagian case study');nav.id='pcs-toc-'+snapshot.id;mobile.setAttribute('aria-controls',nav.id);
 const back=node('a','pcs-back','← Semua Project');back.href='index.html#portfolio';if(preview){back.removeAttribute('href');back.textContent='Preview Working Draft';}
 aside.append(back,mobile,nav);layout.append(aside);
 const content=node('article','pcs-content');layout.append(content);root.append(layout);
 // Anchor clearance includes the collapsed mobile TOC as well as the public header.
 const navOffset=()=>{const style=getComputedStyle(aside),height=getComputedStyle(mobile).display==='none'?0:mobile.getBoundingClientRect().height+parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+parseFloat(style.borderBottomWidth);root.style.setProperty('--pcs-nav-height',height+'px');};
 const navObserver=new ResizeObserver(navOffset);navObserver.observe(aside);navOffset();disposers.push(()=>navObserver.disconnect());
 mobile.addEventListener('click',()=>{const open=mobile.getAttribute('aria-expanded')!=='true';mobile.setAttribute('aria-expanded',String(open));aside.classList.toggle('is-open',open);});
 const entries=[],revealTargets=[];
 function section(id,title,type){const s=node('section','pcs-section pcs-'+type);s.id='pcs-'+id;const h=node('h2','',title);s.append(h);content.append(s);entries.push([s,title]);revealTargets.push(s);return s;}
 function lightbox(src,alt){
  if(!src)return;const previous=document.activeElement,dialog=node('dialog','pcs-lightbox'),close=node('button','pcs-close','Tutup gambar ×'),img=node('img');dialog.setAttribute('aria-label','Pratinjau gambar: '+alt);img.src=src;img.alt=alt;close.type='button';dialog.append(close,img);root.append(dialog);
  const escape=e=>{if(e.key==='Escape')e.stopPropagation();};window.addEventListener('keydown',escape,true);
  const finish=()=>{window.removeEventListener('keydown',escape,true);dialog.remove();previous?.focus({preventScroll:true});};dialog.addEventListener('close',finish,{once:true});close.addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.showModal();close.focus();
 }
 function image(parent,placement,aspect){if(!placement)return;const m=createMedia(snapshot.id,placement,{resolver,aspect,onOpen:lightbox});media.push(m);parent.append(m.element);}
 const hero=node('header','pcs-hero');hero.id='pcs-hero';const legacyTitle=[p.legacy?.title_main,p.legacy?.title_highlight].filter(Boolean).join(' ');hero.append(node('p','pcs-eyebrow',g.category),node('h1','',legacyTitle||g.title),node('p','pcs-summary',p.legacy?.intro||g.summary));
 const meta=node('dl','pcs-meta');for(const [label,value] of [['Peran',g.role],['Periode',g.period],['Status project',g.stage]])if(value){const wrap=node('div');wrap.append(node('dt','',label),node('dd','',value));meta.append(wrap);}hero.append(meta);
 const links=node('div','pcs-links');for(const [label,value] of [['Repository',g.github_url],['Live Project',g.demo_url]]){const href=safeUrl(value);if(href){const a=node('a','',label+' ↗');a.href=href;a.target='_blank';a.rel='noopener noreferrer';links.append(a);}}hero.append(links);image(hero,p.hero,'hero');content.append(hero);entries.push([hero,'Overview']);
 if(p.legacy?.paragraphs?.length||p.legacy?.heading){const s=section('legacy',p.legacy.heading||'Tentang Project','legacy');for(const text of p.legacy.paragraphs)s.append(node('p','',text));}
 if(p.legacy?.technologies?.length){const tags=node('ul','pcs-technology-tags');for(const t of p.legacy.technologies)tags.append(node('li','',t.name));hero.append(tags);}
 for(const s of p.sections.filter(s=>s.enabled)){
  const visibleItems=s.items.filter(i=>i.enabled!==false);
  if(s.type==='architecture'?!visibleItems.length:!visibleItems.length&&!s.text?.trim()&&!s.secondary?.trim())continue;
  const target=section(s.id,s.title||SECTION_LABELS[s.type],s.type);
  if(s.type==='challenge'){
   const columns=node('div','pcs-challenge-columns');for(const [title,text] of [['Challenge',s.text],['Solution',s.secondary]]){const col=node('div');col.append(node('h3','',title),node('p','',text||''));columns.append(col);}target.append(columns);
  }else if(s.text)target.append(node('p','pcs-section-intro',s.text));
  if(s.type==='architecture'){
   const board=node('div','pcs-architecture-board'),nodes=node('div','pcs-architecture-nodes '+(s.layout==='linear'?'is-linear':'')),panels=node('div','pcs-architecture-panels'),relationships=node('ul','pcs-relationships');board.append(nodes);target.append(board,panels);
   const buttons=new Map(),panelMap=new Map();
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('pcs-connections');svg.setAttribute('aria-hidden','true');board.prepend(svg);
   for(const item of s.items.filter(i=>i.enabled!==false)){const b=node('button','pcs-architecture-node',item.title);b.type='button';b.setAttribute('aria-expanded','false');b.setAttribute('aria-controls','pcs-panel-'+item.id);nodes.append(b);buttons.set(item.id,b);
    const panel=node('div','pcs-architecture-panel');panel.id='pcs-panel-'+item.id;panel.hidden=true;panel.append(node('h3','',item.title),node('p','',item.description||''));if(item.technologies?.length)panel.append(node('p','pcs-item-tech',item.technologies.join(' · ')));if(item.notes)panel.append(node('p','',item.notes));image(panel,item.media);panels.append(panel);panelMap.set(item.id,panel);
    b.addEventListener('click',()=>{for(const [id,button]of buttons){button.setAttribute('aria-expanded',String(id===item.id));panelMap.get(id).hidden=id!==item.id;}drawConnections(item.id);});
   }
   for(const edge of s.edges||[]){const source=s.items.find(i=>i.id===edge.source&&i.enabled!==false),dest=s.items.find(i=>i.id===edge.target&&i.enabled!==false);if(source&&dest)relationships.append(node('li','',`${source.title} → ${dest.title} (${edge.type})`));}
   const alternative=node('details','pcs-relationship-details');alternative.append(node('summary','','Hubungan sistem (teks)'),relationships);target.append(alternative);
   function drawConnections(active){if(destroyed)return;svg.replaceChildren();const box=board.getBoundingClientRect();svg.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
    for(const edge of s.edges||[]){const from=buttons.get(edge.source),to=buttons.get(edge.target);if(!from||!to)continue;const a=from.getBoundingClientRect(),b=to.getBoundingClientRect(),line=document.createElementNS(svg.namespaceURI,'path');line.setAttribute('d',`M ${a.x+a.width/2-box.x} ${a.y+a.height/2-box.y} L ${b.x+b.width/2-box.x} ${b.y+b.height/2-box.y}`);if(edge.source===active||edge.target===active)line.classList.add('is-active');svg.append(line);}
   }
   const resize=new ResizeObserver(()=>drawConnections([...buttons].find(([,b])=>b.getAttribute('aria-expanded')==='true')?.[0]));resize.observe(board);disposers.push(()=>resize.disconnect());buttons.values().next().value?.click();
  }else if(visibleItems.length){
   const items=node('div','pcs-items');target.append(items);
   for(const [index,item] of s.items.filter(i=>i.enabled!==false).entries()){
    const card=node('article','pcs-item '+(item.layout==='wide'?'is-wide':item.layout==='portrait'?'is-portrait':''));card.dataset.itemId=item.id;
    if(item.icon&&ICONS[item.icon]){const icon=node('span','pcs-feature-icon',ICONS[item.icon]);icon.setAttribute('aria-hidden','true');card.append(icon);}
    if(s.type==='timeline')card.append(node('span','pcs-phase-number',String(index+1).padStart(2,'0')));
    if(item.title)card.append(node('h3','',item.title));if(item.description)card.append(node('p','',item.description));
    if(item.category)card.append(node('p','pcs-eyebrow',item.category));
    if(item.technologies?.length)card.append(node('p','pcs-item-tech',item.technologies.join(' · ')));
    image(card,item.media);
    if(item.media?.description)card.append(node('p','',item.media.description));
    if(item.media?.phase_id){const phase=p.sections.find(s=>s.type==='timeline')?.items.find(i=>i.id===item.media.phase_id);if(phase)card.append(node('p','pcs-item-tech',phase.title));}
    if(item.notes){const notes=node('details','pcs-notes'),summary=node('summary','','Technical notes');summary.setAttribute('aria-expanded','false');notes.append(summary,node('p','',item.notes));notes.addEventListener('toggle',()=>summary.setAttribute('aria-expanded',String(notes.open)));card.append(notes);}
    const href=safeUrl(item.url);if(href){const a=node('a','','Referensi ↗');a.href=href;a.target='_blank';a.rel='noopener noreferrer';card.append(a);}items.append(card);
   }
  }
 }
 const bottom=node('footer','pcs-bottom');if(!preview){const a=node('a','','← Semua Project');a.href='index.html#portfolio';bottom.append(a);}content.append(bottom);
 function setNext(project){if(destroyed||preview||!project?.payload?.general?.slug||project.payload.general.slug===g.slug)return;bottom.querySelector('[data-next-project]')?.remove();const next=node('a','','Project berikutnya: '+project.payload.general.title);next.dataset.nextProject='';next.href='project.html?'+new URLSearchParams({slug:project.payload.general.slug});bottom.append(next);}
 setNext(nextProject);
 for(const [s,title]of entries){const a=node('a','',title);a.href='#'+s.id;a.addEventListener('click',e=>{if(preview){e.preventDefault();s.scrollIntoView({behavior:'instant',block:'start'});}aside.classList.remove('is-open');mobile.setAttribute('aria-expanded','false');s.tabIndex=-1;s.focus({preventScroll:true});});nav.append(a);}
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 if('IntersectionObserver'in window){const reveal=new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){e.target.classList.add('is-visible');reveal.unobserve(e.target);}},{threshold:.04});
  if(!motion.matches)for(const s of revealTargets){s.classList.add('pcs-reveal');reveal.observe(s);}disposers.push(()=>reveal.disconnect());
 }
 const clearMotion=()=>{if(motion.matches)for(const s of revealTargets)s.classList.add('is-visible');};motion.addEventListener('change',clearMotion);disposers.push(()=>motion.removeEventListener('change',clearMotion));
 function scroll(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;const box=root.getBoundingClientRect(),height=Math.max(1,box.height-innerHeight);progress.style.transform=`scaleX(${Math.max(0,Math.min(1,-box.top/height))})`;
  let current=entries[0]?.[0];for(const [s]of entries)if(s.getBoundingClientRect().top<innerHeight*.3)current=s;
  for(const a of nav.children){if(a.hash==='#'+current?.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');}
  for(const phase of root.querySelectorAll('.pcs-timeline .pcs-item'))phase.classList.toggle('is-active',phase.getBoundingClientRect().top<innerHeight*.7);
  for(const track of root.querySelectorAll('.pcs-timeline .pcs-items')){const box=track.getBoundingClientRect();track.style.setProperty('--pcs-progress',Math.max(0,Math.min(box.height,innerHeight*.7-box.top))+'px');}
 });}
 document.addEventListener('scroll',scroll,{passive:true,capture:true});window.addEventListener('resize',scroll);disposers.push(()=>{document.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',scroll);});scroll();
 return {setNext,destroy(){destroyed=true;cancelAnimationFrame(frame);disposers.forEach(fn=>fn());media.forEach(m=>m.destroy());root.querySelectorAll('dialog').forEach(d=>d.close());root.replaceChildren();}};
}
