const CACHE = "aliento-v12";
const NETWORK_WAIT_MS = 4000;

const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./afirmaciones.js",
  "./account-data.js",
  "./cloud.js",
  "./firebase-config.js",
  "./habitos.js",
  "./cronometro.js",
  "./habitos-ui.js",
  "./habitos-seed.js",
  "./sync.js",
  "./s.css",
  "./extra.css",
  "./favicon.svg",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(ASSETS.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isPage = req.mode === "navigate";
  event.respondWith(
    (async () => {
      const network = fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      });
      const cached = async () => {
        const hit = await caches.match(req, { ignoreSearch: isPage });
        if (hit) return hit;
        return isPage ? (await caches.match("./index.html")) || (await caches.match("./")) : undefined;
      };
      // Red primero, pero si la red tarda mucho usa la copia guardada.
      const slow = new Promise((resolve) => setTimeout(() => resolve("slow"), NETWORK_WAIT_MS));
      try {
        const first = await Promise.race([network, slow]);
        if (first !== "slow") return first;
        const hit = await cached();
        if (hit) {
          network.catch(() => {});
          return hit;
        }
        return await network;
      } catch {
        const hit = await cached();
        if (hit) return hit;
        return Response.error();
      }
    })()
  );
});
