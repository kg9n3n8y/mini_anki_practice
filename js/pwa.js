/**
 * PWA登録・アップデート通知・インストール促し・取り札の自動キャッシュ管理
 */
const pwaController = {
  registration: null,
  waitingWorker: null,
  deferredInstallPrompt: null,
  imageCacheRequested: false,

  /**
   * すでにホーム画面アプリとして起動しているか
   * @returns {boolean}
   */
  isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true
    );
  },

  /**
   * iOS Safari かどうか（beforeinstallprompt 非対応）
   * @returns {boolean}
   */
  isIosSafari() {
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(ua);
    return isIos && isSafari;
  },

  /**
   * Service Worker を登録し、更新検知・インストール促しをセットアップする
   * @param {{
   *   onUpdateAvailable: Function,
   *   onInstallAvailable?: Function,
   * }} callbacks
   */
  async init(callbacks) {
    // PWAインストール促し（Chrome等）
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferredInstallPrompt = event;
      if (callbacks.onInstallAvailable && !this.isStandalone()) {
        callbacks.onInstallAvailable({ type: 'prompt' });
      }
    });

    window.addEventListener('appinstalled', () => {
      this.deferredInstallPrompt = null;
      if (callbacks.onInstallAvailable) {
        callbacks.onInstallAvailable({ type: 'installed' });
      }
      // ホーム画面追加直後にも取り札キャッシュを開始
      this.scheduleImageCache();
    });

    // iOS は beforeinstallprompt が無いので、ブラウザ表示時に案内を出す
    if (!this.isStandalone() && this.isIosSafari() && callbacks.onInstallAvailable) {
      callbacks.onInstallAvailable({ type: 'ios' });
    }

    if (!('serviceWorker' in navigator)) {
      console.info('[PWA] このブラウザは Service Worker 非対応です');
      return null;
    }

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    try {
      this.registration = await navigator.serviceWorker.register('./sw.js');
      console.info('[PWA] Service Worker 登録完了');

      // 裏で取り札画像を自動キャッシュ（ユーザー操作不要）
      this.scheduleImageCache();

      if (this.registration.waiting && navigator.serviceWorker.controller) {
        this.waitingWorker = this.registration.waiting;
        callbacks.onUpdateAvailable();
      }

      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state !== 'installed') return;

          if (navigator.serviceWorker.controller) {
            this.waitingWorker = newWorker;
            callbacks.onUpdateAvailable();
          } else {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      setInterval(() => {
        this.registration.update().catch(() => {});
      }, 60 * 60 * 1000);

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.registration.update().catch(() => {});
          // タブ復帰時にも未キャッシュ分を補完
          this.scheduleImageCache();
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
   * 取り札画像の自動キャッシュを、SW の準備ができ次第開始する
   */
  scheduleImageCache() {
    if (!('serviceWorker' in navigator)) return;

    const start = () => {
      this.requestImageCache();
    };

    if (navigator.serviceWorker.controller) {
      start();
      return;
    }

    navigator.serviceWorker.ready
      .then(() => {
        start();
      })
      .catch(() => {});
  },

  /**
   * 取り札画像のキャッシュを Service Worker に依頼する
   * @returns {boolean} 開始できたか
   */
  requestImageCache() {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CACHE_IMAGES_NOW' });
      this.imageCacheRequested = true;
      return true;
    }

    // SW がまだ制御していない場合は、登録後に送る
    if (this.registration?.active) {
      this.registration.active.postMessage({ type: 'CACHE_IMAGES_NOW' });
      this.imageCacheRequested = true;
      return true;
    }

    return false;
  },

  /**
   * ブラウザのインストールダイアログを表示する
   * @returns {Promise<'accepted'|'dismissed'|'unavailable'>}
   */
  async promptInstall() {
    if (!this.deferredInstallPrompt) return 'unavailable';

    this.deferredInstallPrompt.prompt();
    const choice = await this.deferredInstallPrompt.userChoice;
    this.deferredInstallPrompt = null;
    return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
  },
};
