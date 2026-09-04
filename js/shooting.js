/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/shooting.js - 射撃フェーズ機制御 (テンキー得点入力 & QR得点登録)
 */

const ShootingApp = {
  currentScoreStr: '0',

  init() {
    const role = AppStorage.getRole();
    if (role !== CONFIG.ROLES.SHOOTING) return;

    const screen = document.getElementById('shooting-screen');
    if (screen) screen.classList.remove('hidden');

    this.clear();
  },

  pushKey(num) {
    if (this.currentScoreStr === '0') {
      this.currentScoreStr = String(num);
    } else if (this.currentScoreStr.length < 4) {
      this.currentScoreStr += String(num);
    }
    this.updateDisplay();
  },

  clear() {
    this.currentScoreStr = '0';
    this.updateDisplay();
  },

  backspace() {
    if (this.currentScoreStr.length > 1) {
      this.currentScoreStr = this.currentScoreStr.slice(0, -1);
    } else {
      this.currentScoreStr = '0';
    }
    this.updateDisplay();
  },

  updateDisplay() {
    const display = document.getElementById('shooting-score-display');
    if (display) display.textContent = this.currentScoreStr;
  },

  /**
   * QRスキャナー起動
   */
  openScanner() {
    const scoreVal = parseInt(this.currentScoreStr, 10) || 0;

    CameraScanner.start(async (data) => {
      await this.handleSubmitScore(data, scoreVal);
    });
  },

  /**
   * 射撃得点保存API呼び出し
   * @param {Object} qrData
   * @param {number} score
   */
  async handleSubmitScore(qrData, score) {
    if (!qrData || !qrData.device_id) {
      alert('無効なスタッフQRコードです。');
      return;
    }

    try {
      const res = await API.submitShootingScore({
        device_id: qrData.device_id,
        shooting_score: score
      });

      if (res && res.success) {
        alert(`射撃スコア [ ${score} pts ] を登録しました！`);
        this.clear();
      } else {
        alert('得点登録エラー: ' + (res.error || 'エラー'));
      }
    } catch (e) {
      alert('通信エラーが発生しました。もう一度お試しください。');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  ShootingApp.init();
});