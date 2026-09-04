/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/staff.js - 付き添いスタッフスマホ専用UI制御 (QR描画最適化・チートシート完全対応)
 */

const StaffApp = {
  deviceId: '',
  currentStaffName: '',
  currentGroupName: '',
  selectedDifficulty: 'normal',
  cachedQuestions: [],
  isCheatsVisible: false,
  qrCodeInstance: null,

  init() {
    const role = AppStorage.getRole();
    if (role !== CONFIG.ROLES.STAFF) return;

    const screen = document.getElementById('staff-screen');
    if (screen) screen.classList.remove('hidden');

    // 1. 端末固有ID (DEV-XX) の初期化
    this.initDeviceId();

    // 2. 保存済みアクティブグループがあれば即座にQR画面へ、なければ初期設定入力へ
    const savedGroup = AppStorage.getStaffActiveGroup();
    if (savedGroup && savedGroup.deviceId === this.deviceId) {
      this.currentStaffName = savedGroup.staffName || 'スタッフ';
      this.currentGroupName = savedGroup.groupName || 'グループ';
      this.selectedDifficulty = savedGroup.difficulty || 'normal';
      this.renderActiveView();
    } else {
      this.renderSetupView();
    }

    // 3. チートシート用問題マスタのバックグラウンドロード
    this.loadQuestionsMaster();
  },

  /**
   * 端末IDの管理 (DEV-XX形式)
   */
  initDeviceId() {
    this.deviceId = AppStorage.getStaffDeviceId();

    const headerDevId = document.getElementById('staff-header-dev-id');
    if (headerDevId) headerDevId.textContent = `DEV: ${this.deviceId}`;

    const inputDevId = document.getElementById('staff-input-dev-id');
    if (inputDevId) inputDevId.value = this.deviceId;
  },

  /**
   * 難易度チップ選択
   * @param {string} diff
   * @param {HTMLElement} btnElem
   */
  selectDiff(diff, btnElem) {
    this.selectedDifficulty = diff;
    const chips = document.querySelectorAll('.staff-diff-selector .btn-diff-chip');
    chips.forEach(b => b.classList.remove('active'));
    if (btnElem) btnElem.classList.add('active');
  },

  /**
   * 設定フォーム送信 -> QRコード発行
   * @param {Event} [event]
   */
  generateAndStart(event) {
    if (event) event.preventDefault();

    const staffInput = document.getElementById('staff-input-staff-name');
    const groupInput = document.getElementById('staff-input-group-name');

    this.currentStaffName = staffInput ? staffInput.value.trim() : 'スタッフ';
    this.currentGroupName = groupInput ? groupInput.value.trim() : '';

    if (!this.currentGroupName) {
      alert('グループ名を入力してください');
      return;
    }

    // ストレージに保存
    AppStorage.saveStaffActiveGroup({
      deviceId: this.deviceId,
      staffName: this.currentStaffName,
      groupName: this.currentGroupName,
      difficulty: this.selectedDifficulty,
      isExEntry: this.selectedDifficulty === 'ex'
    });

    this.renderActiveView();
  },

  /**
   * 進行・QR提示画面の描画
   * ※DOMの可視化とサイズ確定を待ってからQRコードを安全に生成
   */
  renderActiveView() {
    const setupView = document.getElementById('staff-view-setup');
    const activeView = document.getElementById('staff-view-active');

    // 1. 画面の切り替え（hidden解除）
    if (setupView) setupView.classList.add('hidden');
    if (activeView) activeView.classList.remove('hidden');

    // 2. テキスト情報の反映
    const devBadge = document.getElementById('staff-active-dev-badge');
    const diffBadge = document.getElementById('staff-active-diff-badge');
    const groupNameElem = document.getElementById('staff-active-group-name');
    const staffNameElem = document.getElementById('staff-active-staff-name');

    if (devBadge) devBadge.textContent = this.deviceId;
    if (diffBadge) diffBadge.textContent = this.selectedDifficulty.toUpperCase();
    if (groupNameElem) groupNameElem.textContent = this.currentGroupName;
    if (staffNameElem) staffNameElem.textContent = `担当: ${this.currentStaffName}`;

    // 3. ブラウザの描画パイプライン（Layout & Paint）が完了した後にQR生成
    requestAnimationFrame(() => {
      setTimeout(() => {
        this.generateQRCode();
      }, 50);
    });
  },

  /**
   * QRCode.js による確実な描画
   */
  generateQRCode() {
    const container = document.getElementById('staff-qrcode-container');
    if (!container) return;

    // 既存内容のクリア
    container.innerHTML = '';
    this.qrCodeInstance = null;

    const payload = {
      device_id: this.deviceId,
      staff_name: this.currentStaffName,
      group_name: this.currentGroupName,
      difficulty: this.selectedDifficulty,
      is_ex_entry: this.selectedDifficulty === 'ex',
      ts: Date.now()
    };

    const qrText = JSON.stringify(payload);

    try {
      this.qrCodeInstance = new QRCode(container, {
        text: qrText,
        width: 220,
        height: 220,
        colorDark: '#050813',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } catch (error) {
      console.error('[StaffApp] QR生成エラー:', error);
      // フォールバック: 再試行
      setTimeout(() => {
        if (container) {
          container.innerHTML = '';
          new QRCode(container, {
            text: qrText,
            width: 220,
            height: 220,
            colorDark: '#050813',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
          });
        }
      }, 200);
    }
  },

  /**
   * 設定入力画面へ戻す
   */
  renderSetupView() {
    const setupView = document.getElementById('staff-view-setup');
    const activeView = document.getElementById('staff-view-active');
    if (setupView) setupView.classList.remove('hidden');
    if (activeView) activeView.classList.add('hidden');

    const groupInput = document.getElementById('staff-input-group-name');
    if (groupInput) groupInput.value = '';
  },

  /**
   * 「グループ案内終了」押下時
   */
  finishAndReset() {
    if (confirm('現在のグループ案内を終了し、次のグループ登録画面に戻りますか？')) {
      AppStorage.clearStaffActiveGroup();
      this.renderSetupView();
    }
  },

  /**
   * チートシート問題データの取得 & 描画
   */
  async loadQuestionsMaster() {
    try {
      const cached = AppStorage.getCachedQuestions();
      if (cached && cached.length > 0) {
        this.cachedQuestions = cached;
        this.renderCheatSheet();
      }

      const res = await API.getQuestions();
      if (res && res.success && Array.isArray(res.questions)) {
        this.cachedQuestions = res.questions;
        AppStorage.cacheQuestions(res.questions);
        this.renderCheatSheet();
      }
    } catch (e) {
      console.warn('[StaffApp] チートシート問題取得スキップ:', e);
    }
  },

  renderCheatSheet() {
    const r1Container = document.getElementById('cheat-list-room1');
    const r2Container = document.getElementById('cheat-list-room2');
    const r3Container = document.getElementById('cheat-list-room3');

    if (!r1Container || !r2Container || !r3Container) return;

    const renderList = (roomNum, targetElem) => {
      const qs = this.cachedQuestions.filter(q => String(q.room) === String(roomNum));
      if (qs.length === 0) {
        targetElem.innerHTML = '<div class="text-muted py-1">問題データなし</div>';
        return;
      }

      targetElem.innerHTML = qs.map(q => `
        <div class="cheat-item">
          <div class="cheat-item-head">
            <span class="badge badge-secondary font-mono">${q.id || '--'}</span>
            <span class="font-cyber font-bold text-highlight">[${String(q.difficulty || '').toUpperCase()}]</span>
          </div>
          <p class="cheat-qtext">${q.question_text || ''}</p>
          <div class="cheat-ans-box">
            <span class="cheat-label">正解:</span>
            <strong class="text-success font-mono font-bold">${q.answer || '--'}</strong>
          </div>
          ${q.explanation ? `<div class="cheat-exp"><span class="cheat-label">解説:</span> ${q.explanation}</div>` : ''}
        </div>
      `).join('');
    };

    renderList('1', r1Container);
    renderList('2', r2Container);
    renderList('3', r3Container);
  },

  /**
   * チートシート開閉トグル
   */
  toggleCheatsVisibility() {
    this.isCheatsVisible = !this.isCheatsVisible;
    const body = document.getElementById('cheat-sheet-body');
    const label = document.getElementById('cheat-toggle-label');
    const btn = document.getElementById('btn-toggle-cheats');

    if (body) body.classList.toggle('hidden', !this.isCheatsVisible);
    if (label) label.textContent = this.isCheatsVisible ? '答えを隠す' : '答えを表示';
    if (btn) btn.classList.toggle('btn-warning', this.isCheatsVisible);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  StaffApp.init();
});