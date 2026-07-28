/**
 * 取り札画像のプリロード・キャッシュ管理
 * Image オブジェクトをメモリに保持し、2回目以降の表示を高速化する
 */
const imageCache = {
  /** @type {Map<string, HTMLImageElement>} */
  cache: new Map(),
  /** @type {Map<string, Promise<HTMLImageElement>>} */
  loading: new Map(),

  /**
   * 1枚の画像をプリロードする（済みなら即 resolve）
   * @param {string} url
   * @returns {Promise<HTMLImageElement>}
   */
  preload(url) {
    const cached = this.cache.get(url);
    if (cached) {
      return Promise.resolve(cached);
    }

    const pending = this.loading.get(url);
    if (pending) {
      return pending;
    }

    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        this.cache.set(url, img);
        this.loading.delete(url);
        resolve(img);
      };
      img.onerror = () => {
        this.loading.delete(url);
        reject(new Error(`画像の読み込みに失敗しました: ${url}`));
      };
      img.src = url;
    });

    this.loading.set(url, promise);
    return promise;
  },

  /**
   * 複数画像を並列でプリロードする
   * @param {string[]} urls
   * @returns {Promise<HTMLImageElement[]>}
   */
  preloadMany(urls) {
    return Promise.all(urls.map((url) => this.preload(url)));
  },

  /**
   * キャッシュ済みかどうか
   * @param {string} url
   * @returns {boolean}
   */
  has(url) {
    return this.cache.has(url);
  },

  /**
   * 全取り札（表・裏）をバックグラウンドでキャッシュする
   * @param {Array<{normal: string, reverse: string}>} cards
   * @param {number} batchSize
   */
  async warmupAll(cards, batchSize = 10) {
    const urls = [];
    cards.forEach((card) => {
      urls.push(card.normal);
      urls.push(card.reverse);
    });

    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      await Promise.all(
        batch.map((url) => this.preload(url).catch(() => null))
      );
    }
  },
};
