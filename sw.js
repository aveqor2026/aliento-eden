const CACHE = "aliento-v2";

const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./afirmaciones.js",
  "./sync.js",
  "./s.css",
  "./extra.css",
  "./favicon.svg",
  "./manifest.json",
  "./images/02-palabra-biblia.jpg",
  "./images/03-decisiones.jpg",
  "./images/04-eden-montanas.jpg",
  "./images/04b-eden-playa.jpg",
  "./images/05-recursos-eden.jpg",
  "./images/06-construyo-leyendo.jpg",
  "./images/07-camino-paz.jpg",
  "./images/08-familia-esposa.jpg",
  "./images/09-aveqor-crece.jpg",
  "./images/10-casa-oracion-pulpito.jpg",
  "./images/11-hospital-ambulancia.jpg",
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
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
  );
});
