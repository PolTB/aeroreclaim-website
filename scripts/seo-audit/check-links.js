#!/usr/bin/env node
/**
 * check-links.js — verifica que todos los hrefs internos de los HTML existen en el filesystem.
 * Salida: lista de broken links o "0 broken links" si todo OK.
 * Uso: node scripts/seo-audit/check-links.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../');
const EXCLUDED = ['node_modules', '.git', 'tmp', 'scripts'];

function getAllHtmlFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDED.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllHtmlFiles(full));
    } else if (entry.name.endsWith('.html') && entry.name !== 'PLANTILLA_ARTICULO.html') {
      results.push(full);
    }
  }
  return results;
}

function extractInternalHrefs(html) {
  const hrefs = [];
  const re = /href="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const v = m[1];
    if (v.startsWith('http') || v.startsWith('mailto:') || v.startsWith('#') || v.startsWith('//')) continue;
    if (v.startsWith('/cdn-cgi/')) continue; // Cloudflare email obfuscation — not a real broken link
    hrefs.push(v);
  }
  return hrefs;
}

function resolveTarget(fromFile, href) {
  const base = path.dirname(fromFile);
  // strip fragment
  const clean = href.split('#')[0].split('?')[0];
  if (!clean) return null;
  if (clean.startsWith('/')) return path.join(ROOT, clean);
  return path.resolve(base, clean);
}

function fileExists(p) {
  try {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      return fs.existsSync(path.join(p, 'index.html'));
    }
    return true;
  } catch { return false; }
}

const files = getAllHtmlFiles(ROOT);
const broken = [];

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const hrefs = extractInternalHrefs(html);
  for (const href of hrefs) {
    const target = resolveTarget(file, href);
    if (!target) continue;
    if (!fileExists(target)) {
      broken.push({ file: path.relative(ROOT, file), href, resolved: path.relative(ROOT, target) });
    }
  }
}

if (broken.length === 0) {
  console.log('✅ 0 broken internal links');
  process.exit(0);
} else {
  console.error(`❌ ${broken.length} broken internal link(s):`);
  for (const b of broken) {
    console.error(`  ${b.file} → href="${b.href}" → ${b.resolved}`);
  }
  process.exit(1);
}
