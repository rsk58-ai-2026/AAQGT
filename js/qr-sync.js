/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * qr-sync.js - 完全ローカル・QRコードバトンリレー & 暗号化 / テンキー入力マネージャー (ミラー制御・スキャン最適化版)
 */

const QRSync = {
  html5QrCode: null,
  currentCameraFacing: 'environment', // 'environment' (背面) または 'user' (前面)
  activeScanCallback: null,
  activePasscodeCallback: null,
  currentInputPasscode: '',
  passcodeCacheKey: 'PROJAI_PASSCODE_VAULT',

  // ==========================================
  // 1. データパック / アンパック（シリアライザ）
  // ==========================================

  packData(dataObj) {
    try {
      const payload = {
        v: 1,
        gid: String(dataObj.groupId || '').trim(),
        diff: String(dataObj.difficulty || 'normal').trim().toLowerCase(),
        from: Number(dataObj.fromRoom || 1),
        q1: dataObj.q1 || null,
        q2: dataObj.q2 || null,
        q3: dataObj.q3 || null,
        score: Math.max(0, Number(dataObj.totalScore) || 0),
        miss: Math.max(0, Number(dataObj.totalMisses) || 0),
        ex: !!dataObj.exQualified,
        ts: Date.now()
      };

      const jsonStr = JSON.stringify(payload);
      const encoded = btoa(encodeURIComponent(jsonStr));
      return 'PROJAI:' + encoded;
    } catch (error) {
      console.error('[QRSync] パック失敗:', error);
      return '';
    }
  },

  unpackData(rawString) {
    try {
      if (!rawString || typeof rawString !== 'string') return null;

      let cleanStr = rawString.trim();
      if (cleanStr.startsWith('PROJAI:')) {
        cleanStr = cleanStr.replace('PROJAI:', '');
      }

      const jsonStr = decodeURIComponent(atob(cleanStr));
      const obj = JSON.parse(jsonStr);

      if (!obj || !obj.gid) {
        throw new Error('Invalid payload structure');
      }

      return {
        version: obj.v || 1,
        groupId: String(obj.gid),
        difficulty: String(obj.diff || 'normal').toLowerCase(),
        fromRoom: Number(obj.from || 1),
        q1: obj.q1 || null,
        q2: obj.q2 || null,
        q3: obj.q3 || null,
        totalScore: Number(obj.score) || 0,
        totalMisses: Number(obj.miss) || 0,
        exQualified: !!obj.ex,
        timestamp: obj.ts || Date.now()
      };
    } catch (error) {
      console.error('[QRSync] アンパック失敗:', error);
      return null;
    }
  },

  generatePasscode(dataObj) {
    try {
      let gNum = 1;
      const m = String(dataObj.groupId || '').match(/(\d+)/);
      if (m) gNum = parseInt(m[1], 10);

      const diffMap = { 'easy': 1, 'normal': 2, 'hard': 3, 'ex': 4 };
      const dVal = diffMap[String(dataObj.difficulty).toLowerCase()] || 2;
      const rVal = Number(dataObj.fromRoom) || 1;

      const rawCalc = (gNum * 37 + dVal * 13 + rVal * 7) % 9000 + 1000;
      const passcode = String(rawCalc).padStart(4, '0');

      this.savePasscodeToVault(passcode, dataObj);
      return passcode;
    } catch (e) {
      return '1234';
    }
  },

  resolvePasscode(passcode) {
    if (!passcode || passcode.length !== 4) return null;

    const vaultData = this.getPasscodeFromVault(passcode);
    if (vaultData) return vaultData;

    const codeNum = parseInt(passcode, 10);
    if (isNaN(codeNum)) return null;

    const gNum = Math.max(1, Math.floor((codeNum % 1000) / 10));
    return {
      version: 1,
      groupId: 'G-' + String(gNum).padStart(2, '0'),
      difficulty: 'normal',
      fromRoom: 1,
      q1: null,
      q2: null,
      q3: null,
      totalScore: 20,
      totalMisses: 0,
      exQualified: false,
      timestamp: Date.now()
    };
  },

  savePasscodeToVault(passcode, dataObj) {
    try {
      const raw = localStorage.getItem(this.passcodeCacheKey);
      const vault = raw ? JSON.parse(raw) : {};
      vault[passcode] = dataObj;
      localStorage.setItem(this.passcodeCacheKey, JSON.stringify(vault));
    } catch (e) {}
  },

  getPasscodeFromVault(passcode) {
    try {
      const raw = localStorage.getItem(this.passcodeCacheKey);
      if (!raw) return null;
      const vault = JSON.parse(raw);
      return vault[passcode] || null;
    } catch (e) {
      return null;
    }
  },

  // ==========================================
  // 2. QRコード描画 (QRCode.js 利用)
  // ==========================================

  generateQRCode(elementId, dataObj) {
    const container = document.getElementById(elementId);
    if (!container) return '';

    container.innerHTML = '';

    const packedString = this.packData(dataObj);
    const passcode = this.generatePasscode(dataObj);

    new QRCode(container, {
      text: packedString,
      width: 260,
      height: 260,
      colorDark: '#050813',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });

    return passcode;
  },

  // ==========================================
  // 3. カメラQRスキャナー制御 (Html5Qrcode)
  // ==========================================

  async startScanner(viewportId, onSuccess) {
    this.activeScanCallback = onSuccess;

    const modal = document.getElementById('qr-scan-modal');
    if (modal) modal.classList.remove('hidden');

    const viewportElem = document.getElementById(viewportId);
    if (viewportElem) {
      if (this.currentCameraFacing === 'user') {
        viewportElem.classList.add('mirror-mode');
      } else {
        viewportElem.classList.remove('mirror-mode');
      }
    }

    try {
      if (this.html5QrCode) {
        await this.stopScanner();
      }

      this.html5QrCode = new Html5Qrcode(viewportId, {
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        },
        verbose: false
      });

      const qrConfig = {
        fps: 20,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const edge = Math.max(160, Math.floor(minEdge * 0.75));
          return { width: edge, height: edge };
        },
        aspectRatio: 1.0,
        disableFlip: false
      };

      const cameraConfig = {
        facingMode: this.currentCameraFacing,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      };

      await this.html5QrCode.start(
        cameraConfig,
        qrConfig,
        (decodedText) => {
          this.handleScanSuccess(decodedText);
        },
        () => {}
      );
    } catch (err) {
      console.warn('[QRSync] カメラ起動失敗 (通常起動へ再試行):', err);
      try {
        if (this.html5QrCode) {
          await this.html5QrCode.start(
            { facingMode: this.currentCameraFacing },
            { fps: 15, aspectRatio: 1.0 },
            (decodedText) => this.handleScanSuccess(decodedText),
            () => {}
          );
          return;
        }
      } catch (fallbackErr) {
        console.warn('[QRSync] フォールバック起動失敗:', fallbackErr);
      }

      alert('カメラの起動に失敗しました。カメラへのアクセスを許可するか、「4桁コード手入力」をご利用ください。');
      this.closeScannerModal();
    }
  },

  async handleScanSuccess(decodedText) {
    const data = this.unpackData(decodedText);
    if (!data) {
      console.warn('[QRSync] 無効なQRコード形式です');
      return;
    }

    this.playSuccessSound();
    await this.stopScanner();
    this.closeScannerModal();

    if (typeof this.activeScanCallback === 'function') {
      this.activeScanCallback(data);
    }
  },

  async stopScanner() {
    if (this.html5QrCode) {
      try {
        if (this.html5QrCode.isScanning) {
          await this.html5QrCode.stop();
        }
        await this.html5QrCode.clear();
      } catch (e) {
        console.warn('[QRSync] スキャナー停止時エラー:', e);
      } finally {
        this.html5QrCode = null;
      }
    }
  },

  closeScannerModal() {
    this.stopScanner();
    const modal = document.getElementById('qr-scan-modal');
    if (modal) modal.classList.add('hidden');
  },

  async toggleCamera() {
    this.currentCameraFacing = (this.currentCameraFacing === 'environment') ? 'user' : 'environment';
    const cb = this.activeScanCallback;
    await this.stopScanner();
    await this.startScanner('qr-reader', cb);
  },

  // ==========================================
  // 4. テンキー入力制御
  // ==========================================

  openPasscodeInput(onSuccess) {
    this.activePasscodeCallback = onSuccess;
    this.currentInputPasscode = '';
    this.updateKeypadDisplay();

    const keypadModal = document.getElementById('passcode-input-modal');
    if (keypadModal) keypadModal.classList.remove('hidden');
  },

  closePasscodeInput() {
    this.currentInputPasscode = '';
    const keypadModal = document.getElementById('passcode-input-modal');
    if (keypadModal) keypadModal.classList.add('hidden');
  },

  pushKeypad(numStr) {
    if (this.currentInputPasscode.length < 4) {
      this.currentInputPasscode += String(numStr);
      this.playKeypadBeep();
      this.updateKeypadDisplay();
    }
  },

  clearKeypad() {
    this.currentInputPasscode = '';
    this.playKeypadBeep();
    this.updateKeypadDisplay();
  },

  backspaceKeypad() {
    if (this.currentInputPasscode.length > 0) {
      this.currentInputPasscode = this.currentInputPasscode.slice(0, -1);
      this.playKeypadBeep();
      this.updateKeypadDisplay();
    }
  },

  updateKeypadDisplay() {
    const display = document.getElementById('passcode-display-val');
    if (!display) return;

    if (!this.currentInputPasscode) {
      display.textContent = '----';
      display.classList.remove('has-value');
    } else {
      display.textContent = this.currentInputPasscode.padEnd(4, '-');
      display.classList.add('has-value');
    }
  },

  submitPasscode() {
    if (this.currentInputPasscode.length !== 4) {
      alert('4桁のアクセスキーを入力してください');
      return;
    }

    const data = this.resolvePasscode(this.currentInputPasscode);
    if (!data) {
      alert('入力されたアクセスキーは無効です');
      this.clearKeypad();
      return;
    }

    this.playSuccessSound();
    this.closePasscodeInput();

    if (typeof this.activePasscodeCallback === 'function') {
      this.activePasscodeCallback(data);
    }
  },

  // ==========================================
  // 5. サウンドヘルパー (Web Audio API)
  // ==========================================

  playKeypadBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch (e) {}
  },

  playSuccessSound() {
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

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(2349.32, now + 0.09);
      gain2.gain.setValueAtTime(0.25, now + 0.09);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.09);
      osc2.stop(now + 0.22);
    } catch (e) {}
  }
};

// ==========================================
// グローバルモーダルハンドラー (HTML onclick 互換)
// ==========================================

const QRModal = {
  closeScanner() {
    QRSync.closeScannerModal();
  },
  switchCamera() {
    QRSync.toggleCamera();
  },
  switchToPasscode() {
    const cb = QRSync.activeScanCallback;
    QRSync.closeScannerModal();
    QRSync.openPasscodeInput(cb);
  }
};

const KeypadModal = {
  pushKey(num) {
    QRSync.pushKeypad(num);
  },
  clear() {
    QRSync.clearKeypad();
  },
  backspace() {
    QRSync.backspaceKeypad();
  },
  submit() {
    QRSync.submitPasscode();
  },
  close() {
    QRSync.closePasscodeInput();
  }
};
