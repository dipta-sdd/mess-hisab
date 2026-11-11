/* Offline app shell. Written to out/sw.js by scripts/build-sw.mjs, which fills in PRECACHE and VERSION.
   The whole app is one static page plus hashed assets, so every file is saved when the worker installs:
   an installed app opens, and moves between pages, with no connection at all. Every page address is
   answered with the saved index.html (the in-browser router draws the page). API calls are on another
   origin and are never touched: balances are only ever shown fresh. */
const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const CACHE = `shell-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname === "/sw.js") return;

  if (req.mode === "navigate") {
    event.respondWith(caches.match("/index.html").then((hit) => hit || fetch(req)));
    return;
  }

  event.respondWith(
    caches.match(req).then(async (hit) => {
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }),
  );
});
