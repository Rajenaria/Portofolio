import { el, append } from "../../core/dom.js";
import { openModal } from "../../core/modal.js";
import { cropPosition, applyImageCrop, PROJECT_FRAME_RATIO } from "../../../../js/cms/project-cover.js";

// Positions are percentages of the overflowing image, never pixel offsets.
// Dragging changes the view only; optimized source files remain intact.
export function openCropEditor({ url, value, onSave, title = "Atur Posisi", ratio = PROJECT_FRAME_RATIO }) {
  let position = cropPosition(value), drag = null, ready = false;
  const body = el("div","project-crop-editor"), frame = el("div","project-crop-frame"), image = el("img");
  const note = el("p","form-help","Geser gambar di dalam bingkai. Rasio mengikuti tampilan website dan tidak dapat diubah. Gunakan tombol panah pada keyboard untuk penyesuaian kecil.");
  frame.style.aspectRatio = String(ratio);
  frame.tabIndex = 0; frame.setAttribute("role","group"); frame.setAttribute("aria-label","Bingkai crop tetap. Geser gambar atau gunakan tombol panah.");
  image.alt = "Pratinjau posisi gambar"; image.draggable = false;
  function paint() { applyImageCrop(image,position); }
  const error = el("p","form-error"); error.setAttribute("role","alert");
  image.addEventListener("load",() => { ready = true; paint(); });
  image.addEventListener("error",() => { ready = false; error.textContent = "Gambar tidak dapat dimuat. Tutup dan coba kembali."; });
  image.src = url; paint(); frame.append(image); append(body,note,frame,error);
  frame.addEventListener("pointerdown",event => {
    if (!ready || event.button > 0 || event.isPrimary === false) return;
    const box = frame.getBoundingClientRect(), scale = Math.max(box.width/image.naturalWidth,box.height/image.naturalHeight);
    drag = { id:event.pointerId, x:event.clientX, y:event.clientY, position:{...position}, overflowX:image.naturalWidth*scale-box.width, overflowY:image.naturalHeight*scale-box.height };
    frame.setPointerCapture(event.pointerId); event.preventDefault(); frame.focus({preventScroll:true});
  });
  frame.addEventListener("pointermove",event => {
    if (!drag || drag.id !== event.pointerId) return;
    position = cropPosition({ x:drag.overflowX > .5 ? drag.position.x-(event.clientX-drag.x)*100/drag.overflowX : 50, y:drag.overflowY > .5 ? drag.position.y-(event.clientY-drag.y)*100/drag.overflowY : 50 }); paint();
  });
  const release = () => { drag = null; };
  frame.addEventListener("pointerup",release); frame.addEventListener("pointercancel",release); frame.addEventListener("lostpointercapture",release);
  frame.addEventListener("keydown",event => {
    if (!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)) return;
    event.preventDefault(); const step = event.shiftKey ? 5 : 1;
    position = cropPosition({ x:position.x+({ArrowLeft:step,ArrowRight:-step}[event.key] || 0), y:position.y+({ArrowUp:step,ArrowDown:-step}[event.key] || 0) }); paint();
  });
  const controller = openModal({title,body,actions:[
    {label:"Reset ke Tengah",variant:"secondary",onClick:() => { position = {x:50,y:50}; paint(); }},
    {label:"Batal",variant:"secondary",onClick:ctl => ctl.close()},
    {label:"Gunakan Posisi",variant:"primary",onClick:ctl => { if (!ready) { error.textContent = "Tunggu sampai gambar selesai dimuat."; return; } onSave({...position}); ctl.close(); }}
  ]});
  controller.dialog.classList.add("project-editor-modal");
  return controller;
}
