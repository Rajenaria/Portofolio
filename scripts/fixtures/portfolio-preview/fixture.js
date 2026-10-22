/* Developer-only synthetic responses. No backend, credentials or UI renderer. */
const VERSION = "00000000-0000-4000-8000-000000000006";
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DATE = "2026-01-01T00:00:00Z";

// A complete one-page PDF, including byte-accurate xref and trailer.
function makePdf() {
  const content = "BT /F1 20 Tf 60 750 Td (DEMO - LOCAL CV FIXTURE) Tj 0 -35 Td /F1 12 Tf (Synthetic document. Not the owner's CV.) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`
  ];
  let pdf = "%PDF-1.4\n", offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
const pdf = makePdf();
const media = {
  "demo/hero-desktop.webp": "assets/images/profile/hadow.webp",
  "demo/hero-mobile.webp": "assets/images/profile/hadow-mobile.webp",
  "demo/second-desktop.webp": "assets/images/profile/profil-1.webp",
  "demo/second-mobile.webp": "assets/images/profile/profil-1-mobile.webp",
  "demo/third.png": "assets/images/profile/Profil 2.png",
  "demo/third-mobile.webp": "assets/images/profile/profil-2-mobile.webp",
  "demo/web.webp": "assets/images/projects/web.webp",
  "demo/web-mobile.webp": "assets/images/projects/web-mobile.webp",
  "demo/ticket.webp": "assets/images/projects/ticket.webp",
  "demo/ticket-mobile.webp": "assets/images/projects/ticket-mobile.webp"
};

function tables({ certificates = 8, projects = 8 } = {}) {
  return {
    profile_content: [{ id: id(100), singleton_key: 1, name: "DEMO Portfolio Lokal",
      professional_title: "Data demonstrasi - bukan konten CMS asli",
      hero_description: "PREVIEW LOKAL TERISOLASI. Renderer asli dengan data sintetis; tidak terhubung ke layanan produksi.",
      about_heading_main: "Tentang", about_heading_highlight: "DEMO",
      about_lead: "Seluruh data CMS dalam sesi ini adalah fixture lokal.",
      about_description: "Gunakan sesi ini untuk review visual dan interaksi. Foto berasal dari asset repository existing.",
      about_photo_bucket: "portfolio-media", about_photo_desktop_path: "demo/hero-desktop.webp",
      about_photo_mobile_path: "demo/hero-mobile.webp", about_photo_alt: "DEMO - asset existing",
      cv_version: VERSION, cv_filename: "DEMO-local-CV.pdf", cv_size_bytes: pdf.length, cv_updated_at: DATE }],
    hero_media: [ ["demo/hero-desktop.webp", "demo/hero-mobile.webp"],
      ["demo/second-desktop.webp", "demo/second-mobile.webp"], ["demo/third.png", "demo/third-mobile.webp"]
    ].map(([desktop_path, mobile_path], i) => ({ slot_number: i + 1, bucket_name: "portfolio-media",
      desktop_path, mobile_path, alt_text: "DEMO - foto existing " + (i + 1), is_visible: true })),
    about_interests: [{ label: "DEMO - Frontend", sort_order: 0, is_active: true }],
    about_organization: [{ heading_main: "Organisasi", heading_highlight: "DEMO",
      paragraph_1: "Contoh konten sintetis untuk visual review.", paragraph_2: "Bukan riwayat atau pencapaian asli owner." }],
    about_organization_skills: [{ title: "DEMO kolaborasi", description: "Deskripsi sintetis.", sort_order: 0, is_active: true }],
    about_gallery: [{ bucket_name: "portfolio-media", desktop_path: "demo/second-desktop.webp",
      mobile_path: "demo/second-mobile.webp", alt_text: "DEMO - gallery", sort_order: 0, is_active: true }],
    technologies: [{ name: "DEMO JavaScript", icon_key: "javascript", public_group: "languages", sort_order: 0,
      is_active: true, show_in_public_stack: true, created_at: DATE }],
    experiences: Array.from({ length: 3 }, (_, i) => ({ id: id(200 + i), type: "DEMO",
      title: "DEMO Experience " + (i + 1), role: "Peran sintetis", location: "Lingkungan lokal",
      description: "Contoh pengalaman untuk memeriksa rendering CMS. Bukan riwayat asli owner.",
      sort_order: i, created_at: DATE, experience_tags: [{ label: "DEMO", sort_order: 0, created_at: DATE }] })),
    projects: Array.from({ length: projects }, (_, i) => ({ id: id(300 + i), slug: "demo-project-" + (i + 1),
      title: "DEMO Project " + (i + 1), card_category: "DEMO - Sintetis",
      short_description: i % 3 === 0 ? "Deskripsi demo singkat." : i % 3 === 1 ? "Deskripsi demo panjang untuk memeriksa konsistensi kartu dan overflow. ".repeat(4) : "",
      detail_intro: "DEMO - detail sintetis, bukan materi proyek asli.", role: "Demo developer", project_type: "Demo",
      about_heading: "Tentang DEMO", project_date: "2026-01-01", status: "published", deleted_at: null,
      published_at: DATE, created_at: DATE, updated_at: DATE, sort_order: i,
      cover_bucket: "portfolio-media", cover_desktop_path: i % 2 ? "demo/ticket.webp" : "demo/web.webp",
      cover_mobile_path: i % 2 ? "demo/ticket-mobile.webp" : "demo/web-mobile.webp", cover_alt: "DEMO - cover existing",
      cover_fit: i % 2 ? "contain" : "cover", cover_position_x: i % 2 ? 50 : 25, cover_position_y: 50,
      project_technologies: [], project_media: [], project_paragraphs: [] })),
    certificates: Array.from({ length: certificates }, (_, i) => ({ id: id(400 + i), title: "DEMO Certificate " + (i + 1),
      category: "course", publisher: "DEMO issuer", period: "2026", issuer_line: "Dokumen sintetis lokal", badge_text: "DEMO",
      description: i % 3 === 0 ? "Deskripsi sintetis singkat." : i % 3 === 1 ? "Deskripsi sintetis panjang untuk memeriksa scrolling dan keterbacaan. ".repeat(14) : "",
      document_bucket: "portfolio-documents", document_path: `certificates/${id(400 + i)}.pdf`, document_type: "pdf",
      external_url: null, status: "published", deleted_at: null, sort_order: i, created_at: DATE })),
    comments: [{ id: id(500), name: "DEMO Pengunjung", message: "Komentar sintetis lokal. Form tidak mengirim ke produksi.", created_at: DATE }]
  };
}
function environmentConfig(frontendOrigin) {
  return { schemaVersion: 1, deploymentId: 'isolated-fixture', environment: 'fixture',
    frontendOrigins: [frontendOrigin], backendOrigin: 'http://127.0.0.1:54321',
    projectRef: 'local', publishableKey: 'sb_publishable_SYNTHETIC_LOCAL_FIXTURE',
    ownerUserId: '00000000-0000-4000-8000-000000000001' };
}
// Older CDP harnesses retain their own synthetic service adapters. Keep their
// deployment input/CSP explicit as well; this helper never forwards requests.
function configureResponse(frontendOrigin, pathname, body, type) {
  if (pathname === '/js/environment-config.js') return require('../../../js/environment').configScript(environmentConfig(frontendOrigin));
  if (/^text\/html/.test(type)) {
    const { withMeta, cspFor } = require('../../prepare-environment');
    return withMeta(body.toString(), cspFor({ backendOrigin: 'http://127.0.0.1:54321', admin: pathname.startsWith('/admin/') }));
  }
  return body;
}
module.exports = { VERSION, pdf, media, tables, environmentConfig, configureResponse };
