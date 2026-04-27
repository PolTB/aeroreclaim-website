/* app.js — AeroReclaim — Pre-Validador AI */

(function() {
  'use strict';

  // ===== REFERRAL TRACKING =====
  // Persist ?ref= param across page navigations within the session
  (function() {
    var ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) {
      try { sessionStorage.setItem('aeroreclaim_ref', ref); } catch(e) {}
    }
  })();

  // ===== THEME TOGGLE =====
  var toggle = document.querySelector('[data-theme-toggle]');
  var root = document.documentElement;
  var theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', theme);
  updateToggleIcon();

  if (toggle) {
    toggle.addEventListener('click', function() {
      theme = theme === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', theme);
      toggle.setAttribute('aria-label', 'Cambiar a modo ' + (theme === 'dark' ? 'claro' : 'oscuro'));
      updateToggleIcon();
    });
  }

  function updateToggleIcon() {
    if (!toggle) return;
    toggle.innerHTML = theme === 'dark'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }

  // ===== STICKY HEADER =====
  var header = document.getElementById('header');
  function handleScroll() {
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

  // ===== PROGRESS ANIMATION =====
  function showProgress(modal, callback) {
    var content = modal.querySelector('#modal-content');
    var steps = [
      { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>', text: 'Verificando número de vuelo...' },
      { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>', text: 'Analizando ruta y aerolínea...' },
      { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/></svg>', text: 'Calculando compensación...' }
    ];

    content.innerHTML =
      '<div class="v-progress">' +
        '<div class="v-progress__header">' +
          '<div class="v-progress__spinner"></div>' +
          '<h3 class="v-progress__title">Analizando tu vuelo</h3>' +
        '</div>' +
        '<div class="v-progress__steps">' +
          steps.map(function(s, i) {
            return '<div class="v-progress__step" id="p-step-' + i + '">' +
              '<div class="v-progress__step-icon">' + s.icon + '</div>' +
              '<span class="v-progress__step-text">' + s.text + '</span>' +
              '<div class="v-progress__step-check"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg></div>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<div class="v-progress__bar"><div class="v-progress__bar-fill" id="p-bar"></div></div>' +
      '</div>';

    // Animate steps
    var bar = document.getElementById('p-bar');
    var delay = 600;

    steps.forEach(function(_, i) {
      setTimeout(function() {
        var step = document.getElementById('p-step-' + i);
        if (step) step.classList.add('v-progress__step--active');
        if (bar) bar.style.width = ((i + 1) / steps.length * 100) + '%';
      }, delay * (i + 1));

      setTimeout(function() {
        var step = document.getElementById('p-step-' + i);
        if (step) {
          step.classList.remove('v-progress__step--active');
          step.classList.add('v-progress__step--done');
        }
      }, delay * (i + 1) + delay - 100);
    });

    setTimeout(callback, delay * (steps.length + 1));
  }

  // ===== RENDER RESULTS =====
  function renderResults(modal, result, flightNumber, dateStr) {
    var content = modal.querySelector('#modal-content');
    var html = '';

    if (result.status === 'error') {
      html = renderError(result);
    } else {
      html = renderEligible(result, flightNumber, dateStr);
    }

    content.innerHTML = html;

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
    var msg = 'No hemos podido verificar tu vuelo.';
    if (result.errors.indexOf('date_future') >= 0) {
      msg = 'La fecha del vuelo está en el futuro. Solo puedes reclamar vuelos ya realizados.';
    } else if (result.errors.indexOf('date_expired') >= 0) {
      msg = 'Este vuelo tiene más de 5 años. Lamentablemente, el plazo de prescripción en España ha expirado.';
    } else if (result.errors.indexOf('invalid_flight') >= 0 || result.errors.indexOf('date_invalid') >= 0) {
      msg = 'Comprueba que el formato del vuelo es correcto (ej: IB3456) y que la fecha es válida.';
    }

    return '<div class="v-result v-result--error">' +
      '<div class="v-result__icon-wrap v-result__icon-wrap--error">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>' +
      '</div>' +
      '<h3 class="v-result__title">No elegible</h3>' +
      '<p class="v-result__desc">' + msg + '</p>' +
      '<button class="btn btn--secondary btn--lg" onclick="document.getElementById(\'results-modal\').querySelector(\'.v-modal__close\').click()">Cerrar</button>' +
    '</div>';
  }

  function renderEligible(result, flightNumber, dateStr) {
    var airline = result.airline;
    var comp = result.compensation;
    var dateInfo = result.dateInfo;

    // Confidence badge
    var badgeClass = result.confidence === 'very_high' || result.confidence === 'high' ? 'v-badge--success' : 'v-badge--warning';
    var badgeText = result.confidence === 'very_high' || result.confidence === 'high' ? 'Alta probabilidad' : 'Posible elegibilidad';

    // Compensation display
    var compDisplay, compLabel;
    if (comp.min === comp.max) {
      compDisplay = comp.estimated + '€';
      compLabel = 'Compensación estimada';
    } else if (comp.min === comp.estimated) {
      compDisplay = comp.estimated + '€';
      compLabel = 'Compensación estimada';
    } else {
      compDisplay = 'Hasta ' + comp.max + '€';
      compLabel = 'Compensación estimada';
    }

    // Distance description
    var distDesc = '';
    if (comp.band === 'short') distDesc = 'Vuelo corto (menos de 1.500 km)';
    else if (comp.band === 'medium') distDesc = 'Vuelo medio (1.500 - 3.500 km)';
    else distDesc = 'Vuelo largo (más de 3.500 km)';

    // How long ago
    var timeDesc = '';
    if (dateInfo.daysAgo === 0) timeDesc = 'Hoy';
    else if (dateInfo.daysAgo === 1) timeDesc = 'Ayer';
    else if (dateInfo.daysAgo < 30) timeDesc = 'Hace ' + dateInfo.daysAgo + ' días';
    else if (dateInfo.daysAgo < 365) timeDesc = 'Hace ' + Math.floor(dateInfo.daysAgo / 30) + ' meses';
    else timeDesc = 'Hace ' + Math.floor(dateInfo.daysAgo / 365) + ' años';

    // Urgency for old flights
    var urgencyHtml = '';
    if (result.reasons.indexOf('close_to_expiry') >= 0) {
      urgencyHtml = '<div class="v-result__urgency"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Tu vuelo se acerca al plazo de prescripción de 5 años. Actúa pronto.</div>';
    }

    return '<div class="v-result v-result--eligible">' +
      '<div class="v-result__icon-wrap v-result__icon-wrap--success">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>' +
      '</div>' +
      '<span class="v-badge ' + badgeClass + '">' + badgeText + '</span>' +
      '<h3 class="v-result__title">Tu vuelo puede tener derecho a compensación</h3>' +

      '<div class="v-result__comp">' +
        '<span class="v-result__comp-label">' + compLabel + '</span>' +
        '<span class="v-result__comp-amount">' + compDisplay + '</span>' +
      '</div>' +

      '<div class="v-result__details">' +
        '<div class="v-result__detail">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>' +
          '<div><strong>' + result.flightParsed.full + '</strong> — ' + airline.name + '</div>' +
        '</div>' +
        '<div class="v-result__detail">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>' +
          '<div>' + AERORECLAIM.formatDate(dateStr) + ' <span class="v-result__detail-sub">(' + timeDesc + ')</span></div>' +
        '</div>' +
        '<div class="v-result__detail">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>' +
          '<div>' + distDesc + '</div>' +
        '</div>' +
        (airline.isEU ?
          '<div class="v-result__detail">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
            '<div>Aerolínea de la UE — Reglamento CE 261/2004 aplicable</div>' +
          '</div>' :
          '<div class="v-result__detail">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>' +
            '<div>Aerolínea no-UE — aplica si tu vuelo salió de un aeropuerto europeo</div>' +
          '</div>'
        ) +
      '</div>' +

      urgencyHtml +

      '<p class="v-result__legal">Estimación basada en el Reglamento CE 261/2004. La compensación final depende del retraso real, causa y circunstancias del vuelo.</p>' +

      '<button class="btn btn--primary btn--lg btn--full" id="result-cta">' +
        'Iniciar mi reclamación gratis' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>' +
      '</button>' +

      '<p class="v-result__reassurance"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Sin coste inicial — Solo cobramos si ganamos</p>' +
    '</div>';
  }

  // ===== LEAD CAPTURE FORM =====
  function showLeadForm(container, result, flightNumber, dateStr) {
    var comp = result.compensation;
    container.innerHTML =
      '<div class="v-lead">' +
        '<div class="v-lead__header">' +
          '<h3 class="v-lead__title">Último paso</h3>' +
          '<p class="v-lead__subtitle">Déjanos tu email y empezaremos a gestionar tu reclamación de <strong>' + comp.estimated + '€' + '</strong>.</p>' +
        '</div>' +
        '<form class="v-lead__form" id="lead-form" novalidate>' +
          '<div class="form-group">' +
            '<label for="lead-name" class="form-label">Nombre completo</label>' +
            '<input type="text" id="lead-name" class="form-input" placeholder="Tu nombre" required autocomplete="name">' +
            '<span class="form-error" aria-live="polite"></span>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="lead-email" class="form-label">Email</label>' +
            '<input type="email" id="lead-email" class="form-input" placeholder="tu@email.com" required autocomplete="email">' +
            '<span class="form-error" aria-live="polite"></span>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="lead-issue" class="form-label">¿Qué ocurrió con tu vuelo?</label>' +
            '<select id="lead-issue" class="form-input form-input--select" required>' +
              '<option value="" disabled selected>Selecciona una opción</option>' +
              '<option value="delay">Retraso de más de 3 horas</option>' +
              '<option value="cancel">Vuelo cancelado</option>' +
              '<option value="overbook">Denegación de embarque (overbooking)</option>' +
              '<option value="other">Otro problema</option>' +
            '</select>' +
            '<span class="form-error" aria-live="polite"></span>' +
          '</div>' +
          '<div class="v-lead__consent">' +
            '<label class="v-lead__checkbox">' +
              '<input type="checkbox" id="lead-consent" required>' +
              '<span>Acepto la <a href="./politica-privacidad.html" target="_blank">Política de Privacidad</a> y las <a href="./condiciones-servicio.html" target="_blank">Condiciones del Servicio</a></span>' +
            '</label>' +
          '</div>' +
          '<button type="submit" class="btn btn--primary btn--lg btn--full">' +
            'Enviar mi reclamación' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>' +
          '</button>' +
          '<input type="hidden" name="flight" value="' + flightNumber + '">' +
          '<input type="hidden" name="date" value="' + dateStr + '">' +
          '<input type="hidden" name="compensation_est" value="' + comp.estimated + '">' +
          '<input type="hidden" name="airline" value="' + (result.airline ? result.airline.name : '') + '">' +
        '</form>' +
        '<p class="v-result__reassurance"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Solo cobramos el 25% si ganamos tu caso</p>' +
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
      var leadData = {
        name: name.value.trim(),
        email: email.value.trim(),
        issue: issue.value,
        flight: flightNumber,
        date: dateStr,
        airline: result.airline ? result.airline.name : '',
        compensation_est: comp.estimated,
        referral: refParam,
        timestamp: new Date().toISOString()
      };

      // Store lead in memory (will connect to backend later)
      AERORECLAIM.leads = AERORECLAIM.leads || [];
      AERORECLAIM.leads.push(leadData);

      // POST to Google Apps Script endpoint via fetch no-cors (works without Google session)
      var LEAD_API = 'https://script.google.com/macros/s/AKfycby08l8Sx2yFesge0mQPQXQ0ZICWlAG2ht_YHjcTCb2gL6NogQKwZOg44gIns3r3ekoD/exec';
      var issueMap = { 'delay': 'Retraso >3h', 'cancel': 'Cancelación', 'overbook': 'Overbooking', 'other': 'Otro' };
      var formBody = [
        'passenger_name=' + encodeURIComponent(leadData.name),
        'passenger_email=' + encodeURIComponent(leadData.email),
        'flight_number=' + encodeURIComponent(leadData.flight),
        'flight_date=' + encodeURIComponent(leadData.date),
        'airline_name=' + encodeURIComponent(leadData.airline),
        'incident_type=' + encodeURIComponent(issueMap[leadData.issue] || leadData.issue),
        'estimated_compensation=' + encodeURIComponent(leadData.compensation_est + '€'),
        'referral_source=' + encodeURIComponent(leadData.referral || '')
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
        '<div class="v-success__icon">' +
          '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>' +
        '</div>' +
        '<h3 class="v-success__title">Reclamación registrada</h3>' +
        '<p class="v-success__desc">Hemos recibido tu solicitud para el vuelo <strong>' + data.flight + '</strong>.</p>' +
        '<div class="v-success__next">' +
          '<h4>Próximos pasos:</h4>' +
          '<ol>' +
            '<li>Recibirás un email de confirmación en <strong>' + data.email + '</strong></li>' +
            '<li>Analizaremos los datos de tu vuelo en detalle</li>' +
            '<li>Te contactaremos con el resultado en 24-48 horas</li>' +
          '</ol>' +
        '</div>' +
        '<button class="btn btn--primary btn--lg" onclick="document.getElementById(\'results-modal\').querySelector(\'.v-modal__close\').click()">Entendido</button>' +
      '</div>';
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

      // Create and show modal with progress
      var modal = createResultsModal();
      openModal();

      showProgress(modal, function() {
        renderResults(modal, result, flightNumber, dateStr);
      });
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

  // ===== ORIGIN PRE-FILTER =====
  var originPrefilter = document.getElementById('origin-prefilter');
  var airlinePrefilter = document.getElementById('airline-prefilter');
  var originIneligible = document.getElementById('origin-ineligible');
  var flightFormEl = document.getElementById('flight-form');

  var btnOriginEU    = document.getElementById('origin-eu');
  var btnOriginNonEU = document.getElementById('origin-noneu');
  var btnAirlineEU    = document.getElementById('airline-eu');
  var btnAirlineNonEU = document.getElementById('airline-noneu');
  var btnAirlineBack  = document.getElementById('airline-back');
  var btnIneligibleBack = document.getElementById('origin-back');

  function showOnly(el) {
    [originPrefilter, airlinePrefilter, originIneligible, flightFormEl].forEach(function(e) {
      if (e) e.style.display = 'none';
    });
    if (el) el.style.display = '';
  }

  if (btnOriginEU) {
    btnOriginEU.addEventListener('click', function() {
      showOnly(flightFormEl);
      if (typeof gtag === 'function') gtag('event', 'prefilter_origen_eu');
    });
  }

  if (btnOriginNonEU) {
    btnOriginNonEU.addEventListener('click', function() {
      showOnly(airlinePrefilter);
      if (typeof gtag === 'function') gtag('event', 'prefilter_origen_no_eu');
    });
  }

  if (btnAirlineEU) {
    btnAirlineEU.addEventListener('click', function() {
      showOnly(flightFormEl);
      if (typeof gtag === 'function') gtag('event', 'prefilter_aerolinea_eu');
    });
  }

  if (btnAirlineNonEU) {
    btnAirlineNonEU.addEventListener('click', function() {
      showOnly(originIneligible);
      if (typeof gtag === 'function') gtag('event', 'prefilter_inelegible');
    });
  }

  if (btnAirlineBack) {
    btnAirlineBack.addEventListener('click', function() {
      showOnly(originPrefilter);
    });
  }

  if (btnIneligibleBack) {
    btnIneligibleBack.addEventListener('click', function() {
      showOnly(originPrefilter);
    });
  }

  // Captación email inelegible
  var btnIneligibleSubmit = document.getElementById('ineligible-submit');
  if (btnIneligibleSubmit) {
    btnIneligibleSubmit.addEventListener('click', function() {
      var emailInput = document.getElementById('ineligible-email');
      var successMsg = document.getElementById('ineligible-success');
      var emailVal = emailInput ? emailInput.value.trim() : '';
      if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
        if (emailInput) emailInput.style.borderColor = 'var(--color-error)';
        return;
      }
      if (emailInput) emailInput.style.borderColor = '';
      // GA4
      if (typeof gtag === 'function') {
        gtag('event', 'ineligible_email_capture', { email: emailVal });
      }
      // Enviar al mismo endpoint de leads con tipo ineligible_waitlist
      var LEAD_API_INELIGIBLE = 'https://script.google.com/macros/s/AKfycby08l8Sx2yFesge0mQPQXQ0ZICWlAG2ht_YHjcTCb2gL6NogQKwZOg44gIns3r3ekoD/exec';
      try {
        fetch(LEAD_API_INELIGIBLE, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'passenger_email=' + encodeURIComponent(emailVal) + '&incident_type=ineligible_waitlist&referral_source=' + encodeURIComponent(window.location.href)
        });
      } catch(e) {}
      btnIneligibleSubmit.disabled = true;
      if (emailInput) emailInput.disabled = true;
      if (successMsg) successMsg.style.display = 'block';
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
