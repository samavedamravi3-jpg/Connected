// Connected service worker: makes the installed app open fast and fail gracefully offline.
// Privacy rules: never cache API responses, sign-in routes, HTML pages, map tiles, photos or any
// cross-origin request. Only same-origin static assets and a generic offline page are stored.
const VERSION = "connected-v2";
// Cloudflare assets serve public/offline.html at the clean URL /offline (/offline.html is a 307 redirect,
// and a cached redirect cannot answer a navigation).
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/favicon.svg", "/manifest.webmanifest"];
const NEVER = [/^\/api\//, /^\/signin-with-chatgpt/, /^\/signout-with-chatgpt/, /^\/callback/];
const STATIC = [/^\/_next\/static\//, /^\/icons\//, /^\/vendor\//, /^\/favicon\.svg$/, /^\/manifest\.webmanifest$/];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // tiles, photos, fonts: browser handles them
  if (NEVER.some((r) => r.test(url.pathname))) return;

  if (req.mode === "navigate") {
    // Always fresh from the network; only show the generic offline page when there is no connection.
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (STATIC.some((r) => r.test(url.pathname))) {
    // Content-hashed / versioned files: cache first, fill the cache on first use.
    event.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        }),
      ),
    );
  }
});
