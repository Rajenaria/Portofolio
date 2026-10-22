// DTO fixtures only: real production renderers build all UI. Every claim is labelled DEMO.
const uid=n=>`90000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function snapshot(row,index=0){
 let n=1000+index*1000;const id=()=>uid(n++),crop=(aspect='card')=>({fit:row.cover_fit||'cover',aspect,x:row.cover_position_x??50,y:row.cover_position_y??50,zoom:1});
 const placement=aspect=>({id:id(),asset_id:row.id,alt:'DEMO — asset existing, konteks sintetis',caption:'DEMO — dokumentasi sintetis',crop:crop(aspect)});
 const item=(title,description)=>({id:id(),title,description,notes:'DEMO — catatan teknis sintetis untuk menguji keterbacaan.',category:'DEMO',technologies:['Vanilla JavaScript'],media:null});
 const section=(type,title,items=[],text='')=>({id:id(),type,title,enabled:true,text,secondary:'',items});
 const phases=Array.from({length:3},(_,i)=>({...item('DEMO Phase '+(i+1),'Deskripsi proses demonstrasi. Bukan klaim proyek owner.'),media:i===1?placement('landscape'):null}));
 const nodes=['Input','Processing','Output'].map(label=>item('DEMO '+label,'Hubungan sintetis untuk verifikasi interaksi diagram.'));
 const architecture={...section('architecture','DEMO System Architecture',nodes),layout:'layered',edges:[{id:id(),source:nodes[0].id,target:nodes[1].id,type:'data'},{id:id(),source:nodes[1].id,target:nodes[2].id,type:'control'}]};
 const sections=[{...section('challenge','DEMO Challenge & Solution',[],'DEMO — contoh masalah sintetis.'),secondary:'DEMO — contoh solusi sintetis.'},section('timeline','DEMO Development Journey',phases),architecture,
 section('features','DEMO Key Capabilities',[{...item('DEMO Feature utama','Konten demonstrasi, bukan pencapaian asli.'),layout:'wide',media:placement('landscape')},{...item('DEMO Feature pendukung','Contoh konten singkat.'),layout:'normal'}]),
 section('decisions','DEMO Engineering Decisions',[item('DEMO JavaScript','Contoh alasan pemilihan teknologi.'),item('DEMO CSS','Contoh pertimbangan desain.')]),
 section('gallery','DEMO Project Artifacts',Array.from({length:3},(_,i)=>({...item('DEMO Artifact '+(i+1),''),layout:i===0?'wide':'normal',media:placement(i===2?'portrait':'landscape')}))),
 section('reflections','DEMO Results & Reflections',[],'DEMO — refleksi sintetis. Tidak berisi metrik atau klaim pencapaian owner.')];
 return {id:row.id,revision_id:uid(index+1),publication_version:1,payload:{schema_version:1,general:{title:row.title,slug:row.slug,category:index%2?'DEMO Web Development':'DEMO Embedded Systems',summary:row.short_description.slice(0,400),role:'DEMO Developer',period:'2026',stage:'DEMO Prototype',github_url:'',demo_url:'',featured:index===0,sort_order:index},cover:placement('card'),hero:placement('hero'),sections,legacy:{paragraphs:[],technologies:[{id:null,name:'DEMO JavaScript',icon:''}]}}};
}
module.exports={snapshot};
