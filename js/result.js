/**
 * result.js - 出口／リザルト端末用ロジック（離脱検知対応版）
 */
const ResultApp = {
  pollingTimer: null,
  currentGroupId: null,
  isExMode: false,
  EX_SECRET_KEYWORD: 'フェニックス',

  async init() {
    const role = AppStorage.getRole();
    if (role !== CONFIG.ROLES.EXIT) {
      return;
    }

    document.getElementById('result-screen').classList.remove('hidden');

    // 離脱イベント登録
    this.setupExitListeners();

    try {
      await API.updateRoomStatus('exit', 'ready');
    } catch (e) {
      console.warn('出口の初期接続通知失敗:', e);
    }

    this.startPolling();
  },

  /**
   * ★画面離脱・タブ閉じ・スリープ時の検知リスナー
   */
  setupExitListeners() {
    const notifyExit = () => {
      const payload = JSON.stringify({
        action: 'updateRoomStatus',
        roomKey: 'exit',
        status: 'unknown'
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(CONFIG.GAS_API_URL, payload);
      }
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

  startPolling() {
    this.checkStatus();
    if (this.pollingTimer) clearInterval(this.pollingTimer);

    this.pollingTimer = setInterval(() => {
      this.checkStatus();
    }, CONFIG.POLLING_INTERVAL_MS);
  },

  async checkStatus() {
    try {
      const res = await API.getStatus();
      if (!res || !res.success) return;

      const exitStatus = res.statuses['exit'];
      if (!exitStatus) return;

      const newGroupId = exitStatus.groupId;
      const isEx = exitStatus.isEx;

      if (newGroupId && newGroupId !== this.currentGroupId) {
        this.currentGroupId = newGroupId;
        this.isExMode = isEx;
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
        alert('成績データの取得に失敗しました: ' + (res.error || '不明なエラー'));
        this.showWaitingView();
      }
    } catch (e) {
      alert('通信エラーが発生しました。');
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

      const diffLabel = {
        easy: 'かんたん',
        normal: 'ふつう',
        hard: 'むずかしい',
        ex: 'EX'
      }[q.info.difficulty] || q.info.difficulty;

      card.innerHTML = `
        <div class="result-card-header">
          <span class="result-q-title">第${q.num}問 (${diffLabel})</span>
          <span class="result-judge-badge ${isCorrect ? 'badge-correct' : 'badge-wrong'}">
            ${isCorrect ? '⭕ 正解' : '❌ 不正解'}
          </span>
        </div>
        <div class="result-card-body">
          <p class="result-q-text"><strong>問題:</strong> ${q.info.questionText || '（記録なし）'}</p>
          <p class="result-q-answer"><strong>模範解答:</strong> <span class="text-highlight">${q.info.answer || '---'}</span></p>
          ${q.info.explanation ? `<p class="result-q-exp"><strong>解説:</strong> ${q.info.explanation}</p>` : ''}
          <div class="result-q-time">残り時間: <strong>${q.info.timeLeft || 0}秒</strong></div>
        </div>
      `;
      container.appendChild(card);
    });

    this.showContentVIew();
  },

  async finishAndReady() {
    if (!confirm('客の案内を完了し、待機状態にしますか？')) return;

    const btn = document.getElementById('btn-finish-result');
    btn.disabled = true;
    btn.textContent = '更新中...';

    try {
      const res = await API.updateRoomStatus('exit', 'ready');
      if (res && res.success) {
        this.showWaitingView();
      } else {
        alert('待機状態への更新に失敗しました。');
      }
    } catch (e) {
      alert('通信エラーが発生しました。');
    } finally {
      btn.disabled = false;
      btn.textContent = '✅ 案内完了（待機状態にする）';
    }
  },

  showWaitingView() {
    document.getElementById('result-view-waiting').classList.remove('hidden');
    document.getElementById('result-view-loading').classList.add('hidden');
    document.getElementById('result-view-content').classList.add('hidden');
  },

  showLoadingView(groupId) {
    document.getElementById('loading-group-text').textContent = `グループ [ ${groupId} ] の成績を集計中...`;
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
