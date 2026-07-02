/* ============================================================
   Betonicum — слой сложной анимации (v4)
   Scroll-reveal со stagger · параллакс hero · счётчики · прогресс
   скролла · сжатие шапки · магнитные кнопки · 3D-tilt карточек ·
   пословное появление заголовка. Уважает prefers-reduced-motion.
   ============================================================ */
(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;
  root.classList.add('js-anim');

  /* ---------- индикатор прогресса скролла ---------- */
  var bar = document.createElement('div');
  bar.className = 'scrollbar-progress';
  document.body.appendChild(bar);
  function onScrollProgress() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + '%';
  }

  /* ---------- сжатие шапки ---------- */
  var header = document.querySelector('.header');
  function onScrollHeader() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 40);
  }

  /* ---------- hero: фоновые слои (сетка, свечение, треугольник) ---------- */
  var hero = document.querySelector('.hero');
  if (hero) {
    var bg = document.createElement('div');
    bg.className = 'hero__bg';
    bg.innerHTML =
      '<div class="hero__grid"></div>' +
      '<div class="hero__glow"></div>' +
      '<svg class="hero__peak" viewBox="420 235 360 345" aria-hidden="true">' +
        '<path d="M600 250 L760 560 L440 560 Z" fill="#1B1D23" opacity=".92"/>' +
        '<path d="M600 250 L600 560 L440 560 Z" fill="#33363E"/>' +
        '<path d="M600 400 L680 560 L520 560 Z" fill="#D8232A"/>' +
        '<path d="M600 400 L600 560 L520 560 Z" fill="#A8161C"/>' +
      '</svg>';
    hero.insertBefore(bg, hero.firstChild);
  }

  /* ---------- hero: разбивка заголовка на слова ---------- */
  var h1 = hero && hero.querySelector('h1');
  if (h1 && !reduced) {
    var wi = 0;
    var nodes = Array.prototype.slice.call(h1.childNodes);
    h1.textContent = '';
    nodes.forEach(function (node) {
      if (node.nodeType === 3) { // текст
        node.textContent.split(/(\s+)/).forEach(function (part) {
          if (/^\s+$/.test(part)) { h1.appendChild(document.createTextNode(part)); }
          else if (part.length) {
            var s = document.createElement('span');
            s.className = 'word'; s.style.setProperty('--w', wi++); s.textContent = part;
            h1.appendChild(s);
          }
        });
      } else { // <em> и пр.
        node.classList && node.classList.add('word');
        node.style && node.style.setProperty('--w', wi++);
        h1.appendChild(node);
      }
    });
  }

  /* ---------- разметка целей для reveal + stagger ---------- */
  function tag(el, type, i) {
    if (!el || el.hasAttribute('data-reveal')) return;
    el.setAttribute('data-reveal', type || '');
    if (i != null) el.style.setProperty('--i', i);
  }
  // заголовки секций
  document.querySelectorAll('.sec-head, .guarantee__head').forEach(function (el) { tag(el, ''); });
  // карточки/плитки группами со stagger
  [['.trust__item', ''], ['.wizard__step', 'scale'], ['.sys', 'scale'],
   ['.guarantee__card', 'scale'], ['.ind', 'scale'], ['.case', ''],
   ['.gallery__item', 'scale'], ['.review', ''], ['.cert', 'scale'],
   ['.duo__card', ''], ['.faq__item', ''], ['.hero__facts > div', '']
  ].forEach(function (pair) {
    var groups = {};
    document.querySelectorAll(pair[0]).forEach(function (el) {
      var p = el.parentNode;
      var key = (p && p.className) || 'g';
      groups[key] = (groups[key] || 0);
      tag(el, pair[1], groups[key]);
      groups[key]++;
    });
  });
  // крупные блоки
  ['.compare', '.oneday__timeline', '.cta-band', '.quote-card'].forEach(function (s) {
    document.querySelectorAll(s).forEach(function (el) { tag(el, 'scale'); });
  });

  /* ---------- IntersectionObserver: reveal + запуск счётчиков ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      if (e.target.matches('[data-count]')) animateCount(e.target);
      e.target.querySelectorAll && e.target.querySelectorAll('[data-count]').forEach(animateCount);
      io.unobserve(e.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  document.querySelectorAll('[data-reveal], .hero, [data-count]').forEach(function (el) { io.observe(el); });

  /* ---------- счётчики ---------- */
  function animateCount(el) {
    if (el.dataset.counted) return; el.dataset.counted = '1';
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (isNaN(target)) return;
    if (reduced) { el.textContent = target; return; }
    var dur = 1400, t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(step); else el.textContent = target;
    }
    requestAnimationFrame(step);
  }

  /* ---------- hero: параллакс (скролл + мышь) ---------- */
  var peak = function () { return hero && hero.querySelector('.hero__peak'); };
  var grid = function () { return hero && hero.querySelector('.hero__grid'); };
  var mx = 0, my = 0, sy = 0;
  function applyParallax() {
    var pk = peak(), gr = grid();
    if (pk) pk.style.transform = 'translateY(calc(-50% + ' + (sy * -0.08 + my * 14) + 'px)) translateX(' + (mx * 18) + 'px) rotate(' + (mx * 4) + 'deg)';
    if (gr) gr.style.transform = 'translate(' + (mx * 12) + 'px,' + (sy * 0.05 + my * 12) + 'px)';
  }
  if (hero && !reduced) {
    hero.addEventListener('mousemove', function (ev) {
      var r = hero.getBoundingClientRect();
      mx = (ev.clientX - r.left) / r.width - 0.5;
      my = (ev.clientY - r.top) / r.height - 0.5;
      applyParallax();
    });
    hero.addEventListener('mouseleave', function () { mx = my = 0; applyParallax(); });
  }

  /* ---------- магнитные кнопки ---------- */
  if (!reduced) {
    document.querySelectorAll('.btn--primary, .btn--lg').forEach(function (b) {
      b.classList.add('is-magnetic');
      b.addEventListener('mousemove', function (e) {
        var r = b.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.3;
        var y = (e.clientY - r.top - r.height / 2) * 0.4;
        b.style.transform = 'translate(' + x + 'px,' + (y - 2) + 'px)';
      });
      b.addEventListener('mouseleave', function () { b.style.transform = ''; });
    });
  }

  /* ---------- 3D-tilt карточек ---------- */
  if (!reduced && window.matchMedia('(pointer:fine)').matches) {
    document.querySelectorAll('.guarantee__card, .sys, .ind, .case, .cert, .gallery__item').forEach(function (c) {
      c.classList.add('tilt');
      c.addEventListener('mousemove', function (e) {
        var r = c.getBoundingClientRect();
        var rx = ((e.clientY - r.top) / r.height - 0.5) * -6;
        var ry = ((e.clientX - r.left) / r.width - 0.5) * 6;
        c.style.transform = 'perspective(700px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateY(-4px)';
      });
      c.addEventListener('mouseleave', function () { c.style.transform = ''; });
    });
  }

  /* ---------- единый rAF-обработчик скролла ---------- */
  var ticking = false;
  function onScroll() {
    sy = window.scrollY;
    if (!ticking) {
      requestAnimationFrame(function () {
        onScrollProgress(); onScrollHeader();
        if (!reduced) applyParallax();
        ticking = false;
      });
      ticking = true;
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- страховка: показать всё, если что-то не сработало ---------- */
  setTimeout(function () {
    document.querySelectorAll('[data-reveal]:not(.is-in)').forEach(function (el) { el.classList.add('is-in'); });
    if (hero) hero.classList.add('is-in');
  }, 1600);
})();
