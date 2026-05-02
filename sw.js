const SHELL_FILES = [
    "/index.html",
    "/contact.html",
    "/client.html",
    "/admin.html",
    "/scanner.html",
    "/style.css",
    "/script.js",
    "/scanner.js",
    "/Logo.jpg"
];

const CACHE_NAME = "noteshost-shell-v3";

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
    );
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(names => Promise.all(
            names
                .filter(name => name !== CACHE_NAME)
                .map(name => caches.delete(name))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET") return;

    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;
            return fetch(request).catch(() => caches.match("/index.html"));
        })
    );
});
