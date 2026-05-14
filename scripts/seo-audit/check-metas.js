#!/usr/bin/env node
/**
 * check-metas.js — verifica que cada HTML tiene meta title y description únicos, no vacíos ni placeholders.
 * Uso: node scripts/seo-audit/check-metas.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../');
const EXCLUDED = ['node_modules', '.git', 'tmp', 'scripts'];
const BAD_PATTERNS = [/undefined/i, /^\s*$/, /placeholder/i, /lorem ipsum/i];

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

function extract(html, re) {
  const m = re.exec(html);
  return m ? m[1].trim() : null;
}

const files = getAllHtmlFiles(ROOT);
const issues = [];
const titles = new Map();
const descs = new Map();

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const html = fs.readFileSync(file, 'utf8');

  const title = extract(html, /<title>([^<]*)<\/title>/i);
  const desc = extract(html, /<meta\s+name="description"\s+content="([^"]*)"/i)
    || extract(html, /<meta\s+content="([^"]*)"\s+name="description"/i);

  if (!title) {
    issues.push(`MISSING TITLE: ${rel}`);
  } else {
    if (BAD_PATTERNS.some(p => p.test(title))) issues.push(`BAD TITLE: ${rel} → "${title}"`);
    if (titles.has(title)) issues.push(`DUPLICATE TITLE: ${rel} == ${titles.get(title)} → "${title}"`);
    else titles.set(title, rel);
  }

  if (!desc) {
    issues.push(`MISSING DESC: ${rel}`);
  } else {
    if (BAD_PATTERNS.some(p => p.test(desc))) issues.push(`BAD DESC: ${rel} → "${desc}"`);
    if (descs.has(desc)) issues.push(`DUPLICATE DESC: ${rel} == ${descs.get(desc)} → "${desc}"`);
    else descs.set(desc, rel);
  }
}

if (issues.length === 0) {
  console.log(`✅ All ${files.length} pages have unique, valid meta title and description`);
  process.exit(0);
} else {
  console.error(`❌ ${issues.length} meta issue(s):`);
  for (const i of issues) console.error(`  ${i}`);
  process.exit(1);
}
