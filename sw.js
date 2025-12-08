// ===============================
// コジバド!! Service Worker
// ===============================

const CACHE_NAME = "kojibado-cache-v1";

// キャッシュするファイル
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

// ------------------------------------
// インストール（初回にキャッシュ）
// ------------------------------------
self.addEventListener("install", event => {
  console.log("[ServiceWorker] Install");

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log("[ServiceWorker] Pre-caching assets");
      return cache.addAll(FILES_TO_CACHE);
    })
  );

  self.skipWaiting(); // すぐ反映
});


// ------------------------------------
// アクティベート（古いキャッシュ削除）
// ------------------------------------
self.addEventListener("activate", event => {
  console.log("[ServiceWorker] Activate");

  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(
        keyList.map(key => {
          if (key !== CACHE_NAME) {
            console.log("[ServiceWorker] Removing old cache:", key);
            return caches.delete(key);
          }
        })
      );
    })
  );

  self.clients.claim();
});


// ------------------------------------
// fetch（オフライン対応）
// ------------------------------------
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュがある → 即返す
        if (response) return response;

        // キャッシュが無い → ネットワークから取得
        return fetch(event.request)
          .catch(() => {
            // オフラインで index.html だけは返す
            if (event.request.mode === "navigate") {
              return caches.match("index.html");
            }
          });
      })
  );
});
