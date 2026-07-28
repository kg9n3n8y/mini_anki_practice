/**
 * PWA登録・アップデート通知・画像キャッシュ進捗の管理
 */
const pwaController = {
  registration: null,
  waitingWorker: null,

  /**
   * Service Worker を登録し、更新検知をセットアップする
   * @param {{ onUpdateAvailable: Function, onImageCacheProgress?: Function, onImageCacheComplete?: Function }} callbacks
   */
  async init(callbacks) {
    if (!('serviceWorker' in navigator)) {
      console.info('[PWA] このブラウザは Service Worker 非対応です');
      return null;
    }

    // SW からのメッセージ（画像キャッシュ進捗など）
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data || {};
      if (data.type === 'IMAGE_CACHE_PROGRESS' && callbacks.onImageCacheProgress) {
        callbacks.onImageCacheProgress(data.saved, data.total);
      }
      if (data.type === 'IMAGE_CACHE_COMPLETE' && callbacks.onImageCacheComplete) {
        callbacks.onImageCacheComplete(data.saved, data.total);
      }
    });

    // 新しい SW が制御を開始したらページを再読み込み
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    try {
      this.registration = await navigator.serviceWorker.register('./sw.js');
      console.info('[PWA] Service Worker 登録完了');

      // すでに待機中の新バージョンがある場合
      if (this.registration.waiting && navigator.serviceWorker.controller) {
        this.waitingWorker = this.registration.waiting;
        callbacks.onUpdateAvailable();
      }

      // 新しい SW のインストールを検知
      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state !== 'installed') return;

          if (navigator.serviceWorker.controller) {
            // 既存ユーザー向け: 通知を出して、押されるまで待機
            this.waitingWorker = newWorker;
            callbacks.onUpdateAvailable();
          } else {
            // 初回インストール: すぐに有効化して画像キャッシュを開始
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      // 定期的に更新をチェック（1時間ごと）
      setInterval(() => {
        this.registration.update().catch(() => {});
      }, 60 * 60 * 1000);

      // タブが前面に戻ったときも更新チェック
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.registration.update().catch(() => {});
        }
      });

      return this.registration;
    } catch (error) {
      console.error('[PWA] Service Worker 登録失敗:', error);
      return null;
    }
  },

  /**
   * 待機中の Service Worker を有効化し、ページを更新する
   */
  applyUpdate() {
    const worker = this.waitingWorker || this.registration?.waiting;
    if (!worker) {
      window.location.reload();
      return;
    }
    worker.postMessage({ type: 'SKIP_WAITING' });
  },

  /**
   * 取り札画像のキャッシュを明示的に開始する
   */
  requestImageCache() {
    if (!navigator.serviceWorker.controller) return;
    navigator.serviceWorker.controller.postMessage({ type: 'CACHE_IMAGES_NOW' });
  },
};
