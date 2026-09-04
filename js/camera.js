/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/camera.js - インカメラQRスキャナー共通制御マネージャー
 */

const CameraScanner = {
  html5QrCode: null,
  currentFacingMode: 'user', // デフォルト前面インカメラ
  activeCallback: null,
  isScanning: false,

  /**
   * インカメラQRスキャナーを起動
   * @param {Function} onScanSuccess - 読み取り成功時コールバック (parsedObj | rawString)
   */
  async start(onScanSuccess) {
    this.activeCallback = onScanSuccess;
    const modal = document.getElementById('camera-scan-modal');
    if (modal) modal.classList.remove('hidden');

    try {
      if (this.html5QrCode) {
        await this.stop();
      }

      this.html5QrCode = new Html5Qrcode('camera-reader-viewport');

      const config = {
        fps: 15,
        qrbox: { width: 240, height: 240 },
        aspectRatio: 1.0
      };

      const cameraConfig = {
        facingMode: this.currentFacingMode
      };

      this.isScanning = true;
      await this.html5QrCode.start(
        cameraConfig,
        config,
        (decodedText) => {
          this.handleDecodedText(decodedText);
        },
        (errorMessage) => {
          // 未検出フレームは無視
        }
      );
    } catch (error) {
      console.warn('[CameraScanner] カメラ起動エラー:', error);
      alert('カメラの起動に失敗しました。カメラの利用権限を許可してください。');
      this.close();
    }
  },

  /**
   * 読み取り成功時のハンドリング
   */
  async handleDecodedText(decodedText) {
    if (!this.isScanning) return;
    this.isScanning = false;

    // 認証成功ビープ音
    this.playSuccessBeep();

    let parsedData = null;
    try {
      parsedData = JSON.parse(decodedText);
    } catch (e) {
      parsedData = { raw: decodedText };
    }

    await this.stop();
    this.closeModalOnly();

    if (typeof this.activeCallback === 'function') {
      this.activeCallback(parsedData);
    }
  },

  /**
   * 前面 / 背面カメラの切り替え
   */
  async toggleCameraFacing() {
    this.currentFacingMode = (this.currentFacingMode === 'user') ? 'environment' : 'user';
    if (this.html5QrCode && this.isScanning) {
      const cb = this.activeCallback;
      await this.stop();
      await this.start(cb);
    }
  },

  /**
   * スキャナー停止処理
   */
  async stop() {
    this.isScanning = false;
    if (this.html5QrCode) {
      try {
        if (this.html5QrCode.isScanning) {
          await this.html5QrCode.stop();
        }
        await this.html5QrCode.clear();
      } catch (e) {
        console.warn('[CameraScanner] 停止処理エラー:', e);
      } finally {
        this.html5QrCode = null;
      }
    }
  },

  /**
   * モーダルを閉じてスキャナーを停止
   */
  async close() {
    await this.stop();
    this.closeModalOnly();
  },

  closeModalOnly() {
    const modal = document.getElementById('camera-scan-modal');
    if (modal) modal.classList.add('hidden');
    this.activeCallback = null;
  },

  /**
   * Web Audio API によるサイバー電子音
   */
  playSuccessBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1760, now); // A6
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.08);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(2349.32, now + 0.09); // D7
      gain2.gain.setValueAtTime(0.25, now + 0.09);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.09);
      osc2.stop(now + 0.22);
    } catch (e) {}
  }
};