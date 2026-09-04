/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/staff.js - 付き添いスタッフスマホ専用UI制御
 */

const StaffApp = {
  deviceId: '',
  currentStaffName: '',
  currentGroupName: '',
  selectedDifficulty: 'normal',
  cachedQuestions: [],
  isCheatsVisible: false,

  init() {
    const role = AppStorage.getRole();
    if (role !== 'staff') return;

    const screen = document.getElementById('staff-screen');
    if (screen) screen.classList.remove('hidden');

    // 1. 端末IDの取得または新規発行・永続化
    this.initDeviceId();

    // 2. 既存の進行中グループがあれば復元、なければ設定入力画面
    const savedGroup = AppStorage.getStaffActiveGroup();
    if (savedGroup && savedGroup.deviceId === this.deviceId) {
      this.currentStaffName = savedGroup.staffName;
      this.currentGroupName = savedGroup.groupName;
      this.selectedDifficulty = savedGroup.difficulty;
      this.renderActiveView();
    } else {
      this.renderSetupView();
    }

    // 3. チートシート用問題マスタのロード
    this.loadQuestionsMaster();
  },

  /**
   * 端末IDの管理 (DEV-XX形式)
   */
  initDeviceId() {
    let devId = localStorage.getItem('PROJAI_STAFF_DEVICE_ID');
    if (!devId) {
      const randNum = Math.floor(10 + Math.random() * 90);
      devId = `DEV-${randNum}`;
      localStorage.setItem('PROJAI_STAFF_DEVICE_ID', devId);
    }
    this.deviceId = devId;

    const headerDevId = document.getElementById('staff-header-dev-id');
    if (headerDevId) headerDevId.textContent = devId;

    const inputDevId = document.getElementById('staff-input-dev-id');
    if (inputDevId) inputDevId.value = devId;
  },

  /**
   * 難易度チップ選択
   */
  selectDiff(diff, btnElem) {
    this.selectedDifficulty = diff;
    document.querySelectorAll('.staff-diff-selector .btn-diff-chip').forEach(b => b.classList.remove('active'));
    if (btnElem) btnElem.classList.add('active');
  },

  /**
   * 設定フォーム送信 -> QRコード発行
   */
  generateAndStart(event) {
    if (event) event.preventDefault();

    const staffInput = document.getElementById('staff-input-staff-name');
    const groupInput = document.getElementById('staff-input-group-name');

    this.currentStaffName = staffInput ? staffInput.value.trim() : 'スタッフ';
    this.currentGroupName = groupInput ? groupInput.value.trim() : 'グループ';

    if (!this.currentGroupName) {
      alert('グループ名を入力してください');
      return;
    }

    // ローカルストレージに保存
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
   */
  renderActiveView() {
    const setupView = document.getElementById('staff-view-setup');
    const activeView = document.getElementById('staff-view-active');
    if (setupView) setupView.classList.add('hidden');
    if (activeView) activeView.classList.remove('hidden');

    document.getElementById('staff-active-dev-badge').textContent = this.deviceId;
    document.getElementById('staff-active-diff-badge').textContent = this.selectedDifficulty.toUpperCase();
    document.getElementById('staff-active-group-name').textContent = this.currentGroupName;
    document.getElementById('staff-active-staff-name').textContent = `担当スタッフ: ${this.currentStaffName}`;

    // QRコード生成
    this.generateQRCode();
  },

  /**
   * QRCode.js によるCanvas描画
   */
  generateQRCode() {
    const container = document.getElementById('staff-qrcode-container');
    if (!container) return;
    container.innerHTML = '';

    const payload = {
      device_id: this.deviceId,
      staff_name: this.currentStaffName,
      group_name: this.currentGroupName,
      difficulty: this.selectedDifficulty,
      is_ex_entry: this.selectedDifficulty === 'ex',
      ts: Date.now()
    };

    new QRCode(container, {
      text: JSON.stringify(payload),
      width: 220,
      height: 220,
      colorDark: '#050813',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
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
      const res = await API.getQuestions();
      if (res && res.success && Array.isArray(res.questions)) {
        this.cachedQuestions = res.questions;
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
            <span class="badge badge-secondary font-mono">${q.id}</span>
            <span class="font-cyber font-bold text-highlight">[${String(q.difficulty).toUpperCase()}]</span>
          </div>
          <p class="cheat-qtext">${q.question_text}</p>
          <div class="cheat-ans-box">
            <span class="cheat-label">正解:</span>
            <strong class="text-success font-mono font-bold">${q.answer}</strong>
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