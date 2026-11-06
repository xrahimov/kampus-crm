/*
 * Service worker of the student app (A-173). It keeps the last opened student
 * pages (a personal /class link, the family page, My Kampus) and the static
 * assets they need, so the app opens offline and shows the last schedule,
 * homework and balance it saw. Everything else, the staff app above all, goes
 * straight to the network as before.
 */
const VERSION = "student-v1";
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
const STUDENT_PATH = /^\/(uz|ru|en)\/(class|student|family)(\/|$)/;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("student-") && !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Network first; a copy is kept for the next time the network is away. */
async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

/** Build assets never change under one URL: the cache answers first. */
async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    if (STUDENT_PATH.test(url.pathname)) event.respondWith(networkFirst(PAGES, request));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(ASSETS, request));
    return;
  }
  // The pages' own data calls (the call status, homework, chat) come from the
  // network and are kept for the offline view of the same page.
  if (url.pathname.startsWith("/api/v1/public/class/")) {
    event.respondWith(networkFirst(PAGES, request));
  }
});

/* Notifications (A-176): the server pushes the same texts the Telegram bot sends. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Kampus";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || undefined,
      icon: "/icons/student-192.png",
      badge: "/icons/student-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(
    (event.notification.data && event.notification.data.url) || "/",
    self.location.origin,
  ).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const open = clients.find((c) => c.url === url || c.url.startsWith(url));
      if (open) return open.focus();
      return self.clients.openWindow(url);
    }),
  );
});
