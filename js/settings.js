/**
 * トレーニング設定の管理（localStorage 保存）
 */
const GRID_OPTIONS = [
  { id: '2x2', cols: 2, rows: 2, label: '2 × 2' },
  { id: '2x3', cols: 2, rows: 3, label: '2 × 3' },
  { id: '3x3', cols: 3, rows: 3, label: '3 × 3' },
  { id: '3x4', cols: 3, rows: 4, label: '3 × 4' },
];

const MEMORIZE_TIME_OPTIONS = [3, 5, 8, 10, 15];

const DEFAULT_SETTINGS = {
  gridId: '2x2',
  memorizeSeconds: 5,
  questionCount: 1,
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
   * 設定を読み込む
   */
  load() {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };

      const parsed = JSON.parse(raw);
      const gridOption = this.getGridOption(parsed.gridId);
      const totalSlots = gridOption.cols * gridOption.rows;
      const memorizeSeconds = MEMORIZE_TIME_OPTIONS.includes(parsed.memorizeSeconds)
        ? parsed.memorizeSeconds
        : DEFAULT_SETTINGS.memorizeSeconds;
      const questionCount = Math.min(
        Math.max(1, Number(parsed.questionCount) || 1),
        totalSlots
      );

      return {
        gridId: gridOption.id,
        memorizeSeconds,
        questionCount,
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
      memorizeSeconds: MEMORIZE_TIME_OPTIONS.includes(settings.memorizeSeconds)
        ? settings.memorizeSeconds
        : DEFAULT_SETTINGS.memorizeSeconds,
      questionCount: Math.min(
        Math.max(1, Number(settings.questionCount) || 1),
        totalSlots
      ),
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
