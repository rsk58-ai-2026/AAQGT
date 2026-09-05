/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/camera.js - インカメラQRスキャナー共通制御マネージャー (安全フォールバック付き)
 */

const CameraScanner = {
  html5QrCode: null,
  currentFacingMode: 'user',
  activeCallback: null,
  isScanning: false,

  async start(onScanSuccess) {
    this.activeCallback = onScanSuccess;
    const modal = document.getElementById('camera-scan-modal');
    if (modal) modal.classList.remove('hidden');

    const viewport = document.getElementById('camera-reader-viewport');
    if (viewport) viewport.innerHTML = '';

    // html5-qrcode ライブラリが存在しない場合の即時手動フォールバック
    if (typeof Html5Qrcode === 'undefined') {
      this.promptManualEntry('QRスキャナーライブラリが読み込めませんでした。\nスタッフ端末のIDを手入力してください:');
      return;
    }

    try {
      if (this.html5QrCode) {
        try {
          if (this.html5QrCode.isScanning) await this.html5QrCode.stop();
          await this.html5QrCode.clear();
        } catch (e) {}
        this.html5QrCode = null;
      }

      this.html5QrCode = new Html5Qrcode('camera-reader-viewport');

      const config = {
        fps: 15,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const edge = Math.max(160, Math.floor(minEdge * 0.75));
          return { width: edge, height: edge };
        },
        aspectRatio: 1.0
      };

      const cameraConfig = { facingMode: this.currentFacingMode };

      this.isScanning = true;
      await this.html5QrCode.start(
        cameraConfig,
        config,
        (decodedText) => {
          this.handleDecodedText(decodedText);
        },
        () => {}
      );
    } catch (error) {
      console.warn('[CameraScanner] カメラ自動起動失敗:', error);
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
    if (!raw) return { device_id: 'DEV-01', group_name: '新規グループ', difficulty: 'normal' };

    let text = String(raw).trim();

    // Base64 パック
    if (text.startsWith('PROJAI:')) {
      try {
        const b64 = text.replace('PROJAI:', '');
        const json = decodeURIComponent(atob(b64));
        const obj = JSON.parse(json);
        return {
          device_id: obj.gid || obj.device_id || 'DEV-01',
          group_name: obj.group_name || obj.gid || 'グループ',
          staff_name: obj.staff_name || 'スタッフ',
          difficulty: obj.diff || obj.difficulty || 'normal',
          is_ex_entry: !!obj.ex || obj.difficulty === 'ex'
        };
      } catch (e) {}
    }

    // JSON
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj === 'object') {
        return {
          device_id: obj.device_id || obj.deviceId || obj.id || 'DEV-01',
          group_name: obj.group_name || obj.groupName || '新規グループ',
          staff_name: obj.staff_name || obj.staffName || 'スタッフ',
          difficulty: String(obj.difficulty || 'normal').toLowerCase(),
          is_ex_entry: obj.is_ex_entry === true || obj.difficulty === 'ex'
        };
      }
    } catch (e) {}

    // URLデコード後JSON
    try {
      const decoded = decodeURIComponent(text);
      const obj = JSON.parse(decoded);
      if (obj && typeof obj === 'object') {
        return {
          device_id: obj.device_id || obj.deviceId || 'DEV-01',
          group_name: obj.group_name || '新規グループ',
          staff_name: obj.staff_name || 'スタッフ',
          difficulty: String(obj.difficulty || 'normal').toLowerCase(),
          is_ex_entry: obj.is_ex_entry === true || obj.difficulty === 'ex'
        };
      }
    } catch (e) {}

    // DEV-XX マッチ
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
