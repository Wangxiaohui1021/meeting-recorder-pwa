// Service Worker：缓存 PWA 壳，支持离线打开首屏
const CACHE = "meeting-recorder-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./app/style.css",
  "./app/main.js",
  "./app/store.js",
  "./app/recorder.js",
  "./app/transcribe.js",
  "./app/minutes.js",
  "./app/ui.js",
  "./app/assets/favicon.svg",
  "./app/assets/icon-192.png",
  "./app/assets/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 壳资源走缓存优先；API 与音频永远走网络
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return; // 不缓存 API
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const net = fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
