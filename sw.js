const CACHE_NAME = "tic-tac-toe-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./settings.html",
  "./fence.html",
  "./fence-settings.html",
  "./style.css",
  "./script.js",
  "./settings.js",
  "./pieces.js",
  "./menu.js",
  "./fence.js",
  "./fence-settings.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
