/**
 * ミニ暗記練 Service Worker
 *
 * - アプリ本体（HTML/CSS/JS）をキャッシュ
 * - 取り札画像を端末ストレージ（Cache Storage）に保存
 * - 新バージョン検知時は待機し、ユーザー操作で更新
 *
 * アップデート時はこの CACHE_VERSION を必ず変更すること
 */
const CACHE_VERSION = 'v1.1.1';
const APP_CACHE = `mini-anki-app-${CACHE_VERSION}`;
const IMAGE_CACHE = `mini-anki-images-${CACHE_VERSION}`;
const RUNTIME_CACHE = `mini-anki-runtime-${CACHE_VERSION}`;

/** アプリ本体（アプリシェル） */
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './fudalist.js',
  './js/app.js',
  './js/settings.js',
  './js/image-cache.js',
  './js/pwa.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

/**
 * 取り札画像URL一覧（表100 + 裏100）
 * @returns {string[]}
 */
function getTorifudaUrls() {
  const urls = ['./torifuda/tori_ura.png'];
  for (let i = 1; i <= 100; i += 1) {
    urls.push(`./torifuda/tori_${i}.png`);
    urls.push(`./torifuda/tori_r_${i}.png`);
  }
  return urls;
}

/**
 * 相対パスを SW スコープ基準の絶対URLに変換
 * @param {string} path
 * @returns {string}
 */
function toAbsoluteUrl(path) {
  return new URL(path, self.registration.scope).href;
}

/**
 * 複数URLをキャッシュに追加（失敗しても続行）
 * @param {Cache} cache
 * @param {string[]} paths
 * @param {number} batchSize
 */
async function addAllSafe(cache, paths, batchSize = 20) {
  const absoluteUrls = paths.map(toAbsoluteUrl);
  let saved = 0;

  for (let i = 0; i < absoluteUrls.length; i += batchSize) {
    const batch = absoluteUrls.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (url) => {
        try {
          const response = await fetch(url, { cache: 'reload' });
          if (response.ok) {
            await cache.put(url, response);
            saved += 1;
          }
        } catch (error) {
          console.warn('[SW] キャッシュ失敗:', url, error);
        }
      })
    );

    // 進捗を開いているタブに通知
    const clientsList = await self.clients.matchAll({ type: 'window' });
    clientsList.forEach((client) => {
      client.postMessage({
        type: 'IMAGE_CACHE_PROGRESS',
        saved,
        total: absoluteUrls.length,
      });
    });
  }

  return saved;
}

// ---------- インストール ----------
self.addEventListener('install', (event) => {
  // skipWaiting は呼ばない → ユーザーが「アップデート」を押すまで待機
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);
      await addAllSafe(cache, APP_SHELL, 10);
    })()
  );
});

// ---------- アクティベート ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 古いバージョンのキャッシュを削除
      const keys = await caches.keys();
      const keep = new Set([APP_CACHE, IMAGE_CACHE, RUNTIME_CACHE]);
      await Promise.all(
        keys
          .filter((key) => !keep.has(key))
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();

      // 取り札画像を本体ストレージへ保存（バックグラウンド）
      const imageCache = await caches.open(IMAGE_CACHE);
      const saved = await addAllSafe(imageCache, getTorifudaUrls(), 15);

      const clientsList = await self.clients.matchAll({ type: 'window' });
      clientsList.forEach((client) => {
        client.postMessage({
          type: 'IMAGE_CACHE_COMPLETE',
          saved,
          total: getTorifudaUrls().length,
        });
      });
    })()
  );
});

// ---------- フェッチ ----------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 取り札画像: キャッシュ優先（オフラインでも使える）
  if (url.pathname.includes('/torifuda/')) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // 同一オリジンのアプリ資産: ネットワーク優先（更新を取りにいく）
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, APP_CACHE));
    return;
  }

  // CDN（Vue / Tailwind / フォントなど）: キャッシュ優先
  event.respondWith(cacheFirst(request, RUNTIME_CACHE));
});

/**
 * キャッシュ優先。なければネットから取得して保存
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return new Response('オフラインのため取得できませんでした', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}

/**
 * ネットワーク優先。失敗時はキャッシュ
 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;

    // ナビゲーション時は index.html にフォールバック
    if (request.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }

    return new Response('オフラインのため取得できませんでした', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}

// ---------- メッセージ（アップデート実行など） ----------
self.addEventListener('message', (event) => {
  const data = event.data || {};

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (data.type === 'CACHE_IMAGES_NOW') {
    event.waitUntil(
      (async () => {
        const imageCache = await caches.open(IMAGE_CACHE);
        const saved = await addAllSafe(imageCache, getTorifudaUrls(), 15);
        if (event.source) {
          event.source.postMessage({
            type: 'IMAGE_CACHE_COMPLETE',
            saved,
            total: getTorifudaUrls().length,
          });
        }
      })()
    );
  }
});
