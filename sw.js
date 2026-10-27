/* ============================================================
 * 拾词 · Service Worker（cache-first 离线缓存，零依赖）
 * 预缓存站点骨架；跨域请求（含 textdb.online 同步 API）一律不碰
 * ============================================================ */
// 每次部署改这个版本号，老设备会自动清旧缓存重新拉取
var CACHE = 'vocab-nest-20261027';
var ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/data.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  // 清理旧版本缓存
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // 同步 API 与其他跨域永不缓存
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit; // cache-first
      return fetch(e.request).then(function (res) {
        if (res && res.ok) {
          var cp = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, cp); });
        }
        return res;
      }).catch(function () {
        // 网络失败回缓存兜底（导航请求回首页）
        return caches.match('./index.html');
      });
    })
  );
});
