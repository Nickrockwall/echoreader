// EchoReader service worker: makes the reader installable and keeps what you've read available offline.
// Only registered in production builds and in secure contexts (localhost or HTTPS).

const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const DATA = `data-${VERSION}`;

const SHELL_FILES = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

/** POST endpoints whose answers depend only on the body: cache them under a key derived from it. */
const CACHEABLE_POSTS = ['/api/tts', '/api/dict/lookup', '/api/ja/furigana'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function bodyKey(request) {
  const body = await request.clone().arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', body);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return new Request(`${new URL(request.url).pathname}?body=${hex}`);
}

async function networkFirst(request, cacheName, key = request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(key, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === 'POST' && url.origin === location.origin && CACHEABLE_POSTS.includes(url.pathname)) {
    event.respondWith(bodyKey(request).then((key) => networkFirst(request, DATA, key)));
    return;
  }
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    // Always try for a fresh shell; offline, any route gets the cached one.
    event.respondWith(networkFirst(request, SHELL, new Request('/')));
    return;
  }
  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/ambient/') || url.pathname.startsWith('/icons/')) {
      event.respondWith(cacheFirst(request, ASSETS));
    } else if (url.pathname.startsWith('/api/tts/audio/')) {
      event.respondWith(cacheFirst(request, DATA)); // content-addressed: never changes
    } else if (url.pathname.startsWith('/api/')) {
      event.respondWith(networkFirst(request, DATA));
    }
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, ASSETS));
  }
});
