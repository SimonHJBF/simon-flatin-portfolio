/**
 * build.js — Simon H.J. Bjørkå Flatin portfolio builder
 * ─────────────────────────────────────────────────────
 * Run locally:  node build.js
 * On Netlify:   runs automatically on every push (see netlify.toml)
 *
 * What this generates:
 *   index.html          ← from content/main/  + featured projects
 *   work.html           ← from all projects/YYYY_slug/ folders
 *   about.html          ← from content/about/
 *   services.html       ← from content/services/
 *   projects/[slug]/    ← one folder per project (images stay in YYYY_slug/)
 *
 * To add a new project:
 *   1. Duplicate projects/_TEMPLATE/
 *   2. Rename to  YYYY_my-project-name/
 *   3. Fill in project.txt, add cover.jpg + images
 *   4. Commit & push — done.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT         = __dirname;
const PROJECTS_DIR = path.join(ROOT, 'projects');
const CONTENT_DIR  = path.join(ROOT, 'content');
const IMAGE_EXTS   = new Set(['.jpg','.jpeg','.png','.webp','.gif','.avif']);

// Gradient fallbacks for projects without a cover image
const GRADIENTS = [
  'linear-gradient(135deg,#1a2a3a 0%,#2d4a6b 50%,#8fb3c8 100%)',
  'linear-gradient(135deg,#3d2a1a 0%,#8b6340 50%,#c4a882 100%)',
  'linear-gradient(135deg,#1e2d1a 0%,#3a5c30 50%,#7ea86e 100%)',
  'linear-gradient(135deg,#2a1f1a 0%,#6b4a35 50%,#b08060 100%)',
  'linear-gradient(135deg,#1f2535 0%,#3d4f6b 50%,#8a9bb5 100%)',
  'linear-gradient(135deg,#22301f 0%,#4a6640 50%,#9ab588 100%)',
  'linear-gradient(135deg,#2a1f2d 0%,#5a3f65 50%,#a88bb5 100%)',
  'linear-gradient(135deg,#2d2a1a 0%,#7a6840 50%,#c8b882 100%)',
  'linear-gradient(135deg,#1a2030 0%,#3a4a5a 50%,#8aaabb 100%)',
  'linear-gradient(135deg,#301a14 0%,#7a3a28 50%,#c07055 100%)',
];

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function grad(i) { return GRADIENTS[i % GRADIENTS.length]; }

function findImages(dir) {
  return fs.readdirSync(dir)
    .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .sort();
}

function readFile(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

// ─────────────────────────────────────────────
//  Parsers
// ─────────────────────────────────────────────

/** Parse YYYY_slug folder name → { year, slug } */
function parseFolderName(name) {
  const m = name.match(/^(\d{4})_(.+)$/);
  return m ? { year: m[1], slug: m[2] } : { year: null, slug: name };
}

/** Parse project.txt → data object with .paragraphs[] */
function parseProjectTxt(content) {
  const sep  = content.indexOf('\n---');
  const meta = sep > -1 ? content.slice(0, sep) : content;
  const desc = sep > -1 ? content.slice(sep).replace(/^[\n\-]+\n?/, '').trim() : '';
  const data = {};
  meta.split('\n').forEach(line => {
    const ci = line.indexOf(':');
    if (ci < 1) return;
    const k = line.slice(0, ci).trim().toLowerCase().replace(/\s+/g, '_');
    const v = line.slice(ci + 1).trim();
    if (k && v && !k.startsWith('#')) data[k] = v;
  });
  data.paragraphs = desc
    .split(/\n\n+/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(p => p && !p.startsWith('-') && !p.startsWith('HOW') && !p.startsWith('GRID') && !p.startsWith('─'));
  return data;
}

/** Parse bio.txt → array of paragraph strings */
function parseBioTxt(content) {
  return content.split(/\n\n+/).map(p => p.replace(/\n/g, ' ').trim()).filter(Boolean);
}

/** Parse cv.txt → { experience: [], education: [] } */
function parseCvTxt(content) {
  const result = { experience: [], education: [] };
  const blocks = content.split(/\n(?=\[)/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const typeM = lines[0].match(/^\[(\w+)\]/);
    if (!typeM) continue;
    const type  = typeM[1].toLowerCase();
    const entry = {};
    lines.slice(1).forEach(line => {
      if (line.startsWith('#')) return;
      const ci = line.indexOf(':');
      if (ci < 1) return;
      const k = line.slice(0, ci).trim().toLowerCase();
      const v = line.slice(ci + 1).trim();
      if (k && v) entry[k] = v;
    });
    if (type === 'experience') result.experience.push(entry);
    if (type === 'education')  result.education.push(entry);
  }
  return result;
}

/** Parse services.txt → array of { name, desc } */
function parseServicesTxt(content) {
  const services = [];
  content.split(/\n(?=\[service\])/i).forEach(block => {
    const lines = block.trim().split('\n');
    if (!lines[0].match(/^\[service\]/i)) return;
    const entry = {};
    lines.slice(1).forEach(line => {
      if (line.startsWith('#')) return;
      const ci = line.indexOf(':');
      if (ci < 1) return;
      const k = line.slice(0, ci).trim().toLowerCase();
      const v = line.slice(ci + 1).trim();
      if (k && v) entry[k] = v;
    });
    if (entry.name) services.push(entry);
  });
  return services;
}

/** Parse featured.txt → array of slugs */
function parseFeaturedTxt(content) {
  return content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
}

// ─────────────────────────────────────────────
//  Shared HTML blocks
// ─────────────────────────────────────────────

// Language toggle script (inline, tiny, no flash)
const LANG_SCRIPT = `<script>
  (function(){
    var l=localStorage.getItem('lang')||'en';
    document.documentElement.setAttribute('data-lang',l);
  })();
</script>`;

const LANG_TOGGLE_SCRIPT = `<script>
  document.addEventListener('DOMContentLoaded',function(){
    document.querySelectorAll('.lang-toggle').forEach(function(btn){
      btn.addEventListener('click',function(){
        var cur=document.documentElement.getAttribute('data-lang')||'en';
        var next=cur==='en'?'no':'en';
        document.documentElement.setAttribute('data-lang',next);
        localStorage.setItem('lang',next);
      });
    });
  });
</script>`;

// Language CSS (goes in <head>)
const LANG_CSS = `
  [data-lang="en"] .l-no { display:none }
  [data-lang="no"] .l-en { display:none }`;

function navHtml(prefix) {
  const p = prefix || '';
  return `  <nav class="nav--page">
    <a href="${p}index.html" class="nav__name">Simon H.J. Bj&oslash;rk&aring; Flatin</a>
    <div class="nav__link-row">
      <ul class="nav__links">
        <li><a href="${p}index.html"><span class="l-en">Main</span><span class="l-no">Forside</span></a></li>
        <li><a href="${p}work.html"><span class="l-en">Work</span><span class="l-no">Prosjekter</span></a></li>
        <li><a href="${p}services.html"><span class="l-en">Services</span><span class="l-no">Tjenester</span></a></li>
        <li><a href="${p}about.html"><span class="l-en">About</span><span class="l-no">Om</span></a></li>
        <li><a href="${p}contact.html"><span class="l-en">Contact</span><span class="l-no">Kontakt</span></a></li>
      </ul>
      <button class="lang-toggle" aria-label="Switch language">EN&nbsp;/&nbsp;NO</button>
    </div>
  </nav>`;
}

function footerHtml(prefix) {
  const p = prefix || '';
  return `  <footer>
    <div>&copy; ${new Date().getFullYear()} Simon H.J. Bj&oslash;rk&aring; Flatin</div>
    <div class="footer__links">
      <a href="${p}about.html"><span class="l-en">About</span><span class="l-no">Om</span></a>
      <a href="${p}work.html"><span class="l-en">Work</span><span class="l-no">Prosjekter</span></a>
      <a href="${p}contact.html"><span class="l-en">Contact</span><span class="l-no">Kontakt</span></a>
    </div>
  </footer>`;
}

// ─────────────────────────────────────────────
//  Card HTML helper
// ─────────────────────────────────────────────

const GRID_CLASSES = { large:'card--large', medium:'card--medium', wide:'card--wide', third:'card--third' };
const AUTO_PATTERN = ['card--large','card--medium','card--wide','card--wide','card--third','card--third','card--third'];

function cardHtml(data, index, prefix) {
  const p       = prefix || '';
  const cls     = GRID_CLASSES[(data.grid||'').toLowerCase()] || AUTO_PATTERN[index % AUTO_PATTERN.length];
  const slug    = data.slug;
  const folder  = data._folder; // e.g. 2024_lalibela-modelmaking
  const cover   = data._cover;
  const imgHtml = cover
    ? `<img src="${p}projects/${esc(folder)}/${esc(cover)}" alt="${esc(data.title)}" loading="lazy" />`
    : `<div class="card__placeholder" style="background:${grad(index)};width:100%;height:100%;"></div>`;
  const year    = data.year || '';
  const org     = data.organization || '';
  const sub     = [year, org].filter(Boolean).join(' — ');
  // Comma-separated individual tags for JS filtering
  const cats    = (data.category || '').split('·').map(t => t.trim()).filter(Boolean).join(',');

  return `
      <a class="card ${cls}" href="${p}projects/${esc(slug)}/" data-categories="${esc(cats)}">
        <div class="card__img-wrap">${imgHtml}</div>
        <div class="card__info">
          <div class="card__category">${esc(data.category || '')}</div>
          <div class="card__name">${esc(data.title || slug)}</div>
          ${sub ? `<div class="card__year">${esc(sub)}</div>` : ''}
          <div class="card__arrow">View project &rarr;</div>
        </div>
      </a>`;
}

// ─────────────────────────────────────────────
//  Page generators
// ─────────────────────────────────────────────

function generateProjectPage(data, folderName, images) {
  const slug   = data.slug;
  const title  = data.title || slug.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const cover  = images.find(f => /^cover\./i.test(f)) || images[0] || null;
  const gallery = images.filter(f => f !== cover);
  // Images live in the source folder (YYYY_slug), referenced from the output folder (slug/)
  const imgBase  = `../${folderName}/`;

  function mRow(label, val) {
    if (!val) return '';
    return `\n          <dt>${esc(label)}</dt><dd>${esc(val)}</dd>`;
  }

  const heroHtml = cover
    ? `  <div class="project-hero"><img src="${imgBase}${esc(cover)}" alt="${esc(title)}" loading="eager" /></div>`
    : `  <div class="project-hero project-hero--placeholder" style="background:${grad(0)};"></div>`;

  const galleryHtml = gallery.length
    ? `\n  <div class="project-gallery">\n` +
      gallery.map(img => `    <figure><img src="${imgBase}${esc(img)}" alt="" loading="lazy" /></figure>`).join('\n') +
      `\n  </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)} &mdash; Simon H.J. Bjørkå Flatin</title>
  <link rel="stylesheet" href="../../style.css" />
  <style>
    .project-hero { width:100%; max-height:80vh; overflow:hidden; }
    .project-hero img { width:100%; display:block; max-height:80vh; object-fit:cover; }
    .project-hero--placeholder { height:60vh; }
    .project-body { max-width:1200px; margin:0 auto; padding:4rem 4rem 0;
      display:grid; grid-template-columns:260px 1fr; gap:5rem; }
    .project-meta { display:grid; grid-template-columns:1fr; }
    .project-meta dt { font-size:.68rem; font-weight:700; letter-spacing:.14em;
      text-transform:uppercase; color:var(--muted); padding-top:1.2rem; }
    .project-meta dt:first-child { padding-top:0; }
    .project-meta dd { font-size:.88rem; line-height:1.55; color:var(--accent);
      border-bottom:1px solid rgba(28,28,26,.08); padding-bottom:.8rem; }
    .project-title { font-family:var(--serif); font-size:clamp(1.8rem,3.5vw,2.8rem);
      font-weight:400; line-height:1.2; margin-bottom:2rem; }
    .project-content p { font-size:.95rem; line-height:1.85; color:var(--accent);
      margin-bottom:1.3rem; max-width:620px; }
    .project-back { display:inline-block; margin-top:2.5rem; font-size:.78rem;
      font-weight:700; letter-spacing:.14em; text-transform:uppercase;
      color:var(--muted); text-decoration:none;
      border-bottom:1px solid rgba(107,104,96,.4); padding-bottom:2px;
      transition:color .2s,border-color .2s; }
    .project-back:hover { color:var(--dark); border-color:var(--dark); }
    .project-gallery { max-width:1200px; margin:4rem auto 0; padding:0 4rem;
      display:flex; flex-direction:column; gap:1.5rem; }
    .project-gallery figure { margin:0; }
    .project-gallery img { width:100%; display:block; }
    @media(max-width:800px) {
      .project-body { grid-template-columns:1fr; gap:3rem; padding:3rem 1.5rem 0; }
      .project-gallery { padding:0 1.5rem; }
    }
    ${LANG_CSS}
  </style>
  ${LANG_SCRIPT}
</head>
<body>

${navHtml('../../')}

${heroHtml}

  <div class="project-body">
    <div>
      <dl class="project-meta">${
        mRow('Category',    data.category) +
        mRow('Year',        data.year) +
        mRow('Location',    data.location) +
        mRow('Typology',    data.typology) +
        mRow('Size',        data.size) +
        mRow('Status',      data.status) +
        mRow('Client',      data.client) +
        mRow('Collaborators', data.collaborators) +
        mRow('Exhibitions', data.exhibitions)
      }
      </dl>
    </div>
    <div class="project-content">
      <h1 class="project-title">${esc(title)}</h1>
      ${data.paragraphs.map(p => `<p>${esc(p)}</p>`).join('\n      ')}
      <a href="../../work.html" class="project-back"><span class="l-en">&larr; All work</span><span class="l-no">&larr; Alle prosjekter</span></a>
    </div>
  </div>
${galleryHtml}

${footerHtml('../../')}
${LANG_TOGGLE_SCRIPT}
</body>
</html>
`;
}

function generateWorkPage(projects) {
  const cards = projects.map((d, i) => cardHtml(d, i, '')).join('');

  // Collect unique individual category tags (sorted alphabetically)
  const tagSet = new Set();
  projects.forEach(p => {
    (p.category || '').split('·').map(t => t.trim()).filter(Boolean).forEach(t => tagSet.add(t));
  });
  const filterTags = ['All', ...Array.from(tagSet).sort()];
  const filterBtns = filterTags.map(tag =>
    `<button class="work-filter-btn${tag === 'All' ? ' active' : ''}" data-filter="${esc(tag)}">${esc(tag)}</button>`
  ).join('\n      ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Work &mdash; Simon H.J. Bj&oslash;rk&aring; Flatin</title>
  <link rel="stylesheet" href="style.css" />
  <style>
    .work-intro { max-width:1400px; margin:0 auto; padding:4rem 4rem 2rem;
      display:flex; align-items:baseline; gap:1.4rem; }
    .work-filters { max-width:1400px; margin:0 auto; padding:0 4rem 2.5rem;
      display:flex; flex-wrap:wrap; gap:0.4rem 1.4rem;
      border-bottom:1px solid rgba(28,28,26,.1); }
    .work-filter-btn { background:none; border:none; cursor:pointer;
      font-size:0.68rem; font-weight:700; letter-spacing:0.18em;
      text-transform:uppercase; color:var(--muted); padding:0.2rem 0;
      font-family:var(--sans); border-bottom:1.5px solid transparent;
      transition:color 0.2s, border-color 0.2s; }
    .work-filter-btn:hover { color:var(--dark); }
    .work-filter-btn.active { color:var(--dark); border-bottom-color:var(--dark); }
    .work-grid  { max-width:1400px; margin:0 auto; padding:4rem 4rem 0; }
    @media(max-width:900px) {
      .work-intro, .work-filters, .work-grid { padding-left:1.5rem; padding-right:1.5rem; }
    }
    ${LANG_CSS}
  </style>
  ${LANG_SCRIPT}
</head>
<body>

${navHtml()}

  <div class="work-intro">
    <span class="section-label"><span class="l-en">Portfolio</span><span class="l-no">Portefølje</span></span>
    <h1 class="section-title"><span class="l-en">All Work</span><span class="l-no">Alle prosjekter</span></h1>
  </div>

  <div class="work-filters">
      ${filterBtns}
  </div>

  <div class="work-grid">
    <div class="projects" id="work-projects">
${cards}
    </div>
  </div>

${footerHtml()}
  <script>
    (function(){
      var btns  = document.querySelectorAll('.work-filter-btn');
      var cards = document.querySelectorAll('#work-projects .card');
      btns.forEach(function(btn){
        btn.addEventListener('click', function(){
          btns.forEach(function(b){ b.classList.remove('active'); });
          btn.classList.add('active');
          var filter = btn.dataset.filter;
          cards.forEach(function(card){
            if(filter === 'All'){
              card.style.display = '';
            } else {
              var cats = card.dataset.categories ? card.dataset.categories.split(',') : [];
              card.style.display = cats.indexOf(filter) > -1 ? '' : 'none';
            }
          });
        });
      });
    })();
  </script>
${LANG_TOGGLE_SCRIPT}
</body>
</html>
`;
}

function generateIndexPage(allProjects, featuredSlugs) {
  // Match featured slugs to project data (in order)
  const featuredProjects = featuredSlugs
    .map(slug => allProjects.find(p => p.slug === slug))
    .filter(Boolean)
    .slice(0, 4);

  // Use fixed grid sizes for the 4 featured slots
  const featuredGrids = ['card--large','card--medium','card--wide','card--wide'];

  const cards = featuredProjects.map((data, i) => {
    const cls     = featuredGrids[i] || 'card--wide';
    const folder  = data._folder;
    const cover   = data._cover;
    const imgHtml = cover
      ? `<img src="projects/${esc(folder)}/${esc(cover)}" alt="${esc(data.title)}" loading="eager" />`
      : `<div class="card__placeholder" style="background:${grad(i)};width:100%;height:100%;"></div>`;
    const sub = [data.year, data.organization].filter(Boolean).join(' — ');

    return `
      <a class="card ${cls}" href="projects/${esc(data.slug)}/">
        <div class="card__img-wrap">${imgHtml}</div>
        <div class="card__info">
          <div class="card__category">${esc(data.category || '')}</div>
          <div class="card__name">${esc(data.title || data.slug)}</div>
          ${sub ? `<div class="card__year">${esc(sub)}</div>` : ''}
          <div class="card__arrow">View project &rarr;</div>
        </div>
      </a>`;
  }).join('');

  // Check for hero video first, then image, then gradient fallback
  const mainDir      = path.join(CONTENT_DIR, 'main');
  const heroVideoFile = fs.existsSync(mainDir)
    ? fs.readdirSync(mainDir).find(f => /\.(mp4|webm)$/i.test(f))
    : null;
  const heroImgFile = !heroVideoFile && fs.existsSync(mainDir)
    ? findImages(mainDir).find(f => /^(hero|cover)\./i.test(f))
    : null;

  const heroBg = heroImgFile
    ? `background: url('content/main/${heroImgFile}') center/cover no-repeat;`
    : heroVideoFile ? ''
    : `background: linear-gradient(160deg, #2d3d2e 0%, #4a6741 35%, #7a9e6e 60%, #c9d9b8 100%);`;

  const heroBgHtml = heroVideoFile
    ? `<video class="hero__bg" autoplay muted loop playsinline>
      <source src="content/main/${heroVideoFile}" type="video/${heroVideoFile.endsWith('.webm') ? 'webm' : 'mp4'}" />
    </video>`
    : `<div class="hero__bg"></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Simon H.J. Bj&oslash;rk&aring; Flatin &mdash; Architect &amp; Designer</title>
  <link rel="stylesheet" href="style.css" />
  <style>
    .hero { position:relative; width:100%; height:100vh; overflow:hidden; }
    .hero__bg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; ${heroBg} }
    .hero__overlay { position:absolute; inset:0;
      background:linear-gradient(to bottom,rgba(0,0,0,.08) 0%,rgba(0,0,0,.32) 100%); }
    .hero__scroll-cue { position:absolute; bottom:2.2rem; left:50%;
      transform:translateX(-50%); display:flex; flex-direction:column;
      align-items:center; gap:.6rem; color:rgba(255,255,255,.65);
      font-size:.65rem; letter-spacing:.2em; text-transform:uppercase; }
    .featured { max-width:1400px; margin:0 auto; padding:6rem 4rem 0; }
    .featured__header { display:flex; align-items:baseline; gap:1.4rem; margin-bottom:4rem; }
    .all-work { margin-top:4rem; text-align:right; }
    .all-work a { font-size:.78rem; font-weight:700; letter-spacing:.16em;
      text-transform:uppercase; color:var(--dark); text-decoration:none;
      border-bottom:1.5px solid var(--dark); padding-bottom:2px;
      transition:color .2s,border-color .2s; }
    .all-work a:hover { color:var(--muted); border-color:var(--muted); }
    @media(max-width:900px) { .featured { padding:3rem 1.5rem 0; } }
    ${LANG_CSS}
    /* lang-toggle hero styles handled in style.css */
  </style>
  ${LANG_SCRIPT}
</head>
<body>

  <section class="hero">
    ${heroBgHtml}
    <div class="hero__overlay"></div>
    <nav class="nav--hero">
      <a href="index.html" class="nav__name">Simon H.J. Bj&oslash;rk&aring; Flatin</a>
      <div class="nav__link-row">
        <ul class="nav__links">
          <li><a href="index.html"><span class="l-en">Main</span><span class="l-no">Forside</span></a></li>
          <li><a href="work.html"><span class="l-en">Work</span><span class="l-no">Prosjekter</span></a></li>
          <li><a href="services.html"><span class="l-en">Services</span><span class="l-no">Tjenester</span></a></li>
          <li><a href="about.html"><span class="l-en">About</span><span class="l-no">Om</span></a></li>
          <li><a href="contact.html"><span class="l-en">Contact</span><span class="l-no">Kontakt</span></a></li>
        </ul>
        <button class="lang-toggle" aria-label="Switch language">EN&nbsp;/&nbsp;NO</button>
      </div>
    </nav>
    <div class="hero__scroll-cue">
      <span class="l-en">Scroll</span><span class="l-no">Rull</span>
      <span class="hero__scroll-arrow" aria-hidden="true"></span>
    </div>
  </section>

  <section class="featured">
    <div class="featured__header">
      <span class="section-label"><span class="l-en">Selected Work</span><span class="l-no">Utvalgte prosjekter</span></span>
      <h2 class="section-title"><span class="l-en">Signature Projects</span><span class="l-no">Signaturprosjekter</span></h2>
    </div>
    <div class="projects">
${cards}
    </div>
    <div class="all-work"><a href="work.html"><span class="l-en">See all work</span><span class="l-no">Se alle prosjekter</span></a></div>
  </section>

${footerHtml()}
${LANG_TOGGLE_SCRIPT}
</body>
</html>
`;
}

function generateAboutPage(paragraphs, cv) {
  // Check for portrait
  const aboutDir    = path.join(CONTENT_DIR, 'about');
  const portraitFile = fs.existsSync(aboutDir)
    ? findImages(aboutDir).find(f => /portrait|photo|headshot/i.test(f))
    : null;

  const bioHtml = paragraphs.map(p => `        <p>${esc(p)}</p>`).join('\n');

  const photoHtml = portraitFile
    ? `<img src="content/about/${portraitFile}" alt="Simon H.J. Bjørkå Flatin" />`
    : `<div style="width:100%;max-width:320px;aspect-ratio:3/4;background:linear-gradient(160deg,#d4c9b8,#b8aa98);"></div>`;

  function cvEntry(e) {
    return `
          <div class="cv-entry">
            <div class="cv-entry__period">${esc(e.period||'')}</div>
            <div class="cv-entry__role">${esc(e.role||'')}</div>
            <div class="cv-entry__org">${esc(e.org||'')}</div>
            ${e.location ? `<div class="cv-entry__location">${esc(e.location)}</div>` : ''}
            ${e.desc ? `<div class="cv-entry__desc">${esc(e.desc)}</div>` : ''}
          </div>`;
  }

  const expHtml = cv.experience.map(cvEntry).join('');
  const eduHtml = cv.education.map(cvEntry).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>About &mdash; Simon H.J. Bjørkå Flatin</title>
  <link rel="stylesheet" href="style.css" />
  <style>
    .about-body { max-width:1400px; margin:0 auto; padding:5rem 4rem 0;
      display:grid; grid-template-columns:1fr 1fr; gap:5rem; }
    .about-bio__label { font-size:.72rem; font-weight:700; letter-spacing:.22em;
      text-transform:uppercase; color:var(--muted); margin-bottom:1.5rem; }
    .about-bio__name { font-family:var(--serif); font-size:clamp(2rem,3.5vw,2.8rem);
      font-weight:400; line-height:1.15; margin-bottom:2.5rem; }
    .about-bio__text p { font-size:.92rem; line-height:1.85; color:var(--accent);
      margin-bottom:1.4rem; }
    .about-photo { margin-top:3rem; }
    .about-photo img { width:100%; max-width:380px; display:block; object-fit:cover; }
    .about-photo__caption { font-size:.72rem; color:var(--muted); margin-top:.75rem; }
    .cv-label { font-size:.72rem; font-weight:700; letter-spacing:.22em;
      text-transform:uppercase; color:var(--muted); margin-bottom:1.5rem; }
    .cv-section { margin-bottom:3.5rem; }
    .cv-section__title { font-size:.78rem; font-weight:700; letter-spacing:.16em;
      text-transform:uppercase; color:var(--dark);
      border-bottom:1px solid rgba(28,28,26,.12); padding-bottom:.75rem; margin-bottom:1.5rem; }
    .cv-entry { margin-bottom:2rem; }
    .cv-entry__period { font-size:.72rem; font-weight:700; letter-spacing:.1em;
      text-transform:uppercase; color:var(--muted); margin-bottom:.3rem; }
    .cv-entry__role { font-family:var(--serif); font-size:1rem;
      font-weight:400; color:var(--dark); margin-bottom:.2rem; }
    .cv-entry__org { font-size:.82rem; color:var(--accent); margin-bottom:.15rem; }
    .cv-entry__location { font-size:.78rem; color:var(--muted); margin-bottom:.6rem; }
    .cv-entry__desc { font-size:.82rem; line-height:1.7; color:var(--muted); }
    @media(max-width:1000px) {
      .about-body { grid-template-columns:1fr; gap:4rem; padding:3rem 1.5rem 0; }
    }
    ${LANG_CSS}
  </style>
  ${LANG_SCRIPT}
</head>
<body>

${navHtml()}

  <div class="about-body">
    <div class="about-bio">
      <div class="about-bio__label"><span class="l-en">About</span><span class="l-no">Om</span></div>
      <h1 class="about-bio__name">Simon H.J.<br>Bj&oslash;rk&aring; Flatin</h1>
      <div class="about-bio__text">
${bioHtml}
      </div>
      <div class="about-photo">
        ${photoHtml}
        <div class="about-photo__caption">Oslo fjord, Norway</div>
      </div>
    </div>

    <div class="about-cv">
      <div class="cv-label">CV</div>
      ${expHtml.trim() ? `<div class="cv-section">
        <div class="cv-section__title"><span class="l-en">Working Experience</span><span class="l-no">Arbeidserfaring</span></div>${expHtml}
      </div>` : ''}
      ${eduHtml.trim() ? `<div class="cv-section">
        <div class="cv-section__title"><span class="l-en">Education</span><span class="l-no">Utdanning</span></div>${eduHtml}
      </div>` : ''}
    </div>
  </div>

${footerHtml()}
${LANG_TOGGLE_SCRIPT}
</body>
</html>
`;
}

function generateServicesPage(services) {
  // Check for hero image
  const servDir     = path.join(CONTENT_DIR, 'services');
  const heroFile    = fs.existsSync(servDir)
    ? findImages(servDir).find(f => f.toLowerCase().startsWith('hero'))
    : null;

  const heroBg = heroFile
    ? `background: url('content/services/${heroFile}') center/cover no-repeat;`
    : `background: linear-gradient(160deg, #1a2535 0%, #2d4058 40%, #8aaabb 100%);`;

  const serviceItems = services.map((s, i) => {
    const num = String(i + 1).padStart(2, '0');
    return `
      <div class="service-item">
        <button class="service-toggle" aria-expanded="false">
          <span class="service-num">${num}</span>
          <span class="service-name">${esc(s.name)}</span>
          <span class="service-icon">+</span>
        </button>
        <div class="service-body"><p>${esc(s.desc || '')}</p></div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Services &mdash; Simon H.J. Bj&oslash;rk&aring; Flatin</title>
  <link rel="stylesheet" href="style.css" />
  <style>
    .services-hero { position:relative; height:50vh; min-height:320px; overflow:hidden; }
    .services-hero__bg { width:100%; height:100%; ${heroBg} }
    .services-hero__overlay { position:absolute; inset:0; background:rgba(0,0,0,.35); }
    .services-hero__text { position:absolute; bottom:3rem; left:50%;
      transform:translateX(-50%); text-align:center; color:#fff; width:90%; max-width:700px; }
    .services-hero__text h1 { font-family:var(--serif);
      font-size:clamp(1.6rem,3.5vw,2.6rem); font-weight:400; line-height:1.3; }
    .services-body { max-width:900px; margin:0 auto; padding:5rem 4rem 0; }
    .services-intro { margin-bottom:4rem; }
    .services-intro p { font-size:1.05rem; line-height:1.8; color:var(--accent); max-width:640px; }
    .services-label { font-size:.72rem; font-weight:700; letter-spacing:.22em;
      text-transform:uppercase; color:var(--muted); margin-bottom:2.5rem; }
    .service-item { border-top:1px solid rgba(28,28,26,.12); }
    .service-item:last-child { border-bottom:1px solid rgba(28,28,26,.12); }
    .service-toggle { width:100%; background:none; border:none; cursor:pointer;
      padding:1.6rem 0; display:flex; justify-content:space-between;
      align-items:center; gap:1rem; text-align:left; }
    .service-num { font-size:.72rem; font-weight:700; letter-spacing:.12em;
      color:var(--muted); min-width:2rem; }
    .service-name { font-family:var(--serif); font-size:clamp(1rem,1.6vw,1.25rem);
      font-weight:400; color:var(--accent); flex:1; transition:color .2s; }
    .service-icon { font-size:1.2rem; color:var(--muted);
      transition:transform .3s,color .2s; flex-shrink:0; }
    .service-item.open .service-icon { transform:rotate(45deg); color:var(--dark); }
    .service-item.open .service-name { color:var(--dark); }
    .service-body { max-height:0; overflow:hidden;
      transition:max-height .4s ease,padding .3s ease; padding:0 0 0 2rem; }
    .service-item.open .service-body { max-height:400px; padding:0 0 1.8rem 2rem; }
    .service-body p { font-size:.9rem; line-height:1.75; color:var(--muted); max-width:580px; }
    .contact-cta { max-width:900px; margin:5rem auto 0; padding:4rem 4rem 0;
      border-top:1px solid rgba(28,28,26,.12);
      display:flex; justify-content:space-between; align-items:center;
      flex-wrap:wrap; gap:2rem; }
    .contact-cta__text h2 { font-family:var(--serif);
      font-size:clamp(1.4rem,2.5vw,2rem); font-weight:400; margin-bottom:.5rem; }
    .contact-cta__text p { font-size:.88rem; color:var(--muted); }
    .contact-cta__link { display:inline-block; font-size:.78rem; font-weight:700;
      letter-spacing:.16em; text-transform:uppercase; color:var(--dark);
      text-decoration:none; border-bottom:1.5px solid var(--dark); padding-bottom:2px;
      transition:color .2s,border-color .2s; }
    .contact-cta__link:hover { color:var(--muted); border-color:var(--muted); }
    @media(max-width:900px) {
      .services-body, .contact-cta { padding-left:1.5rem; padding-right:1.5rem; }
      .service-body, .service-item.open .service-body { padding-left:1rem; }
    }
    ${LANG_CSS}
  </style>
  ${LANG_SCRIPT}
</head>
<body>

${navHtml()}

  <div class="services-hero">
    <div class="services-hero__bg"></div>
    <div class="services-hero__overlay"></div>
    <div class="services-hero__text">
      <h1>
        <span class="l-en">Crafting Places that Echo Mountains,<br>Rivers &amp; the Spaces Between</span>
        <span class="l-no">Skaper steder som gjenspeiler fjell,<br>elver og rommene imellom</span>
      </h1>
    </div>
  </div>

  <div class="services-body">
    <div class="services-intro">
      <p class="l-en">My practice is a dialogue between two worlds: the crisp Nordic light that shaped my childhood and the layered landscapes where I now design. I read terrain first &mdash; through drone photogrammetry, hand sketches or a block of clay &mdash; then guide projects from concept through construction. The goal: architecture that matures gracefully, treads lightly and feels inevitable in its setting.</p>
      <p class="l-no">Min praksis er en dialog mellom to verdener: det klare nordiske lyset som formet barndommen min, og de lagdelte landskapene der jeg nå designer. Jeg leser terrenget først &mdash; gjennom dronebasert fotogrammetri, håndskisser eller en klump leire &mdash; og leder deretter prosjekter fra konsept til ferdigstillelse. Målet: arkitektur som modnes med verdighet, trår lett og virker uunngåelig i sin setting.</p>
    </div>
    <div class="services-label"><span class="l-en">Services</span><span class="l-no">Tjenester</span></div>
    <div class="services-list">
${serviceItems}
    </div>
  </div>

  <div class="contact-cta">
    <div class="contact-cta__text">
      <h2><span class="l-en">Let&rsquo;s work together</span><span class="l-no">La oss samarbeide</span></h2>
      <p><span class="l-en">Available for commissions, collaborations and consultations.</span><span class="l-no">Tilgjengelig for oppdrag, samarbeid og konsultasjoner.</span></p>
    </div>
    <a href="contact.html" class="contact-cta__link"><span class="l-en">Get in touch &rarr;</span><span class="l-no">Ta kontakt &rarr;</span></a>
  </div>

${footerHtml()}

  <script>
    document.querySelectorAll('.service-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const item   = btn.closest('.service-item');
        const isOpen = item.classList.contains('open');
        document.querySelectorAll('.service-item').forEach(i => {
          i.classList.remove('open');
          i.querySelector('.service-toggle').setAttribute('aria-expanded','false');
        });
        if (!isOpen) { item.classList.add('open'); btn.setAttribute('aria-expanded','true'); }
      });
    });
  </script>
${LANG_TOGGLE_SCRIPT}
</body>
</html>
`;
}

function generateContactPage() {
  return `<!DOCTYPE html>
<html lang="en" data-lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><span class="l-en">Contact</span><span class="l-no">Kontakt</span> &mdash; Simon H.J. Bj&oslash;rk&aring; Flatin</title>
  <link rel="stylesheet" href="style.css" />
  <style>${LANG_CSS}
    .contact-wrap { max-width:900px; margin:0 auto; padding:5rem 4rem 0;
      display:grid; grid-template-columns:1fr 1.4fr; gap:5rem; }
    .contact-info__label { font-size:.72rem; font-weight:700; letter-spacing:.22em;
      text-transform:uppercase; color:var(--muted); margin-bottom:1.5rem; }
    .contact-info__name { font-family:var(--serif); font-size:clamp(1.8rem,3vw,2.4rem);
      font-weight:400; line-height:1.2; margin-bottom:2rem; }
    .contact-info__text { font-size:.9rem; line-height:1.85; color:var(--accent);
      margin-bottom:2rem; }
    .contact-info__detail { display:flex; flex-direction:column; gap:.6rem;
      font-size:.85rem; color:var(--muted); }
    .contact-info__detail a { color:var(--dark); text-decoration:none;
      border-bottom:1px solid rgba(28,28,26,.2); padding-bottom:1px;
      transition:border-color .2s; }
    .contact-info__detail a:hover { border-color:var(--dark); }
    .contact-form label { display:block; font-size:.68rem; font-weight:700;
      letter-spacing:.16em; text-transform:uppercase; color:var(--muted);
      margin-bottom:.5rem; margin-top:1.8rem; }
    .contact-form label:first-of-type { margin-top:0; }
    .contact-form input, .contact-form textarea {
      width:100%; box-sizing:border-box;
      background:rgba(28,28,26,.04); border:1px solid rgba(28,28,26,.15);
      border-radius:2px; padding:.75rem 1rem; font-size:.9rem;
      font-family:var(--sans); color:var(--dark);
      transition:border-color .2s, background .2s; }
    .contact-form input:focus, .contact-form textarea:focus {
      outline:none; border-color:var(--dark); background:#fff; }
    .contact-form textarea { min-height:160px; resize:vertical; }
    .contact-form__honeypot { display:none; }
    .contact-form__submit { margin-top:2rem; display:flex;
      align-items:center; gap:1.5rem; flex-wrap:wrap; }
    .contact-form__btn { background:var(--dark); color:#fff;
      border:none; padding:.9rem 2.2rem; font-size:.78rem; font-weight:700;
      letter-spacing:.16em; text-transform:uppercase; cursor:pointer;
      transition:background .2s; }
    .contact-form__btn:hover { background:var(--muted); }
    .contact-form__note { font-size:.75rem; color:var(--muted); }
    .contact-success { display:none; padding:1.5rem; background:rgba(61,59,53,.06);
      border-left:3px solid var(--dark); font-size:.9rem; color:var(--accent);
      margin-top:1.5rem; }
    @media(max-width:800px) {
      .contact-wrap { grid-template-columns:1fr; gap:3rem; padding:3rem 1.5rem 0; }
    }
  </style>
  ${LANG_SCRIPT}
</head>
<body>

${navHtml()}

  <div class="contact-wrap">
    <div class="contact-info">
      <div class="contact-info__label"><span class="l-en">Contact</span><span class="l-no">Kontakt</span></div>
      <h1 class="contact-info__name">
        <span class="l-en">Let&rsquo;s work<br>together</span>
        <span class="l-no">La oss<br>samarbeide</span>
      </h1>
      <p class="contact-info__text">
        <span class="l-en">Available for architectural commissions, research collaborations, modelmaking and consultancy. Based in Oslo, working across Norway, the Netherlands and beyond.</span>
        <span class="l-no">Tilgjengelig for arkitektoppdrag, forskningssamarbeid, modellbygging og rådgivning. Basert i Oslo, med oppdrag i Norge, Nederland og internasjonalt.</span>
      </p>
      <div class="contact-info__detail">
        <a href="mailto:simon@bjorkaflatin.com">simon@bjorkaflatin.com</a>
      </div>
    </div>

    <div class="contact-form-wrap">
      <form name="contact" method="POST" data-netlify="true" netlify-honeypot="bot-field" class="contact-form">
        <input type="hidden" name="form-name" value="contact" />
        <p class="contact-form__honeypot">
          <label>Don&rsquo;t fill this in: <input name="bot-field" /></label>
        </p>

        <label for="name"><span class="l-en">Name</span><span class="l-no">Navn</span></label>
        <input type="text" id="name" name="name" required autocomplete="name"
          placeholder="Your name" />

        <label for="email"><span class="l-en">Email</span><span class="l-no">E-post</span></label>
        <input type="email" id="email" name="email" required autocomplete="email"
          placeholder="your@email.com" />

        <label for="subject"><span class="l-en">Subject</span><span class="l-no">Emne</span></label>
        <input type="text" id="subject" name="subject"
          placeholder="e.g. Commission inquiry" />

        <label for="message"><span class="l-en">Message</span><span class="l-no">Melding</span></label>
        <textarea id="message" name="message" required
          placeholder="Tell me about your project or question..."></textarea>

        <div class="contact-form__submit">
          <button type="submit" class="contact-form__btn">
            <span class="l-en">Send message</span>
            <span class="l-no">Send melding</span>
          </button>
          <span class="contact-form__note">
            <span class="l-en">I usually reply within 2 business days.</span>
            <span class="l-no">Jeg svarer vanligvis innen 2 arbeidsdager.</span>
          </span>
        </div>
      </form>
    </div>
  </div>

${footerHtml()}
${LANG_TOGGLE_SCRIPT}
</body>
</html>
`;
}

// ─────────────────────────────────────────────
//  Main build
// ─────────────────────────────────────────────

function build() {
  console.log('\n── Simon Flatin Portfolio Builder ──\n');

  // 1. Load all projects
  if (!fs.existsSync(PROJECTS_DIR)) {
    console.log('No projects/ directory — skipping project build.');
  }

  const projects = [];
  const dirs = fs.existsSync(PROJECTS_DIR)
    ? fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('_'))
        .map(d => d.name)
    : [];

  for (const folderName of dirs) {
    const sourceDir = path.join(PROJECTS_DIR, folderName);
    const txtPath   = path.join(sourceDir, 'project.txt');
    if (!fs.existsSync(txtPath)) { console.warn(`  skip  ${folderName}/ — no project.txt`); continue; }

    const { year: folderYear, slug } = parseFolderName(folderName);
    const content = fs.readFileSync(txtPath, 'utf8');
    const data    = parseProjectTxt(content);
    data.slug     = slug;
    data._folder  = folderName;
    if (!data.year && folderYear) data.year = folderYear;
    if (!data.title) data.title = slug.replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase());

    const images   = findImages(sourceDir);
    data._cover    = images.find(f => /^cover\./i.test(f)) || images[0] || null;

    // Write project detail page to projects/[slug]/index.html
    const html      = generateProjectPage(data, folderName, images);
    const outputDir = path.join(PROJECTS_DIR, slug);
    writeFile(path.join(outputDir, 'index.html'), html);
    console.log(`  built projects/${slug}/  ← ${folderName}/`);

    projects.push(data);
  }

  // Sort newest first
  projects.sort((a, b) => parseInt(b.year || 0) - parseInt(a.year || 0));

  // 2. Generate work.html
  writeFile(path.join(ROOT, 'work.html'), generateWorkPage(projects));
  console.log(`  built work.html  (${projects.length} projects)`);

  // 3. Generate index.html
  const featuredPath = path.join(CONTENT_DIR, 'main', 'featured.txt');
  const featuredSlugs = featuredPath && fs.existsSync(featuredPath)
    ? parseFeaturedTxt(fs.readFileSync(featuredPath, 'utf8'))
    : projects.slice(0, 4).map(p => p.slug);
  writeFile(path.join(ROOT, 'index.html'), generateIndexPage(projects, featuredSlugs));
  console.log(`  built index.html`);

  // 4. Generate about.html
  const bioTxt  = readFile(path.join(CONTENT_DIR, 'about', 'bio.txt')) || 'Bio coming soon.';
  const cvTxt   = readFile(path.join(CONTENT_DIR, 'about', 'cv.txt'))  || '';
  const bio     = parseBioTxt(bioTxt);
  const cv      = parseCvTxt(cvTxt);
  writeFile(path.join(ROOT, 'about.html'), generateAboutPage(bio, cv));
  console.log(`  built about.html`);

  // 5. Generate services.html
  const servicesTxt = readFile(path.join(CONTENT_DIR, 'services', 'services.txt')) || '';
  const services    = parseServicesTxt(servicesTxt);
  writeFile(path.join(ROOT, 'services.html'), generateServicesPage(services));
  console.log(`  built services.html`);

  // 6. Generate contact.html
  writeFile(path.join(ROOT, 'contact.html'), generateContactPage());
  console.log(`  built contact.html`);

  console.log(`\n── Build complete. ${projects.length} project(s). ──\n`);
}

build();
