# SEO Audit Scripts

Scripts de auditoría SEO técnica para aeroreclaim.com. Añadidos en AER-184 (2026-05-14).

## Prerrequisitos

- Node.js v18+ (sin dependencias externas)
- Para Lighthouse: Chrome instalado + `npx lighthouse` disponible
- Para servir localmente: `npx serve`

## Scripts

### `check-links.js` — Criterion 1: 0 broken links

Busca recursivamente todos los HTML y verifica que cada `href` interno apunta a un archivo o directorio que existe en el filesystem.

```bash
node scripts/seo-audit/check-links.js
# ✅ 0 broken internal links
# ❌ N broken internal link(s): <file> → href="..." → <resolved-path>
```

Excluye: `/cdn-cgi/` (Cloudflare email obfuscation), URLs externas, mailto:, anchors.

---

### `check-alts.js` — Criterion 5: 100% alt coverage

Verifica que todas las etiquetas `<img>` tienen atributo `alt`.

```bash
node scripts/seo-audit/check-alts.js
# ✅ 100% alt coverage (N <img> tag(s) checked, 0 missing alt)
```

---

### `check-metas.js` — Criterion 6: Meta title+description únicos

Verifica que cada página tiene `<title>` y `<meta name="description">` únicos, sin "undefined" ni placeholders.

```bash
node scripts/seo-audit/check-metas.js
# ✅ All N pages have unique, valid meta title and description
```

---

### `generate-sitemap.js` — Criterion 3: Sitemap dinámico

Regenera `sitemap.xml` enumerando todos los HTML indexables del repo. Asigna `lastmod` desde el mtime real del archivo (no hardcodeado). Excluye páginas legales y `PLANTILLA_ARTICULO.html`.

```bash
# Ver qué se generaría (sin escribir)
node scripts/seo-audit/generate-sitemap.js --dry-run

# Regenerar sitemap.xml
node scripts/seo-audit/generate-sitemap.js
# ✅ sitemap.xml regenerated with N URLs
```

Ejecutar tras añadir cualquier página nueva al sitio.

---

### `fix-jsonld-blogposting.js` — Criterion 4: Migración Article → BlogPosting

Cambia `"@type": "Article"` por `"@type": "BlogPosting"` en todos los JSON-LD de la carpeta `/blog/`. Solo toca bloques `<script type="application/ld+json">`.

```bash
# Dry-run
node scripts/seo-audit/fix-jsonld-blogposting.js --dry-run

# Aplicar
node scripts/seo-audit/fix-jsonld-blogposting.js
```

No necesita volver a ejecutarse salvo que se añadan artículos nuevos con `Article` por error.

---

## Lighthouse (Criterion 7)

Requiere servidor local:

```bash
# Terminal 1 — servir el sitio
npx serve . -l 8765

# Terminal 2 — auditar 4 URLs
for URL in "/" "/blog/" "/blog/retraso-vuelo-que-hacer/" "/ryanair/"; do
  npx lighthouse "http://localhost:8765${URL}" \
    --only-categories=seo \
    --output=json \
    --output-path="tmp/lh$(echo $URL | tr '/' '-').json" \
    --chrome-flags="--headless --no-sandbox --disable-gpu" \
    --quiet
  node -e "const r=require('./tmp/lh$(echo $URL | tr '/' '-').json'); console.log('${URL}:', Math.round(r.categories.seo.score*100))"
done
```

Scores objetivo: ≥ 90. Estado actual (2026-05-14): 100/100 en las 4 URLs.

---

## Resultado AER-184 (2026-05-14)

| Criterio | Estado | Evidencia |
|---|---|---|
| 1. 0 broken links | ✅ PASS | `check-links.js` → 0 broken |
| 2. 0 broken images | ✅ PASS | `check-alts.js` → 0 `<img>` tags |
| 3. Sitemap completo | ✅ PASS | 87 URLs (era 80), incluye 5 blog + 3 landings |
| 4. JSON-LD schema.org | ✅ PASS | BlogPosting en 25 artículos, LegalService en home+ryanair |
| 5. Alt text 100% | ✅ PASS | 0 `<img>` sin alt |
| 6. Meta únicos | ✅ PASS | 92 páginas, 0 duplicados |
| 7. Lighthouse SEO ≥ 90 | ✅ PASS | 100/100 en /, /blog/, /blog/retraso-vuelo-que-hacer/, /ryanair/ |
