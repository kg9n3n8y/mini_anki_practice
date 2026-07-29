/**
 * 効果音（Web Audio API で端末内に生成）
 * 外部の音声ファイルは使わず、短いサイン波で正解/不正解を表現する
 */
const sfx = {
  /** @type {AudioContext | null} */
  context: null,

  /**
   * AudioContext を取得（ユーザー操作後に初期化）
   * @returns {AudioContext | null}
   */
  getContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.context) {
      this.context = new AudioCtx();
    }

    if (this.context.state === 'suspended') {
      this.context.resume().catch(() => {});
    }

    return this.context;
  },

  /**
   * 短いトーンを1つ鳴らす
   * @param {number} frequency
   * @param {number} startOffset
   * @param {number} duration
   * @param {number} volume
   * @param {OscillatorType} type
   */
  playTone(frequency, startOffset, duration, volume, type = 'sine') {
    const ctx = this.getContext();
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const startAt = ctx.currentTime + startOffset;
    const endAt = startAt + duration;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(startAt);
    oscillator.stop(endAt + 0.02);
  },

  /**
   * 正解音（明るく上昇する2音）
   */
  playCorrect() {
    this.playTone(523.25, 0, 0.12, 0.08); // C5
    this.playTone(783.99, 0.1, 0.18, 0.09); // G5
  },

  /**
   * 不正解音（低めで短い下降音）
   */
  playIncorrect() {
    this.playTone(220, 0, 0.14, 0.07, 'triangle'); // A3
    this.playTone(164.81, 0.1, 0.2, 0.06, 'triangle'); // E3
  },
};
