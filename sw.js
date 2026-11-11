// Who Drinks What: offline cache.
// Bump VERSION whenever you upload new app files, so phones and iPads drop the old copy.
var VERSION = 'v1';
var CACHE = 'who-drinks-what-' + VERSION;
var CORE = ['./', 'index.html', 'apple-touch-icon.png'];
var FONT_CSS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;800&family=Figtree:wght@400;500;600&display=swap';

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    var cache = await caches.open(CACHE);
    // The app itself must be saved, or the install fails and tries again next visit.
    // 'reload' skips the browser's own cache so a new version never saves an old copy.
    await Promise.all(CORE.map(function (u) {
      return fetch(u, { cache: 'reload' }).then(function (r) {
        if (!r.ok) throw new Error('Could not save ' + u);
        return cache.put(u, r);
      });
    }));
    // The fonts are a bonus. If they cannot be saved, the app falls back to system fonts.
    try {
      var res = await fetch(FONT_CSS);
      if (res.ok) {
        var css = await res.clone().text();
        await cache.put(FONT_CSS, res);
        var urls = Array.from(new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)'"\s]+/g) || []));
        await Promise.all(urls.map(function (u) {
          return fetch(u).then(function (r) { if (r.ok) return cache.put(u, r); }).catch(function () {});
        }));
      }
    } catch (e) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

// Serve the saved copy straight away, then fetch a fresh one in the background
// so the next time the app opens it is up to date.
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;
  var isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;

  event.respondWith((async function () {
    var cache = await caches.open(CACHE);
    var hit = await cache.match(req, { ignoreSearch: sameOrigin });
    // 'no-cache' asks the server whether the file changed, instead of trusting a stored copy.
    var refresh = (sameOrigin ? fetch(req.url, { cache: 'no-cache' }) : fetch(req)).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(function () { return null; });
    if (hit) { event.waitUntil(refresh); return hit; }
    var res = await refresh;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  })());
});
