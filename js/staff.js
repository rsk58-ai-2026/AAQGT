/**
   * 3段階フォールバック付きQRコード生成 (日本語UTF-8完全対応)
   */
  generateQRCode() {
    const container = document.getElementById('staff-qrcode-container');
    if (!container) return;

    container.innerHTML = `
      <div class="qr-loading-placeholder">
        <span class="material-symbols-outlined" style="font-size:32px; animation:spin 1s infinite linear;">sync</span>
        <span>QR生成中...</span>
      </div>
    `;

    const payload = {
      device_id: this.deviceId,
      staff_name: this.currentStaffName,
      group_name: this.currentGroupName,
      difficulty: this.selectedDifficulty,
      is_ex_entry: this.selectedDifficulty === 'ex',
      ts: Date.now()
    };

    // 日本語（UTF-8）を安全にエンコードしたJSON文字列
    const rawJson = JSON.stringify(payload);
    // QRCode.js用のUTF-8バイトエスケープ
    const utf8String = unescape(encodeURIComponent(rawJson));

    // ==========================================
    // 第1段階: ローカル QRCode.js
    // ==========================================
    if (typeof QRCode === 'function') {
      try {
        container.innerHTML = '';
        this.qrCodeInstance = new QRCode(container, {
          text: utf8String,
          width: 220,
          height: 220,
          colorDark: '#050813',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });

        setTimeout(() => {
          const hasGraphic = container.querySelector('canvas') || container.querySelector('img');
          if (!hasGraphic) {
            this.generateQRCodeFallbackAPI(container, rawJson, payload);
          }
        }, 120);
        return;
      } catch (err) {
        console.warn('[StaffApp] 第1段階(QRCode.js)失敗:', err);
      }
    }

    // ==========================================
    // 第2段階: Web API
    // ==========================================
    this.generateQRCodeFallbackAPI(container, rawJson, payload);
  },

  generateQRCodeFallbackAPI(container, rawJson, payload) {
    container.innerHTML = `
      <div class="qr-loading-placeholder">
        <span class="material-symbols-outlined" style="font-size:32px; animation:spin 1s infinite linear;">sync</span>
        <span>予備回線でQR生成中...</span>
      </div>
    `;

    const encodedData = encodeURIComponent(rawJson);
    const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodedData}&margin=2`;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.alt = 'スタッフ認証QRコード';
    img.style.width = '220px';
    img.style.height = '220px';
    img.style.display = 'block';

    img.onload = () => {
      container.innerHTML = '';
      container.appendChild(img);
    };

    img.onerror = () => {
      this.renderEmergencyFallbackText(container, payload);
    };

    img.src = apiUrl;
  },
