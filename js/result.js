/**
 * result.js - 出口／リザルト端末
 */
const ResultApp = {
  pollingTimer: null,
  currentGroupId: null,
  isLowBattery: false,
  EX_SECRET_KEYWORD: 'フェニックス',

  async init() {
    const role = AppStorage.getRole();
    if (role !== CONFIG.ROLES.EXIT) return;

    document.getElementById('result-screen').classList.remove('hidden');
    this.setupExitListeners();

    try {
      await API.updateRoomStatus('exit', 'ready');
    } catch (e) {
      console.warn('初期接続通知失敗:', e);
    }

    this.startPolling();
  },

  setupExitListeners() {
    const notifyExit = () => {
      const payload = JSON.stringify({ action: 'updateRoomStatus', roomKey: 'exit', status: 'unknown' });
      if (navigator.sendBeacon) navigator.sendBeacon(CONFIG.GAS_API_URL, payload);
    };

    window.addEventListener('pagehide', notifyExit);
    window.addEventListener('beforeunload', notifyExit);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        notifyExit();
      } else if (document.visibilityState === 'visible') {
        API.updateRoomStatus('exit', this.currentGroupId ? 'playing' : 'ready');
      }
    });
  },

  async toggleBatteryAlert() {
    this.isLowBattery = !this.isLowBattery;
    const btn = document.getElementById('btn-battery-result');
    btn.classList.toggle('active', this.isLowBattery);
    btn.innerHTML = this.isLowBattery 
      ? '<span class="material-symbols-outlined icon-sm">battery_alert</span> 充電低下 報告中' 
      : '<span class="material-symbols-outlined icon-sm">battery_alert</span> 充電低下';
    await API.reportLowBattery('exit', this.isLowBattery);
  },

  startPolling() {
    this.checkStatus();
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = setInterval(() => this.checkStatus(), CONFIG.POLLING_INTERVAL_MS);
  },

  async checkStatus() {
    try {
      const res = await API.getStatus();
      if (!res || !res.success) return;

      // 入口機（マスター）死活監視ロック
      const lockOverlay = document.getElementById('master-lock-overlay');
      if (!res.adminAlive) {
        lockOverlay.classList.remove('hidden');
        return;
      } else {
        lockOverlay.classList.add('hidden');
      }

      const exitStatus = res.statuses['exit'];
      if (!exitStatus) return;

      const newGroupId = exitStatus.groupId;
      if (newGroupId && newGroupId !== this.currentGroupId) {
        this.currentGroupId = newGroupId;
        await this.loadAndShowResult(newGroupId);
      } else if (!newGroupId && this.currentGroupId) {
        this.currentGroupId = null;
        this.showWaitingView();
      }
    } catch (e) {
      console.error('Result polling error:', e);
    }
  },

  async loadAndShowResult(groupId) {
    this.showLoadingView(groupId);

    try {
      await API.updateRoomStatus('exit', 'playing');
      const res = await API.getGroupResult(groupId);
      if (res && res.success) {
        this.renderResult(res.result);
      } else {
        this.showWaitingView();
      }
    } catch (e) {
      this.showWaitingView();
    }
  },

  renderResult(data) {
    document.getElementById('result-group-id').textContent = data.groupId;
    
    const exBanner = document.getElementById('result-ex-banner');
    const normalBanner = document.getElementById('result-normal-banner');

    if (data.exQualified) {
      exBanner.classList.remove('hidden');
      normalBanner.classList.add('hidden');
      document.getElementById('ex-secret-word').textContent = this.EX_SECRET_KEYWORD;
    } else {
      exBanner.classList.add('hidden');
      normalBanner.classList.remove('hidden');
    }

    const questions = [
      { key: 'q1', num: 1, info: data.q1 },
      { key: 'q2', num: 2, info: data.q2 },
      { key: 'q3', num: 3, info: data.q3 }
    ];

    const container = document.getElementById('result-cards-container');
    container.innerHTML = '';

    questions.forEach(q => {
      const card = document.createElement('div');
      const isCorrect = q.info.isCorrect;
      card.className = `result-question-card ${isCorrect ? 'is-correct' : 'is-wrong'}`;

      card.innerHTML = `
        <div class="result-card-header">
          <span class="result-q-title">第${q.num}問 (${q.info.difficulty.toUpperCase()})</span>
          <span class="result-judge-badge ${isCorrect ? 'badge-correct' : 'badge-wrong'}">
            <span class="material-symbols-outlined icon-xs">${isCorrect ? 'check_circle' : 'cancel'}</span>
            ${isCorrect ? '正解' : '不正解'}
          </span>
        </div>
        <div class="result-card-body">
          <p class="result-q-answer">解答: <span class="text-highlight">${q.info.answer || '--'}</span></p>
          ${q.info.explanation ? `<p class="result-q-exp">${q.info.explanation}</p>` : ''}
          <div class="result-q-time">残り時間: ${q.info.timeLeft || 0}秒</div>
        </div>
      `;
      container.appendChild(card);
    });

    this.showContentVIew();
  },

  async finishAndReady() {
    const btn = document.getElementById('btn-finish-result');
    btn.disabled = true;

    try {
      const res = await API.updateRoomStatus('exit', 'ready');
      if (res && res.success) {
        this.showWaitingView();
      }
    } catch (e) {
      alert('通信エラー');
    } finally {
      btn.disabled = false;
    }
  },

  showWaitingView() {
    document.getElementById('result-view-waiting').classList.remove('hidden');
    document.getElementById('result-view-loading').classList.add('hidden');
    document.getElementById('result-view-content').classList.add('hidden');
  },

  showLoadingView(groupId) {
    document.getElementById('result-view-waiting').classList.add('hidden');
    document.getElementById('result-view-loading').classList.remove('hidden');
    document.getElementById('result-view-content').classList.add('hidden');
  },

  showContentVIew() {
    document.getElementById('result-view-waiting').classList.add('hidden');
    document.getElementById('result-view-loading').classList.add('hidden');
    document.getElementById('result-view-content').classList.remove('hidden');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  ResultApp.init();
});