// Service worker: the site opens instantly and works offline (the forecast itself is already kept in localStorage).
// The page (HTML) is always asked from the network first, so a new release is picked up right away; the
// versioned scripts/styles (?v=<hash>) never change, so they come from the cache. Weather APIs are not touched.
var VERSION = '01d44d2bb3', CACHE = 'cw-' + VERSION, ASSETS = ["./", "style.css?v=2c932ca77b", "icons.js?v=a4e09dec4c", "app.js?v=afdd871fb1", "manifest.webmanifest", "pwa/icon.svg", "pwa/icon-192.png", "pwa/apple-180.png"];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('cw-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;   // Open-Meteo, MET, GitHub: straight to the network
  if (req.mode === 'navigate') {
    // the page: network first (3 s), the cached copy when offline or too slow
    e.respondWith(new Promise(function (resolve) {
      var done = false, fromCache = function () {
        caches.match('./', {ignoreSearch: true}).then(function (r) { if (!done && r) { done = true; resolve(r); } });
      };
      var t = setTimeout(fromCache, 3000);
      fetch(req).then(function (r) {
        clearTimeout(t);
        if (r.ok) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put('./', copy); }); }
        if (!done) { done = true; resolve(r); }
      }).catch(function () {
        clearTimeout(t);
        caches.match('./', {ignoreSearch: true}).then(function (r) { if (!done) { done = true; resolve(r || Response.error()); } });
      });
    }));
    return;
  }
  // everything else of ours: cache first, then the network (and keep a copy)
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (r) {
      if (r.ok) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return r;
    });
  }));
});

// push notifications from our server (push-server/ on Oracle): {title, body, tag, silent}
self.addEventListener('push', function (e) {
  var m = {};
  try { m = e.data ? e.data.json() : {}; } catch (x) { m = {title: e.data ? e.data.text() : ''}; }
  e.waitUntil(self.registration.showNotification(m.title || 'Погода', {
    body: m.body || '', tag: m.tag || undefined, renotify: !!m.tag, silent: !!m.silent,
    icon: 'pwa/icon-192.png', badge: 'pwa/icon-192.png', data: {url: self.registration.scope}
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(function (list) {
    for (var i = 0; i < list.length; i++) if (list[i].url.indexOf(url) === 0 && 'focus' in list[i]) return list[i].focus();
    return self.clients.openWindow(url);
  }));
});
