/**
 * トレーニング設定の管理（localStorage 保存）
 */
const GRID_OPTIONS = [
  { id: '2x2', cols: 2, rows: 2, label: '2 × 2' },
  { id: '2x3', cols: 2, rows: 3, label: '2 × 3' },
  { id: '3x3', cols: 3, rows: 3, label: '3 × 3' },
  { id: '3x4', cols: 3, rows: 4, label: '3 × 4' },
];

const MEMORIZE_TIME_OPTIONS = [3, 5, 8, 10, 15, 20];
const MEMORIZE_TIME_MIN = 3;
const MEMORIZE_TIME_MAX = 20;

const ORIENTATION_OPTIONS = [
  { id: 'normal', label: '自陣向き' },
  { id: 'reverse', label: '相手陣向き' },
  { id: 'mixed', label: 'ミックス' },
];

const DEFAULT_SETTINGS = {
  gridId: '2x2',
  memorizeSeconds: 5,
  questionCount: 1,
  orientation: 'normal',
};

const SETTINGS_STORAGE_KEY = 'mini-anki-settings';

const settingsStore = {
  /**
   * グリッド設定を取得
   * @param {string} gridId
   */
  getGridOption(gridId) {
    return GRID_OPTIONS.find((option) => option.id === gridId) || GRID_OPTIONS[0];
  },

  /**
   * 暗記時間を有効範囲に収める
   * @param {number} value
   */
  clampMemorizeSeconds(value) {
    const seconds = Number(value);
    if (Number.isNaN(seconds)) return DEFAULT_SETTINGS.memorizeSeconds;
    const rounded = Math.min(MEMORIZE_TIME_MAX, Math.max(MEMORIZE_TIME_MIN, Math.round(seconds)));
    if (MEMORIZE_TIME_OPTIONS.includes(rounded)) return rounded;

    // 近い選択肢に丸める
    return MEMORIZE_TIME_OPTIONS.reduce((best, option) => (
      Math.abs(option - rounded) < Math.abs(best - rounded) ? option : best
    ));
  },

  /**
   * 出題数を有効範囲に収める
   * @param {number} value
   * @param {number} totalSlots
   */
  clampQuestionCount(value, totalSlots) {
    const count = Number(value);
    if (Number.isNaN(count)) return 1;
    return Math.min(totalSlots, Math.max(1, Math.round(count)));
  },

  /**
   * 札の向き設定を正規化
   * @param {string} orientation
   */
  normalizeOrientation(orientation) {
    return ORIENTATION_OPTIONS.some((option) => option.id === orientation)
      ? orientation
      : DEFAULT_SETTINGS.orientation;
  },

  /**
   * 設定を読み込む
   */
  load() {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };

      const parsed = JSON.parse(raw);
      const gridOption = this.getGridOption(parsed.gridId);
      const totalSlots = gridOption.cols * gridOption.rows;

      return {
        gridId: gridOption.id,
        memorizeSeconds: this.clampMemorizeSeconds(parsed.memorizeSeconds),
        questionCount: this.clampQuestionCount(parsed.questionCount, totalSlots),
        orientation: this.normalizeOrientation(parsed.orientation),
      };
    } catch (error) {
      console.warn('[settings] 読み込み失敗:', error);
      return { ...DEFAULT_SETTINGS };
    }
  },

  /**
   * 設定を保存する
   * @param {object} settings
   */
  save(settings) {
    const gridOption = this.getGridOption(settings.gridId);
    const totalSlots = gridOption.cols * gridOption.rows;
    const normalized = {
      gridId: gridOption.id,
      memorizeSeconds: this.clampMemorizeSeconds(settings.memorizeSeconds),
      questionCount: this.clampQuestionCount(settings.questionCount, totalSlots),
      orientation: this.normalizeOrientation(settings.orientation),
    };

    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  },

  /**
   * グリッドのマス数を返す
   * @param {object} settings
   */
  getTotalSlots(settings) {
    const grid = this.getGridOption(settings.gridId);
    return grid.cols * grid.rows;
  },
};
