/**
 * Offline shell.
 *
 * Two caches with deliberately different policies:
 *
 *   app shell  — cache-first. It only changes when you deploy, and the version
 *                bump below is what invalidates it.
 *   map tiles  — cache-first with a hard cap. Tiles are immutable and heavy;
 *                caching them is what makes the map usable on Santiago metro
 *                signal. The cap stops a few pans from eating a phone's storage.
 *
 * places.json is deliberately NOT cached here — it's network-first via the
 * fetch handler, because stale dietary data is worse than no data.
 */
const VERSION = "v1";
const SHELL = `vitalmap-shell-${VERSION}`;
const TILES = `vitalmap-tiles-${VERSION}`;
const MAX_TILES = 400;

const SHELL_ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => {
        // A missing shell asset must not wedge the install forever.
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== TILES).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    event.respondWith(
      caches.open(TILES).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) {
          await cache.put(request, res.clone());
          void trimCache(TILES, MAX_TILES);
        }
        return res;
      }),
    );
    return;
  }

  // Network-first for the data: someone reading a gluten-free claim should get
  // today's answer, not last week's. Cache is the fallback, not the default.
  if (url.pathname.endsWith("places.json")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(SHELL).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit ?? Response.error())),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("./index.html").then((hit) => hit ?? Response.error()),
      ),
    );
    return;
  }

  event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
});
