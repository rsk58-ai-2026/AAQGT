/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/camera.js - インカメラQRスキャナー共通制御マネージャー (デッドロック解消・超堅牢パース版)
 */

const CameraScanner = {
  html5QrCode: null,
  currentFacingMode: 'user', // 'user' (インカメラ) / 'environment' (背面)
  activeCallback: null,
  isScanning: false,

  /**
   * QRスキャナーを起動
   * @param {Function} onScanSuccess
   */
  async start(onScanSuccess) {
    this.activeCallback = onScanSuccess;
    const modal = document.getElementById('camera-scan-modal');
    if (modal) modal.classList.remove('hidden');

    try {
      // 既存インスタンスの安全な破棄
      if (this.html5QrCode) {
        try {
          if (this.html5QrCode.isScanning) {
            await this.html5QrCode.stop();
          }
          await this.html5QrCode.clear();
        } catch (e) {}
        this.html5QrCode = null;
      }

      this.html5QrCode = new Html5Qrcode('camera-reader-viewport');

      // 端末の画面サイズに応じて動的にスキャン矩形を最適化
      const config = {
        fps: 15,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const edge = Math.max(180, Math.floor(minEdge * 0.72));
          return { width: edge, height: edge };
        },
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
        () => {
          // 未検出フレームは正常スキップ
        }
      );
    } catch (error) {
      console.error('[CameraScanner] カメラ起動エラー:', error);
      alert('カメラの起動に失敗しました。カメラ権限を許可してください。');
      this.close();
    }
  },

  /**
   * 読み取り成功時のハンドリング (デッドロック回避 & 超堅牢パーサー)
   */
  handleDecodedText(decodedText) {
    if (!this.isScanning) return;
    this.isScanning = false; // 二重発火を即座に遮断

    // 1. 成功ビープ音
    this.playSuccessBeep();

    // 2. 超堅牢データパーサー (JSON / Base64 / 日本語エスケープ / プレーンテキスト対応)
    const parsedData = this.parseDecodedPayload(decodedText);

    // 3. 【最重要】カメラ停止とモーダル終了を非同期で安全に逃がす (デッドロック防止)
    const cb = this.activeCallback;
    this.activeCallback = null;

    this.closeModalOnly();

    // カメラ停止は裏で実行（ユーザーの処理をブロックしない）
    setTimeout(() => {
      this.stop();
    }, 50);

    // 4. コールバックを実行
    if (typeof cb === 'function') {
      try {
        cb(parsedData);
      } catch (err) {
        console.error('[CameraScanner] コールバック実行時エラー:', err);
        alert('読み取り後の処理中にエラーが発生しました: ' + err.message);
      }
    }
  },

  /**
   * あらゆる形式のQRコード文字列からグループ情報を復元
   */
  parseDecodedPayload(raw) {
    if (!raw) return { device_id: 'DEV-01', group_name: '新規グループ', difficulty: 'normal' };

    let text = String(raw).trim();

    // パターンA: Base64 パック形式 (PROJAI:〜)
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

    // パターンB: 標準 JSON 形式 (URLデコード処理を挟んでパース)
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

    // パターンC: URLエンコードされた JSON の場合
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

    // パターンD: 単一の DEV-XX 文字列だった場合の救済
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

    // パターンE: その他プレーンテキスト
    return {
      device_id: 'DEV-01',
      group_name: text.substring(0, 16),
      staff_name: 'スタッフ',
      difficulty: 'normal',
      is_ex_entry: false,
      raw: text
    };
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
        if (this.html5QrCode.isScanning) {
          await this.html5QrCode.stop();
        }
        await this.html5QrCode.clear();
      } catch (e) {
      } finally {
        this.html5QrCode = null;
      }
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
