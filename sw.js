/* sw.js — guarda la app en el celular para que abra rápido y también sin internet.
 * Los datos NO se guardan aquí (la app ya guarda su propia copia); las llamadas al script nunca pasan por la caché. */
var VERSION = 'mf-v1';
var SHELL = ['./', 'index.html', 'pwa.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];
var CDN = ['cdn.tailwindcss.com'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function networkFirst(req) {
  return caches.open(VERSION).then(function (cache) {
    return new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () {                 // red lenta: usa lo guardado si lo hay
        cache.match(req, { ignoreSearch: true }).then(function (hit) { if (hit && !settled) { settled = true; resolve(hit); } });
      }, 3500);
      fetch(req).then(function (res) {
        clearTimeout(timer);
        if (res && res.ok) cache.put(req, res.clone());
        if (!settled) { settled = true; resolve(res); }
      }).catch(function () {
        clearTimeout(timer);
        cache.match(req, { ignoreSearch: true }).then(function (hit) {
          if (!settled) { settled = true; resolve(hit || Response.error()); }
        });
      });
    });
  });
}

function staleWhileRevalidate(req) {
  return caches.open(VERSION).then(function (cache) {
    return cache.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(function () { return hit || Response.error(); });
      return hit || net;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (/\/icons\//.test(url.pathname)) { e.respondWith(caches.match(req).then(function (h) { return h || fetch(req); })); return; }
    e.respondWith(networkFirst(req.mode === 'navigate' ? new Request('index.html') : req));
    return;
  }
  if (CDN.indexOf(url.hostname) >= 0) { e.respondWith(staleWhileRevalidate(req)); return; }
  // todo lo demás (por ejemplo script.google.com) pasa directo, sin caché
});
