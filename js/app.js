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
      imageCacheStatus: '',
      cardBackImage: APP_CONFIG.cardBackImage,
      gridOptions: GRID_OPTIONS,
      memorizeTimeMin: MEMORIZE_TIME_MIN,
      memorizeTimeMax: MEMORIZE_TIME_MAX,
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

    layoutDensity() {
      if (this.totalSlots >= 12) return 'tight';
      if (this.totalSlots >= 9) return 'dense';
      if (this.totalSlots >= 6) return 'compact';
      return 'comfortable';
    },

    gameBoardStyle() {
      return {
        gridTemplateColumns: `repeat(${this.currentGrid.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${this.currentGrid.rows}, minmax(0, 1fr))`,
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
  },

  mounted() {
    imageCache.preload(APP_CONFIG.cardBackImage);
    imageCache.warmupAll(fudalist);

    pwaController.init({
      onUpdateAvailable: () => {
        this.updateAvailable = true;
      },
      onImageCacheProgress: (saved, total) => {
        this.imageCacheStatus = `取り札を保存中… ${saved} / ${total}`;
      },
      onImageCacheComplete: (saved, total) => {
        this.imageCacheStatus = `取り札を端末に保存済み（${saved} / ${total}）`;
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

    setGrid(gridId) {
      this.settings.gridId = gridId;
      const total = settingsStore.getGridOption(gridId).cols * settingsStore.getGridOption(gridId).rows;
      if (this.settings.questionCount > total) {
        this.settings.questionCount = total;
      }
      this.saveSettings();
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
      }));

      this.questions = this.buildQuestions();
      this.setCurrentQuestion();

      const urls = [
        ...this.roundSlots.map((slot) => slot.card.normal),
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
        const slot = this.roundSlots.find((s) => s.position === position);
        return slot ? slot.card.normal : this.cardBackImage;
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

    applyUpdate() {
      pwaController.applyUpdate();
    },

    dismissUpdate() {
      this.updateAvailable = false;
    },
  },
}).mount('#app');
