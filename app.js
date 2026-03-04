/* app.js — AeroReclaim */

(function() {
  'use strict';

  // ===== THEME TOGGLE =====
  const toggle = document.querySelector('[data-theme-toggle]');
  const root = document.documentElement;
  let theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', theme);
  updateToggleIcon();

  if (toggle) {
    toggle.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', theme);
      toggle.setAttribute('aria-label', `Cambiar a modo ${theme === 'dark' ? 'claro' : 'oscuro'}`);
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
  const header = document.getElementById('header');
  let lastScrollY = 0;

  function handleScroll() {
    const scrollY = window.scrollY;
    if (scrollY > 50) {
      header.classList.add('header--scrolled');
    } else {
      header.classList.remove('header--scrolled');
    }
    lastScrollY = scrollY;
  }

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  // ===== HAMBURGER MENU =====
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('open');
      hamburger.classList.toggle('active');
      hamburger.setAttribute('aria-expanded', isOpen);
      mobileMenu.setAttribute('aria-hidden', !isOpen);
    });

    // Close on link click
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        hamburger.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
        mobileMenu.setAttribute('aria-hidden', 'true');
      });
    });
  }

  // ===== SMOOTH SCROLL =====
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ===== FORM VALIDATION =====
  function setupForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const flightInput = form.querySelector('input[type="text"]');
      const dateInput = form.querySelector('input[type="date"]');
      let valid = true;

      // Flight number validation
      if (flightInput) {
        const flightVal = flightInput.value.trim().toUpperCase();
        const flightPattern = /^[A-Z]{2}\d{1,4}$/;
        const errorEl = flightInput.closest('.form-group')?.querySelector('.form-error');

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
        const errorEl = dateInput.closest('.form-group')?.querySelector('.form-error');
        if (!dateInput.value) {
          dateInput.style.borderColor = 'var(--color-error)';
          if (errorEl) errorEl.textContent = 'Selecciona la fecha del vuelo';
          valid = false;
        } else {
          dateInput.style.borderColor = '';
          if (errorEl) errorEl.textContent = '';
        }
      }

      if (valid) {
        // Show success feedback
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg> ¡Verificando tu vuelo...';
        btn.style.background = 'var(--color-success)';
        btn.disabled = true;

        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.style.background = '';
          btn.disabled = false;
          alert('¡Gracias! En una versión en producción, aquí verificaríamos tu vuelo automáticamente.');
        }, 2000);
      }
    });

    // Clear error on input
    form.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', function() {
        this.style.borderColor = '';
        const errorEl = this.closest('.form-group')?.querySelector('.form-error');
        if (errorEl) errorEl.textContent = '';
      });
    });
  }

  setupForm('flight-form');
  setupForm('cta-form');

  // ===== SCROLL ANIMATIONS (Intersection Observer) =====
  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -60px 0px',
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Stagger animations within each parent section
  const sections = document.querySelectorAll('.steps, .comp-cards, .why-grid, .testimonials, .faq-list');
  sections.forEach(section => {
    const items = section.querySelectorAll('.animate-on-scroll');
    items.forEach((el, index) => {
      el.style.transitionDelay = `${index * 80}ms`;
    });
  });

  document.querySelectorAll('.animate-on-scroll').forEach(el => {
    observer.observe(el);
  });

  // ===== ACTIVE NAV HIGHLIGHTING =====
  const pageSections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav__link');

  function highlightNav() {
    const scrollY = window.scrollY + 120;
    pageSections.forEach(section => {
      const top = section.offsetTop;
      const height = section.offsetHeight;
      const id = section.getAttribute('id');

      if (scrollY >= top && scrollY < top + height) {
        navLinks.forEach(link => {
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