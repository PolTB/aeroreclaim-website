# CLAUDE.md — AeroReclaim Website
# Cuenta GitHub: PolTB (ptusquets@gmail.com)
# Última actualización: 30/03/2026

## Proyecto
Web de AeroReclaim en GitHub Pages → aeroreclaim.com  
Reclamaciones CE 261/2004 España. Modelo no win, no fee. Comisión: 25% + IVA.

## Stack
- HTML5 estático + CSS (sin framework)
- GitHub Pages (rama `main` → deploy automático)
- Google Analytics GA4: `G-N4NDPFXP6N`
- Google Fonts: Inter + Plus Jakarta Sans

## Estructura de archivos
```
/                   → index.html (homepage)
/blog/              → índice del blog (index.html) + artículos
/rutas/             → landing pages por ruta (ej. madrid-barcelona/)
/aerolineas/        → landing pages por aerolínea
/assets/            → imágenes, favicon
base.css            → reset y variables CSS globales
style.css           → estilos principales
components.css      → componentes reutilizables (botones, cards, etc.)
blog/blog.css       → estilos específicos del blog
validator.css       → estilos del pre-validador
app.js              → lógica principal (pre-validador, leads)
```

## Reglas OBLIGATORIAS en artículos de blog
⚠️ PARA CREAR UN ARTÍCULO NUEVO: leer blog/PLANTILLA_ARTICULO.html y sustituir el contenido manteniendo TODA la estructura HTML, clases y componentes. NUNCA partir de cero.
⚠️ NUNCA inventar clases CSS. Usar SOLO las clases existentes en el repo.
- Header correcto: `<header class="header" id="header">` con `nav__list`, `nav__link`, `header__actions`
- Footer correcto: `<footer class="footer">` con `footer__grid`, `footer__brand`, `footer__links`
- Clases INCORRECTAS (no existen): `site-header`, `site-footer`, `nav-links`, `nav-logo`, `btn-primary` (usar `btn--primary`)
- SIEMPRE copiar el header y footer EXACTOS de blog/derechos-pasajero-semana-santa-2026/index.html

1. Siempre incluir `<script src="../../app.js" defer></script>` justo antes de `</body>` — sin este script el layout no funciona.
2. Incluir botón theme-toggle en el header (igual que en derechos-pasajero-semana-santa-2026/index.html).

## Reglas CSS OBLIGATORIAS
1. Todos los artículos de blog DEBEN tener `<html lang="es" data-theme="light">` — sin este atributo el layout se rompe.
2. Orden de CSS en artículos de blog (siempre en este orden):
   ```html
   <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
   <link rel="stylesheet" href="../../base.css">
   <link rel="stylesheet" href="../../style.css">
   <link rel="stylesheet" href="../../components.css">
   <link rel="stylesheet" href="../blog.css">
   ```
3. Rutas relativas desde `blog/nombre-articulo/index.html`: usar `../../` para root.

## Estructura de artículos de blog
- Carpeta: `blog/nombre-articulo/index.html`
- Referencia visual: `blog/derechos-pasajero-semana-santa-2026/index.html`
- Clases principales: `blog-main`, `blog-container`, `blog-article`, `blog-sidebar`
- Siempre incluir: breadcrumbs, tabla de contenidos, 3 CTAs a `/#validador`, sidebar con widget, FAQ con JSON-LD, article schema JSON-LD

## Al publicar un artículo nuevo SIEMPRE hacer:
1. Crear `blog/nombre-articulo/index.html`
2. Añadir card en `blog/index.html` (justo antes del comentario `<!-- Article 1 — Oriente Medio -->`)
3. Añadir URL en `sitemap.xml` (antes de `</urlset>`)
4. Commit único con los 3 archivos

## Datos fijos AeroReclaim
- Comisión: 25% + IVA, modelo no win no fee
- Plazo reclamación España: 5 años (Tribunal Supremo)
- Pre-validador URL: https://aeroreclaim.com/#validador
- Email: info@aeroreclaim.com
- NIF Pol Tusquets Batlle: 46142330Y

## Aerolíneas — canales de reclamación
| Aerolínea | Método | Canal |
|---|---|---|
| Ryanair | WEBFORM | https://www.ryanair.com/es/es/useful-info/help-centre/claim-compensation |
| Vueling | WEBFORM | https://help.vueling.com/hc/es/articles/19798807271441 / backup: particulares@vueling.com |
| Air Europa | WEBFORM | https://aeux.eu/formulario |
| Iberia Express | EMAIL | gesrec@iberiaexpress.com |

## Plan editorial blog (pendiente publicar)
### Mayo 2026
- Vuelo con escala cancelado/retrasado → `/blog/vuelo-escala-cancelado-retrasado-reclamar/`
- Air Europa vuelo cancelado → `/blog/reclamar-air-europa-vuelo-cancelado/`
- Huelga aerolínea → `/blog/huelga-aerolinea-vuelo-cancelado-compensacion/`
- Puente de mayo → `/blog/puente-mayo-vuelo-cancelado-derechos/`
### Junio 2026
- Iberia Express → `/blog/reclamar-iberia-express-vuelo-cancelado/`
- Verano 2026 → `/blog/derechos-pasajero-verano-2026/`

## Reglas de sesión (importante)
- Iniciar sesión nueva para cada tarea/artículo distinto
- Usar /compact si el contexto supera el 50%
- Usar /clear entre tareas no relacionadas
- Referencia arquitectura: siempre leer este CLAUDE.md al inicio
