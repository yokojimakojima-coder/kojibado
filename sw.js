// =============================
//  コジバド!! Service Worker
//  オフライン対応・キャッシュ最適化版
// =============================

const CACHE_NAME = "kojibado-cache-v1";

// キャッシュするファイル（必要なもの全部書く）
const urlsToCache = [
  "index.html",
  "players.html",
  "attendance.html",
  "style.css",
  "common.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png"
];

// インストール時にキャッシュ登録
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// オフライン時のキャッシュ読み込み
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // キャッシュがあればそれを返す
      if (response) {
        return response;
      }
      // なければ普通にネットワークへ
      return fetch(event.request);
    })
  );
});

// 新バージョン更新時、古いキャッシュを削除
self.addEventListener("activate", (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (!cacheWhitelist.includes(key)) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});
