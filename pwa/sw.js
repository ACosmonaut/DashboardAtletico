const scope = new URL(self.registration.scope);
const cachePrefix = 'atletico-dashboard:';
const cacheName = cachePrefix + 'ios-v1';
const home = new URL('./', scope).href;
const index = new URL('index.html', scope);
const results = new URL('risultati.json', scope);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(async cache => {
    await cache.addAll([home, results.href].map(url => new Request(url, {cache:'reload'})));
    await self.skipWaiting();
  }));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(cachePrefix) && key !== cacheName) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function networkFirst(request, key) {
  const cache = await caches.open(cacheName).catch(() => null);
  let response;
  try {
    response = await fetch(request);
  } catch (error) {
    const offline = await cache?.match(key);
    if (offline) return offline;
    throw error;
  }
  if (response.ok) {
    await cache?.put(key, response.clone()).catch(() => {});
  } else if (response.status >= 500) {
    return await cache?.match(key) || response;
  }
  return response;
}

self.addEventListener('fetch', event => {
  const {request} = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scope.origin) return;
  if (request.mode === 'navigate' && [scope.pathname, index.pathname].includes(url.pathname)) {
    event.respondWith(networkFirst(request, home));
  } else if (url.pathname === results.pathname) {
    event.respondWith(networkFirst(request, results.href));
  }
});
