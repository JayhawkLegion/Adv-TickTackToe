const CACHE_NAME = "tic-tac-toe-v18";
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
  "./cards-rules.js",
  "./cards-data.js",
  "./cards-cloud-config.js",
  "./cards-online.js",
  "./cards-store.js",
  "./cards.js",
  "./cards-collection.js",
  "./cards-settings.js",
  "./cards-admin.js",
  "./cards-sim.js",
  "./cards-packs.js",
  "./manifest.json",
  "./wildflip.webmanifest",
  "./icons/wildflip.svg",
  "./icons/wildflip-192.png",
  "./icons/wildflip-512.png",
  "./icons/wildflip-512-maskable.png",
  "./icons/wildflip-apple-touch.png",
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
  const url = new URL(event.request.url);
  // Sign-in and online saves (Firebase) go straight to the network.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  // The online-profile config is checked online first, so pasting it in takes
  // effect without a new cache version; the cached copy covers offline.
  if (url.pathname.endsWith("/cards-cloud-config.js")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
