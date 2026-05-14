#!/usr/bin/env node
/**
 * check-alts.js — verifica que todas las etiquetas <img> tienen atributo alt.
 * Salida: lista de imágenes sin alt o "100% alt coverage" si todo OK.
 * Uso: node scripts/seo-audit/check-alts.js
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

const files = getAllHtmlFiles(ROOT);
const issues = [];
let totalImgs = 0;

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const imgRe = /<img\s[^>]*>/gi;
  let m;
  while ((m = imgRe.exec(html)) !== null) {
    totalImgs++;
    const tag = m[0];
    if (!/\balt\s*=/.test(tag)) {
      const lineNum = html.substring(0, m.index).split('\n').length;
      issues.push({ file: path.relative(ROOT, file), line: lineNum, tag: tag.slice(0, 120) });
    }
  }
}

if (issues.length === 0) {
  console.log(`✅ 100% alt coverage (${totalImgs} <img> tag(s) checked, 0 missing alt)`);
  process.exit(0);
} else {
  console.error(`❌ ${issues.length} <img> tag(s) missing alt attribute:`);
  for (const i of issues) {
    console.error(`  ${i.file}:${i.line} — ${i.tag}`);
  }
  process.exit(1);
}
