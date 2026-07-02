/*
 * Betonicum PWA — Service Worker
 * Размещается в КОРНЕ сайта (https://betonicum.ru/sw.js), чтобы scope покрывал весь сайт.
 *
 * Стратегии:
 *  - HTML            → network-first, фолбэк: кэш → /offline.html
 *  - CSS/JS          → stale-while-revalidate
 *  - изображения/шрифты → cache-first (с лимитом записей)
 *  - PDF (ТДС/регламенты) → cache-first; явное сохранение через postMessage SAVE_DOC
 *  - /wp-admin, /wp-login, POST-запросы → не перехватываются
 */

const CACHE_VERSION = 'v1';
const PRECACHE = `betonicum-precache-${CACHE_VERSION}`;
const PAGES = `betonicum-pages-${CACHE_VERSION}`;
const ASSETS = `betonicum-assets-${CACHE_VERSION}`;
const IMAGES = `betonicum-images-${CACHE_VERSION}`;
const DOCS = 'betonicum-docs'; // без версии: сохранённые пользователем документы переживают обновления SW

const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/pwa/icons/icon-192.png',
  '/pwa/icons/icon-512.png',
];

const IMAGE_CACHE_LIMIT = 80;
const PAGE_CACHE_LIMIT = 40;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([PRECACHE, PAGES, ASSETS, IMAGES, DOCS]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Обрезка кэша до limit записей (удаляются самые старые). */
async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > limit) {
    await cache.delete(keys[0]);
    return trimCache(cacheName, limit);
  }
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
      trimCache(PAGES, PAGE_CACHE_LIMIT);
    }
    return response;
  } catch (e) {
    const cached = await cache.match(request) || await caches.match(request);
    return cached || caches.match('/offline.html');
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
    if (limit) trimCache(cacheName, limit);
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/wp-admin') || url.pathname.startsWith('/wp-login')) return;

  if (url.pathname.endsWith('.pdf')) {
    event.respondWith(cacheFirst(request, DOCS));
    return;
  }

  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (request.destination === 'style' || request.destination === 'script') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (request.destination === 'image' || request.destination === 'font') {
    event.respondWith(cacheFirst(request, IMAGES, IMAGE_CACHE_LIMIT));
    return;
  }
});

/*
 * Сообщения со страницы:
 *  - { type: 'SAVE_DOC', url }   → сохранить документ в офлайн-библиотеку
 *  - { type: 'REMOVE_DOC', url } → удалить из библиотеки
 *  - { type: 'LIST_DOCS' }       → вернуть список сохранённых URL (через event.ports[0])
 *  - { type: 'SKIP_WAITING' }    → активировать новую версию SW немедленно
 */
self.addEventListener('message', (event) => {
  const { data } = event;
  if (!data || !data.type) return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'SAVE_DOC' && data.url) {
    event.waitUntil(
      caches.open(DOCS)
        .then((cache) => cache.add(data.url))
        .then(() => event.source && event.source.postMessage({ type: 'DOC_SAVED', url: data.url }))
        .catch(() => event.source && event.source.postMessage({ type: 'DOC_SAVE_FAILED', url: data.url }))
    );
    return;
  }

  if (data.type === 'REMOVE_DOC' && data.url) {
    event.waitUntil(
      caches.open(DOCS).then((cache) => cache.delete(data.url))
        .then(() => event.source && event.source.postMessage({ type: 'DOC_REMOVED', url: data.url }))
    );
    return;
  }

  if (data.type === 'LIST_DOCS' && event.ports[0]) {
    event.waitUntil(
      caches.open(DOCS)
        .then((cache) => cache.keys())
        .then((keys) => event.ports[0].postMessage({ urls: keys.map((r) => r.url) }))
    );
  }
});
