const CACHE_NAME = "tic-tac-toe-v12";
const ASSETS = [
  "./",
  "./index.html",
  "./settings.html",
  "./fence.html",
  "./fence-settings.html",
  "./connect4.html",
  "./connect4-settings.html",
  "./cards.html",
  "./cards-collection.html",
  "./cards-settings.html",
  "./cards-admin.html",
  "./cards-sim.html",
  "./cards-packs.html",
  "./style.css",
  "./script.js",
  "./settings.js",
  "./pieces.js",
  "./menu.js",
  "./fence.js",
  "./fence-settings.js",
  "./connect4.js",
  "./connect4-settings.js",
  "./cards-pool.js",
  "./cards-data.js",
  "./cards.js",
  "./cards-collection.js",
  "./cards-settings.js",
  "./cards-admin.js",
  "./cards-sim.js",
  "./cards-packs.js",
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
