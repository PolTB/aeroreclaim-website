/* app.js — AeroReclaim — Pre-Validador AI */

(function() {
  'use strict';

  // ===== REFERRAL & UTM TRACKING =====
  // Captura UTMs, ?ref= de afiliados, y document.referrer al cargar la página.
  // Se persiste en sessionStorage para que el dato esté disponible aunque el
  // usuario navegue varias páginas antes de rellenar el formulario.
  (function() {
    var params = new URLSearchParams(window.location.search);

    // 1. Afiliados: ?ref=nombre → tiene prioridad máxima
    var ref = params.get('ref');
    if (ref) {
      try { sessionStorage.setItem('aeroreclaim_ref', ref); } catch(e) {}
    }

    // 2. UTMs: capturar en una sola clave JSON si vienen en la URL
    var src      = params.get('utm_source');
    var medium   = params.get('utm_medium');
    var campaign = params.get('utm_campaign');
    var content  = params.get('utm_content');
    var term     = params.get('utm_term');

    if (src || medium || campaign) {
      var utmData = { src: src, med: medium, cam: campaign, con: content, ter: term };
      try { sessionStorage.setItem('aeroreclaim_utm', JSON.stringify(utmData)); } catch(e) {}
    }

    // 3. Referrer externo: guardar si no hay UTMs y viene de fuera
    if (!src && !medium && document.referrer) {
      var isInternal = document.referrer.indexOf('aeroreclaim.com') >= 0;
      if (!isInternal) {
        try {
          if (!sessionStorage.getItem('aeroreclaim_utm')) {
            sessionStorage.setItem('aeroreclaim_referrer', document.referrer);
          }
        } catch(e) {}
      }
    }
  })();

  // Helper: construir string referral_source a partir de UTM / ref / referrer
  function buildReferralSource(refParam) {
    // Prioridad 1: afiliado ?ref=
    if (refParam) return 'ref:' + refParam;

    // Prioridad 2: UTMs guardados en sessionStorage
    try {
      var utmRaw = sessionStorage.getItem('aeroreclaim_utm');
      if (utmRaw) {
        var utm = JSON.parse(utmRaw);
        var parts = [utm.src || '', utm.med || '', utm.cam || ''];
        var label = parts.filter(Boolean).join(' / ');
        if (utm.con) label += ' / ' + utm.con;
        if (utm.ter) label += ' / ' + utm.ter;
        return label || 'utm_unknown';
      }
    } catch(e) {}

    // Prioridad 3: referrer externo
    try {
      var referrer = sessionStorage.getItem('aeroreclaim_referrer');
      if (referrer) {
        try { return 'referrer:' + new URL(referrer).hostname; } catch(e) { return 'referrer:' + referrer.slice(0, 80); }
      }
    } catch(e) {}

    return 'organic';
  }

  // ===== TEMA =====
  // La web tiene un único tema claro (revisión de marca 10/2026).
  document.documentElement.setAttribute('data-theme', 'light');

  var LEAD_API = 'https://script.google.com/macros/s/AKfycby08l8Sx2yFesge0mQPQXQ0ZICWlAG2ht_YHjcTCb2gL6NogQKwZOg44gIns3r3ekoD/exec';

  // ===== STICKY HEADER =====
  var header = document.getElementById('header');
  function handleScroll() {
    if (!header) return;
    if (window.scrollY > 50) {
      header.classList.add('header--scrolled');
    } else {
      header.classList.remove('header--scrolled');
    }
  }
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  // ===== HAMBURGER MENU =====
  var hamburger = document.getElementById('hamburger');
  var mobileMenu = document.getElementById('mobile-menu');

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', function() {
      var isOpen = mobileMenu.classList.toggle('open');
      hamburger.classList.toggle('active');
      hamburger.setAttribute('aria-expanded', isOpen);
      mobileMenu.setAttribute('aria-hidden', !isOpen);
    });
    mobileMenu.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', function() {
        mobileMenu.classList.remove('open');
        hamburger.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
        mobileMenu.setAttribute('aria-hidden', 'true');
      });
    });
  }

  // ===== SMOOTH SCROLL =====
  document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
    anchor.addEventListener('click', function(e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ===== RESULTS MODAL =====
  function createResultsModal() {
    // Remove existing
    var existing = document.getElementById('results-modal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'results-modal';
    overlay.className = 'v-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Resultado de verificación');
    overlay.innerHTML = '<div class="v-modal__backdrop"></div><div class="v-modal__container"><button class="v-modal__close" aria-label="Cerrar"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button><div class="v-modal__content" id="modal-content"></div></div>';
    document.body.appendChild(overlay);

    // Close handlers
    overlay.querySelector('.v-modal__backdrop').addEventListener('click', closeModal);
    overlay.querySelector('.v-modal__close').addEventListener('click', closeModal);
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
    });

    return overlay;
  }

  function closeModal() {
    var modal = document.getElementById('results-modal');
    if (modal) {
      modal.classList.remove('v-modal--open');
      document.body.style.overflow = '';
      setTimeout(function() { modal.remove(); }, 300);
    }
  }

  function openModal() {
    var modal = document.getElementById('results-modal');
    if (modal) {
      document.body.style.overflow = 'hidden';
      // Force reflow before adding class for animation
      modal.offsetHeight;
      modal.classList.add('v-modal--open');
    }
  }

  // ===== RENDER RESULTS =====
  var ARROW = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

  function closeButton(label, cls) {
    return '<button type="button" class="btn ' + (cls || 'btn--secondary') + ' btn--lg" data-close-modal>' + label + '</button>';
  }

  function bindClose(content) {
    content.querySelectorAll('[data-close-modal]').forEach(function(b) {
      b.addEventListener('click', closeModal);
    });
  }

  function renderResults(modal, result, flightNumber, dateStr) {
    var content = modal.querySelector('#modal-content');
    var html = '';

    if (result.status === 'error') {
      html = renderError(result);
    } else {
      html = renderEligible(result, flightNumber, dateStr);
    }

    content.innerHTML = html;
    bindClose(content);

    // GA4: resultado del validador
    if (typeof gtag === 'function') {
      if (result.status === 'error') {
        gtag('event', 'validador_no_elegible', {
          flight_number: flightNumber,
          flight_date: dateStr,
          error_reasons: (result.errors || []).join(',')
        });
      } else {
        gtag('event', 'validador_elegible', {
          flight_number: flightNumber,
          flight_date: dateStr,
          airline: result.airline ? result.airline.code : '',
          compensation_est: result.compensation ? result.compensation.estimated : 0,
          confidence: result.confidence || ''
        });
        gtag('event', 'qualify_lead', {
          flight_number: flightNumber,
          compensation_est: result.compensation ? result.compensation.estimated : 0
        });
      }
    }

    // Add event listener to CTA
    var ctaBtn = content.querySelector('#result-cta');
    if (ctaBtn) {
      ctaBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (typeof gtag === 'function') {
          gtag('event', 'mandato_inicio', {
            flight_number: flightNumber,
            flight_date: dateStr,
            airline: result.airline ? result.airline.code : '',
            compensation_est: result.compensation ? result.compensation.estimated : 0
          });
        }
        showLeadForm(content, result, flightNumber, dateStr);
      });
    }
  }

  function renderError(result) {
    var title = 'Revisa los datos del vuelo';
    var msg = 'No hemos podido leer el vuelo. Comprueba el número (dos letras y hasta cuatro cifras, por ejemplo IB3456) y la fecha.';
    if (result.errors.indexOf('date_future') >= 0) {
      msg = 'La fecha del vuelo es posterior a hoy. Solo se pueden reclamar vuelos que ya se han hecho.';
    } else if (result.errors.indexOf('date_expired') >= 0) {
      title = 'Este vuelo ya no se puede reclamar';
      msg = 'Tiene más de 5 años, que es el plazo para reclamar en España.';
    }

    return '<div class="v-result v-result--error">' +
      '<h3 class="v-result__title">' + title + '</h3>' +
      '<p class="v-result__desc">' + msg + '</p>' +
      closeButton('Cerrar') +
    '</div>';
  }

  function formatEuros(n) {
    return n.toLocaleString('es-ES') + ' €';
  }

  function renderEligible(result, flightNumber, dateStr) {
    var airline = result.airline;
    var comp = result.compensation;
    var dateInfo = result.dateInfo;

    var compDisplay, compLabel;
    if (comp.min === comp.max) {
      compDisplay = formatEuros(comp.estimated);
      compLabel = 'Te pueden corresponder, por pasajero';
    } else {
      compDisplay = 'Entre ' + comp.min + ' y ' + formatEuros(comp.max);
      compLabel = 'Según la distancia del vuelo, por pasajero';
    }

    var timeDesc = '';
    if (dateInfo.daysAgo === 0) timeDesc = 'hoy';
    else if (dateInfo.daysAgo === 1) timeDesc = 'ayer';
    else if (dateInfo.daysAgo < 30) timeDesc = 'hace ' + dateInfo.daysAgo + ' días';
    else if (dateInfo.daysAgo < 365) { var m = Math.floor(dateInfo.daysAgo / 30); timeDesc = 'hace ' + m + (m === 1 ? ' mes' : ' meses'); }
    else { var y = Math.floor(dateInfo.daysAgo / 365); timeDesc = 'hace ' + y + (y === 1 ? ' año' : ' años'); }

    var airlineNote = airline.isEU === true
      ? 'Aerolínea europea: el Reglamento CE 261/2004 se aplica.'
      : 'El Reglamento se aplica si el vuelo salió de un aeropuerto de la UE.';

    var urgencyHtml = '';
    if (result.reasons.indexOf('close_to_expiry') >= 0) {
      urgencyHtml = '<p class="v-result__urgency">Tu vuelo está cerca del plazo de 5 años. Conviene reclamarlo cuanto antes.</p>';
    }

    return '<div class="v-result v-result--eligible">' +
      '<h3 class="v-result__title">Tu vuelo puede tener derecho a compensación</h3>' +

      '<div class="v-result__comp">' +
        '<span class="v-result__comp-label">' + compLabel + '</span>' +
        '<span class="v-result__comp-amount">' + compDisplay + '</span>' +
      '</div>' +

      '<dl class="v-result__details">' +
        '<div class="v-result__detail"><dt>Vuelo</dt><dd><strong>' + result.flightParsed.full + '</strong> · ' + airline.name + '</dd></div>' +
        '<div class="v-result__detail"><dt>Fecha</dt><dd>' + AERORECLAIM.formatDate(dateStr) + ' <span class="v-result__detail-sub">(' + timeDesc + ')</span></dd></div>' +
        '<div class="v-result__detail"><dt>Ley</dt><dd>' + airlineNote + '</dd></div>' +
      '</dl>' +

      urgencyHtml +

      '<p class="v-result__legal">Es una estimación. El importe final depende de la distancia exacta, de cuánto llegaste tarde y de la causa. Lo revisa una persona antes de reclamar nada.</p>' +

      '<button class="btn btn--primary btn--lg btn--full" id="result-cta">Empezar la reclamación' + ARROW + '</button>' +

      '<p class="v-result__reassurance">Solo cobramos si te pagan: 25 % + IVA de lo que recuperemos.</p>' +
    '</div>';
  }

  // ===== VUELO DESDE FUERA DE LA UE =====
  function renderIneligible(content) {
    if (typeof gtag === 'function') gtag('event', 'prefilter_inelegible');
    content.innerHTML =
      '<div class="v-result v-result--error">' +
        '<h3 class="v-result__title">Este vuelo no está cubierto por la ley europea</h3>' +
        '<p class="v-result__desc">El Reglamento CE 261/2004 solo se aplica si el vuelo <strong>salió de la UE</strong> (con cualquier aerolínea) o si <strong>llegó a la UE con una aerolínea europea</strong>.</p>' +
        '<div class="v-ineligible">' +
          '<label for="ineligible-email" class="form-label">¿Tienes otro vuelo que sí salió de Europa? Déjanos tu email y te escribimos.</label>' +
          '<div class="v-ineligible__row">' +
            '<input type="email" id="ineligible-email" class="form-input" placeholder="tu@email.com" autocomplete="email">' +
            '<button type="button" id="ineligible-submit" class="btn btn--primary">Enviar</button>' +
          '</div>' +
          '<p id="ineligible-success" class="v-ineligible__ok" hidden>Anotado. Te escribiremos desde info@aeroreclaim.com.</p>' +
        '</div>' +
        closeButton('Cerrar') +
      '</div>';
    bindClose(content);

    var btn = content.querySelector('#ineligible-submit');
    btn.addEventListener('click', function() {
      var emailInput = content.querySelector('#ineligible-email');
      var emailVal = emailInput.value.trim();
      if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
        emailInput.style.borderColor = 'var(--color-error)';
        return;
      }
      emailInput.style.borderColor = '';
      if (typeof gtag === 'function') {
        gtag('event', 'ineligible_email_capture', { email: emailVal });
      }
      try {
        fetch(LEAD_API, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'passenger_email=' + encodeURIComponent(emailVal) + '&incident_type=ineligible_waitlist&referral_source=' + encodeURIComponent(window.location.href)
        });
      } catch(e) {}
      btn.disabled = true;
      emailInput.disabled = true;
      content.querySelector('#ineligible-success').hidden = false;
    });
  }

  // Vuelo desde fuera de la UE con aerolínea desconocida: preguntamos.
  function renderAirlineQuestion(content, onEU) {
    content.innerHTML =
      '<div class="v-result">' +
        '<h3 class="v-result__title">¿Con qué aerolínea volabas?</h3>' +
        '<p class="v-result__desc">Para vuelos que salen de fuera de la UE, la ley europea solo cubre a las aerolíneas europeas.</p>' +
        '<div class="v-choice">' +
          '<button type="button" class="v-choice__btn" id="airline-eu">Aerolínea europea<span>Iberia, Vueling, Air Europa, Ryanair, easyJet, Volotea…</span></button>' +
          '<button type="button" class="v-choice__btn" id="airline-noneu">Aerolínea no europea<span>American, Delta, Emirates, Latam, Avianca…</span></button>' +
        '</div>' +
      '</div>';
    content.querySelector('#airline-eu').addEventListener('click', function() {
      if (typeof gtag === 'function') gtag('event', 'prefilter_aerolinea_eu');
      onEU();
    });
    content.querySelector('#airline-noneu').addEventListener('click', function() {
      renderIneligible(content);
    });
  }

  // ===== LEAD CAPTURE FORM =====
  function showLeadForm(container, result, flightNumber, dateStr) {
    var comp = result.compensation;
    var amountText = comp.min === comp.max ? formatEuros(comp.estimated) : 'entre ' + comp.min + ' y ' + formatEuros(comp.max);
    container.innerHTML =
      '<div class="v-lead">' +
        '<div class="v-lead__header">' +
          '<h3 class="v-lead__title">Último paso</h3>' +
          '<p class="v-lead__subtitle">Déjanos tu nombre y tu email. Revisamos el vuelo ' + flightNumber + ' y te escribimos con los siguientes pasos para reclamar ' + amountText + ' por pasajero.</p>' +
        '</div>' +
        '<form class="v-lead__form" id="lead-form" novalidate>' +
          '<div class="form-group">' +
            '<label for="lead-name" class="form-label">Nombre y apellidos</label>' +
            '<input type="text" id="lead-name" class="form-input" placeholder="Tu nombre" required autocomplete="name">' +
            '<span class="form-error" aria-live="polite"></span>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="lead-email" class="form-label">Email</label>' +
            '<input type="email" id="lead-email" class="form-input" placeholder="tu@email.com" required autocomplete="email">' +
            '<span class="form-error" aria-live="polite"></span>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="lead-issue" class="form-label">¿Qué pasó con el vuelo?</label>' +
            '<select id="lead-issue" class="form-input form-input--select" required>' +
              '<option value="" disabled selected>Elige una opción</option>' +
              '<option value="delay">Llegó más de 3 horas tarde</option>' +
              '<option value="cancel">Lo cancelaron</option>' +
              '<option value="overbook">No me dejaron embarcar (overbooking)</option>' +
              '<option value="other">Otra cosa</option>' +
            '</select>' +
            '<span class="form-error" aria-live="polite"></span>' +
          '</div>' +
          '<div class="v-lead__consent">' +
            '<label class="v-lead__checkbox">' +
              '<input type="checkbox" id="lead-consent" required>' +
              '<span>Acepto la <a href="/politica-privacidad.html" target="_blank">Política de Privacidad</a> y las <a href="/condiciones-servicio.html" target="_blank">Condiciones del Servicio</a></span>' +
            '</label>' +
          '</div>' +
          '<button type="submit" class="btn btn--primary btn--lg btn--full">Enviar' + ARROW + '</button>' +
          '<input type="hidden" name="flight" value="' + flightNumber + '">' +
          '<input type="hidden" name="date" value="' + dateStr + '">' +
          '<input type="hidden" name="compensation_est" value="' + comp.estimated + '">' +
          '<input type="hidden" name="airline" value="' + (result.airline ? result.airline.name : '') + '">' +
        '</form>' +
        '<p class="v-result__reassurance">Enviarlo no te compromete a nada. Solo cobramos si te pagan.</p>' +
      '</div>';

    // Lead form submission
    var leadForm = document.getElementById('lead-form');
    var leadFormStartFired = false;
    leadForm.addEventListener('focusin', function() {
      if (!leadFormStartFired) {
        leadFormStartFired = true;
        if (typeof gtag === 'function') {
          gtag('event', 'form_start', { event_category: 'funnel', form_id: 'lead-form' });
        }
      }
    });
    leadForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var name = document.getElementById('lead-name');
      var email = document.getElementById('lead-email');
      var issue = document.getElementById('lead-issue');
      var consent = document.getElementById('lead-consent');
      var valid = true;

      [name, email, issue].forEach(function(field) {
        var err = field.closest('.form-group').querySelector('.form-error');
        if (!field.value || !field.value.trim()) {
          field.style.borderColor = 'var(--color-error)';
          if (err) err.textContent = 'Campo obligatorio';
          valid = false;
        } else {
          field.style.borderColor = '';
          if (err) err.textContent = '';
        }
      });

      if (email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
        email.style.borderColor = 'var(--color-error)';
        var err = email.closest('.form-group').querySelector('.form-error');
        if (err) err.textContent = 'Introduce un email válido';
        valid = false;
      }

      if (!consent.checked) {
        consent.closest('.v-lead__checkbox').style.color = 'var(--color-error)';
        valid = false;
      } else {
        consent.closest('.v-lead__checkbox').style.color = '';
      }

      if (!valid) return;

      // Collect lead data
      var refParam = new URLSearchParams(window.location.search).get('ref') || '';
      if (!refParam) { try { refParam = sessionStorage.getItem('aeroreclaim_ref') || ''; } catch(e) {} }

      // Construir referral_source completo (UTM > ref > referrer > organic)
      var referralSource = buildReferralSource(refParam);
      var leadData = {
        name: name.value.trim(),
        email: email.value.trim(),
        issue: issue.value,
        flight: flightNumber,
        date: dateStr,
        airline: result.airline ? result.airline.name : '',
        compensation_est: comp.estimated,
        referral: referralSource,   // full UTM string (e.g. 'google / cpc / test')
        timestamp: new Date().toISOString()
      };

      // Store lead in memory
      AERORECLAIM.leads = AERORECLAIM.leads || [];
      AERORECLAIM.leads.push(leadData);

      // POST to Google Apps Script endpoint via fetch no-cors (works without Google session)
      var issueMap = { 'delay': 'Retraso >3h', 'cancel': 'Cancelación', 'overbook': 'Overbooking', 'other': 'Otro' };
      var formBody = [
        'passenger_name=' + encodeURIComponent(leadData.name),
        'passenger_email=' + encodeURIComponent(leadData.email),
        'flight_number=' + encodeURIComponent(leadData.flight),
        'flight_date=' + encodeURIComponent(leadData.date),
        'airline_name=' + encodeURIComponent(leadData.airline),
        'incident_type=' + encodeURIComponent(issueMap[leadData.issue] || leadData.issue),
        'estimated_compensation=' + encodeURIComponent(leadData.compensation_est + '€'),
        'referral_source=' + encodeURIComponent(referralSource)
      ].join('&');
      try {
        fetch(LEAD_API, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formBody
        }).then(function() {
          if (typeof gtag === 'function') {
            gtag('event', 'lead_capturado', {
              event_category: 'formulario',
              event_label: 'mandato_completado',
              flight_number: flightNumber,
              airline: result.airline ? result.airline.code : '',
              compensation_est: comp.estimated,
              issue_type: issue.value,
              value: comp.estimated * 0.25,
              currency: 'EUR'
            });
            gtag('event', 'close_convert_lead', {
              value: comp.estimated * 0.25,
              currency: 'EUR'
            });
          }
        });
      } catch(err) { /* silent */ }

      // Update referral_source via GET to v8 deployment (avoids duplicate rows)
      if (refParam) {
        try {
          var refUrl = 'https://script.google.com/macros/s/AKfycbwxjXiq1rJPVTkRCDO2E9dAOSeMcgyNz6moyd8vejtii77CvNI8gD4nYhQT59kBXKaXCQ/exec';
          refUrl += '?action=update_referral&email=' + encodeURIComponent(leadData.email) + '&referral=' + encodeURIComponent(refParam);
          fetch(refUrl, { mode: 'no-cors' });
        } catch(e) { /* silent */ }
      }

      // Show success
      showLeadSuccess(container, leadData);
    });
  }

  function showLeadSuccess(container, data) {
    container.innerHTML =
      '<div class="v-success">' +
        '<h3 class="v-success__title">Recibido</h3>' +
        '<p class="v-success__desc">Tenemos tu solicitud para el vuelo <strong>' + data.flight + '</strong>.</p>' +
        '<div class="v-success__next">' +
          '<h4>Qué pasa ahora</h4>' +
          '<ol>' +
            '<li>Te llega un email de info@aeroreclaim.com a <strong>' + data.email + '</strong>. Si no lo ves, mira en spam.</li>' +
            '<li>Una persona revisa los datos de tu vuelo.</li>' +
            '<li>Te contestamos en 24-48 h laborables con lo que necesitamos para reclamar.</li>' +
          '</ol>' +
        '</div>' +
        closeButton('Entendido', 'btn--primary') +
      '</div>';
    bindClose(container);
  }

  // ===== FORM HANDLER =====
  function setupValidatorForm(formId) {
    var form = document.getElementById(formId);
    if (!form) return;

    // Funnel: form_start — fire once on first interaction
    var formStartFired = false;
    form.addEventListener('focusin', function() {
      if (!formStartFired) {
        formStartFired = true;
        if (typeof gtag === 'function') {
          gtag('event', 'validador_inicio', { form_id: formId });
        }
      }
    });

    form.addEventListener('submit', function(e) {
      e.preventDefault();

      var flightInput = form.querySelector('input[type="text"]');
      var dateInput = form.querySelector('input[type="date"]');

      var valid = true;

      // Flight number validation
      if (flightInput) {
        var flightVal = flightInput.value.trim().toUpperCase();
        var flightPattern = /^[A-Z]{2}\d{1,4}$/;
        var errorEl = flightInput.closest('.form-group') ? flightInput.closest('.form-group').querySelector('.form-error') : null;

        if (!flightVal) {
          flightInput.style.borderColor = 'var(--color-error)';
          if (errorEl) errorEl.textContent = 'Introduce un número de vuelo';
          valid = false;
        } else if (!flightPattern.test(flightVal)) {
          flightInput.style.borderColor = 'var(--color-error)';
          if (errorEl) errorEl.textContent = 'Formato: 2 letras + número (ej: IB3456)';
          valid = false;
        } else {
          flightInput.style.borderColor = '';
          if (errorEl) errorEl.textContent = '';
          flightInput.value = flightVal;
        }
      }

      // Date validation
      if (dateInput) {
        var errorEl2 = dateInput.closest('.form-group') ? dateInput.closest('.form-group').querySelector('.form-error') : null;
        if (!dateInput.value) {
          dateInput.style.borderColor = 'var(--color-error)';
          if (errorEl2) errorEl2.textContent = 'Selecciona la fecha del vuelo';
          valid = false;
        } else {
          dateInput.style.borderColor = '';
          if (errorEl2) errorEl2.textContent = '';
        }
      }

      if (!valid) return;

      var flightNumber = flightInput.value.trim().toUpperCase();
      var dateStr = dateInput.value;

      // GA4 event
      if (typeof gtag === 'function') {
        gtag('event', 'flight_check', {
          flight_number: flightNumber,
          flight_date: dateStr
        });
      }

      // Run validation
      var result = AERORECLAIM.validate(flightNumber, dateStr);

      // ¿Desde dónde salió? (solo en los formularios que lo preguntan)
      var originInput = form.querySelector('input[name="origen"]:checked');
      var origin = originInput ? originInput.value : 'eu';
      if (originInput && typeof gtag === 'function') {
        gtag('event', origin === 'noneu' ? 'prefilter_origen_no_eu' : 'prefilter_origen_eu');
      }

      var modal = createResultsModal();
      openModal();
      var content = modal.querySelector('#modal-content');

      if (origin === 'noneu' && result.status !== 'error') {
        if (result.airline.isEU === false) {
          renderIneligible(content);
          return;
        }
        if (result.airline.isEU !== true) {
          renderAirlineQuestion(content, function() {
            renderResults(modal, result, flightNumber, dateStr);
          });
          return;
        }
      }

      renderResults(modal, result, flightNumber, dateStr);
    });

    // Clear errors on input
    form.querySelectorAll('input').forEach(function(input) {
      input.addEventListener('input', function() {
        this.style.borderColor = '';
        var errorEl = this.closest('.form-group') ? this.closest('.form-group').querySelector('.form-error') : null;
        if (errorEl) errorEl.textContent = '';
      });
    });
  }

  setupValidatorForm('flight-form');
  setupValidatorForm('cta-form');

  // ===== SCROLL ANIMATIONS =====
  var observerOptions = { root: null, rootMargin: '0px 0px -60px 0px', threshold: 0.1 };
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  var sections = document.querySelectorAll('.steps, .comp-cards, .why-grid, .testimonials, .faq-list');
  sections.forEach(function(section) {
    var items = section.querySelectorAll('.animate-on-scroll');
    items.forEach(function(el, index) {
      el.style.transitionDelay = index * 80 + 'ms';
    });
  });

  document.querySelectorAll('.animate-on-scroll').forEach(function(el) {
    observer.observe(el);
  });

  // ===== ACTIVE NAV =====
  var pageSections = document.querySelectorAll('section[id]');
  var navLinks = document.querySelectorAll('.nav__link');

  function highlightNav() {
    var scrollY = window.scrollY + 120;
    pageSections.forEach(function(section) {
      var top = section.offsetTop;
      var height = section.offsetHeight;
      var id = section.getAttribute('id');
      if (scrollY >= top && scrollY < top + height) {
        navLinks.forEach(function(link) {
          link.style.color = '';
          if (link.getAttribute('href') === '#' + id) {
            link.style.color = 'var(--color-primary)';
          }
        });
      }
    });
  }

  window.addEventListener('scroll', highlightNav, { passive: true });

})();
