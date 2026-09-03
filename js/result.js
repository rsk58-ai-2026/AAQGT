/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * result.js - 出口／リザルト機（独立保留キュー式・負数防止ガード適用）
 */
const ResultApp = {
  pollingTimer: null,
  activeGroupId: null,
  pendingList: [],
  isCongested: false,
  isLowBattery: false,
  EX_SECRET_KEYWORD: 'しらす',

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
        API.updateRoomStatus('exit', this.activeGroupId ? 'playing' : 'ready');
      }
    });
  },

  async toggleCongestionAlert() {
    this.isCongested = !this.isCongested;
    const btn = document.getElementById('btn-exit-congestion');
    if (btn) {
      btn.classList.toggle('btn-danger', this.isCongested);
      btn.classList.toggle('btn-secondary', !this.isCongested);
      btn.innerHTML = this.isCongested
        ? '<span class="material-symbols-outlined icon-sm">warning</span> 出口混雑中 [警報中]'
        : '<span class="material-symbols-outlined icon-sm">group</span> 出口混雑を報告';
    }
    await API.reportExitCongestion(this.isCongested);
  },

  async toggleBatteryAlert() {
    this.isLowBattery = !this.isLowBattery;
    const btn = document.getElementById('btn-battery-result');
    if (btn) {
      btn.classList.toggle('active', this.isLowBattery);
      btn.innerHTML = this.isLowBattery
        ? '<span class="material-symbols-outlined icon-sm">battery_alert</span> 給電要請'
        : '<span class="material-symbols-outlined icon-sm">battery_alert</span> バッテリー';
    }
    await API.reportLowBattery('exit', this.isLowBattery);
  },

  startPolling() {
    this.fetchPendingQueue();
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = setInterval(() => this.fetchPendingQueue(), CONFIG.POLLING_INTERVAL_MS);
  },

  async fetchPendingQueue() {
    try {
      const res = await API.getPendingResults();
      if (res && res.success) {
        this.pendingList = res.pendingResults || [];
        this.renderQueueRack();
      }
    } catch (e) {
      console.error('Pending queue fetch error:', e);
    }
  },

  renderQueueRack() {
    const rack = document.getElementById('pending-queue-rack');
    const badgeCount = document.getElementById('pending-count-badge');
    if (!rack) return;

    if (badgeCount) badgeCount.textContent = `${this.pendingList.length}組`;

    rack.innerHTML = '';
    if (this.pendingList.length === 0) {
      rack.innerHTML = '<div class="queue-empty-msg">到着待ちグループはありません</div>';
      if (!this.activeGroupId) {
        this.showWaitingView();
      }
      return;
    }

    this.pendingList.forEach(item => {
      const card = document.createElement('button');
      card.className = `queue-chip ${this.activeGroupId === item.groupId ? 'active' : ''}`;
      card.innerHTML = `
        <span class="chip-group-id">${item.groupId}</span>
        <span class="chip-score">${item.totalScore}点</span>
        ${item.exQualified ? '<span class="chip-ex-tag">EX</span>' : ''}
      `;
      card.onclick = () => this.selectGroupResult(item.groupId);
      rack.appendChild(card);
    });
  },

  async selectGroupResult(groupId) {
    this.activeGroupId = groupId;
    this.renderQueueRack();
    this.showLoadingView();

    try {
      await API.updateRoomStatus('exit', 'playing');
      const res = await API.getGroupResult(groupId);
      if (res && res.success) {
        this.renderResultDetail(res.result);
      } else {
        alert('成績データの取得に失敗しました');
        this.showWaitingView();
      }
    } catch (e) {
      alert('通信エラーが発生しました');
      this.showWaitingView();
    }
  },

  renderResultDetail(data) {
    document.getElementById('result-group-id').textContent = data.groupId;

    // スコア・統計表示
    const scoreVal = document.getElementById('result-total-score');
    if (scoreVal) scoreVal.textContent = Math.max(0, Math.floor(Number(data.totalScore) || 0));

    const missVal = document.getElementById('result-total-misses');
    if (missVal) missVal.textContent = Math.max(0, Math.floor(Number(data.totalMisses) || 0));

    // パーフェクトボーナス獲得判定 (全問正解)
    const isPerfect = data.q1.isCorrect && data.q2.isCorrect && data.q3.isCorrect;
    const bonusBadge = document.getElementById('result-bonus-badge');
    if (bonusBadge) {
      bonusBadge.classList.toggle('hidden', !isPerfect);
    }

    // EXバナー制御
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

    // 各問題の詳細カード
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

      // 残り時間・誤答数の負数・不正値ガード
      const safeTimeLeft = Math.max(0, Math.floor(Number(q.info.timeLeft) || 0));
      const safeMissCount = Math.max(0, Math.floor(Number(q.info.missCount) || 0));

      card.innerHTML = `
        <div class="result-card-header">
          <span class="result-q-title">第${q.num}問 (${String(q.info.difficulty).toUpperCase()})</span>
          <span class="result-judge-badge ${isCorrect ? 'badge-correct' : 'badge-wrong'}">
            <span class="material-symbols-outlined icon-xs">${isCorrect ? 'check_circle' : 'cancel'}</span>
            ${isCorrect ? '正解 [クリア]' : '不正解 [突破失敗]'}
          </span>
        </div>
        <div class="result-card-body">
          <p class="result-q-answer">模範解答: <span class="text-highlight font-bold">${q.info.answer || '--'}</span></p>
          ${q.info.explanation ? `<p class="result-q-exp">${q.info.explanation}</p>` : ''}
          <div class="result-q-stats-row">
            <span>残り時間: <strong class="font-mono">${safeTimeLeft}秒</strong></span>
            <span>誤答ペナルティ: <strong class="text-warning font-mono">${safeMissCount}回</strong></span>
          </div>
        </div>
      `;
      container.appendChild(card);
    });

    this.showContentView();
  },

  async finishAndDismissCurrentGroup() {
    if (!this.activeGroupId) return;

    const btn = document.getElementById('btn-finish-result');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined icon-md">sync</span> 案内完了処理中...';

    const targetId = this.activeGroupId;

    try {
      const res = await API.finishGroupResult(targetId);
      if (res && res.success) {
        // キューから除外してリセット
        this.pendingList = this.pendingList.filter(item => item.groupId !== targetId);
        this.activeGroupId = null;
        this.renderQueueRack();
        this.showWaitingView();
      } else {
        alert('退室完了処理に失敗しました');
      }
    } catch (e) {
      alert('通信エラーが発生しました');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-outlined icon-md">check</span> 案内完了・退室（キューから除外）';
    }
  },

  showWaitingView() {
    document.getElementById('result-view-waiting').classList.remove('hidden');
    document.getElementById('result-view-loading').classList.add('hidden');
    document.getElementById('result-view-content').classList.add('hidden');
  },

  showLoadingView() {
    document.getElementById('result-view-waiting').classList.add('hidden');
    document.getElementById('result-view-loading').classList.remove('hidden');
    document.getElementById('result-view-content').classList.add('hidden');
  },

  showContentView() {
    document.getElementById('result-view-waiting').classList.add('hidden');
    document.getElementById('result-view-loading').classList.add('hidden');
    document.getElementById('result-view-content').classList.remove('hidden');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  ResultApp.init();
});
