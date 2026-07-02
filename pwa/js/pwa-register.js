/*
 * Betonicum PWA — регистрация service worker, кнопка установки,
 * кнопки «Сохранить офлайн» для документов (ссылки с атрибутом data-pwa-save).
 * Подключается на всех страницах сайта (см. wordpress/betonicum-pwa.php).
 */
(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('/sw.js').catch(function (err) {
    console.warn('[PWA] SW registration failed:', err);
  });

  /* ---------- Установка приложения ---------- */

  var deferredPrompt = null;

  function showInstallButton() {
    if (document.getElementById('pwa-install-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'pwa-install-btn';
    btn.textContent = 'Установить приложение';
    btn.setAttribute('style',
      'position:fixed;bottom:16px;right:16px;z-index:9999;' +
      'background:#f08c26;color:#fff;border:0;border-radius:24px;' +
      'padding:12px 20px;font:600 14px system-ui,sans-serif;' +
      'box-shadow:0 4px 14px rgba(22,49,79,.35);cursor:pointer;');
    btn.addEventListener('click', function () {
      btn.remove();
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function () { deferredPrompt = null; });
    });
    document.body.appendChild(btn);
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    // Показываем кнопку только повторным посетителям, чтобы не раздражать новых
    try {
      var visits = (parseInt(localStorage.getItem('pwa-visits') || '0', 10)) + 1;
      localStorage.setItem('pwa-visits', String(visits));
      if (visits >= 2) showInstallButton();
    } catch (err) { showInstallButton(); }
  });

  window.addEventListener('appinstalled', function () {
    // событие для аналитики (Яндекс.Метрика)
    if (typeof ym === 'function' && window.yaCounterId) ym(window.yaCounterId, 'reachGoal', 'pwa_installed');
  });

  /* ---------- «Сохранить офлайн» для документов ---------- */

  function toast(text) {
    var t = document.createElement('div');
    t.textContent = text;
    t.setAttribute('style',
      'position:fixed;bottom:72px;left:50%;transform:translateX(-50%);z-index:9999;' +
      'background:#16314f;color:#fff;border-radius:8px;padding:10px 18px;' +
      'font:14px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.3);');
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3000);
  }

  navigator.serviceWorker.addEventListener('message', function (e) {
    if (!e.data) return;
    if (e.data.type === 'DOC_SAVED') toast('Документ сохранён и доступен офлайн');
    if (e.data.type === 'DOC_SAVE_FAILED') toast('Не удалось сохранить документ');
  });

  function initSaveButtons() {
    var links = document.querySelectorAll('a[data-pwa-save]');
    links.forEach(function (link) {
      if (link.dataset.pwaSaveInit) return;
      link.dataset.pwaSaveInit = '1';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '⤓ Сохранить офлайн';
      btn.setAttribute('style',
        'margin-left:8px;background:none;border:1px solid #16314f;color:#16314f;' +
        'border-radius:6px;padding:4px 10px;font:13px system-ui,sans-serif;cursor:pointer;');
      btn.addEventListener('click', function () {
        navigator.serviceWorker.ready.then(function (reg) {
          (reg.active || navigator.serviceWorker.controller)
            .postMessage({ type: 'SAVE_DOC', url: link.href });
        });
      });
      link.insertAdjacentElement('afterend', btn);
    });
  }

  /* ---------- Подсказка для iOS (нет beforeinstallprompt) ---------- */

  function iosHint() {
    var isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (!isIos || standalone) return;
    try {
      if (localStorage.getItem('pwa-ios-hint')) return;
      localStorage.setItem('pwa-ios-hint', '1');
    } catch (e) { return; }
    toast('Установите приложение: «Поделиться» → «На экран Домой»');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initSaveButtons(); iosHint(); });
  } else {
    initSaveButtons();
    iosHint();
  }
})();
