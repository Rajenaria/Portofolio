import { loadCatalog } from './project-data.js';
import { renderCaseStudy } from './project-case-study.js';
const main=document.querySelector('main'),slug=new URLSearchParams(location.search).get('slug');
let view;
function state(message,retry=false){main.replaceChildren();const box=document.createElement('section');box.className='project-page-container';box.style.padding='80px 24px';const h=document.createElement('h1');h.textContent=message;box.append(h);const back=document.createElement('a');back.href='index.html#portfolio';back.textContent='Kembali ke Projects';box.append(back);if(retry){const b=document.createElement('button');b.type='button';b.textContent='Coba Lagi';b.addEventListener('click',load);box.append(b);}main.append(box);}
async function load(){
 view?.destroy();if(!slug?.trim()){state('Project tidak ditemukan.');return;}state('Memuat project…');
 try{const rows=await loadCatalog({slug:slug.trim()});if(!rows.length){state('Project tidak ditemukan.');return;}const row=rows[0];document.title=row.payload.general.title+' — Rajendra Aria Nismara';const root=document.createElement('div');main.replaceChildren(root);view=renderCaseStudy(root,row,{headerElement:document.querySelector('.project-top-nav')});const current=view;loadCatalog().then(catalog=>{const index=catalog.findIndex(p=>p.id===row.id);if(index>=0&&index<catalog.length-1)current.setNext(catalog[index+1]);}).catch(()=>{});}
 catch{state('Data project gagal dimuat.',true);}
}
load();
