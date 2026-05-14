#!/usr/bin/env node
/**
 * fix-jsonld-blogposting.js — cambia "@type": "Article" → "@type": "BlogPosting"
 * solo en archivos dentro de /blog/. No toca otros tipos ni otras carpetas.
 * Uso: node scripts/seo-audit/fix-jsonld-blogposting.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.resolve(__dirname, '../../blog');
const DRY_RUN = process.argv.includes('--dry-run');

function getAllHtmlFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...getAllHtmlFiles(full));
    else if (entry.name.endsWith('.html') && entry.name !== 'PLANTILLA_ARTICULO.html') results.push(full);
  }
  return results;
}

const files = getAllHtmlFiles(BLOG_DIR);
let changed = 0;

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  // Only replace "Article" inside a JSON-LD script block, not elsewhere in HTML
  // Strategy: replace "@type": "Article" with "@type": "BlogPosting" within <script type="application/ld+json"> blocks
  let updated = original.replace(
    /(<script\s+type="application\/ld\+json">)([\s\S]*?)(<\/script>)/gi,
    (match, open, content, close) => {
      const newContent = content.replace(/"@type"\s*:\s*"Article"/g, '"@type": "BlogPosting"');
      return open + newContent + close;
    }
  );

  if (updated !== original) {
    changed++;
    if (!DRY_RUN) {
      fs.writeFileSync(file, updated, 'utf8');
      console.log(`  updated: ${path.relative(path.resolve(__dirname, '../../'), file)}`);
    } else {
      console.log(`  [dry-run] would update: ${path.relative(path.resolve(__dirname, '../../'), file)}`);
    }
  }
}

console.log(`\n${DRY_RUN ? '[dry-run] ' : ''}✅ ${changed} file(s) updated: Article → BlogPosting`);
