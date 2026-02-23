// Bump this value whenever we change static assets (CSS/JS/images)
// so existing installs don't keep serving stale cached files.
const CACHE_NAME = "ops-static-v6";

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


// -------------------------------
// Push Notifications (Web Push)
// -------------------------------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    try {
      data = { body: event.data ? event.data.text() : "" };
    } catch {
      data = {};
    }
  }

  const title = data.title || "Operations";
  const body = data.body || "New update available";
  const url = data.url || "/dashboard";

  const options = {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/dashboard";

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });

      for (const client of allClients) {
        try {
          // If there's already a window open, focus it and navigate
          if ("focus" in client) {
            await client.focus();
            if ("navigate" in client) await client.navigate(url);
            return;
          }
        } catch {}
      }

      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })()
  );
});
