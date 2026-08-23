/*
  Public bilingual layer (English + Bahasa Indonesia).

  Mirrors admin/js/core/i18n.js on purpose: same API shape
  (getLanguage/setLanguage/t/onLanguageChange/applyStaticTranslations), same
  data-i18n markup convention, same "current -> other -> key" fallback so a
  missing translation is an obvious gap rather than a blank control. This is
  a SEPARATE module with its own storage key and dictionary — the public
  language is independent from the Admin interface language, and nothing
  here is loaded on /admin.

  DEFAULT
  -------
  English, always, on a first visit with nothing stored. No navigator.language
  sniffing.

  PERSISTENCE
  -----------
  localStorage key "portfolio.language". No database column, no server round
  trip — the preference is a property of this browser.

  CROSS-SCRIPT BRIDGE
  --------------------
  Several public renderers (js/certificates.js, js/script.js, js/guestbook.js)
  are classic, non-module scripts that already talk to each other and to the
  js/cms/*.js modules through window.* globals (window.certificatesCarousel,
  window.refreshProjectCarousel, window.portfolioReady). t()/getLanguage()/
  onLanguageChange() are published the same way, as window.portfolioI18n, so
  those scripts can translate their own dynamic strings without becoming
  modules themselves.

  SECURITY: dictionary values are only ever written with textContent /
  setAttribute by applyStaticTranslations(). Nothing here uses innerHTML.
*/

const STORAGE_KEY = "portfolio.language";

export const LANGUAGES = Object.freeze([
  { code: "en", label: "EN", name: "English" },
  { code: "id", label: "ID", name: "Bahasa Indonesia" }
]);

export const DEFAULT_LANGUAGE = "en";

const DICTIONARY = {

  en: {
    "nav.home": "Home",
    "nav.about": "About",
    "nav.experience": "Experience",
    "nav.education": "Education",
    "nav.certificates": "Certificates",
    "nav.portfolio": "Portfolio",
    "nav.contact": "Contact",
    "nav.toggleAriaLabel": "Open navigation menu",
    "nav.toggleCloseAriaLabel": "Close navigation menu",
    "nav.languageAriaLabel": "Language",

    "hero.greeting": "HELLO, I'M",
    "hero.viewWork": "View My Work",
    "hero.downloadCV": "Download CV",

    "about.label": "ABOUT ME",
    "about.interestLabel": "AREA OF INTEREST",
    "about.orgLabel": "ORGANIZATION & ACTIVITIES",
    "about.orgPrevAriaLabel": "Previous documentation",
    "about.orgNextAriaLabel": "Next documentation",
    "about.techDescription":
      "A selection of tools and technologies I use across software development, AI, embedded systems, and digital product development.",

    "experience.label": "EXPERIENCE",
    "experience.heading": "Experience That Shaped Me",
    "experience.description":
      "Various technical, professional, and organizational experiences that helped me grow my skills in technology, communication, teamwork, and problem solving.",

    "education.label": "EDUCATION",
    "education.heading": "Education History",
    "education.description": "Education I have completed or am currently pursuing.",

    "certificates.label": "CERTIFICATES",
    "certificates.heading": "Certificates & Awards",
    "certificates.description":
      "Certificates, copyrights, and academic achievements I have earned.",
    "certificates.hint": "(Swipe to rotate · click the front card for details)",
    "certificates.carouselAriaLabel": "List of certificates and awards",
    "certificates.prevAriaLabel": "Previous certificate",
    "certificates.nextAriaLabel": "Next certificate",
    "certificates.dotsAriaLabel": "Select certificate",
    "certificates.cardAriaLabel": "Certificate: {title} — {publisher}. Open details.",
    "certificates.linkAriaLabel": "View certificate {title} (new tab)",
    "certificates.dotAriaLabel": "Show certificate: {title}",
    "certificates.linkEmptyTitle": "Certificate link not set yet",

    "portfolio.label": "PORTFOLIO",
    "portfolio.heading": "Projects I Have Worked On",
    "portfolio.description":
      "Some projects I have worked on in Artificial Intelligence, Computer Vision, Embedded Systems, and UI/UX Design.",
    "portfolio.viewProject": "View project →",

    "contact.label": "CONTACT",
    "contact.heading": "Contact Me.",
    "contact.description":
      "Have a question, want to discuss, or interested in collaborating? Feel free to reach out.",
    "contact.note": "Open to discussion, collaboration, and new opportunities.",

    "guestbook.label": "GUESTBOOK",
    "guestbook.heading": "Leave a Message.",
    "guestbook.description": "Got feedback, a message, or just want to say hi? Write it here.",
    "guestbook.namePlaceholder": "Your name",
    "guestbook.messagePlaceholder": "Write a message or comment...",
    "guestbook.submit": "Send",
    "guestbook.sending": "Sending...",
    "guestbook.counter": "{count} / {max}",
    "guestbook.emptyTitle": "No messages yet.",
    "guestbook.emptyText": "Be the first to leave a message.",
    "guestbook.sliderAriaLabel": "Comment navigation",
    "guestbook.errNameShort": "Name must be at least 2 characters.",
    "guestbook.errNameLong": "Name must be at most 30 characters.",
    "guestbook.errMessageShort": "Message must be at least 3 characters.",
    "guestbook.errMessageLong": "Message must be at most 500 characters.",
    "guestbook.errLoad": "Failed to load messages.",
    "guestbook.errLoadRefresh": "Please refresh the page.",
    "guestbook.errSubmit": "Failed to send message.",
    "guestbook.sendingStatus": "Sending your message...",
    "guestbook.successSent": "Message sent successfully. Thank you!",
    "guestbook.pending": "Message received, pending review.",
    "guestbook.pinAriaLabel": "Pin this message",
    "guestbook.sliderCommentAriaLabel": "View comment {n}",

    "footer.description":
      "Computer Engineering graduate interested in embedded systems, artificial intelligence, computer vision, software development, and UI/UX design.",

    "projectDetail.backToPortfolio": "Back to Portfolio",
    "projectDetail.notFoundTitle": "Project not found.",
    "projectDetail.notFoundMessage": "The project you are looking for is not available.",
    "projectDetail.loadErrorTitle": "Project could not be loaded.",
    "projectDetail.loadErrorMessage":
      "Something went wrong while loading this project. Please try again later.",
    "projectDetail.backToProjects": "← Back to Projects",
    "projectDetail.projectEyebrow": "PROJECT",
    "projectDetail.roleLabel": "ROLE",
    "projectDetail.yearLabel": "YEAR",
    "projectDetail.typeLabel": "PROJECT TYPE",
    "projectDetail.viewDemo": "View Demo ↗",
    "projectDetail.github": "GitHub ↗",
    "projectDetail.aboutLabel": "ABOUT THE PROJECT",
    "projectDetail.toolsLabel": "TOOLS & TECHNOLOGY",
    "projectDetail.techStack": "Tech Stack",
    "projectDetail.documentationLabel": "DOCUMENTATION",
    "projectDetail.previewHeading": "Project Preview.",
    "projectDetail.back": "BACK",
    "projectDetail.allProjects": "← All Projects",
    "projectDetail.nextProject": "NEXT PROJECT",
    "projectDetail.footerTagline": "Portfolio Project Documentation"
  },

  id: {
    "nav.home": "Beranda",
    "nav.about": "Tentang Saya",
    "nav.experience": "Pengalaman",
    "nav.education": "Pendidikan",
    "nav.certificates": "Sertifikat",
    "nav.portfolio": "Portfolio",
    "nav.contact": "Kontak",
    "nav.toggleAriaLabel": "Buka menu navigasi",
    "nav.toggleCloseAriaLabel": "Tutup menu navigasi",
    "nav.languageAriaLabel": "Bahasa",

    "hero.greeting": "HALO, SAYA",
    "hero.viewWork": "Lihat Karya Saya",
    "hero.downloadCV": "Unduh CV",

    "about.label": "TENTANG SAYA",
    "about.interestLabel": "BIDANG MINAT",
    "about.orgLabel": "ORGANISASI & KEGIATAN",
    "about.orgPrevAriaLabel": "Dokumentasi sebelumnya",
    "about.orgNextAriaLabel": "Dokumentasi berikutnya",
    "about.techDescription":
      "Beberapa bahasa pemrograman, teknologi, development tools, database, dan software yang pernah saya gunakan dalam pembelajaran, project, desain, maupun pengembangan prototype.",

    "experience.label": "PENGALAMAN",
    "experience.heading": "Pengalaman yang Membentuk Saya",
    "experience.description":
      "Berbagai pengalaman teknis, profesional, dan organisasi yang membantu saya mengembangkan kemampuan di bidang teknologi, komunikasi, kerja sama tim, dan problem solving.",

    "education.label": "PENDIDIKAN",
    "education.heading": "Riwayat Pendidikan",
    "education.description": "Pendidikan yang telah dan sedang saya tempuh.",

    "certificates.label": "SERTIFIKAT",
    "certificates.heading": "Sertifikat & Penghargaan",
    "certificates.description":
      "Sertifikat, hak cipta, dan pencapaian akademik yang pernah saya raih.",
    "certificates.hint": "(Geser untuk memutar · klik kartu depan untuk detail)",
    "certificates.carouselAriaLabel": "Daftar sertifikat dan penghargaan",
    "certificates.prevAriaLabel": "Sertifikat sebelumnya",
    "certificates.nextAriaLabel": "Sertifikat berikutnya",
    "certificates.dotsAriaLabel": "Pilih sertifikat",
    "certificates.cardAriaLabel": "Sertifikat: {title} — {publisher}. Buka detail.",
    "certificates.linkAriaLabel": "Lihat sertifikat {title} (tab baru)",
    "certificates.dotAriaLabel": "Tampilkan sertifikat: {title}",
    "certificates.linkEmptyTitle": "Link sertifikat belum diisi",

    "portfolio.label": "PORTFOLIO",
    "portfolio.heading": "Project yang Pernah Saya Kerjakan",
    "portfolio.description":
      "Beberapa project yang saya kerjakan dalam bidang Artificial Intelligence, Computer Vision, Embedded Systems, dan UI/UX Design.",
    "portfolio.viewProject": "Lihat Project →",

    "contact.label": "KONTAK",
    "contact.heading": "Hubungi Saya.",
    "contact.description":
      "Punya pertanyaan, ingin berdiskusi, atau tertarik untuk berkolaborasi? Jangan ragu untuk menghubungi saya.",
    "contact.note": "Terbuka untuk diskusi, kolaborasi, dan kesempatan baru.",

    "guestbook.label": "GUESTBOOK",
    "guestbook.heading": "Tinggalkan Pesan.",
    "guestbook.description": "Punya feedback, pesan, atau sekadar ingin menyapa? Tulis pesan kamu di sini.",
    "guestbook.namePlaceholder": "Nama kamu",
    "guestbook.messagePlaceholder": "Tulis pesan atau komentar...",
    "guestbook.submit": "Kirim",
    "guestbook.sending": "Mengirim...",
    "guestbook.counter": "{count} / {max}",
    "guestbook.emptyTitle": "Belum ada pesan.",
    "guestbook.emptyText": "Jadilah orang pertama yang meninggalkan pesan.",
    "guestbook.sliderAriaLabel": "Navigasi komentar",
    "guestbook.errNameShort": "Nama minimal 2 karakter.",
    "guestbook.errNameLong": "Nama maksimal 30 karakter.",
    "guestbook.errMessageShort": "Pesan minimal 3 karakter.",
    "guestbook.errMessageLong": "Pesan maksimal 500 karakter.",
    "guestbook.errLoad": "Pesan gagal dimuat.",
    "guestbook.errLoadRefresh": "Silakan refresh halaman.",
    "guestbook.errSubmit": "Pesan gagal dikirim.",
    "guestbook.sendingStatus": "Sedang mengirim pesan...",
    "guestbook.successSent": "Pesan berhasil terkirim. Terima kasih!",
    "guestbook.pending": "Pesan terpending, akan dicek dulu ya.",
    "guestbook.pinAriaLabel": "Sematkan pesan ini",
    "guestbook.sliderCommentAriaLabel": "Lihat komentar {n}",

    "footer.description":
      "Computer Engineering graduate yang tertarik pada embedded systems, artificial intelligence, computer vision, software development, dan UI/UX design.",

    "projectDetail.backToPortfolio": "Kembali ke Portfolio",
    "projectDetail.notFoundTitle": "Project tidak ditemukan.",
    "projectDetail.notFoundMessage": "Project yang Anda cari tidak tersedia.",
    "projectDetail.loadErrorTitle": "Project gagal dimuat.",
    "projectDetail.loadErrorMessage":
      "Terjadi kesalahan saat memuat project ini. Silakan coba lagi nanti.",
    "projectDetail.backToProjects": "← Kembali ke Project",
    "projectDetail.projectEyebrow": "PROJECT",
    "projectDetail.roleLabel": "PERAN",
    "projectDetail.yearLabel": "TAHUN",
    "projectDetail.typeLabel": "JENIS PROJECT",
    "projectDetail.viewDemo": "Lihat Demo ↗",
    "projectDetail.github": "GitHub ↗",
    "projectDetail.aboutLabel": "TENTANG PROJECT",
    "projectDetail.toolsLabel": "TOOLS & TEKNOLOGI",
    "projectDetail.techStack": "Tech Stack",
    "projectDetail.documentationLabel": "DOKUMENTASI",
    "projectDetail.previewHeading": "Pratinjau Project.",
    "projectDetail.back": "KEMBALI",
    "projectDetail.allProjects": "← Semua Project",
    "projectDetail.nextProject": "PROJECT SELANJUTNYA",
    "projectDetail.footerTagline": "Dokumentasi Project Portfolio"
  }

};

function readStored() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return DICTIONARY[saved] ? saved : null;
  } catch (error) {
    // Private mode or blocked storage: fall back to the default, never throw.
    return null;
  }
}

let current = readStored() || DEFAULT_LANGUAGE;

const listeners = new Set();

export function getLanguage() {
  return current;
}

export function t(key, params) {
  const value =
    (DICTIONARY[current] && DICTIONARY[current][key]) ??
    (DICTIONARY[current === "id" ? "en" : "id"] || {})[key] ??
    key;

  if (!params) {
    return value;
  }

  return String(value).replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

export function setLanguage(code) {
  if (!DICTIONARY[code] || code === current) {
    return;
  }

  current = code;

  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch (error) {
    // Preference simply will not persist; the switch still works this session.
  }

  document.documentElement.setAttribute("lang", code);
  applyStaticTranslations();

  listeners.forEach(listener => {
    try {
      listener(code);
    } catch (error) {
      console.error(error);
    }
  });
}

export function onLanguageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/*
  Rewrites statically authored markup carrying a data-i18n hook. Text is
  written with textContent, so a dictionary entry can never be interpreted
  as markup.
*/
export function applyStaticTranslations(root) {
  const scope = root || document;

  scope.querySelectorAll("[data-i18n]").forEach(node => {
    node.textContent = t(node.dataset.i18n);
  });

  scope.querySelectorAll("[data-i18n-placeholder]").forEach(node => {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  });

  scope.querySelectorAll("[data-i18n-aria-label]").forEach(node => {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  });
}

/*
  Compact EN | ID control. Two instances live on the page (desktop navbar,
  mobile menu) and stay in sync through the shared module state + listener
  set — clicking either one calls setLanguage(), which notifies both.
*/
export function createLanguageSwitch(className) {
  const wrap = document.createElement("div");
  wrap.className = className || "lang-switch";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", t("nav.languageAriaLabel"));

  const buttons = LANGUAGES.map(language => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lang-switch-option";
    button.textContent = language.label;
    button.dataset.lang = language.code;
    button.title = language.name;
    button.addEventListener("click", () => setLanguage(language.code));
    wrap.appendChild(button);
    return button;
  });

  function sync() {
    buttons.forEach(button => {
      const active = button.dataset.lang === current;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    wrap.setAttribute("aria-label", t("nav.languageAriaLabel"));
  }

  sync();
  onLanguageChange(sync);

  return wrap;
}

document.documentElement.setAttribute("lang", current);
applyStaticTranslations();

document.addEventListener("DOMContentLoaded", () => {
  applyStaticTranslations();
});

/* Bridge for the classic (non-module) scripts — see header note. */
window.portfolioI18n = {
  getLanguage,
  setLanguage,
  t,
  onLanguageChange,
  createLanguageSwitch
};
