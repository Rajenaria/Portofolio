import { el } from '../../core/dom.js';
import { openModal } from '../../core/modal.js';
import { createDraftMediaResolver } from '../../core/project-client.js';
import { renderCaseStudy } from '../../../../js/cms/project-case-study.js';
export function openCaseStudyPreview(project,payload){
 const body=el('div','m09-preview'),media=createDraftMediaResolver();
 const view=renderCaseStudy(body,{id:project,payload},{resolver:media.resolve,preview:true});
 return openModal({title:'Working Draft Preview — belum dipublikasikan',body,
  actions:[{label:'Tutup',onClick:c=>c.close()}],onClosed(){view.destroy();media.destroy();}});
}
