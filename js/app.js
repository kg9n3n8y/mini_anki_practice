const { createApp } = Vue;

// MVP設定（将来は設定画面から変更できるようにする）
const CONFIG = {
  gridCols: 2,
  gridRows: 2,
  memorySeconds: 5,
  questionCount: 1,
  feedbackMs: 1500,
  orientation: 'normal', // 将来: 'normal' | 'reverse' | 'mixed'
  cardBackImage: './torifuda/tori_ura.png',
};

createApp({
  data() {
    return {
      screen: 'top',
      roundSlots: [],
      targetCard: null,
      targetPosition: null,
      selectedPosition: null,
      isCorrect: false,
      countdown: CONFIG.memorySeconds,
      isAnswering: false,
      isPreparing: false,
      updateAvailable: false,
      imageCacheStatus: '',
      cardBackImage: CONFIG.cardBackImage,
      countdownTimer: null,
      feedbackTimer: null,
    };
  },

  mounted() {
    // トップ画面表示中にメモリ上でも全札をプリロード
    imageCache.preload(CONFIG.cardBackImage);
    imageCache.warmupAll(fudalist);

    // PWA（Service Worker）の登録と更新検知
    pwaController.init({
      onUpdateAvailable: () => {
        this.updateAvailable = true;
      },
      onImageCacheProgress: (saved, total) => {
        this.imageCacheStatus = `取り札を保存中… ${saved} / ${total}`;
      },
      onImageCacheComplete: (saved, total) => {
        this.imageCacheStatus = `取り札を端末に保存済み（${saved} / ${total}）`;
        // しばらくしたら表示を消す
        setTimeout(() => {
          if (this.imageCacheStatus.includes('保存済み')) {
            this.imageCacheStatus = '';
          }
        }, 4000);
      },
    });
  },

  beforeUnmount() {
    this.clearTimers();
  },

  methods: {
  /**
   * タイマーをすべてクリアする
   */
    clearTimers() {
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
      if (this.feedbackTimer) {
        clearTimeout(this.feedbackTimer);
        this.feedbackTimer = null;
      }
    },

  /**
   * 配列からランダムに指定件数を取り出す
   */
    pickRandomItems(array, count) {
      const copied = [...array];
      for (let i = copied.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copied[i], copied[j]] = [copied[j], copied[i]];
      }
      return copied.slice(0, count);
    },

  /**
   * 新しいラウンドを開始する
   * 画像のプリロード完了後にカウントダウンを始める
   */
    async startRound() {
      this.clearTimers();
      this.isAnswering = false;
      this.isPreparing = true;
      this.selectedPosition = null;
      this.isCorrect = false;

      const totalSlots = CONFIG.gridCols * CONFIG.gridRows;
      const selectedCards = this.pickRandomItems(fudalist, totalSlots);

      this.roundSlots = selectedCards.map((card, index) => ({
        position: index,
        card,
      }));

      const targetSlot = this.roundSlots[Math.floor(Math.random() * this.roundSlots.length)];
      this.targetCard = targetSlot.card;
      this.targetPosition = targetSlot.position;

      const urls = [
        ...this.roundSlots.map((slot) => slot.card.normal),
        CONFIG.cardBackImage,
      ];
      this.screen = 'loading';

      try {
        await imageCache.preloadMany(urls);
      } catch (error) {
        console.error(error);
      }

      this.isPreparing = false;
      this.countdown = CONFIG.memorySeconds;
      this.screen = 'memory';

      // DOM更新後にカウントダウン開始（画像描画のタイミングをずらす）
      await this.$nextTick();
      this.startCountdown();
    },

  /**
   * 記憶フェーズのカウントダウンを開始する
   */
    startCountdown() {
      this.countdownTimer = setInterval(() => {
        this.countdown -= 1;
        if (this.countdown <= 0) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
          this.screen = 'answer';
        }
      }, 1000);
    },

  /**
   * ユーザーの回答を処理する
   */
    submitAnswer(position) {
      if (this.isAnswering) return;

      this.isAnswering = true;
      this.selectedPosition = position;
      this.isCorrect = position === this.targetPosition;
      this.screen = 'feedback';

      this.feedbackTimer = setTimeout(() => {
        this.screen = 'result';
        this.feedbackTimer = null;
      }, CONFIG.feedbackMs);
    },

  /**
   * フィードバック画面でのセル見た目を決める
   */
    getFeedbackCellClass(position) {
      const isTarget = position === this.targetPosition;
      const isSelected = position === this.selectedPosition;

      if (this.isCorrect && isSelected) {
        return 'fuda-cell-filled fuda-cell-correct';
      }

      if (!this.isCorrect) {
        if (isTarget) {
          return 'fuda-cell-filled fuda-cell-answer';
        }
        if (isSelected) {
          return 'fuda-cell-filled fuda-cell-wrong';
        }
      }

      return 'fuda-cell-back';
    },

  /**
   * フィードバック画面で表示する画像URLを返す
   */
    getFeedbackImageSrc(position) {
      if (this.shouldShowCardInFeedback(position)) {
        const slot = this.roundSlots.find((s) => s.position === position);
        return slot ? slot.card.normal : this.cardBackImage;
      }
      return this.cardBackImage;
    },

  /**
   * フィードバック画面で札画像を表示するかどうか
   */
    shouldShowCardInFeedback(position) {
      const isTarget = position === this.targetPosition;
      const isSelected = position === this.selectedPosition;

      if (this.isCorrect) {
        return isSelected;
      }

      return isTarget || isSelected;
    },

  /**
   * トップ画面に戻る
   */
    goTop() {
      this.clearTimers();
      this.screen = 'top';
      this.roundSlots = [];
      this.targetCard = null;
      this.isAnswering = false;
      this.isPreparing = false;
    },

  /**
   * 新しい Service Worker を有効化してページを更新する
   */
    applyUpdate() {
      pwaController.applyUpdate();
    },

  /**
   * アップデート通知をいったん閉じる
   */
    dismissUpdate() {
      this.updateAvailable = false;
    },
  },
}).mount('#app');
