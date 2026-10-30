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

/**
 * Clean URL for an output path: projects/tinn/index.html -> projects/tinn/,
 * about.html -> about. Netlify serves and links pages without .html, so this is
 * the form canonical, hreflang and the sitemap must agree on.
 */
function urlOf(rel) { return rel.replace(/index\.html$/, '').replace(/\.html$/, ''); }

// Titles per language. Project page titles are registered into this table as
// each project is built, so they can be localised the same way.
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
  'privacy.html': { en: `Privacy &middot; ${NAME}`, no: `Personvern &middot; ${NAME}`, pt: `Privacidade &middot; ${NAME}` },
  'contact-success.html': {
    en: `Message sent &middot; ${NAME}`,
    no: `Melding sendt &middot; ${NAME}`,
    pt: `Mensagem enviada &middot; ${NAME}`,
  },
};

// ─────────────────────────────────────────────
//  Metadata vocabulary
// ─────────────────────────────────────────────
// The dt labels were translated from the start, the dd values were not, so a
// Norwegian page read "Kategori: Architecture". A whole-value match wins, which
// lets a phrase that does not survive being chopped up ("Render / Pitch Package")
// carry a translation of its own. Otherwise the value is split on its separators
// and each piece is looked up alone, so "Alta, Norway / Delft, The Netherlands"
// needs no entry. Anything unlisted is a proper noun and passes through.
const TERMS = {
  // Categories and filter tags
  'All':                          { no:'Alle',                       pt:'Todos' },
  'Application':                  { no:'Byggesak',                   pt:'Licenciamento' },
  'Architectural renders':        { no:'Arkitekturvisualisering',    pt:'Renders arquitetônicos' },
  'Architecture':                 { no:'Arkitektur',                 pt:'Arquitetura' },
  'Architecture Design Competition': { no:'Arkitektkonkurranse',     pt:'Concurso de arquitetura' },
  'Built':                        { no:'Bygget',                     pt:'Construído' },
  'Competition':                  { no:'Konkurranse',                pt:'Concurso' },
  'Form studies':                 { no:'Formstudier',                pt:'Estudos de forma' },
  'Healthcare':                   { no:'Helse og omsorg',                  pt:'Saúde' },
  'Interior':                     { no:'Interiør',                   pt:'Interiores' },
  'Internship':                   { no:'Praksis',                    pt:'Estágio' },
  'Making':                       { no:'Håndverk',                    pt:'Construção' },
  'Model making':                 { no:'Modellbygging',              pt:'Maquetes' },
  'Models':                       { no:'Modeller',                   pt:'Maquetes' },
  'Photography':                  { no:'Fotografi',                  pt:'Fotografia' },
  'Research':                     { no:'Forskning',                  pt:'Pesquisa' },
  'Software':                     { no:'Programvare',                pt:'Software' },
  'Specification tool':           { no:'Spesifikasjonsverktøy',      pt:'Ferramenta de especificação' },
  'Web app':                      { no:'Webapp',                     pt:'App web' },
  'Web design':                   { no:'Webdesign',                  pt:'Web design' },

  // Places
  'Australia':                    { no:'Australia',                  pt:'Austrália' },
  'Architecture faculty':         { no:'Arkitekturfakultetet',       pt:'Faculdade de Arquitetura' },
  'Brazil':                       { no:'Brasil',                     pt:'Brasil' },
  'Italy':                        { no:'Italia',                     pt:'Itália' },
  'Norway':                       { no:'Norge',                      pt:'Noruega' },
  'United Kingdom':               { no:'Storbritannia',              pt:'Reino Unido' },
  'London':                       { no:'London',                     pt:'Londres' },
  'Youth AI hub':                 { no:'Ungdomssenter for KI',       pt:'Centro de IA para jovens' },
  'The Netherlands':              { no:'Nederland',                  pt:'Países Baixos' },
  'USA':                          { no:'USA',                        pt:'EUA' },
  'Venice':                       { no:'Venezia',                    pt:'Veneza' },
  '49 m² gross area':             { no:'49 m² BTA',                  pt:'49 m² de área bruta' },
  'Venice Architecture Biennale': { no:'arkitekturbiennalen i Venezia', pt:'Bienal de Arquitetura de Veneza' },

  // Typologies
  'Architectural model':          { no:'Arkitekturmodell',           pt:'Maquete arquitetônica' },
  'Chicken coop':                 { no:'Hønsehus',                   pt:'Galinheiro' },
  'Desktop application (Windows · macOS)': { no:'Skrivebordsapp (Windows · macOS)', pt:'App de desktop (Windows · macOS)' },
  'Desktop application (Windows)': { no:'Skrivebordsapp (Windows)', pt:'App de desktop (Windows)' },
  'Dwellings':                    { no:'Boliger',                    pt:'Habitações' },
  'Garage':                       { no:'Garasje',                    pt:'Garagem' },
  'Graduation design booklet':    { no:'Designhefte, avgangsprosjekt', pt:'Caderno de projeto de graduação' },
  'Graduation research booklet':  { no:'Forskningshefte, avgangsprosjekt', pt:'Caderno de pesquisa de graduação' },
  'Home with Bed & Breakfast':    { no:'Bolig med bed and breakfast', pt:'Casa com bed and breakfast' },
  'Photography Series':           { no:'Fotoserie',                  pt:'Série fotográfica' },
  'Regulatory Application / Change of Use': { no:'Søknad om bruksendring', pt:'Licenciamento e mudança de uso' },
  'Render / Pitch Package':       { no:'Visualisering og presentasjonsmateriell', pt:'Render e material de apresentação' },
  'Residence with workshop and bridge': { no:'Bolig med verksted og bru', pt:'Residência com oficina e ponte' },
  'Sociocultural & Sports Park':  { no:'Sosiokulturell park og idrettspark', pt:'Parque sociocultural e esportivo' },
  'Sports school':                { no:'Idrettsskole',               pt:'Escola esportiva' },
  'Visual Essay':                 { no:'Visuelt essay',              pt:'Ensaio visual' },
  'Web application':              { no:'Webapplikasjon',             pt:'Aplicação web' },
  'Website':                      { no:'Nettside',                   pt:'Site' },

  // Status
  'Concept':                      { no:'Konsept',                    pt:'Conceito' },
  'Design proposal':              { no:'Prosjektforslag',                    pt:'Proposta de projeto' },
  'In Progress':                  { no:'Pågår',                      pt:'Em andamento' },
  'In testing':                   { no:'Under testing',              pt:'Em testes' },
  'Released, in development':      { no:'Lansert, under utvikling',   pt:'Lançado, em desenvolvimento' },
  'Live':                         { no:'I drift',                    pt:'No ar' },
  'Realized':                     { no:'Realisert',                  pt:'Realizado' },

  // CV periods
  '2023 - Present':               { no:'2023 - i dag',               pt:'2023 - presente' },
  'Nov 2022 - Jun 2023':          { no:'nov. 2022 - juni 2023',      pt:'nov. 2022 - jun. 2023' },
  'Sep - Dec 2021':               { no:'sep. - des. 2021',           pt:'set. - dez. 2021' },

  // Client and year
  'Self-initiated':               { no:'Eget initiativ',             pt:'Iniciativa própria' },
  '2026 (ongoing)':               { no:'2026 (pågår)',               pt:'2026 (em andamento)' },

  // Credited roles, which sit in brackets after a name
  'build':                        { no:'byggearbeid',                    pt:'construção' },
  'building technology mentor':   { no:'bygningsteknisk veileder',   pt:'orientador de tecnologia da construção' },
  'dance':                        { no:'dans',                       pt:'dança' },
  'delegate':                     { no:'sensor',                    pt:'delegada' },
  'design mentor':                { no:'designveileder',             pt:'orientadora de projeto' },
  'drawing':                      { no:'tegninger',                    pt:'desenho' },
  'erosion studies':              { no:'erosjonsstudier',            pt:'estudos de erosão' },
  'fieldwork':                    { no:'feltarbeid',                 pt:'trabalho de campo' },
  'film':                         { no:'film',                       pt:'filme' },
  'music':                        { no:'musikk',                     pt:'música' },
  'photography':                  { no:'foto',                       pt:'fotografia' },
  'photography assistance':       { no:'fotoassistent',             pt:'assistência de fotografia' },
  'research mentor':              { no:'forskningsveileder',         pt:'orientadora de pesquisa' },
  'visualization':                { no:'visualisering',              pt:'visualização' },

  // Exhibitions, which only read well translated whole
  'Biennale Architettura 2023, Venice, May to November 2023': {
    no:'Biennale Architettura 2023, Venezia, mai til november 2023',
    pt:'Biennale Architettura 2023, Veneza, de maio a novembro de 2023' },
  'BK Expo: Sight, Sites, Situations. Photography as an Instrument for Design. Oostserre, Faculty of Architecture, TU Delft, 26 September to 20 October 2023': {
    no:'BK Expo: Sight, Sites, Situations. Photography as an Instrument for Design. Oostserre, arkitekturfakultetet ved TU Delft, 26. september til 20. oktober 2023',
    pt:'BK Expo: Sight, Sites, Situations. Photography as an Instrument for Design. Oostserre, Faculdade de Arquitetura da TU Delft, 26 de setembro a 20 de outubro de 2023' },
  'TU Delft, 1 September to 1 November 2024': {
    no:'TU Delft, 1. september til 1. november 2024',
    pt:'TU Delft, 1 de setembro a 1 de novembro de 2024' },
  'TU Delft Graduation 2023': {
    no:'TU Delft, avgangsutstilling 2023',
    pt:'TU Delft, mostra de graduação 2023' },
};

// A project name stays as it is; the descriptive half of one does not.
// "Lalibela model making" is a place plus a description, and the description
// belongs in the reader's language.
const PROJECT_TITLES = {
  'Bjørnåsen garage':          { no:'Garasje på Bjørnåsen',      pt:'Garagem em Bjørnåsen' },
  'Borders and Transitions':   { no:'Grenser og overganger',     pt:'Fronteiras e transições' },
  'Chicken coop':              { no:'Hønsehus',                  pt:'Galinheiro' },
  'Erosion':                   { no:'Erosjon',                   pt:'Erosão' },
  'Form studies':              { no:'Formstudier',               pt:'Estudos de forma' },
  'Lalibela model making':     { no:'Lalibela-modell',           pt:'Maquete de Lalibela' },
  'Meqdela Gebbi model making': { no:'Meqdela Gebbi-modell',      pt:'Maquete de Meqdela Gebbi' },
  'Stilt House':               { no:'Pælehuset',                 pt:'Casa sobre palafitas' },
  'The staircase home':        { no:'Trappehuset',               pt:'A casa da escada' },
  'Von Sauna - Floating Saunas': { no:'Von Sauna - flytende badstuer', pt:'Von Sauna - saunas flutuantes' },
};

/** Translate one metadata value. English passes straight through. */
function tVal(val, lang) {
  if (!val) return val;
  if (lang === 'en') return String(val);
  const whole = TERMS[String(val).trim()];
  if (whole) return whole[lang];
  // split() with a capturing group keeps the separators in the array.
  return String(val).split(/( · |, | \/ )/).map(part => {
    if (/^( · |, | \/ )$/.test(part)) return part;
    const hit = TERMS[part.trim()];
    if (hit) return hit[lang];
    // "Ewa Ziemiecka (dance)" keeps the name and translates the role.
    return part.replace(/\(([^)]+)\)/g, (m, role) => {
      const r = TERMS[role.trim()];
      return r ? `(${r[lang]})` : m;
    });
  }).join('');
}

/** Translate a project title, if it has a translation. */
function tTitle(title, lang) {
  if (!title) return title;
  if (lang === 'en') return String(title);
  const hit = PROJECT_TITLES[String(title).trim()];
  return hit ? hit[lang] : String(title);
}

// Text that lands inside an attribute cannot carry l-xx spans, so it is written
// as a token and swapped in per language when the page is emitted.
const ATTR_TEXT = {
  '__VIEW_LABEL__':    { en:'View',                                 no:'Visning',                                    pt:'Visualização' },
  '__PAGER_LABEL__':   { en:'More projects',                        no:'Flere prosjekter',                           pt:'Mais projetos' },
  '__LANG_LABEL__':   { en:'Select language',                      no:'Velg språk',                                 pt:'Selecionar idioma' },
  '__CONSENT_LABEL__': { en:'Analytics consent',                    no:'Samtykke til analyse',                       pt:'Consentimento para análise' },
  '__PH_NAME__':    { en:'Your name',                              no:'Navnet ditt',                                pt:'Seu nome' },
  '__PH_EMAIL__':   { en:'your@email.com',                         no:'din@epost.no',                               pt:'seu@email.com' },
  '__PH_SUBJECT__': { en:'e.g. Commission inquiry',                no:'f.eks. forespørsel om oppdrag',              pt:'ex. proposta de trabalho' },
  '__PH_MESSAGE__': { en:'Tell me about your project or question...', no:'Fortell om prosjektet eller spørsmålet ditt...', pt:'Conte sobre seu projeto ou sua dúvida...' },
};

// Attribute text that differs per page (an image's alt from its project title)
// is registered here and written as [[A:n]], then swapped in like ATTR_TEXT.
const ATTR_DYN = [];
function attrLang(f) {
  ATTR_DYN.push({ en: f('en'), no: f('no'), pt: f('pt') });
  return `[[A:${ATTR_DYN.length - 1}]]`;
}

/** One <span class="l-xx"> per language, or plain text when all three agree. */
function langSpans(value, translate) {
  const vals = LANGS.map(l => translate(value, l));
  if (vals.every(v => v === vals[0])) return esc(vals[0]);
  return LANGS.map((l, i) => `<span class="l-${l}">${esc(vals[i])}</span>`).join('');
}

/**
 * Per-language spans for a content field that carries its own translations as
 * name_no, desc_pt and so on. A field without one falls back to the shared
 * vocabulary, which already covers periods and locations, and then to English.
 */
function fieldSpans(obj, key) {
  return langSpans(obj[key] || '', (v, lang) =>
    lang === 'en' ? v : (obj[`${key}_${lang}`] || tVal(v, lang)));
}

// Meta descriptions for the fixed pages. Project pages derive theirs from
// their own first paragraph, so they are not listed here.
const PAGE_DESCRIPTIONS = {
  'index.html': {
    en: 'Architect, MSc and ir. from TU Delft, working between Norway and São Paulo. Architecture, visualization, physical models and software for the building industry.',
    no: 'Arkitekt, MSc og ir. fra TU Delft, som jobber mellom Norge og São Paulo. Arkitektur, visualisering, fysiske modeller og programvare for byggebransjen.',
    pt: 'Arquiteto, MSc e ir. pela TU Delft, entre a Noruega e São Paulo. Arquitetura, visualização, maquetes físicas e software para a construção civil.',
  },
  'work.html': {
    en: 'Selected work: architecture, competitions, architectural models, photography and software, from TU Delft graduation projects to built work in Norway and Brazil.',
    no: 'Utvalgte prosjekter: arkitektur, konkurranser, arkitekturmodeller, fotografi og programvare, fra avgangsprosjekter ved TU Delft til realiserte prosjekter i Norge og Brasil.',
    pt: 'Trabalhos selecionados: arquitetura, concursos, maquetes, fotografia e software, de projetos de graduação na TU Delft a obras na Noruega e no Brasil.',
  },
  'about.html': {
    en: 'Architect with an MSc and ir. from TU Delft, graduated cum laude. Nine years at Ebano, a graduation project in Arctic Norway, and an independent practice since 2023.',
    no: 'Arkitekt med MSc og ir. fra TU Delft, uteksaminert cum laude. Ni år hos Ebano, avgangsprosjekt i Nord-Norge og egen praksis siden 2023.',
    pt: 'Arquiteto com MSc e ir. pela TU Delft, formado cum laude. Nove anos na Ebano, um projeto de graduação no Ártico norueguês e escritório próprio desde 2023.',
  },
  'services.html': {
    en: 'Architecture, BIM and parametric modeling, technical documentation, physical models, drone photogrammetry, research and planning applications in Norway.',
    no: 'Arkitektur, BIM og parametrisk modellering, teknisk dokumentasjon, fysiske modeller, dronefotogrammetri, forskning og byggesøknader i Norge.',
    pt: 'Arquitetura, BIM e modelagem paramétrica, documentação técnica, maquetes físicas, fotogrametria com drone, pesquisa e licenciamento na Noruega.',
  },
  'contact.html': {
    en: 'Available for architectural commissions, research collaborations, model making and consultancy. Based in the Oslo region, with clients across five countries.',
    no: 'Tilgjengelig for arkitektoppdrag, forskningssamarbeid, modellbygging og rådgivning. Med base i Osloregionen og kunder i fem land.',
    pt: 'Disponível para encomendas de arquitetura, colaborações de pesquisa, maquetes e consultoria. Baseado na região de Oslo, com clientes em cinco países.',
  },
  'privacy.html': {
    en: 'How simonflatin.com handles analytics, application links and messages from the contact form.',
    no: 'Hvordan simonflatin.com håndterer analyse, lenker i søknader og meldinger fra kontaktskjemaet.',
    pt: 'Como o simonflatin.com trata análise, links em candidaturas e mensagens do formulário de contato.',
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

// Link previews in mail, LinkedIn and chat apps. One JPEG for every page,
// because not every preview renderer reads WebP.
const OG_IMAGE  = '/content/main/web/og.jpg';
const OG_LOCALE = { en:'en_GB', no:'nb_NO', pt:'pt_BR' };

/** Open Graph tags. `title` arrives already entity-encoded from <title>. */
function ogHtml(url, title, desc, lang) {
  const rows = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${NAME}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${title}" />`,
    desc ? `<meta property="og:description" content="${esc(desc)}" />` : '',
    `<meta property="og:locale" content="${OG_LOCALE[lang]}" />`,
    fs.existsSync(path.join(ROOT, OG_IMAGE)) ? `<meta property="og:image" content="${SITE_URL}${OG_IMAGE}" />` : '',
    `<meta name="twitter:card" content="summary_large_image" />`,
  ];
  return rows.filter(Boolean).map(r => '\n  ' + r).join('');
}

// Every canonical URL emitted, for sitemap.xml.
const SITEMAP_URLS = [];

/** Write one page three times, one per language, each with a single language. */
function emitLangVariants(rel, html) {
  for (const lang of LANGS) {
    let out = stripLangs(html, lang);
    out = out.replace('<html lang="en">', `<html lang="${lang}">`);
    const desc = metaDescription(rel, lang, out);
    const url = SITE_URL + linkBase(lang) + urlOf(rel);
    const title = PAGE_TITLES[rel];
    if (title) out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${title[lang]}</title>`);
    // Read back from the page, so project titles registered at build time count too.
    const shownTitle = (out.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const headAt = out.includes('<meta charset="UTF-8" />') ? '<meta charset="UTF-8" />' : '<head>';
    out = out.replace(headAt, headAt + '\n  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />\n' + hreflangHtml(rel) +
      `\n  <link rel="canonical" href="${url}" />` +
      (desc ? `\n  <meta name="description" content="${esc(desc)}" />` : '') +
      ogHtml(url, shownTitle, desc, lang));
    // The form confirmation page is not worth indexing.
    if (rel !== 'contact-success.html') {
      SITEMAP_URLS.push(SITE_URL + linkBase(lang) + urlOf(rel));
    }
    out = out.split('<!--LANGNAV-->').join(langLinksHtml(lang, rel));
    out = out.split('__LINKBASE__').join(linkBase(lang));
    for (const [token, t] of Object.entries(ATTR_TEXT)) out = out.split(token).join(esc(t[lang]));
    out = out.replace(/\[\[A:(\d+)\]\]/g, (m, i) => esc(ATTR_DYN[i][lang]));
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

/**
 * Pixel size of a WebP or JPEG, read from its header. Written into width and
 * height so the browser reserves the space before the file arrives, instead of
 * pushing the text down when it lands. Null for anything it cannot read.
 */
function imageSize(urlPath) {
  let b;
  try { b = fs.readFileSync(path.join(ROOT, decodeURI(urlPath))); } catch (e) { return null; }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') { const n = b.readUInt32LE(21); return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 }; }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** width="" height="" for an image URL, or nothing. */
function sizeAttrs(urlPath) {
  const s = urlPath && imageSize(urlPath);
  return s ? ` width="${s.w}" height="${s.h}"` : '';
}

/**
 * srcset and sizes for an image URL, listing the -800 and -1200 copies that
 * MEMORY/make_image_sizes.js writes beside it. Nothing when there are none.
 */
function srcsetAttrs(urlPath, sizes) {
  const full = urlPath && imageSize(urlPath);
  if (!full || !/\.webp$/.test(urlPath)) return '';
  const set = [800, 1200]
    .map(w => [urlPath.replace(/\.webp$/, `-${w}.webp`), w])
    .filter(([u, w]) => w < full.w && fs.existsSync(path.join(ROOT, decodeURI(u))))
    .map(([u, w]) => `${u} ${w}w`);
  if (!set.length) return '';
  set.push(`${urlPath} ${full.w}w`);
  return ` srcset="${set.join(', ')}" sizes="${sizes}"`;
}

// How wide each card class is drawn, for sizes. Phones always show one column.
const CARD_SIZES = {
  'card--full': '(max-width: 900px) 100vw, 1400px',
  'card--large': '(max-width: 900px) 100vw, 60vw',
  'card--medium': '(max-width: 900px) 100vw, 45vw',
  'card--wide': '(max-width: 900px) 100vw, 50vw',
  'card--third': '(max-width: 900px) 100vw, 35vw',
};

function grad(i) { return GRADIENTS[i % GRADIENTS.length]; }

// Video files live in projects/<folder>/video/, a sibling of web/, so the image
// discovery in findImages() never picks up a poster frame as a gallery image.
function videoDir(folder) { return `projects/${folder}/video`; }

/** Which of base.webm / base.mp4 / base.jpg actually exist in that folder. */
// If a <base>-sm cut has been encoded alongside the full-size one, narrow
// screens get it instead. A browser plays the first <source> it supports whose
// media matches, so the small pair has to come first and carry the query.
const SMALL_SUFFIX = '-sm';
const SMALL_MEDIA  = '(max-width: 900px)';

function videoParts(folder, name) {
  const dir = videoDir(folder);
  const base = String(name).replace(/\.[^.]+$/, '');
  const has = file => fs.existsSync(path.join(ROOT, dir, file));
  const pair = (suffix, media) => [['.webm', 'video/webm'], ['.mp4', 'video/mp4']]
    .filter(([e]) => has(base + suffix + e))
    .map(([e, t]) => `<source${media ? ` media="${media}"` : ''} src="/${dir}/${base}${suffix}${e}" type="${t}" />`)
    .join('');
  return {
    sources: pair(SMALL_SUFFIX, SMALL_MEDIA) + pair('', ''),
    poster: has(base + '.jpg') ? `/${dir}/${base}.jpg` : null,
  };
}

/**
 * The face of a project card: a hover-played loop when the project declares a
 * cardvideo, otherwise the cover image, otherwise a gradient. preload="none"
 * keeps the bytes off the page until someone actually hovers the card.
 */
function cardMedia(data, index, eager, cls) {
  if (data.cardvideo) {
    const { sources, poster } = videoParts(data._folder, data.cardvideo);
    if (sources) {
      return `<video class="card__video" muted loop playsinline preload="none"` +
        `${poster ? ` poster="${poster}"` : ''} aria-label="${esc(data.title)}">${sources}</video>`;
    }
  }
  return data._cover
    ? `<img src="${webSrc(`projects/${data._folder}`, data._cover)}"${srcsetAttrs(webSrc(`projects/${data._folder}`, data._cover), CARD_SIZES[cls] || CARD_SIZES['card--wide'])} alt="${attrLang(l => tTitle(data.title, l))}" loading="${eager ? 'eager' : 'lazy'}" />`
    : `<div class="card__placeholder" style="background:${grad(index)};width:100%;height:100%;"></div>`;
}

// Card loops hold on their poster until hovered, so /work does not turn into a
// wall of motion. Touch devices never fire mouseenter and simply keep the still.
const CARD_VIDEO_SCRIPT = `  <script>
    (function(){
      document.querySelectorAll('.card__video').forEach(function(v){
        var card = v.closest('.card');
        if(!card) return;
        card.addEventListener('mouseenter', function(){
          var p = v.play(); if(p && p.catch) p.catch(function(){});
        });
        // load() drops back to the poster; frame 0 of the loop is black.
        card.addEventListener('mouseleave', function(){ v.pause(); v.load(); });
      });
    })();
  </script>`;

/** Extract YouTube embed URL from various YouTube URL formats */
function youtubeEmbedUrl(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  // nocookie: no tracking cookie is set unless the visitor actually plays it.
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}

function findImages(dir) {
  // The web/ derivatives are what actually deploy; the originals are kept
  // locally but not committed. Discover from web/ when it exists, so the build
  // finds the same set of images on the server as it does on this machine.
  const webDir = path.join(dir, 'web');
  const from = fs.existsSync(webDir) ? webDir : dir;
  return fs.readdirSync(from)
    .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    // Smaller copies for srcset, the phone crop and the link preview are not
    // images of their own.
    .filter(f => !/-(800|1200|sm)\.webp$/.test(f) && f !== 'og.jpg')
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

// Google Analytics loads only after the visitor chooses Allow in the consent
// bar (ekomloven section 3-15). The choice itself is kept in localStorage so the
// bar does not return on every page; declining also clears any _ga cookies left
// from an earlier Allow. The bar's markup lives in footerHtml().
const GA_TAG = `<script>
(function(){
  var ID='G-VBPFZJZXY9',KEY='sf-analytics',loaded=false;
  function get(){try{return localStorage.getItem(KEY);}catch(e){return null;}}
  function set(v){try{localStorage.setItem(KEY,v);}catch(e){}}
  function load(){
    if(loaded)return;loaded=true;
    window.dataLayer=window.dataLayer||[];
    window.gtag=function(){dataLayer.push(arguments);};
    gtag('js',new Date());gtag('config',ID);
    var s=document.createElement('script');s.async=true;
    s.src='https://www.googletagmanager.com/gtag/js?id='+ID;
    document.head.appendChild(s);
  }
  function clearCookies(){
    var host=location.hostname.replace(/^www\\./,'');
    document.cookie.split(';').forEach(function(c){
      var n=c.split('=')[0].trim();
      if(!/^_ga/.test(n))return;
      ['','; domain=.'+host,'; domain='+location.hostname].forEach(function(d){
        document.cookie=n+'=; Max-Age=0; path=/'+d;
      });
    });
  }
  function bar(on){var b=document.getElementById('consent');if(b)b.hidden=!on;}
  if(get()==='yes')load();
  document.addEventListener('DOMContentLoaded',function(){
    // On the start page the question waits until the visitor scrolls or has
    // had five seconds with the photograph; the footer button opens it anytime.
    if(!get()){
      if(document.getElementById('mc')){
        var asked=false;
        var ask=function(){if(asked)return;asked=true;window.removeEventListener('scroll',ask);if(!get())bar(true);};
        setTimeout(ask,5000);window.addEventListener('scroll',ask,{passive:true});
      }else bar(true);
    }
    document.addEventListener('click',function(e){
      var t=e.target.closest('[data-consent]');
      if(!t)return;
      var v=t.getAttribute('data-consent');
      if(v==='open'){bar(true);return;}
      set(v);bar(false);
      if(v==='yes')load();
      else{clearCookies();if(loaded)location.reload();}
    });
  });
})();
</script>
<script>
/* Images arrive from the page slowly, once, as they come into view. Without
 * this script, or with reduced motion, they are simply there. */
(function(){
  if(!('IntersectionObserver' in window)||(window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches))return;
  document.documentElement.classList.add('img-fade');
  document.addEventListener('DOMContentLoaded',function(){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){
      if(!e.isIntersecting)return;
      var i=e.target;io.unobserve(i);
      var show=function(){i.classList.add('is-in');};
      if(i.complete)show();else{i.addEventListener('load',show);i.addEventListener('error',show);}
    });},{rootMargin:'0px 0px -6% 0px'});
    document.querySelectorAll('.project-gallery img, .card__img-wrap img').forEach(function(i){io.observe(i);});
  });
})();
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
        <li><a href="__LINKBASE__work"><span class="l-en">Work</span><span class="l-no">Prosjekter</span><span class="l-pt">Projetos</span></a></li>
        <li><a href="__LINKBASE__services"><span class="l-en">Services</span><span class="l-no">Tjenester</span><span class="l-pt">Servi&ccedil;os</span></a></li>
        <li><a href="__LINKBASE__about"><span class="l-en">About</span><span class="l-no">Om</span><span class="l-pt">Sobre</span></a></li>
        <li><a href="__LINKBASE__contact"><span class="l-en">Contact</span><span class="l-no">Kontakt</span><span class="l-pt">Contato</span></a></li>
      </ul>
      <div class="lang-toggle" role="group" aria-label="__LANG_LABEL__">
<!--LANGNAV-->
      </div>
    </div>
  </nav>`;
}

function footerHtml(prefix) {
  // Norwegian clients expect an organisation number somewhere on the site.
  // Set ORG_NR to have it appear; left empty it is simply omitted.
  const ENK = 'Bj&oslash;rk&aring; Flatin ENK';
  // MVA marks the VAT registration, which ehandelsloven section 8 asks for.
  const orgEn = ORG_NR ? ` &middot; org.no. ${ORG_NR} MVA` : '';
  const orgNo = ORG_NR ? ` &middot; org.nr. ${ORG_NR} MVA` : '';
  return `  <section id="consent" class="consent" aria-label="__CONSENT_LABEL__" hidden>
    <p class="consent__text"><span class="l-en">May I use cookies to count visits?</span><span class="l-no">Kan jeg bruke informasjonskapsler til &aring; telle bes&oslash;k?</span><span class="l-pt">Posso usar cookies para contar as visitas?</span> <a href="__LINKBASE__privacy"><span class="l-en">More</span><span class="l-no">Mer</span><span class="l-pt">Mais</span></a></p>
    <div class="consent__buttons">
      <button type="button" data-consent="yes"><span class="l-en">Allow</span><span class="l-no">Tillat</span><span class="l-pt">Permitir</span></button>
      <button type="button" data-consent="no"><span class="l-en">Decline</span><span class="l-no">Avsl&aring;</span><span class="l-pt">Recusar</span></button>
    </div>
  </section>
  <footer>
    <div>&copy; ${new Date().getFullYear()} Simon H.J. Bj&oslash;rk&aring; Flatin</div>
    <div class="footer__identity"><span class="l-en">Architect MNAL, MSc / ir. &middot; ${ENK}${orgEn} &middot; Oslo region, Norway and S&atilde;o Paulo</span><span class="l-no">Arkitekt MNAL, MSc / ir. &middot; ${ENK}${orgNo} &middot; Osloregionen og S&atilde;o Paulo</span><span class="l-pt">Arquiteto MNAL, MSc / ir. &middot; ${ENK}${orgEn} &middot; Regi&atilde;o de Oslo, Noruega, e S&atilde;o Paulo</span></div>
    <div class="footer__links">
      <a href="__LINKBASE__about"><span class="l-en">About</span><span class="l-no">Om</span><span class="l-pt">Sobre</span></a>
      <a href="__LINKBASE__work"><span class="l-en">Work</span><span class="l-no">Prosjekter</span><span class="l-pt">Projetos</span></a>
      <a href="__LINKBASE__contact"><span class="l-en">Contact</span><span class="l-no">Kontakt</span><span class="l-pt">Contato</span></a>
      <a href="${LINKEDIN_URL}" target="_blank" rel="noopener">LinkedIn</a>
      <a href="__LINKBASE__privacy"><span class="l-en">Privacy</span><span class="l-no">Personvern</span><span class="l-pt">Privacidade</span></a>
      <button type="button" class="footer__cookies" data-consent="open"><span class="l-en">Cookies</span><span class="l-no">Informasjonskapsler</span><span class="l-pt">Cookies</span></button>
    </div>
  </footer>`;
}

// ─────────────────────────────────────────────
//  Card HTML helper
// ─────────────────────────────────────────────

const GRID_CLASSES = { full:'card--full', large:'card--large', medium:'card--medium', wide:'card--wide', third:'card--third' };
// 14-step pattern: alternates large-on-left vs large-on-right every 7 cards
const AUTO_PATTERN = [
  'card--large','card--medium',              // row: 7+5=12  (large LEFT)
  'card--wide','card--wide',                 // row: 6+6=12
  'card--third','card--third','card--third', // row: 4+4+4=12
  'card--medium','card--large',              // row: 5+7=12  (large RIGHT)
  'card--wide','card--wide',                 // row: 6+6=12
  'card--third','card--third','card--third', // row: 4+4+4=12
];

// The /work grid is placed by hand: projects in this order, each starting at the
// given column of 12. A card that starts left of the one before it opens a new
// row. Projects not listed here follow at the end in the normal flow.
const WORK_LAYOUT = [
  ['sesc-mogi-das-cruzes', 1], ['florestaprod', 9],
  ['tinn', 4],
  ['sknf-flagship', 1], ['von-sauna', 8],
  ['bjornasen-house-addition', 6],
  ['the-nine-boxes', 1], ['lalibela-modelmaking', 8],
  ['chicken-coop', 4],
  ['omsorgsgruppen-valer', 2], ['arctic-symphony', 6],
  ['meqdela-gebbi', 1], ['borders-transitions', 7],
  ['symphony-time-architecture', 3],
  ['erosion', 1], ['assembling-arctic-symphony', 6],
  ['stilt-house', 2], ['oud-alblas', 8],
  ['billow-maas', 1],
  ['staircase-home', 1], ['form-studies', 8],
];
const GRID_SPANS = { 'card--full':12, 'card--large':7, 'card--wide':6, 'card--medium':5, 'card--third':4 };

function cardHtml(data, index, prefix, column) {
  const cls     = GRID_CLASSES[(data.grid||'').toLowerCase()] || AUTO_PATTERN[index % AUTO_PATTERN.length];
  const slug    = data.slug;
  const folder  = data._folder; // e.g. 2024_lalibela-modelmaking
  const cover   = data._cover;
  const imgHtml = cardMedia(data, index, false, cls);
  const year    = data.year || '';
  const org     = data.organization || '';
  const sub     = [year, org].filter(Boolean).join(' · ');
  // Comma-separated individual tags for JS filtering
  // `tags` drives the /work filters; `category` stays as the card's label, so a
  // card can read "Software · Specification tool" while filtering under Software.
  const cats    = (data.tags || data.category || '').split('·').map(t => t.trim()).filter(Boolean).join(',');

  return `
      <a class="card ${cls}${column ? ' card--at' : ''}" href="__LINKBASE__projects/${esc(slug)}/" data-categories="${esc(cats)}"${column ? ` style="--at:${column} / span ${GRID_SPANS[cls]}"` : ''}>
        <div class="card__img-wrap">${imgHtml}</div>
        <div class="card__info">
          <div class="card__category">${langSpans(data.category || '', tVal)}</div>
          <div class="card__name">${langSpans(data.title || slug, tTitle)}</div>
          ${sub ? `<div class="card__year">${langSpans(sub, tVal)}</div>` : ''}
        </div>
      </a>`;
}

// ─────────────────────────────────────────────
//  Page generators
// ─────────────────────────────────────────────

function generateProjectPage(data, folderName, images, prev, next) {
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
    'Size':          { no:'Areal',                pt:'Tamanho' },
    'Status':        { no:'Status',               pt:'Status' },
    'Client':        { no:'Oppdragsgiver',           pt:'Cliente' },
    'Collaborators': { no:'Samarbeidspartnere',   pt:'Colaboradores' },
    'Mentors':       { no:'Veiledere',            pt:'Orientadores' },
    'Exhibitions':   { no:'Utstillinger',         pt:'Exposições' },
  };
  function mRow(label, val) {
    if (!val) return '';
    const t = META_LABELS[label] || { no:label, pt:label };
    return `\n          <dt><span class="l-en">${esc(label)}</span><span class="l-no">${esc(t.no)}</span><span class="l-pt">${esc(t.pt)}</span></dt><dd>${langSpans(val, tVal)}</dd>`;
  }

  // `video:` takes either a YouTube URL, which embeds in a block further down
  // exactly as before, or a bare filename served from the project's own video/
  // folder. A self-hosted walkthrough becomes the hero instead: on a website
  // project the moving page says more than any still of it, so it leads.
  const embedUrl = youtubeEmbedUrl(data.video);
  const local    = !embedUrl && data.video ? videoParts(folderName, data.video) : null;

  // A near-square or upright picture would lose its top and bottom to the
  // 80vh crop, so it is shown whole, centred on the page, instead.
  const heroSize = hero && imageSize(webSrc(imgDir, hero));
  const heroTall = !!(heroSize && heroSize.h / heroSize.w > 0.8);
  const heroHtml = local && local.sources
    ? `  <div class="project-hero project-hero--video"><video autoplay muted loop playsinline controls preload="metadata"` +
      `${local.poster ? ` poster="${local.poster}"${sizeAttrs(local.poster)}` : ''} aria-label="${esc(title)}">${local.sources}</video></div>`
    : hero
      ? `  <div class="project-hero${heroTall ? ' project-hero--tall' : ''}"><img src="${webSrc(imgDir, hero)}"${sizeAttrs(webSrc(imgDir, hero))}${srcsetAttrs(webSrc(imgDir, hero), '100vw')} alt="${attrLang(l => tTitle(title, l))}" loading="eager" fetchpriority="high" /></div>`
      : `  <div class="project-hero project-hero--placeholder" style="background:${grad(0)};"></div>`;

  // The gallery reads like a book rather than a feed. Drawings (found by their
  // file name) sit narrower, printed onto the page. A project can also set
  //   layout image-03-ai-lab: small | pair | full | drawing
  //   caption image-03-ai-lab: English | Norsk | Português
  // in its header. Two neighbouring `pair` images share a row.
  const DRAWING = /(^|-)(plans?|sections?|elevations?|axonometric|axo|drawings?|sketch(es)?|diagram)(-|$)/i;
  const stem    = f => f.replace(/\.[^.]+$/, '').toLowerCase();
  const figs = gallery.map((img, i) => {
    const lay = (data['layout_' + stem(img)] || '').toLowerCase() || (DRAWING.test(stem(img)) ? 'drawing' : 'full');
    const capRaw = data['caption_' + stem(img)];
    const cap = capRaw ? (([en, no, pt]) => ({ en, no: no || en, pt: pt || en }))(capRaw.split('|').map(s => s.trim())) : null;
    const src = webSrc(imgDir, img);
    const alt = attrLang(l => cap ? `${tTitle(title, l)}: ${cap[l]}`
      : `${tTitle(title, l)}, ${({ en:'image', no:'bilde', pt:'imagem' })[l]} ${i + 1} ${({ en:'of', no:'av', pt:'de' })[l]} ${gallery.length}`);
    const sizes = lay === 'full' ? '(max-width: 1200px) 100vw, 1200px' : '(max-width: 800px) 100vw, 880px';
    const capHtml = cap ? `<figcaption><span class="l-en">${esc(cap.en)}</span><span class="l-no">${esc(cap.no)}</span><span class="l-pt">${esc(cap.pt)}</span></figcaption>` : '';
    return { lay, html: `<figure class="fig--${lay}"><img src="${src}"${sizeAttrs(src)}${srcsetAttrs(src, sizes)} alt="${alt}" loading="lazy" />${capHtml}</figure>` };
  });
  const rows = [];
  for (let i = 0; i < figs.length; i++) {
    if (figs[i].lay === 'pair' && figs[i + 1] && figs[i + 1].lay === 'pair') {
      rows.push(`    <div class="fig-pair">${figs[i].html}${figs[i + 1].html}</div>`); i++;
    } else rows.push(`    ${figs[i].html}`);
  }
  const galleryHtml = gallery.length
    ? `\n  <div class="project-gallery">\n` + rows.join('\n') + `\n  </div>`
    : '';

  // A self-hosted video is already the hero, so only a YouTube embed gets a
  // block of its own down here.
  const videoHtml = embedUrl
    ? `\n  <div class="project-video">\n    <button type="button" class="yt-facade" data-yt="${embedUrl}?autoplay=1" data-title="${esc(title)}"` +
      `${hero ? ` style="background-image:url('${webSrc(imgDir, hero)}')"` : ''}>` +
      `<span class="yt-facade__play"><span class="l-en">Play video</span><span class="l-no">Spill av video</span><span class="l-pt">Reproduzir v&iacute;deo</span></span>` +
      `<span class="yt-facade__note"><span class="l-en">Plays from YouTube</span><span class="l-no">Spilles av fra YouTube</span><span class="l-pt">Reproduzido do YouTube</span></span></button>\n` +
      `    <script>document.querySelector('.yt-facade').addEventListener('click',function(){var f=document.createElement('iframe');f.src=this.dataset.yt;f.title=this.dataset.title;f.allow='autoplay; fullscreen';f.allowFullscreen=true;this.replaceWith(f);});</script>\n  </div>`
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
    .project-hero img { width:100%; height:auto; display:block; max-height:80vh; object-fit:cover; }
    .project-hero--tall img { width:auto; max-width:100%; margin:0 auto; object-fit:contain; }
    /* The walkthrough is a fixed-size recording, not a photograph, so it is
       framed rather than stretched: never shown wider than it was captured,
       centred in a black band. Enlarging it past its own resolution only
       softens it. The video keeps a black background of its own because a
       height cap can leave the element fractionally wider than the picture. */
    .project-hero--video { max-height:none; background:#000; display:flex; align-items:center; justify-content:center; }
    .project-hero video { display:block; width:100%; max-width:1280px; max-height:78vh; height:auto; background:#000; }
    .project-hero--placeholder { height:60vh; }
    .project-body { max-width:1200px; margin:0 auto; padding:4rem 4rem 0;
      display:grid; grid-template-columns:260px 1fr; gap:5rem; }
    .project-meta { display:grid; grid-template-columns:1fr; }
    .project-meta dt { font-size:.68rem; font-weight:400; letter-spacing:.14em;
      text-transform:uppercase; color:var(--muted); padding-top:1.2rem; }
    .project-meta dt:first-child { padding-top:0; }
    .project-meta dd { font-size:.88rem; line-height:1.55; color:var(--accent);
      border-bottom:1px solid rgba(28,28,26,.08); padding-bottom:.8rem; }
    .project-title { font-family:var(--serif); font-size:clamp(1.8rem,3.5vw,2.8rem);
      font-weight:400; line-height:1.2; margin-bottom:2rem; }
    .project-content p { font-size:.95rem; line-height:1.85; color:var(--accent);
      margin-bottom:1.3rem; max-width:620px; }
    .project-back { display:inline-block; margin-top:2.5rem; font-size:.78rem;
      font-weight:400; letter-spacing:.14em; text-transform:uppercase;
      color:var(--muted); text-decoration:none;
      border-bottom:1px solid rgba(107,104,96,.4); padding-bottom:2px;
      transition:color .2s,border-color .2s; }
    .project-back:hover { color:var(--dark); border-color:var(--dark); }
    .project-content a { color:inherit; text-decoration:underline; text-decoration-color:rgba(28,28,26,.3);
      text-decoration-thickness:1px; text-underline-offset:3px; transition:text-decoration-color .4s; }
    .project-content a:hover { text-decoration-color:var(--dark); }
    .project-gallery { max-width:1200px; margin:5rem auto 0; padding:0 4rem;
      display:flex; flex-direction:column; gap:3.5rem; }
    .project-gallery figure { margin:0; }
    .project-gallery img { width:100%; height:auto; display:block; }
    .project-gallery figcaption { font-size:.78rem; line-height:1.5; color:var(--muted); margin-top:.8rem; }
    .project-gallery .fig--small { width:min(560px,100%); margin:3.5rem auto; }
    .project-gallery .fig--drawing { width:min(880px,100%); margin:3.5rem auto; }
    .fig--drawing img { mix-blend-mode:multiply; }
    .fig-pair { display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; align-items:start; }
    .project-video { max-width:1200px; margin:4rem auto 0; padding:0 4rem; }
    .yt-facade { width:100%; aspect-ratio:16/9; border:none; cursor:pointer; display:flex; flex-direction:column;
      align-items:center; justify-content:center; gap:.5rem; color:#fff; font:inherit;
      background:#1c1c1a center/cover no-repeat; box-shadow:inset 0 0 0 100vmax rgba(0,0,0,.4); }
    .yt-facade__play { font-size:.78rem; letter-spacing:.18em; text-transform:uppercase; border:1px solid rgba(255,255,255,.8); padding:.8rem 1.4rem; }
    .yt-facade:hover .yt-facade__play { background:#fff; color:#1c1c1a; }
    .yt-facade__note { font-size:.7rem; opacity:.8; }
    .project-video iframe,
    .project-video video { width:100%; aspect-ratio:16/9; border:none; display:block;
      background:#000; object-fit:cover; }
    .project-role { font-size:.95rem; line-height:1.7; color:var(--dark); margin:-1rem 0 2rem; max-width:620px; }
    .project-role__label { display:block; font-size:.68rem; font-weight:400; letter-spacing:.14em;
      text-transform:uppercase; color:var(--muted); margin-bottom:.3rem; }
    .project-pager { max-width:1200px; margin:5rem auto 0; padding:2rem 4rem 0;
      border-top:1px solid rgba(28,28,26,.1); display:flex; justify-content:space-between; gap:2rem; }
    .project-pager a { text-decoration:none; color:var(--dark); display:flex; flex-direction:column; gap:.4rem; max-width:45%; }
    .project-pager__next { text-align:right; margin-left:auto; }
    .project-pager__dir { font-size:.68rem; font-weight:400; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); }
    .project-pager__name { font-family:var(--serif); font-size:clamp(1.05rem,1.6vw,1.3rem); line-height:1.3; }
    .project-pager a:hover .project-pager__name { color:var(--muted); }
    @media(max-width:800px) {
      .project-body { grid-template-columns:1fr; gap:3rem; padding:3rem 1.5rem 0; }
      /* On a phone the text comes first; the facts follow it instead of
         pushing the description below the first screen. */
      .project-body > div:first-child { order:2; }
      .project-gallery { padding:0 1.5rem; gap:2.5rem; }
      .project-gallery .fig--small, .project-gallery .fig--drawing { margin:1rem auto; }
      .fig-pair { grid-template-columns:1fr; gap:2.5rem; }
      .project-pager { padding:2rem 1.5rem 0; }
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
      <h1 class="project-title">${langSpans(title, tTitle)}</h1>
${data.role ? `      <p class="project-role"><span class="project-role__label"><span class="l-en">My role</span><span class="l-no">Min rolle</span><span class="l-pt">Meu papel</span></span>${fieldSpans(data, 'role')}</p>\n` : ''}      <div class="l-en">${data.paragraphs.map(p => `<p>${escLinks(p)}</p>`).join('\n      ')}</div>
      <div class="l-no">${(data.paragraphs_no && data.paragraphs_no.length ? data.paragraphs_no : data.paragraphs).map(p => `<p>${escLinks(p)}</p>`).join('\n      ')}</div>
      <div class="l-pt">${(data.paragraphs_pt && data.paragraphs_pt.length ? data.paragraphs_pt : data.paragraphs).map(p => `<p>${escLinks(p)}</p>`).join('\n      ')}</div>
      <a href="__LINKBASE__work" class="project-back"><span class="l-en">&larr; All work</span><span class="l-no">&larr; Alle prosjekter</span><span class="l-pt">&larr; Todo o trabalho</span></a>
    </div>
  </div>
${galleryHtml}
${videoHtml}
${prev && next && prev !== data ? `
  <nav class="project-pager" aria-label="__PAGER_LABEL__">
    <a href="__LINKBASE__projects/${esc(prev.slug)}/" class="project-pager__prev"><span class="project-pager__dir"><span class="l-en">&larr; Previous</span><span class="l-no">&larr; Forrige</span><span class="l-pt">&larr; Anterior</span></span><span class="project-pager__name">${langSpans(prev.title, tTitle)}</span></a>
    <a href="__LINKBASE__projects/${esc(next.slug)}/" class="project-pager__next"><span class="project-pager__dir"><span class="l-en">Next &rarr;</span><span class="l-no">Neste &rarr;</span><span class="l-pt">Pr&oacute;ximo &rarr;</span></span><span class="project-pager__name">${langSpans(next.title, tTitle)}</span></a>
  </nav>` : ''}

${footerHtml('../../')}
${LANG_TOGGLE_SCRIPT}
</body>
</html>
`;
}

function generateWorkPage(projects) {
  const column = new Map(WORK_LAYOUT);
  const order = WORK_LAYOUT.map(([slug]) => slug);
  const rank = d => order.includes(d.slug) ? order.indexOf(d.slug) : order.length;
  const cards = [...projects].sort((a, b) => rank(a) - rank(b))
    .map((d, i) => cardHtml(d, i, '', column.get(d.slug))).join('');
  // The same projects as a plain list, for a reader who wants the whole body
  // of work at a glance rather than one image at a time.
  const rows = projects.map(d => {
    const cats = (d.tags || d.category || '').split('·').map(x => x.trim()).filter(Boolean).join(',');
    return `
        <a class="work-row" href="__LINKBASE__projects/${esc(d.slug)}/" data-categories="${esc(cats)}">` +
      `<span class="work-row__year">${esc(d.year || '')}</span>` +
      `<span class="work-row__title">${langSpans(d.title || d.slug, tTitle)}</span>` +
      `<span class="work-row__cat">${langSpans(d.category || '', tVal)}</span>` +
      `<span class="work-row__place">${langSpans(d.location || '', tVal)}</span></a>`;
  }).join('');

  // Collect unique individual category tags (sorted alphabetically)
  const tagSet = new Set();
  projects.forEach(p => {
    (p.tags || p.category || '').split('·').map(t => t.trim()).filter(Boolean).forEach(t => tagSet.add(t));
  });
  const filterTags = ['All', ...Array.from(tagSet).sort()];
  const filterBtns = filterTags.map(tag =>
    `<button class="work-filter-btn${tag === 'All' ? ' active' : ''}" data-filter="${esc(tag)}">${langSpans(tag, tVal)}</button>`
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
      font-size:0.68rem; font-weight:400; letter-spacing:0.14em;
      text-transform:uppercase; color:var(--muted); padding:0.2rem 0;
      font-family:var(--sans); border-bottom:1.5px solid transparent;
      transition:color 0.2s, border-color 0.2s; }
    .work-filter-btn:hover { color:var(--dark); }
    .work-filter-btn.active { color:var(--dark); border-bottom-color:var(--dark); }
    .work-grid  { max-width:1400px; margin:0 auto; padding:4rem 4rem 0; }
    .work-view { margin-left:auto; display:flex; gap:1rem; }
    .work-list { display:none; max-width:1400px; margin:0 auto; padding:2rem 4rem 0; }
    body.view-list .work-grid { display:none; }
    body.view-list .work-list { display:block; }
    .work-row { display:grid; grid-template-columns:7rem 1.4fr 1fr 1fr; gap:1.5rem; align-items:baseline;
      padding:1rem 0; border-bottom:1px solid rgba(28,28,26,.1); text-decoration:none; color:var(--accent); }
    .work-row__year { font-size:.75rem; color:var(--muted); }
    .work-row__title { font-family:var(--serif); font-size:1.15rem; color:var(--dark); }
    .work-row__cat, .work-row__place { font-size:.8rem; color:var(--muted); }
    .work-row:hover .work-row__title { color:var(--muted); }
    @media(max-width:700px) {
      .work-row { grid-template-columns:4.5rem 1fr; gap:.2rem 1rem; }
      .work-row__cat { grid-column:2; }
      .work-row__place { display:none; }
    }
    @media(max-width:900px) {
      .work-intro, .work-filters, .work-grid, .work-list { padding-left:1.5rem; padding-right:1.5rem; }
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
      <div class="work-view" role="group" aria-label="__VIEW_LABEL__">
        <button class="work-filter-btn active" data-view="grid" aria-pressed="true"><span class="l-en">Images</span><span class="l-no">Bilder</span><span class="l-pt">Imagens</span></button>
        <button class="work-filter-btn" data-view="list" aria-pressed="false"><span class="l-en">List</span><span class="l-no">Liste</span><span class="l-pt">Lista</span></button>
      </div>
  </div>

  <div class="work-grid">
    <div class="projects" id="work-projects">
${cards}
    </div>
  </div>

  <div class="work-list">${rows}
  </div>

${footerHtml()}
  <script>
    (function(){
      var btns  = document.querySelectorAll('.work-filter-btn[data-filter]');
      var cards = document.querySelectorAll('#work-projects .card, .work-row');
      var views = document.querySelectorAll('.work-filter-btn[data-view]');
      views.forEach(function(v){
        v.addEventListener('click', function(){
          views.forEach(function(b){ b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
          v.classList.add('active'); v.setAttribute('aria-pressed','true');
          document.body.classList.toggle('view-list', v.dataset.view === 'list');
        });
      });
      btns.forEach(function(btn){
        btn.addEventListener('click', function(){
          btns.forEach(function(b){ b.classList.remove('active'); });
          btn.classList.add('active');
          var filter = btn.dataset.filter;
          document.getElementById('work-projects').classList.toggle('is-filtered', filter !== 'All');
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
${CARD_VIDEO_SCRIPT}
${LANG_TOGGLE_SCRIPT}
</body>
</html>
`;
}

// Who and where, in the form Google and AI search read: one person, one
// practice, every spelling of the name, and the profiles that confirm them.
const PERSON_JSONLD = `<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Person',
      '@id': `${SITE_URL}/#person`,
      name: 'Simon H.J. Bjørkå Flatin',
      alternateName: ['Simon Flatin', 'Simon Bjørkå Flatin', 'Simon Holger Julian Bjørkå Flatin'],
      jobTitle: 'Architect',
      url: `${SITE_URL}/`,
      image: `${SITE_URL}/content/about/web/portrait.webp`,
      alumniOf: { '@type': 'CollegeOrUniversity', name: 'Delft University of Technology' },
      memberOf: { '@type': 'Organization', name: 'Norske arkitekters landsforbund (NAL)', url: 'https://arkitektur.no/' },
      homeLocation: [
        { '@type': 'Place', name: 'Oslo region, Norway' },
        { '@type': 'Place', name: 'São Paulo, Brazil' },
      ],
      worksFor: { '@id': `${SITE_URL}/#practice` },
      sameAs: [LINKEDIN_URL],
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#practice`,
      name: 'Bjørkå Flatin ENK',
      legalName: 'BJØRKÅ FLATIN',
      taxID: ORG_NR.replace(/ /g, ''),
      vatID: `NO${ORG_NR.replace(/ /g, '')}MVA`,
      url: `${SITE_URL}/`,
      founder: { '@id': `${SITE_URL}/#person` },
      areaServed: ['Norway', 'Brazil'],
      address: { '@type': 'PostalAddress', streetAddress: 'Bjørnåsen 21', postalCode: '1560', addressLocality: 'Larkollen', addressCountry: 'NO' },
    },
  ],
}, null, 2)}
</script>`;

// About is the page that describes the person, so it says so to search engines.
const PROFILE_JSONLD = `<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'ProfilePage',
  mainEntity: { '@type': 'Person', '@id': `${SITE_URL}/#person`, name: 'Simon H.J. Bjørkå Flatin', url: `${SITE_URL}/` },
}, null, 2)}
</script>`;

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
    const imgHtml = cardMedia(data, i, i === 0, cls);
    const sub = [data.year, data.organization].filter(Boolean).join(' · ');

    return `
      <a class="card ${cls}" href="projects/${esc(data.slug)}/">
        <div class="card__img-wrap">${imgHtml}</div>
        <div class="card__info">
          <div class="card__category">${langSpans(data.category || '', tVal)}</div>
          <div class="card__name">${langSpans(data.title || data.slug, tTitle)}</div>
          ${sub ? `<div class="card__year">${langSpans(sub, tVal)}</div>` : ''}
        </div>
      </a>`;
  }).join('');

  // Hero: static image only (no video)
  const mainDir     = path.join(CONTENT_DIR, 'main');
  const heroImgFile = fs.existsSync(mainDir)
    ? findImages(mainDir).find(f => /^(hero|cover|mirror)\./i.test(f)) || findImages(mainDir)[0]
    : null;
  const heroImgPath = heroImgFile ? webSrc('content/main', heroImgFile) : null;

  // Phones get a portrait crop from the middle of the photo, a third of the
  // weight, instead of downloading 2000px to show a narrow slice of it.
  const heroSmPath = heroImgPath && heroImgPath.replace(/\.webp$/, '-sm.webp');
  const hasSm = heroSmPath && heroSmPath !== heroImgPath && fs.existsSync(path.join(ROOT, heroSmPath));
  const heroBgHtml = heroImgPath
    ? (hasSm ? `<picture><source media="(max-width: 700px) and (orientation: portrait)" srcset="${heroSmPath}"${sizeAttrs(heroSmPath)}>` : '') +
      `<img class="hero__bg" src="${heroImgPath}"${sizeAttrs(heroImgPath)} alt="" fetchpriority="high">` +
      (hasSm ? '</picture>' : '')
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
    <image width="100%" height="100%"
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
    .hero { position:relative; width:100%; height:100vh; height:100svh; overflow:hidden; }
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
    .all-work a { font-size:.78rem; font-weight:400; letter-spacing:.16em;
      text-transform:uppercase; color:var(--dark); text-decoration:none;
      border-bottom:1px solid var(--dark); padding-bottom:2px;
      transition:color .2s,border-color .2s; }
    .all-work a:hover { color:var(--muted); border-color:var(--muted); }
    @media(max-width:900px) { .featured { padding:3rem 1.5rem 0; } }
    ${LANG_CSS}
    /* lang-toggle hero styles handled in style.css */
  </style>
  ${LANG_SCRIPT}
  ${GA_TAG}
  ${PERSON_JSONLD}
</head>
<body>

  <section class="hero">
    ${heroBgHtml}
    ${heroWaterHtml}
    <div class="hero__overlay"></div>
    <canvas id="mc" aria-hidden="true"></canvas>
    <nav class="nav--hero">
      <h1 class="nav__h1"><a href="__LINKBASE__" class="nav__name">Simon H.J. Bj&oslash;rk&aring; Flatin</a></h1>
      <div class="nav__link-row">
        <ul class="nav__links">
          <li><a href="__LINKBASE__work"><span class="l-en">Work</span><span class="l-no">Prosjekter</span><span class="l-pt">Projetos</span></a></li>
          <li><a href="__LINKBASE__services"><span class="l-en">Services</span><span class="l-no">Tjenester</span><span class="l-pt">Servi&ccedil;os</span></a></li>
          <li><a href="__LINKBASE__about"><span class="l-en">About</span><span class="l-no">Om</span><span class="l-pt">Sobre</span></a></li>
          <li><a href="__LINKBASE__contact"><span class="l-en">Contact</span><span class="l-no">Kontakt</span><span class="l-pt">Contato</span></a></li>
        </ul>
        <div class="lang-toggle" role="group" aria-label="__LANG_LABEL__">
<!--LANGNAV-->
        </div>
      </div>
    </nav>
    <div class="hero__scroll-cue">
      <span class="l-en">Scroll</span><span class="l-no">Rull ned</span><span class="l-pt">Rolar</span>
      <span class="hero__scroll-arrow-wrap" aria-hidden="true"><span class="hero__scroll-arrow"></span></span>
    </div>
  </section>

  <section class="featured">
    <div class="featured__header">
      <h2 class="section-title"><span class="l-en">Selected work</span><span class="l-no">Utvalgte prosjekter</span><span class="l-pt">Trabalhos selecionados</span></h2>
    </div>
    <div class="projects">
${cards}
    </div>
    <div class="all-work"><a href="__LINKBASE__work"><span class="l-en">See all work</span><span class="l-no">Se alle prosjekter</span><span class="l-pt">Ver todos os projetos</span></a></div>
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
    'float dens=0.55+s*0.45;'+
    'float dL=hmL*(v1*cL*0.63+v2*cL*0.76+v3*cL*0.52)*dens;'+
    'float dR=hmR*(v1*cR*0.63+v2*cR*0.76+v3*cR*0.52)*dens;'+
    'float base=(hmL+hmR)*0.5*(0.25+s*0.75)*smoothstep(0.04,0.16,uv.y)*(1.-smoothstep(0.54,0.62,uv.y))*0.10;'+
    'float d=clamp(dL+dR+base,0.,1.)*smoothstep(0.03,0.10,uv.y);'+
    // Portrait screens: boost density so fog feels solid on tall vertical canvases
    'd=clamp(d*(1.0+max(0.,(1.-aspect)*0.5)),0.,1.);'+
    'd=smoothstep(0.02,0.96,d)*0.92;'+
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
  /* The water layer takes whichever photo the browser chose for the hero, so a
   * phone never downloads the large one just for the ripple. */
  (function(){
    var img=document.querySelector('.hero__bg'),wi=document.querySelector('.hero__water image');
    if(!img||!wi||!img.src)return;
    function use(){wi.setAttribute('href',img.currentSrc||img.src);}
    if(img.complete)use();else img.addEventListener('load',use);
  })();
  /* Water ripple - sinusoidal feOffset oscillation, zero seam, works on iOS.
   * dy and dx oscillate at different periods so the combined motion never
   * exactly repeats, giving endlessly varied, natural-looking ripple. */
  (function(){
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;
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
${CARD_VIDEO_SCRIPT}
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
            <div class="cv-entry__period">${fieldSpans(e, 'period')}</div>
            <div class="cv-entry__role">${fieldSpans(e, 'role')}</div>
            <div class="cv-entry__org">${fieldSpans(e, 'org')}</div>
            ${e.location ? `<div class="cv-entry__location">${fieldSpans(e, 'location')}</div>` : ''}
            ${e.desc ? `<div class="cv-entry__desc">${fieldSpans(e, 'desc')}</div>` : ''}
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
    .about-bio__label { font-size:.72rem; font-weight:400; letter-spacing:.16em;
      text-transform:uppercase; color:var(--muted); margin-bottom:1.5rem; }
    .about-bio__name { font-family:var(--serif); font-size:clamp(2rem,3.5vw,2.8rem);
      font-weight:400; line-height:1.15; margin-bottom:2.5rem; }
    .about-bio__text p { font-size:.92rem; line-height:1.85; color:var(--accent);
      margin-bottom:1.4rem; }
    .about-photo { margin-top:3rem; }
    .about-photo img { width:100%; max-width:380px; display:block; object-fit:cover; aspect-ratio:3/4; object-position:center top; }
    .about-photo__caption { font-size:.72rem; color:var(--muted); margin-top:.75rem; }
    .cv-label { font-size:.72rem; font-weight:400; letter-spacing:.16em;
      text-transform:uppercase; color:var(--muted); margin-bottom:1.5rem; }
    .cv-section { margin-bottom:3.5rem; }
    .cv-section__title { font-size:.78rem; font-weight:400; letter-spacing:.16em;
      text-transform:uppercase; color:var(--dark);
      border-bottom:1px solid rgba(28,28,26,.12); padding-bottom:.75rem; margin-bottom:1.5rem; }
    .cv-entry { margin-bottom:2rem; }
    .cv-entry__period { font-size:.72rem; font-weight:400; letter-spacing:.1em;
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
  ${PROFILE_JSONLD}
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
        <div class="about-photo__caption"><span class="l-en">Oslo fjord, Norway</span><span class="l-no">Oslofjorden, Norge</span><span class="l-pt">Fiorde de Oslo, Noruega</span></div>
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
    // Open, not an accordion: a client should be able to read the whole list
    // without clicking seven times.
    return `
      <div class="service-item">
        <h3 class="service-head">
          <span class="service-num">${num}</span>
          <span class="service-name">${fieldSpans(s, 'name')}</span>
        </h3>
        <div class="service-body"><p>${fieldSpans(s, 'desc')}</p></div>
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
    .services-hero { position:relative; height:100vh; height:100svh; overflow:hidden; }
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
    .services-label { font-size:.72rem; font-weight:400; letter-spacing:.16em;
      text-transform:uppercase; color:var(--muted); margin-bottom:2.5rem; }
    .service-item { border-top:1px solid rgba(28,28,26,.12); }
    .service-item:last-child { border-bottom:1px solid rgba(28,28,26,.12); }
    .service-head { padding:1.6rem 0 .6rem; display:flex; align-items:baseline; gap:1rem; margin:0; }
    .service-num { font-size:.72rem; font-weight:400; letter-spacing:.12em;
      color:var(--muted); min-width:2rem; }
    .service-name { font-family:var(--serif); font-size:clamp(1.05rem,1.6vw,1.3rem);
      font-weight:400; color:var(--dark); flex:1; }
    .service-body { padding:0 0 1.6rem 3rem; }
    .service-body p { font-size:.92rem; line-height:1.75; color:var(--accent); max-width:600px; }
    .services-steps { margin-top:5rem; }
    .services-steps ol { list-style:none; counter-reset:step; display:grid; gap:1.4rem; padding:0; }
    .services-steps li { counter-increment:step; display:flex; gap:1rem;
      font-size:.92rem; line-height:1.75; color:var(--accent); max-width:640px; }
    .services-steps li::before { content:counter(step, decimal-leading-zero); font-size:.72rem;
      font-weight:400; letter-spacing:.12em; color:var(--muted); min-width:2rem; padding-top:.2rem; }
    .contact-cta { max-width:900px; margin:5rem auto 0; padding:4rem 4rem 0;
      border-top:1px solid rgba(28,28,26,.12);
      display:flex; justify-content:space-between; align-items:center;
      flex-wrap:wrap; gap:2rem; }
    .contact-cta__text h2 { font-family:var(--serif);
      font-size:clamp(1.4rem,2.5vw,2rem); font-weight:400; margin-bottom:.5rem; }
    .contact-cta__text p { font-size:.88rem; color:var(--muted); }
    .contact-cta__link { display:inline-block; font-size:.78rem; font-weight:400;
      letter-spacing:.16em; text-transform:uppercase; color:var(--dark);
      text-decoration:none; border-bottom:1px solid var(--dark); padding-bottom:2px;
      transition:color .2s,border-color .2s; }
    .contact-cta__link:hover { color:var(--muted); border-color:var(--muted); }
    @media(max-width:900px) {
      .services-body, .contact-cta { padding-left:1.5rem; padding-right:1.5rem; }
      .service-body { padding-left:3rem; }
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
        <span class="l-en">Architecture, drawings<br>and models</span>
        <span class="l-no">Arkitektur, tegninger<br>og modeller</span>
        <span class="l-pt">Arquitetura, desenhos<br>e maquetes</span>
      </h1>
    </div>
    <div class="hero__scroll-cue">
      <span class="l-en">Scroll</span><span class="l-no">Rull ned</span><span class="l-pt">Rolar</span>
      <span class="hero__scroll-arrow-wrap" aria-hidden="true"><span class="hero__scroll-arrow"></span></span>
    </div>
  </div>

  <div class="services-body">
    <div class="services-intro">
      <p class="l-en">I am an architect working between Norway and S&atilde;o Paulo, mostly online, with clients in Norway, Sweden, Portugal, the United States and Brazil. The work runs from planning applications and competition proposals to visualization, physical models and the software I build for the building industry. Most projects still start with a physical model on the desk.</p>
      <p class="l-no">Jeg er arkitekt og jobber mellom Norge og S&atilde;o Paulo, mest p&aring; nett, med kunder i Norge, Sverige, Portugal, USA og Brasil. Arbeidet spenner fra bygges&oslash;knader og konkurranseforslag til visualisering, fysiske modeller og programvaren jeg lager for byggebransjen. De fleste prosjektene begynner fortsatt med en fysisk modell p&aring; bordet.</p>
      <p class="l-pt">Sou arquiteto e trabalho entre a Noruega e S&atilde;o Paulo, principalmente online, com clientes na Noruega, Su&eacute;cia, Portugal, Estados Unidos e Brasil. O trabalho vai de pedidos de licenciamento e propostas de concurso a visualiza&ccedil;&atilde;o, maquetes f&iacute;sicas e o software que desenvolvo para a constru&ccedil;&atilde;o civil. A maioria dos projetos ainda come&ccedil;a com uma maquete f&iacute;sica sobre a mesa.</p>
    </div>
    <div class="services-label"><span class="l-en">Services</span><span class="l-no">Tjenester</span><span class="l-pt">Servi&ccedil;os</span></div>
    <div class="services-list">
${serviceItems}
    </div>

    <div class="services-steps">
      <h2 class="services-label"><span class="l-en">How a commission starts</span><span class="l-no">Slik starter et oppdrag</span><span class="l-pt">Como come&ccedil;a uma encomenda</span></h2>
      <ol>
        <li><span class="l-en">Write to me with the address or property number, what you want to build or change, and roughly when.</span><span class="l-no">Skriv til meg med adresse eller g&aring;rds- og bruksnummer, hva du vil bygge eller endre, og omtrent n&aring;r.</span><span class="l-pt">Escreva-me com o endere&ccedil;o ou o n&uacute;mero do im&oacute;vel, o que voc&ecirc; quer construir ou mudar e mais ou menos quando.</span></li>
        <li><span class="l-en">I reply within two business days, and we talk it through on site or by video.</span><span class="l-no">Jeg svarer innen to virkedager, og vi g&aring;r gjennom det p&aring; stedet eller p&aring; video.</span><span class="l-pt">Respondo em at&eacute; dois dias &uacute;teis, e conversamos sobre o projeto no local ou por v&iacute;deo.</span></li>
        <li><span class="l-en">You get a written offer for the first stage, with a fixed price or an hourly rate, plus VAT. Nothing starts before you have agreed to it.</span><span class="l-no">Du f&aring;r et skriftlig tilbud p&aring; f&oslash;rste fase, med fastpris eller timepris, pluss mva. Ingenting starter f&oslash;r du har sagt ja.</span><span class="l-pt">Voc&ecirc; recebe uma proposta por escrito para a primeira etapa, com pre&ccedil;o fechado ou valor por hora, mais impostos. Nada come&ccedil;a antes de voc&ecirc; concordar.</span></li>
      </ol>
    </div>
  </div>

  <div class="contact-cta">
    <div class="contact-cta__text">
      <h2><span class="l-en">Tell me about your project</span><span class="l-no">Fortell om prosjektet ditt</span><span class="l-pt">Conte sobre o seu projeto</span></h2>
      <p><span class="l-en">By email or through the short form on the contact page.</span><span class="l-no">P&aring; e-post eller gjennom det korte skjemaet p&aring; kontaktsiden.</span><span class="l-pt">Por e-mail ou pelo formul&aacute;rio curto na p&aacute;gina de contato.</span></p>
    </div>
    <a href="__LINKBASE__contact" class="contact-cta__link"><span class="l-en">Contact &rarr;</span><span class="l-no">Kontakt &rarr;</span><span class="l-pt">Contato &rarr;</span></a>
  </div>

${footerHtml()}
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
    .success-wrap__label { font-size:.72rem; font-weight:400; letter-spacing:.16em;
      text-transform:uppercase; color:var(--muted); margin-bottom:1.5rem; }
    .success-wrap__heading { font-family:var(--serif); font-size:clamp(2rem,3.5vw,2.8rem);
      font-weight:400; line-height:1.2; margin-bottom:1.5rem; }
    .success-wrap__text { font-size:.9rem; line-height:1.85; color:var(--accent); margin-bottom:2.5rem; }
    .success-wrap__back { display:inline-block; font-size:.78rem; font-weight:400;
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
      <span class="l-no">Meldingen din er mottatt. Jeg tar kontakt innen to virkedager.</span>
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

// Cloudflare rewrites email addresses into a script-only link unless they sit
// between these markers, which left "[email protected]" for anyone without JS.
const EMAIL = '<!--email_off--><a href="mailto:simon@bjorkaflatin.com">simon@bjorkaflatin.com</a><!--/email_off-->';
const ADDRESS = 'Bj&oslash;rn&aring;sen 21, 1560 Larkollen';

function generatePrivacyPage() {
  const p = (en, no, pt) => `    <p><span class="l-en">${en}</span><span class="l-no">${no}</span><span class="l-pt">${pt}</span></p>`;
  const h = (en, no, pt) => `    <h2><span class="l-en">${en}</span><span class="l-no">${no}</span><span class="l-pt">${pt}</span></h2>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy &middot; Simon H.J. Bj&oslash;rk&aring; Flatin</title>
  <link rel="stylesheet" href="/style.css" />
  <style>
    .privacy { max-width:680px; margin:0 auto; padding:6rem 4rem 2rem; }
    .privacy h1 { font-family:var(--serif); font-size:clamp(2rem,3.5vw,2.8rem); font-weight:400; margin-bottom:2rem; }
    .privacy h2 { font-size:.72rem; font-weight:400; letter-spacing:.16em; text-transform:uppercase;
      color:var(--muted); margin:2.5rem 0 .8rem; }
    .privacy p { font-size:.95rem; line-height:1.8; color:var(--accent); }
    .privacy button { margin-top:1rem; font:inherit; font-size:.78rem; font-weight:400; letter-spacing:.16em;
      text-transform:uppercase; background:none; border:none; border-bottom:1px solid var(--dark);
      padding:0 0 2px; color:var(--dark); cursor:pointer; }
    @media(max-width:600px){ .privacy { padding:4rem 1.5rem 1rem; } }
  </style>
  ${GA_TAG}
</head>
<body>
${navHtml()}
  <div class="privacy">
    <h1><span class="l-en">Privacy</span><span class="l-no">Personvern</span><span class="l-pt">Privacidade</span></h1>
${p(`This site belongs to Simon H.J. Bj&oslash;rk&aring; Flatin, Bj&oslash;rk&aring; Flatin ENK, org.no. ${ORG_NR} in Enhetsregisteret, ${ADDRESS}, who is responsible for the personal data handled here. Questions about it go to ${EMAIL}.`,
    `Dette nettstedet tilh&oslash;rer Simon H.J. Bj&oslash;rk&aring; Flatin, Bj&oslash;rk&aring; Flatin ENK, org.nr. ${ORG_NR} i Enhetsregisteret, ${ADDRESS}, som er ansvarlig for personopplysningene som behandles her. Sp&oslash;rsm&aring;l om dem kan sendes til ${EMAIL}.`,
    `Este site pertence a Simon H.J. Bj&oslash;rk&aring; Flatin, Bj&oslash;rk&aring; Flatin ENK, org. nº ${ORG_NR} no Enhetsregisteret, ${ADDRESS}, respons&aacute;vel pelos dados pessoais tratados aqui. Perguntas sobre eles podem ser enviadas para ${EMAIL}.`)}
${h('Analytics', 'Analyse', 'An&aacute;lise')}
${p('If you allow it, the site uses Google Analytics to count visits and see which pages are read. Google Analytics sets cookies, which last up to two years, and sends information about the visit, such as pages viewed, device type and an approximate location, to Google. Google may process this in the United States, under the EU-US Data Privacy Framework, and keeps it for up to 14 months. The legal basis is your consent. Nothing is stored or sent unless you choose Allow, and you can withdraw your consent at any time.',
    'Hvis du tillater det, bruker nettstedet Google Analytics til &aring; telle bes&oslash;k og se hvilke sider som leses. Google Analytics setter informasjonskapsler, som varer i opptil to &aring;r, og sender opplysninger om bes&oslash;ket, som sidene du ser, type enhet og omtrentlig sted, til Google. Google kan behandle dette i USA, under rammeverket EU-US Data Privacy Framework, og lagrer det i opptil 14 m&aring;neder. Behandlingsgrunnlaget er samtykket ditt. Ingenting lagres eller sendes med mindre du velger Tillat, og du kan trekke samtykket tilbake n&aring;r som helst.',
    'Se voc&ecirc; permitir, o site usa o Google Analytics para contar visitas e ver quais p&aacute;ginas s&atilde;o lidas. O Google Analytics grava cookies, que duram at&eacute; dois anos, e envia ao Google informa&ccedil;&otilde;es sobre a visita, como as p&aacute;ginas vistas, o tipo de dispositivo e uma localiza&ccedil;&atilde;o aproximada. O Google pode tratar esses dados nos Estados Unidos, no &acirc;mbito do EU-US Data Privacy Framework, e os guarda por at&eacute; 14 meses. A base legal &eacute; o seu consentimento. Nada &eacute; armazenado ou enviado se voc&ecirc; n&atilde;o escolher Permitir, e voc&ecirc; pode retirar o consentimento a qualquer momento.')}
    <button type="button" data-consent="open"><span class="l-en">Change your choice</span><span class="l-no">Endre valget</span><span class="l-pt">Mudar sua escolha</span></button>
${h('Links in applications', 'Lenker i s&oslash;knader', 'Links em candidaturas')}
${p('When I include a link to this site in a job application, the link can carry a short code. If you allow analytics, the code tells me that a link from my applications was opened. It is not tied to your name, and I use it for nothing else.',
    'N&aring;r jeg legger ved en lenke til nettstedet i en jobbs&oslash;knad, kan lenken inneholde en kort kode. Hvis du tillater analyse, forteller koden meg at en lenke fra s&oslash;knadene mine ble &aring;pnet. Den er ikke knyttet til navnet ditt, og jeg bruker den ikke til noe annet.',
    'Quando incluo um link para este site em uma candidatura de emprego, o link pode levar um c&oacute;digo curto. Se voc&ecirc; permitir a an&aacute;lise, o c&oacute;digo me mostra que um link das minhas candidaturas foi aberto. Ele n&atilde;o est&aacute; ligado ao seu nome, e n&atilde;o o uso para mais nada.')}
${h('Video', 'Video', 'V&iacute;deo')}
${p('One project page has a video from YouTube. It only loads when you press play. YouTube, which belongs to Google, then receives information about your visit.',
    'En prosjektside har en video fra YouTube. Den lastes bare inn n&aring;r du trykker p&aring; avspilling. Da mottar YouTube, som eies av Google, opplysninger om bes&oslash;ket ditt.',
    'Uma p&aacute;gina de projeto tem um v&iacute;deo do YouTube. Ele s&oacute; carrega quando voc&ecirc; aperta o play. O YouTube, que pertence ao Google, recebe ent&atilde;o informa&ccedil;&otilde;es sobre a sua visita.')}
${h('Contact form', 'Kontaktskjema', 'Formul&aacute;rio de contato')}
${p('Messages sent through the contact form are delivered by Netlify, which hosts the site. The legal basis is my legitimate interest in answering you. I keep messages only as long as needed to answer them.',
    'Meldinger fra kontaktskjemaet leveres av Netlify, der nettstedet ligger. Behandlingsgrunnlaget er min berettigede interesse i &aring; svare deg. Jeg tar vare p&aring; meldingene bare s&aring; lenge det trengs for &aring; besvare dem.',
    'As mensagens enviadas pelo formul&aacute;rio de contato s&atilde;o entregues pela Netlify, que hospeda o site. A base legal &eacute; o meu leg&iacute;timo interesse em responder a voc&ecirc;. Guardo as mensagens apenas pelo tempo necess&aacute;rio para respond&ecirc;-las.')}
${h('Your rights', 'Dine rettigheter', 'Seus direitos')}
${p('You can ask to see, correct or delete what I hold about you. You can also complain to Datatilsynet, the Norwegian Data Protection Authority.',
    'Du kan be om innsyn i, retting av og sletting av opplysningene jeg har om deg. Du kan ogs&aring; klage til Datatilsynet.',
    'Voc&ecirc; pode pedir para ver, corrigir ou apagar o que tenho sobre voc&ecirc;. Tamb&eacute;m pode reclamar ao Datatilsynet, a autoridade norueguesa de prote&ccedil;&atilde;o de dados.')}
  </div>
${footerHtml()}
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
    .contact-info__label { font-size:.72rem; font-weight:400; letter-spacing:.16em;
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
    .contact-info__address { font-size:.85rem; color:var(--muted); }
    .contact-form label { display:block; font-size:.68rem; font-weight:400;
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
      border:none; padding:.9rem 2.2rem; font-size:.78rem; font-weight:400;
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
        <span class="l-en">Tell me about<br>your project</span>
        <span class="l-no">Fortell om<br>prosjektet ditt</span>
        <span class="l-pt">Conte sobre<br>o seu projeto</span>
      </h1>
      <p class="contact-info__text">
        <span class="l-en">Available for architectural commissions, research collaborations, model making and consultancy. Based in the Oslo region, splitting my time with S&atilde;o Paulo, with clients in Norway, Sweden, Portugal, the United States and Brazil.</span>
        <span class="l-no">Tilgjengelig for arkitektoppdrag, forskningssamarbeid, modellbygging og r&aring;dgivning. Jeg holder til i Osloregionen, deler tiden med S&atilde;o Paulo og har kunder i Norge, Sverige, Portugal, USA og Brasil.</span>
        <span class="l-pt">Dispon&iacute;vel para encomendas de arquitetura, colabora&ccedil;&otilde;es de pesquisa, maquetes e consultoria. Baseado na regi&atilde;o de Oslo, dividindo meu tempo com S&atilde;o Paulo, com clientes na Noruega, Su&eacute;cia, Portugal, Estados Unidos e Brasil.</span>
      </p>
      <div class="contact-info__detail">
        ${EMAIL}
        <a href="${LINKEDIN_URL}" target="_blank" rel="noopener">LinkedIn</a>
        <span class="contact-info__address">${ADDRESS}</span>
      </div>
    </div>

    <div class="contact-form-wrap">
      <form name="contact" method="POST" data-netlify="true" netlify-honeypot="bot-field" action="__LINKBASE__contact-success" class="contact-form">
        <input type="hidden" name="form-name" value="contact" />
        <p class="contact-form__honeypot">
          <label><span class="l-en">Don&rsquo;t fill this in</span><span class="l-no">Ikke fyll ut dette</span><span class="l-pt">N&atilde;o preencha</span>: <input name="bot-field" /></label>
        </p>

        <label for="name">
          <span class="l-en">Name</span><span class="l-no">Navn</span><span class="l-pt">Nome</span>
        </label>
        <input type="text" id="name" name="name" required autocomplete="name"
          placeholder="__PH_NAME__" />

        <label for="email">
          <span class="l-en">Email</span><span class="l-no">E-post</span><span class="l-pt">E-mail</span>
        </label>
        <input type="email" id="email" name="email" required autocomplete="email"
          placeholder="__PH_EMAIL__" />

        <label for="subject">
          <span class="l-en">Subject</span><span class="l-no">Emne</span><span class="l-pt">Assunto</span>
        </label>
        <input type="text" id="subject" name="subject"
          placeholder="__PH_SUBJECT__" />

        <label for="message">
          <span class="l-en">Message</span><span class="l-no">Melding</span><span class="l-pt">Mensagem</span>
        </label>
        <textarea id="message" name="message" required
          placeholder="__PH_MESSAGE__"></textarea>

        <div class="contact-form__submit">
          <button type="submit" class="contact-form__btn">
            <span class="l-en">Send message</span>
            <span class="l-no">Send melding</span>
            <span class="l-pt">Enviar mensagem</span>
          </button>
          <span class="contact-form__note">
            <span class="l-en">I usually reply within 2 business days.</span>
            <span class="l-no">Jeg svarer vanligvis innen to virkedager.</span>
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
    data._images   = images;

    projects.push(data);
  }

  // Sort by weight (desc, default 0) then by year (desc)
  // Use weight: -N in project.txt to push a project toward the end of the list.
  projects.sort((a, b) => {
    const wa = parseInt(a.weight || 0), wb = parseInt(b.weight || 0);
    if (wb !== wa) return wb - wa;
    return parseInt(b.year || 0) - parseInt(a.year || 0);
  });

  // Project pages come after the sort, so each can link to its neighbours in
  // the same order as the Work page. The list wraps at both ends.
  projects.forEach((data, i) => {
    const prev = projects[(i - 1 + projects.length) % projects.length];
    const next = projects[(i + 1) % projects.length];
    const html    = generateProjectPage(data, data._folder, data._images, prev, next);
    const projRel = 'projects/' + data.slug + '/index.html';
    // Register the localised <title>; emitLangVariants swaps it in per language.
    PAGE_TITLES[projRel] = Object.fromEntries(
      LANGS.map(l => [l, esc(tTitle(data.title, l)) + ' &middot; ' + NAME])
    );
    emitLangVariants(projRel, html);
    console.log(`  built projects/${data.slug}/  ← ${data._folder}/`);
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
  emitLangVariants('privacy.html', generatePrivacyPage());
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
