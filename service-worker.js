const CACHE_NAME = "workpay-v10";
const APP_SHELL = [
    "./", "./index.html", "./styles.css",
    "./holiday-pay.js?v=10", "./core.js?v=10", "./direct-date-edit.js?v=10", "./app.js?v=10",
    "./manifest.webmanifest", "./favicon.svg", "./icon-192.png", "./icon-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil(caches.open(CACHE_NAME)
        .then(cache => cache.addAll(APP_SHELL))
        .then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
    event.waitUntil(caches.keys()
        .then(keys => Promise.all(keys
            .filter(key => key.startsWith("workpay-") && key !== CACHE_NAME)
            .map(key => caches.delete(key))))
        .then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    const cachePromise = caches.open(CACHE_NAME);

    if (request.mode === "navigate") {
        event.respondWith(fetch(request).then(async response => {
            if (response.ok) {
                const cache = await cachePromise;
                await cache.put("./index.html", response.clone());
            }
            return response;
        }).catch(() => cachePromise.then(cache => cache.match("./index.html"))));
        return;
    }

    const update = fetch(request).then(async response => {
        if (response.ok) {
            const cache = await cachePromise;
            await cache.put(request, response.clone());
        }
        return response;
    });
    // Keep refreshes alive after returning a cached response. Versioned scripts
    // must match exactly so a new shell cannot receive an older script bundle.
    event.waitUntil(update.catch(() => {}));
    event.respondWith(cachePromise.then(cache => cache.match(request))
        .then(cached => cached || update));
});
