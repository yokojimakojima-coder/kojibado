/* ======================================================
   コジバド!! サービスワーカー（完全版）
====================================================== */

const CACHE_NAME = "kojibado-cache-v1";

/* キャッシュするファイル一覧 */
const FILES_TO_CACHE = [
  "index.html",
  "players.html",
  "attendance.html",
  "style.css",
  "common.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png"
];

/* インストール時：キャッシュに保存 */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

/* アクティベート時：古いキャッシュを削除 */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(
        keyList.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

/* フェッチ時：キャッシュ → ネットの順で取得 */
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // キャッシュにあればそれを返す
      if (response) return response;

      // ネットから取得してキャッシュに保存
      return fetch(event.request).then(networkRes => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkRes.clone());
          return networkRes;
        });
      });
    })
  );
});
