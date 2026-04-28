const SHELL_FILES = [
    "/index.html",
    "/client.html",
    "/admin.html",
    "/scanner.html",
    "/style.css",
    "/script.js",
    "/scanner.js",
    "/Logo.jpg"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open("noteshost-shell-v1").then(cache => cache.addAll(SHELL_FILES))
    );
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(self.clients.claim());
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
