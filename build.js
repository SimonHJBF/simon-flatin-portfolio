/**
 * build.js - Simon H.J. Bjørkå Flatin portfolio builder
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
 *   4. Commit & push - done.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT         = __dirname;
const PROJECTS_DIR = path.join(ROOT, 'projects');
const CONTENT_DIR  = path.join(ROOT, 'content');
const IMAGE_EXTS   = new Set(['.jpg','.jpeg','.png','.webp','.gif','.avif']);

// Percent-encoded: the profile slug contains the non-ASCII characters oe and aa.
const LINKEDIN_URL = 'https://www.linkedin.com/in/simon-h-j-bj%C3%B8rk%C3%A5-flatin-97947baa';

// Norwegian organisation number, shown in the footer. Empty means omitted.
const ORG_NR = '935 392 780';

// ---------------------------------------------
//  Per-language output
// ---------------------------------------------
// English lives at the site root, Norwegian under /no/, Portuguese under /pt/.
// Every page is emitted once per language with only that language in the DOM,
// so crawlers and screen readers see one language per document.

const LANGS    = ['en', 'no', 'pt'];
const SITE_URL = 'https://simonflatin.com';

/** Base for page links in a language. Assets always use '/'. */
function linkBase(lang) { return lang === 'en' ? '/' : `/${lang}/`; }

/** Output subdirectory for a language, relative to ROOT. */
function langDir(lang) { return lang === 'en' ? '' : lang; }

/** Index just past the </tag> closing the element whose open tag ended at `from`. */
function matchingClose(html, tag, from) {
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
  re.lastIndex = from;
  let depth = 1, m;
  while ((m = re.exec(html)) !== null) {
    if (m[0][1] === '/') { if (--depth === 0) return re.lastIndex; }
    else depth++;
  }
  return -1;
}

/** Remove every element carrying class="cls", including its contents. */
function removeTagged(html, cls) {
  const open = new RegExp(`<(span|div|p)\\s+class="${cls}"[^>]*>`, 'g');
  let out = '', last = 0, m;
  while ((m = open.exec(html)) !== null) {
    const end = matchingClose(html, m[1], open.lastIndex);
    if (end === -1) continue;
    out += html.slice(last, m.index);
    last = end;
    open.lastIndex = end;
  }
  return out + html.slice(last);
}

/** Keep only one language's blocks in a rendered page. */
function stripLangs(html, keep) {
  for (const lang of LANGS) if (lang !== keep) html = removeTagged(html, `l-${lang}`);
  return html;
}

/** Clean URL for an output path: projects/tinn/index.html -> projects/tinn/ */
function urlOf(rel) { return rel.replace(/index\.html$/, ''); }

// Titles per language. Project pages keep their own title (a proper noun),
// so they are deliberately absent here.
const NAME = 'Simon H.J. Bj&oslash;rk&aring; Flatin';
const PAGE_TITLES = {
  'index.html': {
    en: `${NAME} &middot; Architect &amp; Designer`,
    no: `${NAME} &middot; Arkitekt og designer`,
    pt: `${NAME} &middot; Arquiteto e designer`,
  },
  'work.html':    { en: `Work &middot; ${NAME}`,    no: `Prosjekter &middot; ${NAME}`,   pt: `Projetos &middot; ${NAME}` },
  'about.html':   { en: `About &middot; ${NAME}`,   no: `Om &middot; ${NAME}`,           pt: `Sobre &middot; ${NAME}` },
  'services.html':{ en: `Services &middot; ${NAME}`,no: `Tjenester &middot; ${NAME}`,    pt: `Servi&ccedil;os &middot; ${NAME}` },
  'contact.html': { en: `Contact &middot; ${NAME}`, no: `Kontakt &middot; ${NAME}`,      pt: `Contato &middot; ${NAME}` },
  'contact-success.html': {
    en: `Message sent &middot; ${NAME}`,
    no: `Melding sendt &middot; ${NAME}`,
    pt: `Mensagem enviada &middot; ${NAME}`,
  },
};

// Meta descriptions for the fixed pages. Project pages derive theirs from
// their own first paragraph, so they are not listed here.
const PAGE_DESCRIPTIONS = {
  'index.html': {
    en: 'Architect, MSc and ir. from TU Delft, working between Norway and São Paulo. Architecture, visualisation, physical models and software for the building industry.',
    no: 'Arkitekt, MSc og ir. fra TU Delft, med base mellom Norge og São Paulo. Arkitektur, visualisering, fysiske modeller og programvare for byggebransjen.',
    pt: 'Arquiteto, MSc e ir. pela TU Delft, entre a Noruega e São Paulo. Arquitetura, visualização, maquetes físicas e software para a construção civil.',
  },
  'work.html': {
    en: 'Selected work: architecture, competitions, architectural models, photography and software, from TU Delft graduation projects to built work in Norway and Brazil.',
    no: 'Utvalgte prosjekter: arkitektur, konkurranser, arkitekturmodeller, fotografi og programvare, fra avgangsprosjekter ved TU Delft til bygde prosjekter i Norge og Brasil.',
    pt: 'Trabalhos selecionados: arquitetura, concursos, maquetes, fotografia e software, de projetos de graduação na TU Delft a obras na Noruega e no Brasil.',
  },
  'about.html': {
    en: 'Architect with an MSc and ir. from TU Delft, graduated cum laude. Nine years at Ebano, a graduation project in Arctic Norway, and an independent practice since 2023.',
    no: 'Arkitekt med MSc og ir. fra TU Delft, uteksaminert cum laude. Ni år hos Ebano, avgangsprosjekt i Nord-Norge og egen praksis siden 2023.',
    pt: 'Arquiteto com MSc e ir. pela TU Delft, formado cum laude. Nove anos na Ebano, um projeto de graduação no Ártico norueguês e escritório próprio desde 2023.',
  },
  'services.html': {
    en: 'Architecture, BIM and parametric modelling, technical documentation, physical models, drone photogrammetry, research and planning applications in Norway.',
    no: 'Arkitektur, BIM og parametrisk modellering, teknisk dokumentasjon, fysiske modeller, dronefotogrammetri, research og byggesøknader i Norge.',
    pt: 'Arquitetura, BIM e modelagem paramétrica, documentação técnica, maquetes físicas, fotogrametria com drone, pesquisa e licenciamento na Noruega.',
  },
  'contact.html': {
    en: 'Available for architectural commissions, research collaborations, modelmaking and consultancy. Based in the Oslo region, with clients across five countries.',
    no: 'Tilgjengelig for arkitektoppdrag, forskningssamarbeid, modellbygging og rådgivning. Basert i Osloregionen, med kunder i fem land.',
    pt: 'Disponível para encomendas de arquitetura, colaborações de pesquisa, maquetes e consultoria. Baseado na região de Oslo, com clientes em cinco países.',
  },
  'contact-success.html': {
    en: 'Your message has been sent.',
    no: 'Meldingen din er sendt.',
    pt: 'Sua mensagem foi enviada.',
  },
};

/** Strip tags and decode the few entities esc() introduces. */
function plainText(html) {
  return html.replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

/** Trim to a whole word at or under `n` characters. */
function truncate(s, n) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,.;:]$/, '') + '...';
}

/** Description for one page in one language. */
function metaDescription(rel, lang, strippedHtml) {
  const fixed = PAGE_DESCRIPTIONS[rel];
  if (fixed) return fixed[lang];
  const m = strippedHtml.match(/<div class="l-[a-z]{2}">\s*<p>([\s\S]*?)<\/p>/);
  return m ? truncate(plainText(m[1]), 155) : null;
}

/** hreflang alternates, so crawlers know the three pages are the same content. */
function hreflangHtml(rel) {
  const u = urlOf(rel);
  const rows = LANGS.map(l =>
    `  <link rel="alternate" hreflang="${l}" href="${SITE_URL}${linkBase(l)}${u}" />`);
  rows.push(`  <link rel="alternate" hreflang="x-default" href="${SITE_URL}/${u}" />`);
  return rows.join('\n');
}

/** Language switcher: real links to this same page in each language. */
function langLinksHtml(lang, rel) {
  const u = urlOf(rel);
  return LANGS.map(l =>
    `        <a class="lang-btn${l === lang ? ' active' : ''}" href="${linkBase(l)}${u}"` +
    ` hreflang="${l}"${l === lang ? ' aria-current="page"' : ''}>${l.toUpperCase()}</a>`
  ).join('\n        <span class="lang-sep">&middot;</span>\n');
}

// Every canonical URL emitted, for sitemap.xml.
const SITEMAP_URLS = [];

/** Write one page three times, one per language, each with a single language. */
function emitLangVariants(rel, html) {
  for (const lang of LANGS) {
    let out = stripLangs(html, lang);
    out = out.replace('<html lang="en">', `<html lang="${lang}">`);
    const desc = metaDescription(rel, lang, out);
    out = out.replace('<head>', '<head>\n' + hreflangHtml(rel) +
      (desc ? `\n  <meta name="description" content="${esc(desc)}" />` : ''));
    const title = PAGE_TITLES[rel];
    if (title) out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${title[lang]}</title>`);
    // The form confirmation page is not worth indexing.
    if (rel !== 'contact-success.html') {
      SITEMAP_URLS.push(SITE_URL + linkBase(lang) + urlOf(rel));
    }
    out = out.split('<!--LANGNAV-->').join(langLinksHtml(lang, rel));
    out = out.split('__LINKBASE__').join(linkBase(lang));
    writeFile(path.join(ROOT, langDir(lang), rel), out);
  }
}

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

/** Escape body text, then turn [label](url) and bare URLs into links. */
function escLinks(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_, label, url) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`)
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:])/g,
      (_, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
}

/**
 * Absolute URL for an image, preferring the web-optimised derivative in
 * <dir>/web/ produced by the image pipeline. Falls back to the original if a
 * derivative has not been generated yet, so the build never emits a dead src.
 */
function webSrc(dirRel, file) {
  const webRel = `${dirRel}/web/${file.replace(/\.[^.]+$/, '.webp')}`;
  return fs.existsSync(path.join(ROOT, webRel)) ? `/${webRel}` : `/${dirRel}/${file}`;
}

function grad(i) { return GRADIENTS[i % GRADIENTS.length]; }

/** Extract YouTube embed URL from various YouTube URL formats */
function youtubeEmbedUrl(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  // nocookie: no tracking cookie is set unless the visitor actually plays it.
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}

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

/** Parse project.txt → data object with .paragraphs[], .paragraphs_no[], .paragraphs_pt[]
 *  Description block may contain ===no=== and ===pt=== section markers for translations. */
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
  // Split description into language sections via ===no=== / ===pt=== markers
  function splitLang(text) {
    const noIdx = text.search(/===no===/i);
    const ptIdx = text.search(/===pt===/i);
    let en = text, no = '', pt = '';
    const markers = [];
    if (noIdx > -1) markers.push({ lang:'no', idx:noIdx });
    if (ptIdx > -1) markers.push({ lang:'pt', idx:ptIdx });
    markers.sort(function(a,b){ return a.idx - b.idx; });
    if (markers.length > 0) {
      en = text.slice(0, markers[0].idx).trim();
      for (var i = 0; i < markers.length; i++) {
        var start = markers[i].idx + 8; // len('===no===') == 8
        var end   = (i + 1 < markers.length) ? markers[i+1].idx : text.length;
        if (markers[i].lang === 'no') no = text.slice(start, end).trim();
        if (markers[i].lang === 'pt') pt = text.slice(start, end).trim();
      }
    }
    return { en: en, no: no, pt: pt };
  }
  function toParagraphs(text) {
    return (text || '').split(/\n\n+/)
      .map(function(p){ return p.replace(/\n/g, ' ').trim(); })
      .filter(function(p){ return p && !p.startsWith('-') && !p.startsWith('HOW') && !p.startsWith('GRID') && !p.startsWith('─'); });
  }
  const langs = splitLang(desc);
  data.paragraphs    = toParagraphs(langs.en);
  data.paragraphs_no = toParagraphs(langs.no);
  data.paragraphs_pt = toParagraphs(langs.pt);
  return data;
}

/** Parse bio.txt → { en, no, pt } arrays of paragraph strings.
 *  Supports ===no=== and ===pt=== section markers (same as project.txt). */
function parseBioTxt(content) {
  const parse = s => s.split(/\n\n+/).map(p => p.replace(/\n/g, ' ').trim()).filter(Boolean);
  const noIdx = content.indexOf('\n===no===');
  const ptIdx = content.indexOf('\n===pt===');
  const enEnd = noIdx > -1 ? noIdx : (ptIdx > -1 ? ptIdx : content.length);
  const noEnd = ptIdx > -1 ? ptIdx : content.length;
  return {
    en: parse(content.slice(0, enEnd)),
    no: noIdx > -1 ? parse(content.slice(noIdx + 9, noEnd)) : [],
    pt: ptIdx > -1 ? parse(content.slice(ptIdx + 9)) : []
  };
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

// Each page is now emitted once per language with only that language in the
// DOM, so there is nothing left to toggle at runtime. These are kept as empty
// strings so the page templates below do not all need editing.
const LANG_SCRIPT = '';
const LANG_TOGGLE_SCRIPT = '';

const GA_TAG = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-VBPFZJZXY9"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-VBPFZJZXY9');
</script>`;

// Language CSS (goes in <head>)
// Was used to hide the two inactive languages. Now unnecessary: only one
// language is ever present in a document.
const LANG_CSS = '';

function navHtml(prefix, mode) {
  const navClass = mode === 'hero' ? 'nav--hero' : 'nav--page';
  return `  <nav class="${navClass}">
    <a href="__LINKBASE__" class="nav__name">Simon H.J. Bj&oslash;rk&aring; Flatin</a>
    <div class="nav__link-row">
      <ul class="nav__links">
        <li><a href="__LINKBASE__"><span class="l-en">Main</span><span class="l-no">Forside</span><span class="l-pt">In&iacute;cio</span></a></li>
        <li><a href="__LINKBASE__work.html"><span class="l-en">Work</span><span class="l-no">Prosjekter</span><span class="l-pt">Projetos</span></a></li>
        <li><a href="__LINKBASE__services.html"><span class="l-en">Services</span><span class="l-no">Tjenester</span><span class="l-pt">Servi&ccedil;os</span></a></li>
        <li><a href="__LINKBASE__about.html"><span class="l-en">About</span><span class="l-no">Om</span><span class="l-pt">Sobre</span></a></li>
        <li><a href="__LINKBASE__contact.html"><span class="l-en">Contact</span><span class="l-no">Kontakt</span><span class="l-pt">Contato</span></a></li>
      </ul>
      <div class="lang-toggle" role="group" aria-label="Select language">
<!--LANGNAV-->
      </div>
    </div>
  </nav>`;
}

function footerHtml(prefix) {
  // Norwegian clients expect an organisation number somewhere on the site.
  // Set ORG_NR to have it appear; left empty it is simply omitted.
  const ENK = 'Bj&oslash;rk&aring; Flatin ENK';
  const orgEn = ORG_NR ? ` &middot; org.no. ${ORG_NR}` : '';
  const orgNo = ORG_NR ? ` &middot; org.nr. ${ORG_NR}` : '';
  return `  <footer>
    <div>&copy; ${new Date().getFullYear()} Simon H.J. Bj&oslash;rk&aring; Flatin</div>
    <div class="footer__identity"><span class="l-en">Architect MSc / ir. &middot; ${ENK}${orgEn} &middot; Larkollen, Norway</span><span class="l-no">Arkitekt MSc / ir. &middot; ${ENK}${orgNo} &middot; Larkollen, Norge</span><span class="l-pt">Arquiteto MSc / ir. &middot; ${ENK}${orgEn} &middot; Larkollen, Noruega</span></div>
    <div class="footer__links">
      <a href="__LINKBASE__about.html"><span class="l-en">About</span><span class="l-no">Om</span><span class="l-pt">Sobre</span></a>
      <a href="__LINKBASE__work.html"><span class="l-en">Work</span><span class="l-no">Prosjekter</span><span class="l-pt">Projetos</span></a>
      <a href="__LINKBASE__contact.html"><span class="l-en">Contact</span><span class="l-no">Kontakt</span><span class="l-pt">Contato</span></a>
      <a href="${LINKEDIN_URL}" target="_blank" rel="noopener">LinkedIn</a>
    </div>
  </footer>`;
}

// ─────────────────────────────────────────────
//  Card HTML helper
// ─────────────────────────────────────────────

const GRID_CLASSES = { large:'card--large', medium:'card--medium', wide:'card--wide', third:'card--third' };
// 14-step pattern: alternates large-on-left vs large-on-right every 7 cards
const AUTO_PATTERN = [
  'card--large','card--medium',              // row: 7+5=12  (large LEFT)
  'card--wide','card--wide',                 // row: 6+6=12
  'card--third','card--third','card--third', // row: 4+4+4=12
  'card--medium','card--large',              // row: 5+7=12  (large RIGHT)
  'card--wide','card--wide',                 // row: 6+6=12
  'card--third','card--third','card--third', // row: 4+4+4=12
];

function cardHtml(data, index, prefix) {
  const cls     = GRID_CLASSES[(data.grid||'').toLowerCase()] || AUTO_PATTERN[index % AUTO_PATTERN.length];
  const slug    = data.slug;
  const folder  = data._folder; // e.g. 2024_lalibela-modelmaking
  const cover   = data._cover;
  const imgHtml = cover
    ? `<img src="${webSrc(`projects/${folder}`, cover)}" alt="${esc(data.title)}" loading="lazy" />`
    : `<div class="card__placeholder" style="background:${grad(index)};width:100%;height:100%;"></div>`;
  const year    = data.year || '';
  const org     = data.organization || '';
  const sub     = [year, org].filter(Boolean).join(' · ');
  // Comma-separated individual tags for JS filtering
  // `tags` drives the /work filters; `category` stays as the card's label, so a
  // card can read "Software · Specification tool" while filtering under Software.
  const cats    = (data.tags || data.category || '').split('·').map(t => t.trim()).filter(Boolean).join(',');

  return `
      <a class="card ${cls}" href="__LINKBASE__projects/${esc(slug)}/" data-categories="${esc(cats)}">
        <div class="card__img-wrap">${imgHtml}</div>
        <div class="card__info">
          <div class="card__category">${esc(data.category || '')}</div>
          <div class="card__name">${esc(data.title || slug)}</div>
          ${sub ? `<div class="card__year">${esc(sub)}</div>` : ''}
          <div class="card__arrow"><span class="l-en">View project</span><span class="l-no">Se prosjekt</span><span class="l-pt">Ver projeto</span> &rarr;</div>
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
  // Project-page hero image: prefer banner.*/hero.* if present, else fall back to cover.
  // Lets a wider banner sit at the top of the project page while a tighter cover.*
  // is used for the homepage card thumbnail.
  const hero   = images.find(f => /^(banner|hero)\./i.test(f)) || cover;
  const gallery = images.filter(f => f !== cover && f !== hero);
  // Images live in the source folder (YYYY_slug), referenced from the output folder (slug/)
  // Absolute so the same markup works from /, /no/ and /pt/ alike.
  const imgDir = `projects/${folderName}`;

  const META_LABELS = {
    'Category':      { no:'Kategori',             pt:'Categoria' },
    'Year':          { no:'År',                   pt:'Ano' },
    'Location':      { no:'Sted',                 pt:'Localização' },
    'Typology':      { no:'Typologi',             pt:'Tipologia' },
    'Size':          { no:'Størrelse',            pt:'Tamanho' },
    'Status':        { no:'Status',               pt:'Status' },
    'Client':        { no:'Klient',               pt:'Cliente' },
    'Collaborators': { no:'Samarbeidspartnere',   pt:'Colaboradores' },
    'Mentors':       { no:'Veiledere',            pt:'Orientadores' },
    'Exhibitions':   { no:'Utstillinger',         pt:'Exposições' },
  };
  function mRow(label, val) {
    if (!val) return '';
    const t = META_LABELS[label] || { no:label, pt:label };
    return `\n          <dt><span class="l-en">${esc(label)}</span><span class="l-no">${esc(t.no)}</span><span class="l-pt">${esc(t.pt)}</span></dt><dd>${esc(val)}</dd>`;
  }

  const heroHtml = hero
    ? `  <div class="project-hero"><img src="${webSrc(imgDir, hero)}" alt="${esc(title)}" loading="eager" /></div>`
    : `  <div class="project-hero project-hero--placeholder" style="background:${grad(0)};"></div>`;

  const galleryHtml = gallery.length
    ? `\n  <div class="project-gallery">\n` +
      gallery.map((img, i) => `    <figure><img src="${webSrc(imgDir, img)}" alt="${esc(title)}, image ${i + 1} of ${gallery.length}" loading="lazy" /></figure>`).join('\n') +
      `\n  </div>`
    : '';

  const embedUrl = youtubeEmbedUrl(data.video);
  const videoHtml = embedUrl
    ? `\n  <div class="project-video">\n    <iframe src="${embedUrl}" title="${esc(title)}" allowfullscreen loading="lazy"></iframe>\n  </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)} &middot; Simon H.J. Bjørkå Flatin</title>
  <link rel="stylesheet" href="/style.css" />
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
    .project-video { max-width:1200px; margin:4rem auto 0; padding:0 4rem; }
    .project-video iframe { width:100%; aspect-ratio:16/9; border:none; display:block; }
    @media(max-width:800px) {
      .project-body { grid-template-columns:1fr; gap:3rem; padding:3rem 1.5rem 0; }
      .project-gallery { padding:0 1.5rem; }
    }
    ${LANG_CSS}
  </style>
  ${LANG_SCRIPT}
  ${GA_TAG}
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
        mRow('Mentors',      data.mentors) +
        mRow('Exhibitions', data.exhibitions) +
        (data.live ? `\n          <dt><span class="l-en">Live</span><span class="l-no">Nettside</span><span class="l-pt">Site</span></dt><dd><a href="${esc(/^https?:\/\//i.test(data.live) ? data.live : 'https://' + data.live)}" target="_blank" rel="noopener">${esc(data.live)}</a></dd>` : '')
      }
      </dl>
    </div>
    <div class="project-content">
      <h1 class="project-title">${esc(title)}</h1>
      <div class="l-en">${data.paragraphs.map(p => `<p>${escLinks(p)}</p>`).join('\n      ')}</div>
      <div class="l-no">${(data.paragraphs_no && data.paragraphs_no.length ? data.paragraphs_no : data.paragraphs).map(p => `<p>${escLinks(p)}</p>`).join('\n      ')}</div>
      <div class="l-pt">${(data.paragraphs_pt && data.paragraphs_pt.length ? data.paragraphs_pt : data.paragraphs).map(p => `<p>${escLinks(p)}</p>`).join('\n      ')}</div>
      <a href="__LINKBASE__work.html" class="project-back"><span class="l-en">&larr; All work</span><span class="l-no">&larr; Alle prosjekter</span><span class="l-pt">&larr; Todo o trabalho</span></a>
    </div>
  </div>
${galleryHtml}
${videoHtml}

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
    (p.tags || p.category || '').split('·').map(t => t.trim()).filter(Boolean).forEach(t => tagSet.add(t));
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
  <title>Work &middot; Simon H.J. Bj&oslash;rk&aring; Flatin</title>
  <link rel="stylesheet" href="/style.css" />
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
  ${GA_TAG}
</head>
<body>

${navHtml()}

  <div class="work-intro">
    <span class="section-label"><span class="l-en">Portfolio</span><span class="l-no">Portef&oslash;lje</span><span class="l-pt">Portf&oacute;lio</span></span>
    <h1 class="section-title"><span class="l-en">All Work</span><span class="l-no">Alle prosjekter</span><span class="l-pt">Todo o Trabalho</span></h1>
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
    .slice(0, 5);

  // Fixed grid sizes for the 5 featured slots, three rows:
  // Row 1: wide + wide  (slots 1, 2)  two equal landscape cards
  // Row 2: full         (slot 3)      one card alone, 40/19 banner ratio
  // Row 3: wide + wide  (slots 4, 5)  two equal landscape cards
  const featuredGrids = ['card--wide','card--wide','card--full','card--wide','card--wide'];

  const cards = featuredProjects.map((data, i) => {
    const cls     = featuredGrids[i] || 'card--wide';
    const folder  = data._folder;
    const cover   = data._cover;
    const imgHtml = cover
      ? `<img src="${webSrc(`projects/${folder}`, cover)}" alt="${esc(data.title)}" loading="eager" />`
      : `<div class="card__placeholder" style="background:${grad(i)};width:100%;height:100%;"></div>`;
    const sub = [data.year, data.organization].filter(Boolean).join(' · ');

    return `
      <a class="card ${cls}" href="projects/${esc(data.slug)}/">
        <div class="card__img-wrap">${imgHtml}</div>
        <div class="card__info">
          <div class="card__category">${esc(data.category || '')}</div>
          <div class="card__name">${esc(data.title || data.slug)}</div>
          ${sub ? `<div class="card__year">${esc(sub)}</div>` : ''}
          <div class="card__arrow"><span class="l-en">View project</span><span class="l-no">Se prosjekt</span><span class="l-pt">Ver projeto</span> &rarr;</div>
        </div>
      </a>`;
  }).join('');

  // Hero: static image only (no video)
  const mainDir     = path.join(CONTENT_DIR, 'main');
  const heroImgFile = fs.existsSync(mainDir)
    ? findImages(mainDir).find(f => /^(hero|cover|mirror)\./i.test(f)) || findImages(mainDir)[0]
    : null;
  const heroImgPath = heroImgFile ? webSrc('content/main', heroImgFile) : null;

  const heroBgHtml = heroImgPath
    ? `<img class="hero__bg" src="${heroImgPath}" alt="">`
    : `<div class="hero__bg" style="background:linear-gradient(160deg,#2d3d2e 0%,#4a6741 35%,#7a9e6e 60%,#c9d9b8 100%);"></div>`;

  // Water ripple on the lower ~45% of the hero (where the water/fjord is).
  // Technique: an SVG <image> (same src as static hero) clipped to y=55-100%
  // via objectBoundingBox clipPath. An SVG-native filter (feTurbulence +
  // feDisplacementMap) ripples the image. feOffset oscillates sinusoidally
  // so there is NO scroll-period boundary and NO visible seam - ever.
  // SVG-native filters work on iOS Safari; CSS filter:url(#id) does not.
  // A CSS mask-image gradient softly fades the water at the waterline and
  // bottom edge for a natural blend with the shore.
  const heroWaterHtml = heroImgPath ? `
  <svg class="hero__water" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="wf" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.009 0.014"
                      numOctaves="3" seed="5" stitchTiles="stitch" result="n"/>
        <feOffset id="wo" in="n" dx="0" dy="0" result="s"/>
        <feDisplacementMap in="SourceGraphic" in2="s"
                           scale="22" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
      <clipPath id="wc" clipPathUnits="objectBoundingBox">
        <rect x="0" y="0.55" width="1" height="0.45"/>
      </clipPath>
    </defs>
    <image href="${heroImgPath}" width="100%" height="100%"
           preserveAspectRatio="xMidYMid slice"
           filter="url(#wf)"
           clip-path="url(#wc)"/>
  </svg>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Simon H.J. Bj&oslash;rk&aring; Flatin &middot; Architect &amp; Designer</title>
  <link rel="stylesheet" href="/style.css" />
  <style>
    .hero { position:relative; width:100%; height:100vh; overflow:hidden; }
    .hero__bg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
    /* Water ripple - full-screen SVG, image clipped to bottom 45% via clipPath.
       Mask fades the water softly at the waterline (top) and bottom edge. */
    .hero__water { position:absolute; inset:0; width:100%; height:100%;
      pointer-events:none;
      -webkit-mask-image:linear-gradient(to top,transparent 0%,black 8%,black 42%,transparent 47%);
      mask-image:linear-gradient(to top,transparent 0%,black 8%,black 42%,transparent 47%); }
    /* Mist canvas - WebGL procedural fog, scroll-triggered from top corners */
    #mc { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; display:block; }
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
  ${GA_TAG}
</head>
<body>

  <section class="hero">
    ${heroBgHtml}
    ${heroWaterHtml}
    <div class="hero__overlay"></div>
    <canvas id="mc" aria-hidden="true"></canvas>
    <nav class="nav--hero">
      <a href="__LINKBASE__" class="nav__name">Simon H.J. Bj&oslash;rk&aring; Flatin</a>
      <div class="nav__link-row">
        <ul class="nav__links">
          <li><a href="__LINKBASE__"><span class="l-en">Main</span><span class="l-no">Forside</span><span class="l-pt">In&iacute;cio</span></a></li>
          <li><a href="__LINKBASE__work.html"><span class="l-en">Work</span><span class="l-no">Prosjekter</span><span class="l-pt">Projetos</span></a></li>
          <li><a href="__LINKBASE__services.html"><span class="l-en">Services</span><span class="l-no">Tjenester</span><span class="l-pt">Servi&ccedil;os</span></a></li>
          <li><a href="__LINKBASE__about.html"><span class="l-en">About</span><span class="l-no">Om</span><span class="l-pt">Sobre</span></a></li>
          <li><a href="__LINKBASE__contact.html"><span class="l-en">Contact</span><span class="l-no">Kontakt</span><span class="l-pt">Contato</span></a></li>
        </ul>
        <div class="lang-toggle" role="group" aria-label="Select language">
          <button class="lang-btn" data-lang="en">EN</button>
          <span class="lang-sep">&middot;</span>
          <button class="lang-btn" data-lang="no">NO</button>
          <span class="lang-sep">&middot;</span>
          <button class="lang-btn" data-lang="pt">PT</button>
        </div>
      </div>
    </nav>
    <div class="hero__scroll-cue">
      <span class="l-en">Scroll</span><span class="l-no">Rull</span><span class="l-pt">Rolar</span>
      <span class="hero__scroll-arrow-wrap" aria-hidden="true"><span class="hero__scroll-arrow"></span></span>
    </div>
  </section>

  <section class="featured">
    <div class="featured__header">
      <span class="section-label"><span class="l-en">Selected Work</span><span class="l-no">Utvalgte prosjekter</span><span class="l-pt">Trabalho Selecionado</span></span>
      <h2 class="section-title"><span class="l-en">Signature Projects</span><span class="l-no">Signatur&shy;prosjekter</span><span class="l-pt">Projetos de Destaque</span></h2>
    </div>
    <div class="projects">
${cards}
    </div>
    <div class="all-work"><a href="__LINKBASE__work.html"><span class="l-en">See all work</span><span class="l-no">Se alle prosjekter</span><span class="l-pt">Ver todos os projetos</span></a></div>
  </section>

${footerHtml()}
<script>
// Mist v5: two INDEPENDENT fog fields - LEFT (flows →) and RIGHT (flows ←).
// Each has its own mask that extends PAST the centre to the opposite edge.
// No shared symmetric mask → no centre seam, no hard stop at x=0.5.
// Single-level domain warp only → puffy clouds, no swirly tendrils.
// Mobile: aspect-ratio density boost for portrait screens.
(function(){
  if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  var c=document.getElementById('mc');
  if(!c)return;
  var gl=c.getContext('webgl')||c.getContext('experimental-webgl');
  if(!gl)return;
  var vs='attribute vec2 a;void main(){gl_Position=vec4(a,0,1);}';
  var fs=
    'precision mediump float;'+
    'uniform float u_t,u_s;'+
    'uniform vec2 u_r;'+
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.545);}'+
    'float n(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);'+
    'return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}'+
    'float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(.8,.6,-.6,.8);'+
    'for(int i=0;i<5;i++){v+=a*n(p);p=m*p*2.+vec2(5.2,1.3);a*=.5;}return v;}'+
    'void main(){'+
    'vec2 uv=gl_FragCoord.xy/u_r;'+
    'float s=u_s*u_s*(3.-2.*u_s);'+
    // Aspect ratio: <1 on portrait phone, used for mobile density boost
    'float aspect=u_r.x/u_r.y;'+
    // sp=0.80 at rest → hmL at x=1.0 = 0.199 (fog present everywhere even without scroll)
    // sp=1.0 at full scroll → hmL at x=1.0 = 1.0 (fully covered). No seam at any scroll depth.
    'float sp=0.80+s*0.20;'+
    'float fw=0.28;'+
    // LEFT mask: full at x=0, soft right edge at x≈sp. Extends past centre at sp>0.5+fw
    'float hmL=clamp((sp-uv.x+fw)/fw,0.,1.);'+
    'hmL=hmL*hmL*(3.-2.*hmL);'+
    // RIGHT mask: mirror - full at x=1, soft left edge. Both fully overlap at 75% scroll
    'float hmR=clamp((sp-(1.-uv.x)+fw)/fw,0.,1.);'+
    'hmR=hmR*hmR*(3.-2.*hmR);'+
    // Always animating (cinematic idle), faster when scrolled
    'float dt=u_t*(0.003+s*0.005);'+
    // LEFT fog: drifts rightward with time + scroll. s*1.0 = ~0.5 UV shift at full scroll.
    'vec2 stL=vec2(uv.x*2.0-dt-s*1.0,uv.y*3.0+0.5);'+
    'vec2 qL=vec2(fbm(stL),fbm(stL+vec2(4.1,1.8)));'+
    'float cL=fbm(stL+1.2*qL);'+
    'cL=clamp((cL-0.25)*1.8,0.,1.);'+
    // RIGHT fog: independent seed, drifts leftward with time + scroll (mirror of L)
    'vec2 stR=vec2((1.-uv.x)*2.0-dt-s*1.0+7.3,uv.y*3.0+3.5);'+
    'vec2 qR=vec2(fbm(stR),fbm(stR+vec2(4.1,1.8)));'+
    'float cR=fbm(stR+1.2*qR);'+
    'cR=clamp((cR-0.25)*1.8,0.,1.);'+
    // Three fixed-height layers - no scroll-driven vertical descent
    'float yA=0.60;'+
    'float v1=(1.-smoothstep(yA-0.02,yA+0.10,uv.y))*smoothstep(yA-0.22,yA+0.02,uv.y);'+
    'float yB=0.48;'+
    'float v2=(1.-smoothstep(yB-0.02,yB+0.10,uv.y))*smoothstep(yB-0.28,yB+0.02,uv.y);'+
    'float yC=0.34;'+
    'float v3=(1.-smoothstep(yC-0.01,yC+0.07,uv.y))*smoothstep(yC-0.30,yC+0.01,uv.y);'+
    // L and R overlap everywhere - no seam. dens ramps from 0.40 at rest to 1.0 at full scroll.
    'float dens=0.40+s*0.60;'+
    'float dL=hmL*(v1*cL*0.63+v2*cL*0.76+v3*cL*0.52)*dens;'+
    'float dR=hmR*(v1*cR*0.63+v2*cR*0.76+v3*cR*0.52)*dens;'+
    'float base=(hmL+hmR)*0.5*(0.25+s*0.75)*smoothstep(0.04,0.16,uv.y)*(1.-smoothstep(0.54,0.62,uv.y))*0.10;'+
    'float d=clamp(dL+dR+base,0.,1.)*smoothstep(0.03,0.10,uv.y);'+
    // Portrait screens: boost density so fog feels solid on tall vertical canvases
    'd=clamp(d*(1.0+max(0.,(1.-aspect)*0.5)),0.,1.);'+
    'd=smoothstep(0.02,0.96,d)*0.86;'+
    'gl_FragColor=vec4(0.97*d,0.96*d,0.94*d,d);}';
  function mk(t,s){var sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);return gl.getShaderParameter(sh,gl.COMPILE_STATUS)?sh:null;}
  var sv=mk(gl.VERTEX_SHADER,vs),sf=mk(gl.FRAGMENT_SHADER,fs);
  if(!sv||!sf)return;
  var p=gl.createProgram();
  gl.attachShader(p,sv);gl.attachShader(p,sf);gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))return;
  gl.useProgram(p);
  var buf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  var al=gl.getAttribLocation(p,'a');
  gl.enableVertexAttribArray(al);
  gl.vertexAttribPointer(al,2,gl.FLOAT,false,0,0);
  var uT=gl.getUniformLocation(p,'u_t');
  var uS=gl.getUniformLocation(p,'u_s');
  var uR=gl.getUniformLocation(p,'u_r');
  var sT=0,sC=0;
  function resize(){var w=c.offsetWidth||window.innerWidth,h=c.offsetHeight||window.innerHeight;if(c.width!==w||c.height!==h){c.width=w;c.height=h;gl.viewport(0,0,w,h);}}
  function onScroll(){sT=Math.min((window.scrollY||window.pageYOffset)/(c.parentElement.offsetHeight||window.innerHeight),1);}
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',resize);
  resize();
  var t0=null;
  function frame(ts){
    if(!t0)t0=ts;
    sC+=(sT-sC)*0.06;
    resize();
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uT,(ts-t0)/1000);
    gl.uniform1f(uS,sC);
    gl.uniform2f(uR,c.width,c.height);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
</script>
<script>
  /* Water ripple - sinusoidal feOffset oscillation, zero seam, works on iOS.
   * dy and dx oscillate at different periods so the combined motion never
   * exactly repeats, giving endlessly varied, natural-looking ripple. */
  (function(){
    var fo=document.getElementById('wo');
    if(!fo)return;
    var t=0,lastTs=null;
    function step(ts){
      if(lastTs===null)lastTs=ts;
      var dt=Math.min((ts-lastTs)/1000,0.1); lastTs=ts; t+=dt;
      fo.setAttribute('dy',String(-35*Math.sin(t*0.25)));
      fo.setAttribute('dx',String(12*Math.sin(t*0.4+1.0)));
      requestAnimationFrame(step);
    }
    if(document.readyState==='loading'){
      document.addEventListener('DOMContentLoaded',function(){requestAnimationFrame(step);});
    }else{requestAnimationFrame(step);}
  })();
</script>
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

  const makeBio = (paras, fallback) =>
    (paras && paras.length ? paras : fallback).map(p => `<p>${esc(p)}</p>`).join('\n          ');
  const bioHtml = `        <div class="l-en">
          ${makeBio(paragraphs.en, [])}
        </div>
        <div class="l-no">
          ${makeBio(paragraphs.no, paragraphs.en)}
        </div>
        <div class="l-pt">
          ${makeBio(paragraphs.pt, paragraphs.en)}
        </div>`;

  const photoHtml = portraitFile
    ? `<img src="${webSrc('content/about', portraitFile)}" alt="Simon H.J. Bjørkå Flatin" />`
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
  <title>About &middot; Simon H.J. Bjørkå Flatin</title>
  <link rel="stylesheet" href="/style.css" />
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
    .about-photo img { width:100%; max-width:380px; display:block; object-fit:cover; aspect-ratio:3/4; object-position:center top; }
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
  ${GA_TAG}
</head>
<body>

${navHtml()}

  <div class="about-body">
    <div class="about-bio">
      <div class="about-bio__label"><span class="l-en">About</span><span class="l-no">Om</span><span class="l-pt">Sobre</span></div>
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
        <div class="cv-section__title"><span class="l-en">Working Experience</span><span class="l-no">Arbeidserfaring</span><span class="l-pt">Experi&ecirc;ncia Profissional</span></div>${expHtml}
      </div>` : ''}
      ${eduHtml.trim() ? `<div class="cv-section">
        <div class="cv-section__title"><span class="l-en">Education</span><span class="l-no">Utdanning</span><span class="l-pt">Educa&ccedil;&atilde;o</span></div>${eduHtml}
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
  const servDir  = path.join(CONTENT_DIR, 'services');
  // Use any image found - prefer one named 'hero', else first image
  const heroFile = fs.existsSync(servDir)
    ? (findImages(servDir).find(f => f.toLowerCase().startsWith('hero')) || findImages(servDir)[0])
    : null;

  const heroBgHtml = heroFile
    ? `<img class="services-hero__bg" src="${webSrc('content/services', heroFile)}" alt="">`
    : `<div class="services-hero__bg" style="background:linear-gradient(160deg,#1a2535 0%,#2d4058 40%,#8aaabb 100%);"></div>`;

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
  <title>Services &middot; Simon H.J. Bj&oslash;rk&aring; Flatin</title>
  <link rel="stylesheet" href="/style.css" />
  <style>
    .services-hero { position:relative; height:100vh; overflow:hidden; }
    .services-hero__bg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
    .services-hero__overlay { position:absolute; inset:0;
      background:linear-gradient(to bottom,rgba(0,0,0,.15) 0%,rgba(0,0,0,.55) 100%); }
    .services-hero__text { position:absolute; bottom:8rem; left:50%;
      transform:translateX(-50%); text-align:center; width:90%; max-width:700px; }
    .services-hero__text h1 { font-family:var(--serif);
      font-size:clamp(1.6rem,3.5vw,2.6rem); font-weight:400; line-height:1.4;
      color:var(--cream); text-shadow:0 2px 24px rgba(0,0,0,.55); }
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
  ${GA_TAG}
</head>
<body>

  <div class="services-hero">
    ${heroBgHtml}
    <div class="services-hero__overlay"></div>
    ${navHtml('', 'hero')}
    <div class="services-hero__text">
      <h1>
        <span class="l-en">Architecture, visualisation,<br>models and software</span>
        <span class="l-no">Arkitektur, visualisering,<br>modeller og programvare</span>
        <span class="l-pt">Arquitetura, visualiza&ccedil;&atilde;o,<br>maquetes e software</span>
      </h1>
    </div>
    <div class="hero__scroll-cue">
      <span class="l-en">Scroll</span><span class="l-no">Rull</span><span class="l-pt">Rolar</span>
      <span class="hero__scroll-arrow-wrap" aria-hidden="true"><span class="hero__scroll-arrow"></span></span>
    </div>
  </div>

  <div class="services-body">
    <div class="services-intro">
      <p class="l-en">I am an architect working between Norway and S&atilde;o Paulo, mostly online, with clients in Norway, Sweden, Portugal, the United States and Brazil. The work runs from planning applications and competition proposals to visualisation, physical models and the software I build for the building industry. Most projects still start with a physical model on the desk.</p>
      <p class="l-no">Jeg er arkitekt og jobber mellom Norge og S&atilde;o Paulo, mest online, med kunder i Norge, Sverige, Portugal, USA og Brasil. Arbeidet spenner fra bygges&oslash;knader og konkurranseforslag til visualisering, fysiske modeller og programvaren jeg lager for byggebransjen. De fleste prosjektene begynner fortsatt med en fysisk modell p&aring; bordet.</p>
      <p class="l-pt">Sou arquiteto e trabalho entre a Noruega e S&atilde;o Paulo, principalmente online, com clientes na Noruega, Su&eacute;cia, Portugal, Estados Unidos e Brasil. O trabalho vai de pedidos de licenciamento e propostas de concurso a visualiza&ccedil;&atilde;o, maquetes f&iacute;sicas e o software que desenvolvo para a constru&ccedil;&atilde;o civil. A maioria dos projetos ainda come&ccedil;a com uma maquete f&iacute;sica sobre a mesa.</p>
    </div>
    <div class="services-label"><span class="l-en">Services</span><span class="l-no">Tjenester</span><span class="l-pt">Servi&ccedil;os</span></div>
    <div class="services-list">
${serviceItems}
    </div>
  </div>

  <div class="contact-cta">
    <div class="contact-cta__text">
      <h2><span class="l-en">Let&rsquo;s work together</span><span class="l-no">La oss samarbeide</span><span class="l-pt">Vamos trabalhar juntos</span></h2>
      <p><span class="l-en">Available for commissions, collaborations and consultations.</span><span class="l-no">Tilgjengelig for oppdrag, samarbeid og konsultasjoner.</span><span class="l-pt">Dispon&iacute;vel para comiss&otilde;es, colabora&ccedil;&otilde;es e consultas.</span></p>
    </div>
    <a href="__LINKBASE__contact.html" class="contact-cta__link"><span class="l-en">Get in touch &rarr;</span><span class="l-no">Ta kontakt &rarr;</span><span class="l-pt">Entre em contato &rarr;</span></a>
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

function generateContactSuccessPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Message sent &middot; Simon H.J. Bj&oslash;rk&aring; Flatin</title>
  <link rel="stylesheet" href="/style.css" />
  <style>${LANG_CSS}
    .success-wrap { max-width:600px; margin:0 auto; padding:8rem 4rem; text-align:center; }
    .success-wrap__label { font-size:.72rem; font-weight:700; letter-spacing:.22em;
      text-transform:uppercase; color:var(--muted); margin-bottom:1.5rem; }
    .success-wrap__heading { font-family:var(--serif); font-size:clamp(2rem,3.5vw,2.8rem);
      font-weight:400; line-height:1.2; margin-bottom:1.5rem; }
    .success-wrap__text { font-size:.9rem; line-height:1.85; color:var(--accent); margin-bottom:2.5rem; }
    .success-wrap__back { display:inline-block; font-size:.78rem; font-weight:700;
      letter-spacing:.16em; text-transform:uppercase; color:var(--dark);
      text-decoration:none; border-bottom:1px solid var(--dark); padding-bottom:2px; }
    @media(max-width:600px){ .success-wrap { padding:5rem 1.5rem; } }
  </style>
  ${LANG_SCRIPT}
  ${GA_TAG}
</head>
<body>
${navHtml()}
  <div class="success-wrap">
    <div class="success-wrap__label">
      <span class="l-en">Message sent</span>
      <span class="l-no">Melding sendt</span>
      <span class="l-pt">Mensagem enviada</span>
    </div>
    <h1 class="success-wrap__heading">
      <span class="l-en">Thank you!</span>
      <span class="l-no">Takk!</span>
      <span class="l-pt">Obrigado!</span>
    </h1>
    <p class="success-wrap__text">
      <span class="l-en">Your message has been received. I&rsquo;ll be in touch within 2 business days.</span>
      <span class="l-no">Meldingen din er mottatt. Jeg tar kontakt innen 2 virkedager.</span>
      <span class="l-pt">Sua mensagem foi recebida. Entrarei em contato em at&eacute; 2 dias &uacute;teis.</span>
    </p>
    <a href="__LINKBASE__" class="success-wrap__back">
      <span class="l-en">&larr; Back to home</span>
      <span class="l-no">&larr; Tilbake til forsiden</span>
      <span class="l-pt">&larr; Voltar ao in&iacute;cio</span>
    </a>
  </div>
${footerHtml()}
${LANG_TOGGLE_SCRIPT}
</body>
</html>
`;
}

function generateContactPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Contact &middot; Simon H.J. Bj&oslash;rk&aring; Flatin</title>
  <link rel="stylesheet" href="/style.css" />
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
    @media(max-width:800px) {
      .contact-wrap { grid-template-columns:1fr; gap:3rem; padding:3rem 1.5rem 0; }
    }
  </style>
  ${LANG_SCRIPT}
  ${GA_TAG}
</head>
<body>

${navHtml()}

  <div class="contact-wrap">
    <div class="contact-info">
      <div class="contact-info__label">
        <span class="l-en">Contact</span><span class="l-no">Kontakt</span><span class="l-pt">Contato</span>
      </div>
      <h1 class="contact-info__name">
        <span class="l-en">Let&rsquo;s work<br>together</span>
        <span class="l-no">La oss<br>samarbeide</span>
        <span class="l-pt">Vamos trabalhar<br>juntos</span>
      </h1>
      <p class="contact-info__text">
        <span class="l-en">Available for architectural commissions, research collaborations, modelmaking and consultancy. Based in the Oslo region, splitting my time with S&atilde;o Paulo, with clients in Norway, Sweden, Portugal, the United States and Brazil.</span>
        <span class="l-no">Tilgjengelig for arkitektoppdrag, forskningssamarbeid, modellbygging og r&aring;dgivning. Basert i Osloregionen, med tiden delt mot S&atilde;o Paulo, og kunder i Norge, Sverige, Portugal, USA og Brasil.</span>
        <span class="l-pt">Dispon&iacute;vel para encomendas de arquitetura, colabora&ccedil;&otilde;es de pesquisa, maquetes e consultoria. Baseado na regi&atilde;o de Oslo, dividindo meu tempo com S&atilde;o Paulo, com clientes na Noruega, Su&eacute;cia, Portugal, Estados Unidos e Brasil.</span>
      </p>
      <div class="contact-info__detail">
        <a href="mailto:simon@bjorkaflatin.com">simon@bjorkaflatin.com</a>
        <a href="${LINKEDIN_URL}" target="_blank" rel="noopener">LinkedIn</a>
      </div>
    </div>

    <div class="contact-form-wrap">
      <form name="contact" method="POST" data-netlify="true" netlify-honeypot="bot-field" action="__LINKBASE__contact-success.html" class="contact-form">
        <input type="hidden" name="form-name" value="contact" />
        <p class="contact-form__honeypot">
          <label><span class="l-en">Don&rsquo;t fill this in</span><span class="l-no">Ikke fyll ut dette</span><span class="l-pt">N&atilde;o preencha</span>: <input name="bot-field" /></label>
        </p>

        <label for="name">
          <span class="l-en">Name</span><span class="l-no">Navn</span><span class="l-pt">Nome</span>
        </label>
        <input type="text" id="name" name="name" required autocomplete="name"
          placeholder="Your name" />

        <label for="email">
          <span class="l-en">Email</span><span class="l-no">E-post</span><span class="l-pt">E-mail</span>
        </label>
        <input type="email" id="email" name="email" required autocomplete="email"
          placeholder="your@email.com" />

        <label for="subject">
          <span class="l-en">Subject</span><span class="l-no">Emne</span><span class="l-pt">Assunto</span>
        </label>
        <input type="text" id="subject" name="subject"
          placeholder="e.g. Commission inquiry" />

        <label for="message">
          <span class="l-en">Message</span><span class="l-no">Melding</span><span class="l-pt">Mensagem</span>
        </label>
        <textarea id="message" name="message" required
          placeholder="Tell me about your project or question..."></textarea>

        <div class="contact-form__submit">
          <button type="submit" class="contact-form__btn">
            <span class="l-en">Send message</span>
            <span class="l-no">Send melding</span>
            <span class="l-pt">Enviar mensagem</span>
          </button>
          <span class="contact-form__note">
            <span class="l-en">I usually reply within 2 business days.</span>
            <span class="l-no">Jeg svarer vanligvis innen 2 arbeidsdager.</span>
            <span class="l-pt">Geralmente respondo em at&eacute; 2 dias &uacute;teis.</span>
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
    console.log('No projects/ directory - skipping project build.');
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
    if (!fs.existsSync(txtPath)) { console.warn(`  skip  ${folderName}/ - no project.txt`); continue; }

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
    emitLangVariants('projects/' + slug + '/index.html', html);
    console.log(`  built projects/${slug}/  ← ${folderName}/`);

    projects.push(data);
  }

  // Sort by weight (desc, default 0) then by year (desc)
  // Use weight: -N in project.txt to push a project toward the end of the list.
  projects.sort((a, b) => {
    const wa = parseInt(a.weight || 0), wb = parseInt(b.weight || 0);
    if (wb !== wa) return wb - wa;
    return parseInt(b.year || 0) - parseInt(a.year || 0);
  });

  // 2. Generate work.html
  emitLangVariants('work.html', generateWorkPage(projects));
  console.log(`  built work.html  (${projects.length} projects)`);

  // 3. Generate index.html
  const featuredPath = path.join(CONTENT_DIR, 'main', 'featured.txt');
  const featuredSlugs = featuredPath && fs.existsSync(featuredPath)
    ? parseFeaturedTxt(fs.readFileSync(featuredPath, 'utf8'))
    : projects.slice(0, 4).map(p => p.slug);
  emitLangVariants('index.html', generateIndexPage(projects, featuredSlugs));
  console.log(`  built index.html`);

  // 4. Generate about.html
  const bioTxt  = readFile(path.join(CONTENT_DIR, 'about', 'bio.txt')) || 'Bio coming soon.';
  const cvTxt   = readFile(path.join(CONTENT_DIR, 'about', 'cv.txt'))  || '';
  const bio     = parseBioTxt(bioTxt);
  const cv      = parseCvTxt(cvTxt);
  emitLangVariants('about.html', generateAboutPage(bio, cv));
  console.log(`  built about.html`);

  // 5. Generate services.html
  const servicesTxt = readFile(path.join(CONTENT_DIR, 'services', 'services.txt')) || '';
  const services    = parseServicesTxt(servicesTxt);
  emitLangVariants('services.html', generateServicesPage(services));
  console.log(`  built services.html`);

  // 6. Generate contact.html + success page
  emitLangVariants('contact.html', generateContactPage());
  console.log(`  built contact.html`);
  emitLangVariants('contact-success.html', generateContactSuccessPage());
  console.log(`  built contact-success.html`);

  // 7. Sitemap and robots, built from every URL emitted above
  const urls = SITEMAP_URLS.map(u => `  <url><loc>${u}</loc></url>`).join('\n');
  writeFile(path.join(ROOT, 'sitemap.xml'),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`);
  console.log(`  built sitemap.xml  (${SITEMAP_URLS.length} urls)`);

  writeFile(path.join(ROOT, 'robots.txt'),
`User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`);
  console.log(`  built robots.txt`);

  console.log(`\n── Build complete. ${projects.length} project(s). ──\n`);
}

build();
