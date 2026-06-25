/* ============================================================
   Betonicum — лидогенерация: онлайн-калькулятор, интерактивный
   CTA с чипами-«плюшками», плавающая кнопка, тосты.
   Демо-логика (без бэкенда): расчёт на клиенте + подтверждение.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- тост ---------- */
  var toastEl = document.getElementById('toast');
  var toastTimer;
  function toast(html) {
    if (!toastEl) return;
    toastEl.innerHTML = html;
    toastEl.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-shown'); }, 4000);
  }

  /* ---------- калькулятор расхода/стоимости ---------- */
  // ориентировочные параметры по типам покрытия (демо-значения)
  var SYS = {
    sl: { th: 3, kg: 6.0, eur: 26 },   // наливное гладкое
    tg: { th: 6, kg: 12.0, eur: 35 },  // противоскользящее
    sr: { th: 4, kg: 8.0, eur: 30 },   // износостойкое
    as: { th: 3, kg: 6.5, eur: 33 }    // антистатическое
  };
  var area = document.getElementById('calc-area');
  var sys = document.getElementById('calc-sys');
  var outTh = document.getElementById('calc-th');
  var outKg = document.getElementById('calc-kg');
  var outSum = document.getElementById('calc-sum');

  function fmt(n) { return Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' '); }
  function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

  function recalc() {
    if (!area || !sys) return;
    var a = Math.max(0, parseFloat(area.value) || 0);
    var s = SYS[sys.value] || SYS.tg;
    outTh.textContent = s.th + ' мм';
    outKg.textContent = '≈ ' + fmt(a * s.kg) + ' кг';
    outSum.textContent = a > 0 ? 'от ' + fmt(a * s.eur) + ' €' : '—';
    [outKg, outSum].forEach(bump);
  }
  if (area && sys) {
    ['input', 'change'].forEach(function (ev) { area.addEventListener(ev, recalc); sys.addEventListener(ev, recalc); });
    recalc();
  }

  /* ---------- интерактивные чипы-«плюшки» в CTA ---------- */
  document.querySelectorAll('.chip--toggle').forEach(function (chip) {
    chip.addEventListener('click', function () { chip.classList.toggle('is-on'); });
  });

  /* ---------- отправка форм (демо) ---------- */
  function picks() {
    return Array.prototype.slice.call(document.querySelectorAll('.chip--toggle.is-on'))
      .map(function (c) { return c.getAttribute('data-pick'); });
  }
  function handleLead(form, kind) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var phone = form.querySelector('input[type="tel"]');
      if (phone && phone.value.replace(/\D/g, '').length < 6) {
        phone.focus(); phone.classList.add('field--error');
        toast('Укажите телефон — и инженер свяжется с вами');
        return;
      }
      if (phone) phone.classList.remove('field--error');
      var extra = '';
      if (kind === 'calc' && outSum) extra = ' Расчёт: <b>' + outSum.textContent + '</b>';
      if (kind === 'cta') { var p = picks(); if (p.length) extra = ' Пришлём: <b>' + p.join(', ') + '</b>'; }
      form.reset();
      document.querySelectorAll('.chip--toggle').forEach(function (c, i) { c.classList.toggle('is-on', i < 2); });
      if (area && sys) recalc();
      toast('✓ Заявка принята.' + extra + ' Инженер свяжется в рабочее время.');
    });
  }
  var lh = document.getElementById('lead-hero'); if (lh) handleLead(lh, 'calc');
  var lc = document.getElementById('lead-cta'); if (lc) handleLead(lc, 'cta');

  /* ---------- плавающая кнопка-лидолов ---------- */
  var fab = document.getElementById('fab-cta');
  if (fab) {
    fab.addEventListener('click', function () {
      var q = document.getElementById('quote');
      if (q) { q.scrollIntoView({ behavior: 'smooth', block: 'center' }); var n = q.querySelector('input[type="text"]'); if (n) setTimeout(function () { n.focus(); }, 500); }
    });
    var heroQuote = document.getElementById('quote');
    var onScroll = function () {
      var past = window.scrollY > (window.innerHeight * 0.9);
      // прятать, когда сам калькулятор в зоне видимости
      var inView = false;
      if (heroQuote) { var r = heroQuote.getBoundingClientRect(); inView = r.top < window.innerHeight && r.bottom > 0; }
      fab.classList.toggle('is-shown', past && !inView);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
