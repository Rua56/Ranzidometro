// Ranzidometro service worker: app disponibile anche senza internet.
const V = "ranzi-7178e06791";
const CORE = ["/", "/pwa.js?v=7178e06791", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png", "/privacy.html", "/fonts/fonts.css", "/fonts/bagel-latin-5cf04e.woff2", "/fonts/bagel-latin-ext-a59240.woff2", "/fonts/nunito-latin-ext-9abf3b.woff2", "/fonts/nunito-latin-ff573f.woff2"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== "ranzi-fonts").map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return; // sempre in rete
  if (url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.open("ranzi-fonts").then(async c => { const hit = await c.match(req); const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }).catch(() => hit); return hit || net; }));
    return;
  }
  if (url.origin !== location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put("/", cp)); return r; }).catch(() => caches.match("/")));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); } return r; })));
});

// --- notifiche: promemoria e coccole ---
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Ranzidometro", {
    body: d.body || "", tag: d.tag || "ranzi", renotify: true, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png",
    data: { url: d.url || "/" }, vibrate: d.tag === "coccola" ? [60, 40, 60, 40, 120] : [80, 60, 80]
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => new URL(x.url).origin === self.location.origin);
    if (c) { c.postMessage({ type: "ranzi-open", url }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
