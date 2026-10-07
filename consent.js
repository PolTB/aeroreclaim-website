/* Consentimiento de cookies — AeroReclaim (octubre 2026)
 * Google Analytics (y la medición de Google Ads) solo se carga si el visitante acepta.
 * Modo de consentimiento v2 de Google: todo empieza denegado y solo se concede al aceptar. Hasta entonces, las
 * llamadas a gtag() de la web se quedan en cola en dataLayer y no salen del
 * navegador. La elección se recuerda en este navegador y se puede cambiar
 * desde la Política de Cookies (botón "Cambiar mis preferencias").
 */
(function () {
  var GA_ID = 'G-N4NDPFXP6N';
  var KEY = 'ar_cookies_v2'; // v2 (oct-2026): el consentimiento incluye medición publicitaria; se vuelve a preguntar
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  var DENEGADO = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' };
  var CONCEDIDO = { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'denied', analytics_storage: 'granted' };
  window.gtag('consent', 'default', DENEGADO);

  function leer() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function guardar(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* sin almacenamiento: se volverá a preguntar */ } }

  function cargarGA() {
    window.gtag('consent', 'update', CONCEDIDO);
    if (document.getElementById('ga-lib')) return;
    var s = document.createElement('script');
    s.id = 'ga-lib';
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
  }

  function quitarBanner() {
    var b = document.getElementById('ar-cookies');
    if (b) b.remove();
  }

  function mostrarBanner() {
    if (document.getElementById('ar-cookies')) return;
    var b = document.createElement('div');
    b.id = 'ar-cookies';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Preferencias de cookies');
    b.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;max-width:560px;margin:0 auto;' +
      'background:#fff;color:#1f2937;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.15);' +
      'padding:16px;font:14px/1.5 Inter,system-ui,sans-serif';
    b.innerHTML =
      '<p style="margin:0 0 12px">Usamos cookies de análisis y de medición publicitaria (Google Analytics y Google Ads) para saber cómo se usa la web y qué anuncios funcionan. No las usamos para mostrarte publicidad personalizada. ' +
      'Solo se activan si aceptas. <a href="/politica-cookies.html" style="color:#0369a1">Más información</a></p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" data-v="no" style="flex:1;min-width:120px;padding:10px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#1f2937;font-weight:600;cursor:pointer">Rechazar</button>' +
      '<button type="button" data-v="si" style="flex:1;min-width:120px;padding:10px;border-radius:8px;border:1px solid #0369a1;background:#0369a1;color:#fff;font-weight:600;cursor:pointer">Aceptar</button>' +
      '</div>';
    b.addEventListener('click', function (e) {
      var v = e.target && e.target.getAttribute && e.target.getAttribute('data-v');
      if (!v) return;
      guardar(v);
      quitarBanner();
      if (v === 'si') cargarGA();
    });
    document.body.appendChild(b);
  }

  window.arCookies = {
    cambiar: function () { try { localStorage.removeItem(KEY); } catch (e) {} mostrarBanner(); }
  };

  var eleccion = leer();
  if (eleccion === 'si') cargarGA();
  else if (eleccion !== 'no') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mostrarBanner);
    else mostrarBanner();
  }
})();
