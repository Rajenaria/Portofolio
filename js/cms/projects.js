import { loadCatalog, categories, categoryKey, createMedia } from './project-data.js';

// Homepage catalog only. Data compatibility and media/crop behavior belong to
// project-data.js; this controller owns filters, pagination and reveal lifetime.
const root = document.querySelector('#portfolio');
const grid = document.querySelector('#projectGrid');
const filters = document.querySelector('#projectFilters');
const status = document.querySelector('#projectResults');
const more = document.querySelector('#projectLoadMore');
const retry = document.querySelector('#projectRetry');
const hint = document.querySelector('#projectSwipeHint');
const mobile = matchMedia('(max-width: 650px)');

let rows = [], selected = '', limit = 6, media = [], reveal;
const revealed = new Set();

function clear() {
  media.forEach(item => item.destroy());
  media = [];
  reveal?.disconnect();
  grid.replaceChildren();
}

function createCard(row) {
  const payload = row.payload, general = payload.general;
  const card = document.createElement('article');
  card.className = 'project-card';
  card.dataset.projectId = row.id;

  if (payload.cover) {
    const item = createMedia(row.id, payload.cover, { aspect: 'card' });
    media.push(item);
    card.append(item.element);
  }

  const body = document.createElement('div');
  body.className = 'project-content';
  const category = document.createElement('p');
  category.className = 'project-category';
  category.textContent = general.category + (general.featured ? ' · Featured' : '');
  const title = document.createElement('h3');
  title.textContent = general.title;
  const summary = document.createElement('p');
  summary.className = 'project-text';
  summary.textContent = general.summary;
  const tech = document.createElement('div');
  tech.className = 'project-tech';
  const names = [
    ...(payload.legacy?.technologies || []).map(item => item.name),
    ...payload.sections.filter(section => section.enabled && section.type === 'decisions')
      .flatMap(section => section.items.map(item => item.title))
  ];
  [...new Set(names)].slice(0, 3).forEach(name => {
    const tag = document.createElement('span');
    tag.textContent = name;
    tech.append(tag);
  });

  const link = document.createElement('a');
  link.className = 'project-link';
  link.href = 'project.html?' + new URLSearchParams({ slug: general.slug });
  link.setAttribute('aria-label', 'Lihat Project ' + general.title);
  const arrow = document.createElement('span');
  arrow.className = 'project-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '↗';
  link.append('Lihat Project ', arrow);
  body.append(category, title, summary, tech, link);
  card.append(body);
  return card;
}

function restoreFocus(projectId) {
  if (!projectId) return;
  const card = [...grid.children].find(item => item.dataset.projectId === projectId);
  card?.querySelector('a')?.focus({ preventScroll: true });
  if (mobile.matches && card) {
    grid.scrollLeft = card.offsetLeft - grid.firstElementChild.offsetLeft;
  } else if (!card) {
    grid.focus({ preventScroll: true });
  }
}

function observeCards() {
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    reveal = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          revealed.add(entry.target.dataset.projectId);
          reveal.unobserve(entry.target);
        }
      });
    }, { threshold: .05 });
    for (const card of grid.children) {
      if (!revealed.has(card.dataset.projectId)) {
        card.classList.add('project-reveal');
        reveal.observe(card);
      }
    }
  }
}

function draw({ preserveFocus = false } = {}) {
  const focused = preserveFocus
    ? grid.querySelector('a:focus')?.closest('[data-project-id]')?.dataset.projectId
    : null;
  clear();
  const matching = rows.filter(row => !selected || categoryKey(row.payload.general.category) === selected);
  const visible = mobile.matches ? matching : matching.slice(0, limit);
  grid.tabIndex = mobile.matches && matching.length ? 0 : -1;
  grid.setAttribute('role', 'region');
  grid.setAttribute('aria-label', mobile.matches
    ? 'Project — geser atau gunakan tombol panah untuk menelusuri' : 'Daftar project');
  status.textContent = !rows.length ? 'Belum ada project published.'
    : !matching.length ? 'Tidak ada project dalam kategori ini.'
    : `${visible.length} dari ${matching.length} project`;
  if (hint) hint.hidden = !mobile.matches || matching.length < 2;
  for (const row of visible) grid.append(createCard(row));
  more.hidden = mobile.matches || matching.length <= limit;
  grid.scrollLeft = 0;
  restoreFocus(focused);
  for (const button of filters.children) {
    button.setAttribute('aria-pressed', String(button.dataset.key === selected));
  }
  observeCards();
}

async function load() {
  retry.hidden = true;
  more.hidden = true;
  if (hint) hint.hidden = true;
  grid.tabIndex = -1;
  filters.replaceChildren();
  clear();
  status.textContent = 'Memuat project…';
  root.setAttribute('aria-busy', 'true');
  try {
    rows = await loadCatalog();
    selected = '';
    limit = 6;
    for (const [key, label] of [['', 'Semua'], ...categories(rows)]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.dataset.key = key;
      button.setAttribute('aria-pressed', String(!key));
      button.addEventListener('click', () => {
        selected = key;
        limit = 6;
        draw();
      });
      filters.append(button);
    }
    draw();
  } catch {
    rows = [];
    status.textContent = 'Data project gagal dimuat. Silakan coba lagi.';
    retry.hidden = false;
  } finally {
    root.removeAttribute('aria-busy');
    window.portfolioReady?.mark('projects');
  }
}

if (grid && filters && status && more && retry) {
  mobile.addEventListener('change', () => {
    // Preserve a failed load across resize; an error must not become "empty".
    if (!root.hasAttribute('aria-busy') && retry.hidden) draw({ preserveFocus: true });
  });
  more.addEventListener('click', () => {
    const old = grid.children.length;
    limit += 6;
    draw();
    grid.children[old]?.querySelector('a')?.focus({ preventScroll: true });
  });
  retry.addEventListener('click', load);
  load();
}
