const CACHE_NAME = "ops-static-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // GET فقط
  if (req.method !== "GET") return;

  // نفس الدومين فقط
  if (url.origin !== self.location.origin) return;

  // ممنوع نكاشّش الـ API (عشان السشن والبيانات تفضل سليمة)
  if (url.pathname.startsWith("/api/")) return;

  // ممنوع نكاشّش صفحات HTML (عشان مايحصلش مشاكل لوجين/نسخ قديمة)
  if (req.destination === "document") return;

  // كاش للـ static assets فقط
  const isStatic =
    req.destination === "style" ||
    req.destination === "script" ||
    req.destination === "image" ||
    req.destination === "font";

  if (!isStatic) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return resp;
      }).catch(() => cached);

      // لو موجود كاش رجّعه فورًا (سريع) + حدّث في الخلفية
      return cached || fetchPromise;
    })
  );
});
