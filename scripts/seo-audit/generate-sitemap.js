#!/usr/bin/env node
/**
 * generate-sitemap.js — regenera sitemap.xml dinámicamente con todas las rutas indexables.
 * Excluye: legal pages, PLANTILLA_ARTICULO.html, tmp/, scripts/
 * Prioridades: home=1.0, blog=0.9, aerolineas/landing=0.85, rutas=0.7, legal=omitidas
 * Uso: node scripts/seo-audit/generate-sitemap.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../');
const BASE_URL = 'https://aeroreclaim.com';
const DRY_RUN = process.argv.includes('--dry-run');

// Files/dirs to exclude from sitemap
const EXCLUDE_DIRS = ['node_modules', '.git', 'tmp', 'scripts', 'public', 'assets', 'data'];
const EXCLUDE_FILES = [
  'PLANTILLA_ARTICULO.html',
  'aviso-legal.html',
  'condiciones-servicio.html',
  'politica-cookies.html',
  'politica-privacidad.html',
];
// These paths are legal/privacy — exclude or use low priority
const LEGAL_PATHS = ['/privacidad/', '/politica-privacidad', '/aviso-legal', '/politica-cookies', '/condiciones-servicio'];

function getPriority(urlPath) {
  if (urlPath === '/') return '1.0';
  if (urlPath.startsWith('/blog/') && urlPath !== '/blog/') return '0.8';
  if (urlPath === '/blog/') return '0.9';
  if (urlPath.startsWith('/aerolineas/') || ['/aireuropa/', '/ryanair/', '/vueling/'].some(p => urlPath.startsWith(p))) return '0.85';
  if (urlPath.startsWith('/rutas/')) return '0.7';
  return '0.6';
}

function getChangefreq(urlPath) {
  if (urlPath === '/') return 'weekly';
  if (urlPath.startsWith('/blog/')) return 'monthly';
  if (urlPath.startsWith('/rutas/')) return 'monthly';
  return 'monthly';
}

function getLastmod(filePath) {
  const stat = fs.statSync(filePath);
  return stat.mtime.toISOString().split('T')[0];
}

function toUrlPath(filePath) {
  let rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  // index.html → directory path
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.replace(/\/index\.html$/, '/');
  return '/' + rel;
}

function getAllIndexableFiles(dir, depth = 0) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDE_DIRS.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllIndexableFiles(full, depth + 1));
    } else if (entry.name.endsWith('.html')) {
      if (EXCLUDE_FILES.includes(entry.name)) continue;
      const urlPath = toUrlPath(full);
      if (LEGAL_PATHS.some(p => urlPath.startsWith(p))) continue;
      results.push({ file: full, urlPath });
    }
  }
  return results;
}

const entries = getAllIndexableFiles(ROOT);

// Sort: home first, then blog, then aerolineas, then rutas, then rest
entries.sort((a, b) => {
  const order = (p) => {
    if (p === '/') return 0;
    if (p.startsWith('/blog/')) return 1;
    if (['/aireuropa/', '/ryanair/', '/vueling/'].some(x => p.startsWith(x))) return 2;
    if (p.startsWith('/aerolineas/')) return 2;
    if (p.startsWith('/rutas/')) return 3;
    return 4;
  };
  return order(a.urlPath) - order(b.urlPath) || a.urlPath.localeCompare(b.urlPath);
});

const urls = entries.map(({ file, urlPath }) => {
  const lastmod = getLastmod(file);
  const priority = getPriority(urlPath);
  const changefreq = getChangefreq(urlPath);
  const loc = BASE_URL + urlPath;
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
});

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;

if (DRY_RUN) {
  console.log(`[dry-run] Would write ${entries.length} URLs to sitemap.xml`);
  console.log(xml.slice(0, 2000) + (xml.length > 2000 ? '\n... (truncated)' : ''));
} else {
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');
  console.log(`✅ sitemap.xml regenerated with ${entries.length} URLs`);
}
