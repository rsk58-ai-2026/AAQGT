/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/staff.js - 付き添いスタッフスマホUI (テンキー認証コード発行)
 */

const StaffApp = {
  deviceId: '',
  shortCode: '01',
  currentStaffName: '',
  currentGroupName: '',
  currentGroupId: 'G--',
  selectedDifficulty: 'normal',
  cachedQuestions: [],
  isCheatsVisible: false,

  init() {
    const role = AppStorage.getRole();
    if (role !== CONFIG.ROLES.STAFF) return;

    const screen = document.getElementById('staff-screen');
    if (screen) screen.classList.remove('hidden');

    this.initDeviceId();

    const savedGroup = AppStorage.getStaffActiveGroup();
    if (savedGroup && savedGroup.deviceId === this.deviceId) {
      this.currentStaffName = savedGroup.staffName || 'スタッフ';
      this.currentGroupName = savedGroup.groupName || 'グループ';
      this.currentGroupId = savedGroup.groupId || 'G-??';
      this.selectedDifficulty = savedGroup.difficulty || 'normal';
      this.renderActiveView();
    } else {
      this.renderSetupView();
    }

    this.loadQuestionsMaster();
  },

  initDeviceId() {
    this.deviceId = AppStorage.getStaffDeviceId();
    const m = this.deviceId.match(/\d+/);
    this.shortCode = m ? m[0] : '01';

    const headerDevId = document.getElementById('staff-header-dev-id');
    if (headerDevId) headerDevId.textContent = `CODE: ${this.shortCode}`;

    const inputDevId = document.getElementById('staff-input-dev-id');
    if (inputDevId) inputDevId.value = this.shortCode;
  },

  selectDiff(diff, btnElem) {
    this.selectedDifficulty = diff;
    const chips = document.querySelectorAll('.staff-diff-selector .btn-diff-chip');
    chips.forEach(b => b.classList.remove('active'));
    if (btnElem) btnElem.classList.add('active');
  },

  async generateAndStart(event) {
    if (event) event.preventDefault();

    const staffInput = document.getElementById('staff-input-staff-name');
    const groupInput = document.getElementById('staff-input-group-name');

    this.currentStaffName = staffInput ? staffInput.value.trim() : 'スタッフ';
    this.currentGroupName = groupInput ? groupInput.value.trim() : '';

    if (!this.currentGroupName) {
      alert('グループ名を入力してください');
      return;
    }

    const btnSubmit = event ? event.target.querySelector('button[type="submit"]') : null;
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = '登録通信中...';
    }

    // スマホから直接GASにグループ登録
    try {
      const res = await API.registerGroup({
        device_id: this.deviceId,
        group_name: this.currentGroupName,
        staff_name: this.currentStaffName,
        difficulty: this.selectedDifficulty,
        is_ex_entry: this.selectedDifficulty === 'ex'
      });

      if (res && res.success) {
        this.currentGroupId = res.groupId || 'G-01';
      }
    } catch (e) {
      console.warn('[StaffApp] 登録通信エラー(ローカルで継続):', e);
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<span class="material-symbols-outlined icon-md">tag</span> 認証コードを発行する';
      }
    }

    AppStorage.saveStaffActiveGroup({
      deviceId: this.deviceId,
      groupId: this.currentGroupId,
      staffName: this.currentStaffName,
      groupName: this.currentGroupName,
      difficulty: this.selectedDifficulty,
      isExEntry: this.selectedDifficulty === 'ex'
    });

    this.renderActiveView();
  },

  renderActiveView() {
    const setupView = document.getElementById('staff-view-setup');
    const activeView = document.getElementById('staff-view-active');

    if (setupView) setupView.classList.add('hidden');
    if (activeView) activeView.classList.remove('hidden');

    const devBadge = document.getElementById('staff-active-dev-badge');
    const diffBadge = document.getElementById('staff-active-diff-badge');
    const groupNameElem = document.getElementById('staff-active-group-name');
    const staffNameElem = document.getElementById('staff-active-staff-name');
    const codeElem = document.getElementById('staff-auth-code-huge');
    const gidElem = document.getElementById('staff-active-gid-huge');

    if (devBadge) devBadge.textContent = this.deviceId;
    if (diffBadge) diffBadge.textContent = this.selectedDifficulty.toUpperCase();
    if (groupNameElem) groupNameElem.textContent = this.currentGroupName;
    if (staffNameElem) staffNameElem.textContent = `担当: ${this.currentStaffName}`;
    if (codeElem) codeElem.textContent = this.shortCode;
    if (gidElem) gidElem.textContent = this.currentGroupId;
  },

  renderSetupView() {
    const setupView = document.getElementById('staff-view-setup');
    const activeView = document.getElementById('staff-view-active');
    if (setupView) setupView.classList.remove('hidden');
    if (activeView) activeView.classList.add('hidden');

    const groupInput = document.getElementById('staff-input-group-name');
    if (groupInput) groupInput.value = '';
  },

  finishAndReset() {
    if (confirm('現在のグループ案内を終了し、次のグループ登録画面に戻りますか？')) {
      AppStorage.clearStaffActiveGroup();
      this.renderSetupView();
    }
  },

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
    } catch (e) {}
  },

  renderCheatSheet() {
    const r1 = document.getElementById('cheat-list-room1');
    const r2 = document.getElementById('cheat-list-room2');
    const r3 = document.getElementById('cheat-list-room3');
    if (!r1 || !r2 || !r3) return;

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
        </div>
      `).join('');
    };

    renderList('1', r1);
    renderList('2', r2);
    renderList('3', r3);
  },

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
