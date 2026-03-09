/**
 * build.js — Simon H.J. Bjørkå Flatin portfolio builder
 *
 * Run with: node build.js
 *
 * How to add a new project:
 *  1. Create a folder in /projects/ — e.g. projects/my-new-project/
 *  2. Add a project.txt file with your metadata and description
 *  3. Add images (cover.jpg is used as the hero, the rest as gallery)
 *  4. Commit and push — Netlify will run this script and publish automatically
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT         = __dirname;
const PROJECTS_DIR = path.join(ROOT, 'projects');
const IMAGE_EXTS   = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/** Parse a project.txt file into a data object */
function parseProjectTxt(content) {
  const sep = content.indexOf('\n---');
  const metaBlock = sep > -1 ? content.slice(0, sep) : content;
  const descBlock = sep > -1 ? content.slice(sep).replace(/^\n---+\n?/, '').trim() : '';

  const data = {};
  metaBlock.split('\n').forEach(line => {
    const colon = line.indexOf(':');
    if (colon < 1) return;
    const key = line.slice(0, colon).trim().toLowerCase().replace(/\s+/g, '_');
    const val = line.slice(colon + 1).trim();
    if (key && val) data[key] = val;
  });

  data.description_raw = descBlock;
  data.paragraphs = descBlock
    .split(/\n\n+/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(Boolean);

  return data;
}

/** Find all image files in a directory, sorted alphabetically */
function findImages(dir) {
  return fs.readdirSync(dir)
    .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .sort();
}

/** Escape HTML entities */
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build a <dt>/<dd> metadata row, or nothing if value is empty */
function metaRow(label, value) {
  if (!value) return '';
  return `
          <dt>${esc(label)}</dt>
          <dd>${esc(value)}</dd>`;
}

// ─────────────────────────────────────────────
//  Nav + Footer snippets (shared)
// ─────────────────────────────────────────────

const NAV = `  <nav class="nav--page">
    <a href="../../index.html" class="nav__name">Simon H.J. Bjørkå Flatin</a>
    <ul class="nav__links">
      <li><a href="../../index.html">Main</a></li>
      <li><a href="../../work.html">Work</a></li>
      <li><a href="../../services.html">Services</a></li>
      <li><a href="../../about.html">About</a></li>
    </ul>
  </nav>`;

const FOOTER = `  <footer>
    <div>© 2026 Simon H.J. Bjørkå Flatin</div>
    <div class="footer__links">
      <a href="../../about.html">About</a>
      <a href="../../work.html">Work</a>
      <a href="../../services.html">Services</a>
    </div>
  </footer>`;

// ─────────────────────────────────────────────
//  Generate a single project detail page
// ─────────────────────────────────────────────

function generateProjectPage(slug, data, images) {
  const title     = data.title || slug;
  const coverFile = images.find(f => /^cover\./i.test(f)) || images[0] || null;
  const gallery   = images.filter(f => f !== coverFile);

  const heroHtml = coverFile
    ? `  <div class="project-hero">
    <img src="${esc(coverFile)}" alt="${esc(title)}" loading="eager" />
  </div>`
    : `  <div class="project-hero project-hero--placeholder"></div>`;

  const metaHtml = `
        <dl class="project-meta">
          ${metaRow('Category',      data.category)}
          ${metaRow('Year',          data.year)}
          ${metaRow('Location',      data.location)}
          ${metaRow('Typology',      data.typology)}
          ${metaRow('Size',          data.size)}
          ${metaRow('Status',        data.status)}
          ${metaRow('Collaborators', data.collaborators)}
          ${metaRow('Exhibitions',   data.exhibitions)}
          ${metaRow('Client',        data.client)}
        </dl>`;

  const descHtml = data.paragraphs.length
    ? data.paragraphs.map(p => `          <p>${esc(p)}</p>`).join('\n')
    : '';

  const galleryHtml = gallery.length
    ? `\n  <div class="project-gallery">\n` +
      gallery.map(img =>
        `    <div class="project-gallery__item">\n      <img src="${esc(img)}" alt="${esc(title)}" loading="lazy" />\n    </div>`
      ).join('\n') +
      `\n  </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)} — Simon H.J. Bjørkå Flatin</title>
  <link rel="stylesheet" href="../../style.css" />
  <style>
    .project-hero {
      width: 100%;
      max-height: 80vh;
      overflow: hidden;
    }
    .project-hero img {
      width: 100%; display: block;
      max-height: 80vh; object-fit: cover;
    }
    .project-hero--placeholder {
      height: 60vh;
      background: linear-gradient(160deg, #2a2a28 0%, #4a4a44 100%);
    }
    .project-body {
      max-width: 1200px;
      margin: 0 auto;
      padding: 4rem 4rem 0;
      display: grid;
      grid-template-columns: 260px 1fr;
      gap: 5rem;
    }
    .project-meta {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0;
    }
    .project-meta dt {
      font-size: 0.68rem; font-weight: 700;
      letter-spacing: 0.14em; text-transform: uppercase;
      color: var(--muted);
      padding-top: 1.2rem;
      margin-top: 0.2rem;
    }
    .project-meta dd {
      font-size: 0.88rem;
      line-height: 1.55;
      color: var(--accent);
      border-bottom: 1px solid rgba(28,28,26,0.08);
      padding-bottom: 1rem;
    }
    .project-meta dt:first-child { padding-top: 0; margin-top: 0; }
    .project-content { }
    .project-title {
      font-family: var(--serif);
      font-size: clamp(1.8rem, 3.5vw, 2.8rem);
      font-weight: 400;
      line-height: 1.2;
      margin-bottom: 2rem;
    }
    .project-content p {
      font-size: 0.95rem;
      line-height: 1.85;
      color: var(--accent);
      margin-bottom: 1.3rem;
      max-width: 620px;
    }
    .project-content p:last-child { margin-bottom: 0; }
    .project-back {
      display: inline-block;
      margin-top: 2.5rem;
      font-size: 0.78rem; font-weight: 700;
      letter-spacing: 0.14em; text-transform: uppercase;
      color: var(--muted); text-decoration: none;
      border-bottom: 1px solid rgba(107,104,96,0.4);
      padding-bottom: 2px;
      transition: color 0.2s, border-color 0.2s;
    }
    .project-back:hover { color: var(--dark); border-color: var(--dark); }
    .project-gallery {
      max-width: 1200px;
      margin: 4rem auto 0;
      padding: 0 4rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .project-gallery__item img {
      width: 100%; display: block;
    }
    @media (max-width: 800px) {
      .project-body { grid-template-columns: 1fr; gap: 3rem; padding: 3rem 1.5rem 0; }
      .project-gallery { padding: 0 1.5rem; }
    }
  </style>
</head>
<body>

${NAV}

${heroHtml}

  <div class="project-body">
    <div>${metaHtml}
    </div>
    <div class="project-content">
      <h1 class="project-title">${esc(title)}</h1>
${descHtml}
      <a href="../../work.html" class="project-back">← All work</a>
    </div>
  </div>
${galleryHtml}

${FOOTER}

</body>
</html>
`;
}

// ─────────────────────────────────────────────
//  Determine grid size class for a project card
// ─────────────────────────────────────────────

const GRID_CLASSES = {
  large: 'card--large', medium: 'card--medium',
  wide:  'card--wide',  third:  'card--third',
};

function gridClass(data, index) {
  if (data.grid && GRID_CLASSES[data.grid.toLowerCase()]) {
    return GRID_CLASSES[data.grid.toLowerCase()];
  }
  // Auto-assign based on position: large+medium alternating pairs, then wides
  const patterns = ['card--large', 'card--medium', 'card--wide', 'card--wide', 'card--third', 'card--third', 'card--third'];
  return patterns[index % patterns.length];
}

// ─────────────────────────────────────────────
//  Generate work.html from all projects
// ─────────────────────────────────────────────

function generateWorkPage(projects) {
  const cards = projects.map((data, i) => {
    const cls      = gridClass(data, i);
    const cover    = data._cover_image || null;
    const imgHtml  = cover
      ? `<img src="projects/${esc(data.slug)}/${esc(cover)}" alt="${esc(data.title)}" loading="lazy" />`
      : `<div class="card__placeholder"></div>`;
    const year     = data.year || '';
    const org      = data.organization || data.org || '';
    const yearLine = [year, org].filter(Boolean).join(' — ');

    return `
      <a class="card ${cls}" href="projects/${esc(data.slug)}/">
        <div class="card__img-wrap">${imgHtml}</div>
        <div class="card__info">
          <div class="card__category">${esc(data.category || '')}</div>
          <div class="card__name">${esc(data.title || data.slug)}</div>
          ${yearLine ? `<div class="card__year">${esc(yearLine)}</div>` : ''}
          <div class="card__arrow">View project →</div>
        </div>
      </a>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Work — Simon H.J. Bjørkå Flatin</title>
  <link rel="stylesheet" href="style.css" />
  <style>
    .work-intro {
      max-width: 1400px; margin: 0 auto;
      padding: 4rem 4rem 3rem;
      display: flex; align-items: baseline; gap: 1.4rem;
      border-bottom: 1px solid rgba(28,28,26,0.1);
    }
    .work-grid { max-width: 1400px; margin: 0 auto; padding: 4rem 4rem 0; }
    @media (max-width: 900px) {
      .work-intro, .work-grid { padding-left: 1.5rem; padding-right: 1.5rem; }
    }
  </style>
</head>
<body>

  <nav class="nav--page">
    <a href="index.html" class="nav__name">Simon H.J. Bjørkå Flatin</a>
    <ul class="nav__links">
      <li><a href="index.html">Main</a></li>
      <li><a href="work.html">Work</a></li>
      <li><a href="services.html">Services</a></li>
      <li><a href="about.html">About</a></li>
    </ul>
  </nav>

  <div class="work-intro">
    <span class="section-label">Portfolio</span>
    <h1 class="section-title">All Work</h1>
  </div>

  <div class="work-grid">
    <div class="projects">
${cards}
    </div>
  </div>

  <footer>
    <div>© 2026 Simon H.J. Bjørkå Flatin</div>
    <div class="footer__links">
      <a href="about.html">About</a>
      <a href="work.html">Work</a>
      <a href="services.html">Services</a>
    </div>
  </footer>

</body>
</html>
`;
}

// ─────────────────────────────────────────────
//  Main build
// ─────────────────────────────────────────────

function build() {
  if (!fs.existsSync(PROJECTS_DIR)) {
    console.log('No projects/ directory found — nothing to build.');
    return;
  }

  const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_'))
    .map(d => d.name);

  const projects = [];

  for (const slug of dirs) {
    const projectDir = path.join(PROJECTS_DIR, slug);
    const txtPath    = path.join(projectDir, 'project.txt');

    if (!fs.existsSync(txtPath)) {
      console.warn(`  skip: projects/${slug}/ — no project.txt found`);
      continue;
    }

    const content = fs.readFileSync(txtPath, 'utf8');
    const data    = parseProjectTxt(content);
    data.slug     = slug;
    if (!data.title) data.title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const images = findImages(projectDir);
    data._cover_image = images.find(f => /^cover\./i.test(f)) || images[0] || null;

    // Write project page
    const html = generateProjectPage(slug, data, images);
    fs.writeFileSync(path.join(projectDir, 'index.html'), html, 'utf8');
    console.log(`  built: projects/${slug}/index.html`);

    projects.push(data);
  }

  // Sort newest first
  projects.sort((a, b) => {
    const ya = parseInt(a.year) || 0;
    const yb = parseInt(b.year) || 0;
    return yb - ya;
  });

  // Write work.html
  if (projects.length > 0) {
    const workHtml = generateWorkPage(projects);
    fs.writeFileSync(path.join(ROOT, 'work.html'), workHtml, 'utf8');
    console.log(`  built: work.html  (${projects.length} projects)`);
  }

  console.log(`\nBuild complete. ${projects.length} project(s) processed.`);
}

build();
