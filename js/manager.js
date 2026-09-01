/**
 * manager.js - 管理者機 (バックヤード統括)
 */
const ManagerApp = {
  pollingTimer: null,
  isPaused: false,

  init() {
    const role = AppStorage.getRole();
    if (role !== CONFIG.ROLES.MANAGER) return;

    document.getElementById('manager-screen').classList.remove('hidden');
    this.startPolling();
  },

  startPolling() {
    this.fetchStatus();
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = setInterval(() => {
      this.fetchStatus();
    }, CONFIG.POLLING_INTERVAL_MS);
  },

  async fetchStatus() {
    const syncDot = document.getElementById('manager-sync-dot');
    const syncText = document.getElementById('manager-sync-text');

    try {
      syncDot.className = 'sync-dot syncing';
      const res = await API.getStatus();

      if (res && res.success) {
        syncDot.className = 'sync-dot';
        syncText.textContent = new Date().toLocaleTimeString();

        this.isPaused = res.systemPaused;
        this.updatePauseUI(res.systemPaused);

        // 制限時間の初回セット（フォーカスしていない場合のみ反映）
        const timeInput = document.getElementById('manager-time-limit-input');
        if (document.activeElement !== timeInput && res.globalTimeLimit) {
          timeInput.value = res.globalTimeLimit;
        }

        this.renderBooths(res.statuses);
      }
    } catch (error) {
      syncDot.className = 'sync-dot error';
    }
  },

  updatePauseUI(isPaused) {
    const pauseBtn = document.getElementById('btn-emergency-pause');
    const banner = document.getElementById('manager-paused-banner');

    if (isPaused) {
      pauseBtn.className = 'btn btn-success btn-sm';
      pauseBtn.innerHTML = '<span class="material-symbols-outlined icon-sm">play_circle</span> 一時停止を解除（再開）';
      banner.classList.remove('hidden');
    } else {
      pauseBtn.className = 'btn btn-danger btn-sm';
      pauseBtn.innerHTML = '<span class="material-symbols-outlined icon-sm">pause_circle</span> 緊急一時停止';
      banner.classList.add('hidden');
    }
  },

  async togglePause() {
    const nextState = !this.isPaused;
    const actionName = nextState ? '【緊急一時停止】を発動' : '一時停止を【解除（再開）】';

    if (!confirm(`全ブースの ${actionName} しますか？`)) return;

    try {
      const res = await API.toggleEmergencyPause(nextState);
      if (res && res.success) {
        this.isPaused = nextState;
        this.updatePauseUI(nextState);
      }
    } catch (e) {
      alert('通信エラーが発生しました');
    }
  },

  async saveTimeLimit() {
    const input = document.getElementById('manager-time-limit-input');
    const timeLimit = parseInt(input.value, 10);

    if (!timeLimit || timeLimit < 10) {
      alert('制限時間は10秒以上を指定してください');
      return;
    }

    try {
      const res = await API.setGlobalTimeLimit(timeLimit);
      if (res && res.success) {
        alert(`全体制限時間を [ ${timeLimit}秒 ] に更新しました。\n次回の進行・出題から適用されます。`);
      }
    } catch (e) {
      alert('保存に失敗しました');
    }
  },

  async resetAllSystem() {
    const pass = prompt('🚨 システムを初期化しますか？\n全ブースのグループ割当とパイプラインが初期状態に戻ります。\n実行する場合は「RESET」と入力してください:');
    if (pass !== 'RESET') {
      if (pass !== null) alert('キャンセルされました');
      return;
    }

    try {
      const res = await API.resetAllStatus();
      if (res && res.success) {
        alert('システムを初期化しました');
        await this.fetchStatus();
      }
    } catch (e) {
      alert('リセット処理に失敗しました');
    }
  },

  renderBooths(statuses) {
    const container = document.getElementById('manager-booth-grid');
    container.innerHTML = '';

    const rooms = [
      { key: 'room1', title: '第1問 ブース' },
      { key: 'room2', title: '第2問 ブース' },
      { key: 'room3', title: '第3問 ブース' },
      { key: 'exit',  title: '出口 / リザルト' }
    ];

    rooms.forEach(r => {
      const b = statuses[r.key] || {
        status: 'unknown',
        groupId: '',
        difficulty: 'normal',
        currentQuestionId: '',
        currentQuestionText: '',
        currentAnswer: '',
        timeLeft: 0,
        lastJudge: null,
        lowBattery: false
      };

      const card = document.createElement('div');
      card.className = `manager-detail-card ${b.status === 'playing' ? 'is-playing' : ''}`;

      const statusBadgeClass = b.status === 'ready' ? 'badge-correct' : (b.status === 'playing' ? 'badge-warning' : 'badge-secondary');
      const statusText = b.status === 'ready' ? '待機中' : (b.status === 'playing' ? '進行中' : '未接続');

      card.innerHTML = `
        <div class="manager-card-head">
          <div>
            <strong class="manager-booth-name">${r.title}</strong>
            <span class="group-pill-sm">${b.groupId ? (b.isEx ? '[EX] ' : '') + b.groupId : '空室'}</span>
          </div>
          <div class="manager-head-badges">
            ${b.lowBattery ? '<span class="battery-alert"><span class="material-symbols-outlined icon-xs">battery_alert</span>充電少</span>' : ''}
            <span class="result-judge-badge ${statusBadgeClass}">${statusText}</span>
          </div>
        </div>

        <div class="manager-card-body">
          <div class="manager-stat-row">
            <span class="stat-label">選択難易度:</span>
            <span class="stat-value font-bold">${b.difficulty.toUpperCase()}</span>
          </div>

          ${r.key !== 'exit' ? `
            <div class="manager-stat-row">
              <span class="stat-label">出題中QID:</span>
              <span class="stat-value font-mono">${b.currentQuestionId || '--'}</span>
            </div>
            <div class="manager-stat-row question-snippet">
              <span class="stat-label">問題文:</span>
              <span class="stat-value snippet-text">${b.currentQuestionText || '（出題待機）'}</span>
            </div>
            <div class="manager-stat-row">
              <span class="stat-label">正解:</span>
              <span class="stat-value text-highlight font-bold">${b.currentAnswer || '--'}</span>
            </div>
            <div class="manager-stat-row">
              <span class="stat-label">残り時間:</span>
              <span class="stat-value timer-val font-mono">${b.timeLeft} 秒</span>
            </div>
          ` : `
            <div class="manager-stat-row">
              <span class="stat-label">リザルト状態:</span>
              <span class="stat-value">${b.status === 'playing' ? '案内中' : '待機中'}</span>
            </div>
          `}

          <div class="manager-stat-row">
            <span class="stat-label">直前判定:</span>
            <span class="stat-value">
              ${b.lastJudge === true ? '<span class="text-success font-bold">⭕ 正解</span>' : (b.lastJudge === false ? '<span class="text-danger font-bold">❌ 不正解</span>' : '--')}
            </span>
          </div>
        </div>
      `;

      container.appendChild(card);
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  ManagerApp.init();
});