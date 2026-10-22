import { ProjectError } from './project-contract.js';
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes,start,end){let value=0xffffffff;for(let i=start;i<end;i++)value=crcTable[(value^bytes[i])&255]^(value>>>8);return (value^0xffffffff)>>>0;}
// Structural parser, bounded before allocation/decoding. Browser also decodes/re-encodes derivatives.
export function inspectImage(bytes, mime, derivative = false) {
  const bad = () => { throw new ProjectError('INVALID_IMAGE'); };
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > (derivative ? 5 : 15)*1048576) bad();
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), str=(at,n)=>String.fromCharCode(...bytes.subarray(at,at+n));
  let width=0,height=0;
  if (mime==='image/png' && !derivative) {
    if (str(0,8)!=='\x89PNG\r\n\x1a\n' || bytes.length<45) bad();
    let at=8, ended=false, data=false,count=0;
    while(at+12<=bytes.length) {
      const n=view.getUint32(at),type=str(at+4,4); if(n>bytes.length-at-12||++count>4096||crc(bytes,at+4,at+8+n)!==view.getUint32(at+8+n))bad();
      if(at===8){if(type!=='IHDR'||n!==13)bad();width=view.getUint32(at+8);height=view.getUint32(at+12);}
      if(type==='IDAT')data=true;
      if(type==='IEND'){if(n||at+12!==bytes.length)bad();ended=true;break;} at+=n+12;
    }
    if(!ended||!data)bad();
  } else if(mime==='image/jpeg' && !derivative) {
    if(bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)bad();
    let at=2;
    while(at+4<bytes.length){if(bytes[at++]!==255)bad();while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===218)break;
      const n=view.getUint16(at);if(n<2||at+n>bytes.length)bad();
      if([192,193,194].includes(marker)){if(n<8)bad();height=view.getUint16(at+3);width=view.getUint16(at+5);}at+=n;}
  } else if(mime==='image/webp') {
    if(bytes.length<30||str(0,4)!=='RIFF'||str(8,4)!=='WEBP'||view.getUint32(4,true)+8!==bytes.length)bad();
    let at=12, found=false,extended=null,count=0;
    while(at+8<=bytes.length){const type=str(at,4),n=view.getUint32(at+4,true),p=at+8;if(n>bytes.length-p||++count>4096)bad();
      if(type==='ANIM'||type==='ANMF')bad();
      if(type==='VP8X'){if(n!==10||extended||(bytes[p]&2))bad();extended={width:1+bytes[p+4]+(bytes[p+5]<<8)+(bytes[p+6]<<16),height:1+bytes[p+7]+(bytes[p+8]<<8)+(bytes[p+9]<<16)};}
      if(type==='VP8 '){if(found||n<10||str(p+3,3)!=='\x9d\x01\x2a')bad();width=view.getUint16(p+6,true)&16383;height=view.getUint16(p+8,true)&16383;found=true;}
      if(type==='VP8L'){if(found||n<5||bytes[p]!==47)bad();const b=view.getUint32(p+1,true);width=(b&16383)+1;height=((b>>>14)&16383)+1;found=true;}
      at=p+n+(n%2);
    }
    if(!found||at!==bytes.length||(extended&&(extended.width!==width||extended.height!==height)))bad();
  } else bad();
  if(!width||!height||width>12000||height>12000||width*height>50000000)bad();
  return {width,height,mime,size:bytes.length};
}
export async function boundedBytes(req,max,timeoutMs=15000) {
  if(Number(req.headers.get('content-length'))>max)throw new ProjectError('TOO_LARGE',413);
  const reader=req.body?.getReader();if(!reader)throw new ProjectError('EMPTY_BODY');
  const chunks=[];let size=0,timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(new ProjectError('BODY_TIMEOUT',408));void reader.cancel().catch(()=>{});},timeoutMs);});
  try{while(true){const {done,value}=await Promise.race([reader.read(),deadline]);if(done)break;size+=value.length;if(size>max){void reader.cancel().catch(()=>{});throw new ProjectError('TOO_LARGE',413);}chunks.push(value);}}
  finally{clearTimeout(timer);reader.releaseLock();}
  const out=new Uint8Array(size);let at=0;for(const chunk of chunks){out.set(chunk,at);at+=chunk.length;}return out;
}
export async function sha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
