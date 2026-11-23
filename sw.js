// Sube este número cada vez que publiques cambios importantes.
// No es obligatorio, pero ayuda a limpiar cachés viejas.
const CACHE_NAME = "residente-obra-v29";

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./exceljs.min.js",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("./index.html");
    })
  );
});

// Estrategia: intenta traer la versión más nueva de internet primero
// (así ves tus cambios apenas los publiques). Si no hay internet,
// usa la copia guardada para que la app siga funcionando en obra.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Las llamadas a Firebase (respaldo en la nube) nunca se cachean.
  const host = new URL(event.request.url).hostname;
  if (host.endsWith("googleapis.com") && host !== "fonts.googleapis.com") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match("./index.html")))
  );
});
