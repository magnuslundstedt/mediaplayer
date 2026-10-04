// Service worker: makes the app shell available offline.
//
// Network-first with a short timeout, falling back to the cache. Every
// successful fetch refreshes the cached copy, so an online launch always runs
// the latest build and an offline launch runs the last one seen.
//
// A file missing from SHELL still gets cached the first time it is fetched
// through the worker, but not on first install, so keep the list complete.

const CACHE = 'mediaplayer-shell-v1';
const TIMEOUT_MS = 2000;
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/player.js',
  'js/loop.js',
  'js/store.js',
  'js/wakelock.js',
  'js/nowplaying.js',
  'js/version.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  const { response, refreshed } = networkFirst(request);
  event.respondWith(response);
  // Let a slow fetch finish and refresh the cache after we have answered.
  event.waitUntil(refreshed);
});

function networkFirst(request) {
  const opened = caches.open(CACHE);

  // 'no-cache' revalidates with the server instead of trusting the HTTP cache,
  // which GitHub Pages lets hold a file for ten minutes.
  const network = fetch(request.url, { cache: 'no-cache' });
  const fresh = (async () => {
    const response = await network;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const copy = await unredirected(response);
    await (await opened).put(request, copy.clone());
    return copy;
  })();

  const response = (async () => {
    const cached = await (await opened).match(request, { ignoreSearch: true });
    // Nothing to fall back to: pass on whatever the network said, errors included.
    if (!cached) return fresh.catch(() => network);
    const timeout = new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS, null));
    try {
      return (await Promise.race([fresh, timeout])) ?? cached;
    } catch {
      return cached;
    }
  })();

  return { response, refreshed: fresh.catch(() => {}) };
}

// A navigation may not be answered with a response that followed a redirect.
async function unredirected(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
