const CACHE_NAME = 'wordlab-v30-hard-word-catalog-1064';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './vocabulary.js',
  './listening-vocabulary.js',
  './rescue-vocabulary.js',
  './visual-data.js',
  './app.js',
  './icon.svg',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (
    url.pathname.endsWith('/ielts/corpus/catalog.json') ||
    url.pathname.endsWith('/ielts/corpus/student-hard-words.json') ||
    url.pathname.endsWith('/ielts/audio/hard-words/manifest.json')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (!response.ok) return response;
            return cache.put(request, response.clone()).then(() => response);
          })
          .catch(() => null);
        if (cached) {
          event.waitUntil(network.then(() => undefined));
          return cached;
        }
        return (await network) || Response.error();
      }),
    );
    return;
  }

  if (url.pathname.includes('/ielts/audio/')) {
    // Safari and other media engines request byte ranges. Partial (206) responses
    // cannot be stored by Cache API, so let the browser handle them directly.
    if (request.headers.has('range')) return;
    const cachePromise = caches.open(CACHE_NAME);
    const refresh = cachePromise
      .then((cache) =>
        fetch(request).then((response) => {
          if (!response.ok || response.status === 206) return response;
          return cache.put(request, response.clone()).then(() => response);
        }),
      )
      .catch(() => null);
    event.waitUntil(refresh.then(() => undefined));
    event.respondWith(
      cachePromise.then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await refresh;
        return response || Response.error();
      }),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
