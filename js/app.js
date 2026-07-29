const { createApp } = Vue;

const APP_CONFIG = {
  feedbackMs: 1500,
  cardBackImage: './torifuda/tori_ura.png',
};

createApp({
  data() {
    const settings = settingsStore.load();
    return {
      screen: 'top',
      settings,
      roundSlots: [],
      questions: [],
      currentQuestionIndex: 0,
      correctCount: 0,
      targetCard: null,
      targetPosition: null,
      selectedPosition: null,
      lastAnswerCorrect: false,
      countdown: settings.memorizeSeconds,
      isAnswering: false,
      isPreparing: false,
      updateAvailable: false,
      installPromptVisible: false,
      installPromptType: null, // 'prompt' | 'ios'
      isCachingImages: false,
      imageCacheStatus: '',
      cardBackImage: APP_CONFIG.cardBackImage,
      gridOptions: GRID_OPTIONS,
      orientationOptions: ORIENTATION_OPTIONS,
      memorizeTimeOptions: MEMORIZE_TIME_OPTIONS,
      countdownTimer: null,
      feedbackTimer: null,
    };
  },

  computed: {
    currentGrid() {
      return settingsStore.getGridOption(this.settings.gridId);
    },

    totalSlots() {
      return this.currentGrid.cols * this.currentGrid.rows;
    },

    questionCountOptions() {
      return Array.from({ length: this.totalSlots }, (_, index) => index + 1);
    },

    layoutDensity() {
      if (this.totalSlots >= 12) return 'tight';
      if (this.totalSlots >= 9) return 'dense';
      if (this.totalSlots >= 6) return 'compact';
      return 'comfortable';
    },

    gameBoardStyle() {
      const { cols, rows } = this.currentGrid;
      // 取り札画像の実寸比 5:7（400x560）に合わせて盤面を組む
      return {
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        aspectRatio: `${cols * 5} / ${rows * 7}`,
      };
    },

    currentQuestionNumber() {
      return this.currentQuestionIndex + 1;
    },

    isLastQuestion() {
      return this.currentQuestionIndex >= this.questions.length - 1;
    },

    roundSummaryText() {
      return `${this.questions.length}問中 ${this.correctCount}問正解`;
    },

    imageCacheButtonLabel() {
      if (this.isCachingImages) return '保存中…';
      if (this.imageCacheStatus.includes('保存済み')) return '取り札を再保存';
      return '取り札を端末に保存';
    },
  },

  mounted() {
    // 伏せ札だけ先読み（全取り札は手動ボタンで保存）
    imageCache.preload(APP_CONFIG.cardBackImage);

    pwaController.init({
      onUpdateAvailable: () => {
        this.updateAvailable = true;
      },
      onInstallAvailable: ({ type }) => {
        if (type === 'installed') {
          this.installPromptVisible = false;
          this.installPromptType = null;
          return;
        }
        this.installPromptType = type;
        this.installPromptVisible = true;
      },
      onImageCacheProgress: (saved, total) => {
        this.isCachingImages = true;
        this.imageCacheStatus = `取り札を保存中… ${saved} / ${total}`;
      },
      onImageCacheComplete: (saved, total) => {
        this.isCachingImages = false;
        this.imageCacheStatus = `取り札を端末に保存済み（${saved} / ${total}）`;
      },
    });
  },

  beforeUnmount() {
    this.clearTimers();
  },

  methods: {
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

    saveSettings() {
      this.settings = settingsStore.save(this.settings);
    },

    onGridChange() {
      const total = this.totalSlots;
      if (this.settings.questionCount > total) {
        this.settings.questionCount = total;
      }
      this.saveSettings();
    },

    /**
     * 設定に応じて札の表示画像を決める
     * @param {object} card
     * @param {string} orientation
     */
    resolveDisplayImage(card, orientation) {
      if (orientation === 'reverse') return card.reverse;
      if (orientation === 'normal') return card.normal;
      return Math.random() < 0.5 ? card.normal : card.reverse;
    },

    /**
     * 指定位置の札の表示画像を返す
     * @param {number} position
     */
    getSlotDisplayImage(position) {
      const slot = this.roundSlots.find((s) => s.position === position);
      return slot ? slot.displayImage : this.cardBackImage;
    },

    /**
     * 正解札の表示画像を返す
     */
    getTargetDisplayImage() {
      return this.getSlotDisplayImage(this.targetPosition);
    },

    pickRandomItems(array, count) {
      const copied = [...array];
      for (let i = copied.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copied[i], copied[j]] = [copied[j], copied[i]];
      }
      return copied.slice(0, count);
    },

    buildQuestions() {
      const questionSlots = this.pickRandomItems(
        this.roundSlots,
        Math.min(this.settings.questionCount, this.roundSlots.length)
      );
      return questionSlots.map((slot) => ({
        card: slot.card,
        position: slot.position,
      }));
    },

    setCurrentQuestion() {
      const current = this.questions[this.currentQuestionIndex];
      this.targetCard = current.card;
      this.targetPosition = current.position;
    },

    async startRound() {
      this.clearTimers();
      this.isAnswering = false;
      this.isPreparing = true;
      this.selectedPosition = null;
      this.lastAnswerCorrect = false;
      this.currentQuestionIndex = 0;
      this.correctCount = 0;

      const selectedCards = this.pickRandomItems(fudalist, this.totalSlots);
      this.roundSlots = selectedCards.map((card, index) => ({
        position: index,
        card,
        displayImage: this.resolveDisplayImage(card, this.settings.orientation),
      }));

      this.questions = this.buildQuestions();
      this.setCurrentQuestion();

      const urls = [
        ...this.roundSlots.map((slot) => slot.displayImage),
        APP_CONFIG.cardBackImage,
      ];
      this.screen = 'loading';

      try {
        await imageCache.preloadMany(urls);
      } catch (error) {
        console.error(error);
      }

      this.isPreparing = false;
      this.countdown = this.settings.memorizeSeconds;
      this.screen = 'memory';

      await this.$nextTick();
      this.startCountdown();
    },

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

    submitAnswer(position) {
      if (this.isAnswering) return;

      this.isAnswering = true;
      this.selectedPosition = position;
      this.lastAnswerCorrect = position === this.targetPosition;
      if (this.lastAnswerCorrect) {
        this.correctCount += 1;
        sfx.playCorrect();
      } else {
        sfx.playIncorrect();
      }
      this.screen = 'feedback';

      this.feedbackTimer = setTimeout(() => {
        this.feedbackTimer = null;
        if (this.isLastQuestion) {
          this.screen = 'result';
          this.isAnswering = false;
          return;
        }

        this.currentQuestionIndex += 1;
        this.setCurrentQuestion();
        this.selectedPosition = null;
        this.isAnswering = false;
        this.screen = 'answer';
      }, APP_CONFIG.feedbackMs);
    },

    getFeedbackCellClass(position) {
      const isTarget = position === this.targetPosition;
      const isSelected = position === this.selectedPosition;

      if (this.lastAnswerCorrect && isSelected) {
        return 'fuda-cell-filled fuda-cell-correct';
      }

      if (!this.lastAnswerCorrect) {
        if (isTarget) {
          return 'fuda-cell-filled fuda-cell-answer';
        }
        if (isSelected) {
          return 'fuda-cell-filled fuda-cell-wrong';
        }
      }

      return 'fuda-cell-back';
    },

    getFeedbackImageSrc(position) {
      if (this.shouldShowCardInFeedback(position)) {
        return this.getSlotDisplayImage(position);
      }
      return this.cardBackImage;
    },

    shouldShowCardInFeedback(position) {
      const isTarget = position === this.targetPosition;
      const isSelected = position === this.selectedPosition;

      if (this.lastAnswerCorrect) {
        return isSelected;
      }

      return isTarget || isSelected;
    },

    goTop() {
      this.clearTimers();
      this.screen = 'top';
      this.roundSlots = [];
      this.questions = [];
      this.targetCard = null;
      this.isAnswering = false;
      this.isPreparing = false;
    },

    /**
     * 取り札画像を端末に保存する（手動）
     */
    async downloadTorifudaImages() {
      if (this.isCachingImages) return;

      this.isCachingImages = true;
      this.imageCacheStatus = '取り札を保存中…';

      // メモリ上のプリロードも並行して進める
      imageCache.warmupAll(fudalist).catch(() => {});

      const started = pwaController.requestImageCache();
      if (!started) {
        // SW未制御の場合はメモリプリロード完了後に完了扱い
        try {
          await imageCache.warmupAll(fudalist);
          this.isCachingImages = false;
          this.imageCacheStatus = '取り札を端末に保存済み（ブラウザキャッシュ）';
        } catch (error) {
          this.isCachingImages = false;
          this.imageCacheStatus = '保存に失敗しました。通信環境を確認してください。';
          console.error(error);
        }
      }
    },

    /**
     * PWAインストールを促す
     */
    async installApp() {
      if (this.installPromptType === 'ios') {
        // iOSはブラウザの共有メニューから追加する必要がある
        return;
      }

      const result = await pwaController.promptInstall();
      if (result === 'accepted' || result === 'dismissed') {
        this.installPromptVisible = false;
      }
    },

    dismissInstallPrompt() {
      this.installPromptVisible = false;
    },

    applyUpdate() {
      pwaController.applyUpdate();
    },

    dismissUpdate() {
      this.updateAvailable = false;
    },
  },
}).mount('#app');
