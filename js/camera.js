/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/camera.js - インカメラQRスキャナー共通制御マネージャー (DOM描画待機 & 多段フォールバック強化版)
 */

const CameraScanner = {
  html5QrCode: null,
  currentFacingMode: 'user', // デフォルト: インカメラ
  activeCallback: null,
  isScanning: false,
  targetContainerId: 'camera-reader-viewport',

  /**
   * 難易度文字列の安全な正規化
   */
  normalizeDifficulty(val) {
    if (!val) return 'normal';
    const s = String(val).trim().toLowerCase();
    if (['easy', 'e', '1'].includes(s)) return 'easy';
    if (['normal', 'norm', 'n', '2'].includes(s)) return 'normal';
    if (['hard', 'h', '3'].includes(s)) return 'hard';
    if (['ex', 'extra', '4'].includes(s)) return 'ex';
    return 'normal';
  },

  async start(onScanSuccess) {
    this.activeCallback = onScanSuccess;
    const modal = document.getElementById('camera-scan-modal');
    if (modal) modal.classList.remove('hidden');

    const viewport = document.getElementById(this.targetContainerId);
    if (viewport) {
      viewport.innerHTML = '';
      if (this.currentFacingMode === 'user') {
        viewport.classList.add('mirror-mode');
      } else {
        viewport.classList.remove('mirror-mode');
      }
    }

    if (typeof Html5Qrcode === 'undefined') {
      this.promptManualEntry('QRスキャナーライブラリが読み込めませんでした。\nスタッフ端末のIDを手入力してください:');
      return;
    }

    // 【最重要】モーダルのDOMレンダリング（幅・高さ確定）を確実に待機
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 120);
      });
    });

    await this.initAndStartCamera();
  },

  async initAndStartCamera() {
    try {
      if (this.html5QrCode) {
        try {
          if (this.html5QrCode.isScanning) await this.html5QrCode.stop();
          await this.html5QrCode.clear();
        } catch (e) {}
        this.html5QrCode = null;
      }

      this.html5QrCode = new Html5Qrcode(this.targetContainerId, {
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        },
        verbose: false
      });

      const qrConfig = {
        fps: 20,
        qrbox: { width: 200, height: 200 },
        aspectRatio: 1.0,
        disableFlip: false
      };

      this.isScanning = true;

      // 第1試行: facingMode で起動
      try {
        await this.html5QrCode.start(
          { facingMode: this.currentFacingMode },
          qrConfig,
          (decodedText) => this.handleDecodedText(decodedText),
          () => {}
        );
        return;
      } catch (err1) {
        console.warn('[CameraScanner] 第1試行(facingMode)失敗、deviceId取得を試行:', err1);
      }

      // 第2試行: デバイス一覧からカメラIDを特定して起動
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          let selectedDevice = devices[0];
          if (this.currentFacingMode === 'user') {
            const front = devices.find(d => /front|user|facetime/i.test(d.label));
            if (front) selectedDevice = front;
          } else {
            const back = devices.find(d => /back|rear|environment/i.test(d.label));
            if (back) selectedDevice = back;
          }

          await this.html5QrCode.start(
            selectedDevice.id,
            qrConfig,
            (decodedText) => this.handleDecodedText(decodedText),
            () => {}
          );
          return;
        }
      } catch (err2) {
        console.warn('[CameraScanner] 第2試行(deviceId)失敗、制約解除を試行:', err2);
      }

      // 第3試行: 最低限の制約で起動
      await this.html5QrCode.start(
        { video: true },
        { fps: 15, aspectRatio: 1.0 },
        (decodedText) => this.handleDecodedText(decodedText),
        () => {}
      );
    } catch (finalError) {
      console.error('[CameraScanner] 全カメラ起動試行失敗:', finalError);
      this.promptManualEntry('カメラの起動に失敗しました（権限またはデバイス制限）。\nスタッフ端末のID（例: DEV-01）を入力してください:');
    }
  },

  handleDecodedText(decodedText) {
    if (!this.isScanning) return;
    this.isScanning = false;

    this.playSuccessBeep();
    const parsedData = this.parseDecodedPayload(decodedText);

    const cb = this.activeCallback;
    this.activeCallback = null;
    this.closeModalOnly();

    setTimeout(() => {
      this.stop();
    }, 50);

    if (typeof cb === 'function') {
      try {
        cb(parsedData);
      } catch (err) {
        console.error('[CameraScanner] コールバックエラー:', err);
      }
    }
  },

  parseDecodedPayload(raw) {
    if (!raw) return { device_id: 'DEV-01', group_name: '新規グループ', difficulty: 'normal', is_ex_entry: false };

    let text = String(raw).trim();

    // 1. Base64 パック (PROJAI:...)
    if (text.startsWith('PROJAI:')) {
      try {
        const b64 = text.replace('PROJAI:', '');
        const json = decodeURIComponent(atob(b64));
        const obj = JSON.parse(json);
        const diff = this.normalizeDifficulty(obj.diff || obj.difficulty);
        return {
          device_id: String(obj.gid || obj.device_id || 'DEV-01').trim(),
          group_name: String(obj.group_name || obj.gid || 'グループ').trim(),
          staff_name: String(obj.staff_name || 'スタッフ').trim(),
          difficulty: diff,
          is_ex_entry: !!obj.ex || diff === 'ex'
        };
      } catch (e) {}
    }

    // 2. 直接JSON文字列
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj === 'object') {
        const diff = this.normalizeDifficulty(obj.difficulty || obj.diff);
        return {
          device_id: String(obj.device_id || obj.deviceId || obj.id || 'DEV-01').trim(),
          group_name: String(obj.group_name || obj.groupName || '新規グループ').trim(),
          staff_name: String(obj.staff_name || obj.staffName || 'スタッフ').trim(),
          difficulty: diff,
          is_ex_entry: obj.is_ex_entry === true || diff === 'ex'
        };
      }
    } catch (e) {}

    // 3. URLエンコード後JSON文字列
    try {
      const decoded = decodeURIComponent(text);
      const obj = JSON.parse(decoded);
      if (obj && typeof obj === 'object') {
        const diff = this.normalizeDifficulty(obj.difficulty || obj.diff);
        return {
          device_id: String(obj.device_id || obj.deviceId || 'DEV-01').trim(),
          group_name: String(obj.group_name || '新規グループ').trim(),
          staff_name: String(obj.staff_name || 'スタッフ').trim(),
          difficulty: diff,
          is_ex_entry: obj.is_ex_entry === true || diff === 'ex'
        };
      }
    } catch (e) {}

    // 4. DEV-XX マッチフォールバック
    const devMatch = text.match(/(DEV-\d+)/i);
    if (devMatch) {
      return {
        device_id: devMatch[1].toUpperCase(),
        group_name: '救済グループ (' + devMatch[1].toUpperCase() + ')',
        staff_name: 'スタッフ',
        difficulty: 'normal',
        is_ex_entry: false
      };
    }

    return {
      device_id: 'DEV-01',
      group_name: text.substring(0, 16),
      staff_name: 'スタッフ',
      difficulty: 'normal',
      is_ex_entry: false
    };
  },

  promptManualEntry(message) {
    const input = prompt(message || 'スタッフ端末IDを入力してください (例: DEV-01):', 'DEV-01');
    if (input) {
      const devId = input.trim().toUpperCase();
      const cb = this.activeCallback;
      this.close();
      if (typeof cb === 'function') {
        cb({
          device_id: devId.startsWith('DEV-') ? devId : `DEV-${devId}`,
          group_name: '手動入力グループ',
          staff_name: 'スタッフ',
          difficulty: 'normal',
          is_ex_entry: false
        });
      }
    } else {
      this.close();
    }
  },

  async toggleCameraFacing() {
    this.currentFacingMode = (this.currentFacingMode === 'user') ? 'environment' : 'user';
    const cb = this.activeCallback;
    await this.stop();
    await this.start(cb);
  },

  async stop() {
    this.isScanning = false;
    if (this.html5QrCode) {
      try {
        if (this.html5QrCode.isScanning) await this.html5QrCode.stop();
        await this.html5QrCode.clear();
      } catch (e) {}
      this.html5QrCode = null;
    }
  },

  close() {
    this.isScanning = false;
    this.closeModalOnly();
    this.stop();
  },

  closeModalOnly() {
    const modal = document.getElementById('camera-scan-modal');
    if (modal) modal.classList.add('hidden');
    this.activeCallback = null;
  },

  playSuccessBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch (e) {}
  }
};
