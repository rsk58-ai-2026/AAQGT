/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/camera.js - QRカメラ完全廃止・画面テンキー入力マネージャー
 */

const KeypadAuth = {
  currentInput: '',
  activeCallback: null,

  /**
   * テンキーモーダルを開く
   * @param {Function} onConfirm - 入力確定時コールバック (data) => void
   */
  start(onConfirm) {
    this.activeCallback = onConfirm;
    this.currentInput = '';
    this.updateDisplay();

    const modal = document.getElementById('keypad-auth-modal');
    if (modal) modal.classList.remove('hidden');
  },

  push(num) {
    if (this.currentInput.length < 4) {
      this.currentInput += String(num);
      this.playKeyBeep();
      this.updateDisplay();
    }
  },

  clear() {
    this.currentInput = '';
    this.playKeyBeep();
    this.updateDisplay();
  },

  backspace() {
    if (this.currentInput.length > 0) {
      this.currentInput = this.currentInput.slice(0, -1);
      this.playKeyBeep();
      this.updateDisplay();
    }
  },

  updateDisplay() {
    const display = document.getElementById('keypad-auth-display');
    if (!display) return;
    display.textContent = this.currentInput ? this.currentInput : '--';
  },

  confirm() {
    if (!this.currentInput) {
      alert('スタッフの認証コード（数字）を入力してください');
      return;
    }

    const num = parseInt(this.currentInput, 10);
    // DEV-XX 形式のIDを作成（例: "12" -> "DEV-12", "5" -> "DEV-05"）
    const formattedNum = String(num).padStart(2, '0');
    const deviceId = `DEV-${formattedNum}`;

    this.playSuccessBeep();
    this.close();

    if (typeof this.activeCallback === 'function') {
      this.activeCallback({
        device_id: deviceId,
        code: formattedNum
      });
    }
  },

  close() {
    this.currentInput = '';
    const modal = document.getElementById('keypad-auth-modal');
    if (modal) modal.classList.add('hidden');
    this.activeCallback = null;
  },

  playKeyBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch (e) {}
  },

  playSuccessBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1760, now);
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.08);
    } catch (e) {}
  }
};

// 既存コードとの互換性エイリアス
const CameraScanner = KeypadAuth;
