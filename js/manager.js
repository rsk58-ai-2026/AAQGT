/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * manager.js - 管理者機 (バックヤード統括)
 */
const ManagerApp = {
  pollingTimer: null,
  isEmergencyPaused: false,
  isInfoPaused: false,
  currentPaceSignal: 'none',

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

        // 1. 緊急一時停止状態
        this.isEmergencyPaused = res.systemPaused;
        this.updateEmergencyPauseUI(res.systemPaused);

        // 2. 待機・機材調整中（非緊急）停止状態
        this.isInfoPaused = res.infoPaused;
        this.updateInfoPauseUI(res.infoPaused);

        // 3. ペース指示シグナル状態
        this.currentPaceSignal = res.paceSignal || 'none';
        this.updatePaceSignalUI(this.currentPaceSignal);

        // 4. 出口混雑アラート表示
        const exitAlertBox = document.getElementById('manager-exit-congested-box');
        if (exitAlertBox) {
          if (res.isExitCongested) {
            exitAlertBox.classList.remove('hidden');
          } else {
            exitAlertBox.classList.add('hidden');
          }
        }

        // 5. 制限時間インプット（編集中でなければ反映）
        const timeInput = document.getElementById('manager-time-limit-input');
        if (document.activeElement !== timeInput && res.globalTimeLimit) {
          timeInput.value = res.globalTimeLimit;
        }

        // 6. 各ブース詳細状況の描画
        this.renderBooths(res.statuses);
      }
    } catch (error) {
      syncDot.className = 'sync-dot error';
    }
  },

  updateEmergencyPauseUI(isPaused) {
    const pauseBtn = document.getElementById('btn-emergency-pause');
    const banner = document.getElementById('manager-paused-banner');

    if (!pauseBtn) return;
    if (isPaused) {
      pauseBtn.className = 'btn btn-success btn-sm';
      pauseBtn.innerHTML = '<span class="material-symbols-outlined icon-sm">play_circle</span> 緊急停止を解除（再開）';
      if (banner) banner.classList.remove('hidden');
    } else {
      pauseBtn.className = 'btn btn-danger btn-sm';
      pauseBtn.innerHTML = '<span class="material-symbols-outlined icon-sm">pause_circle</span> 緊急一時停止';
      if (banner) banner.classList.add('hidden');
    }
  },

  updateInfoPauseUI(isPaused) {
    const infoBtn = document.getElementById('btn-info-pause');
    const banner = document.getElementById('manager-infopause-banner');

    if (!infoBtn) return;
    if (isPaused) {
      infoBtn.className = 'btn btn-success btn-sm';
      infoBtn.innerHTML = '<span class="material-symbols-outlined icon-sm">play_circle</span> 待機中表示を解除';
      if (banner) banner.classList.remove('hidden');
    } else {
      infoBtn.className = 'btn btn-warning btn-sm';
      infoBtn.innerHTML = '<span class="material-symbols-outlined icon-sm">hourglass_top</span> 「しばらくお待ちください」送信';
      if (banner) banner.classList.add('hidden');
    }
  },

  updatePaceSignalUI(signal) {
    const btnWait = document.getElementById('btn-pace-wait');
    const btnPush = document.getElementById('btn-pace-push');
    const btnNone = document.getElementById('btn-pace-none');

    if (!btnWait || !btnPush || !btnNone) return;

    btnWait.classList.toggle('active', signal === CONFIG.PACE_SIGNALS.WAIT);
    btnPush.classList.toggle('active', signal === CONFIG.PACE_SIGNALS.PUSH);
    btnNone.classList.toggle('active', signal === CONFIG.PACE_SIGNALS.NONE);
  },

  async toggleEmergencyPause() {
    const nextState = !this.isEmergencyPaused;
    const actionName = nextState ? '【緊急一時停止（赤）】を発動' : '緊急一時停止を【解除・再開】';

    if (!confirm(`全ブースの ${actionName} しますか？`)) return;

    try {
      const res = await API.toggleEmergencyPause(nextState);
      if (res && res.success) {
        this.isEmergencyPaused = nextState;
        this.updateEmergencyPauseUI(nextState);
      }
    } catch (e) {
      alert('通信エラーが発生しました');
    }
  },

  async toggleInfoPause() {
    const nextState = !this.isInfoPaused;
    const actionName = nextState ? '【機材調整中/待機画面（黄）】を表示' : '待機画面表示を【解除・再開】';

    if (!confirm(`全問題機に ${actionName} しますか？`)) return;

    try {
      const res = await API.toggleInfoPause(nextState);
      if (res && res.success) {
        this.isInfoPaused = nextState;
        this.updateInfoPauseUI(nextState);
      }
    } catch (e) {
      alert('通信エラーが発生しました');
    }
  },

  async setPaceSignal(signal) {
    try {
      const res = await API.setPaceSignal(signal);
      if (res && res.success) {
        this.currentPaceSignal = signal;
        this.updatePaceSignalUI(signal);
      }
    } catch (e) {
      alert('シグナル送信に失敗しました');
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
        alert(`全体制限時間を [ ${timeLimit}秒 ] に更新しました。\n次回の進行・出題から全ブースへ適用されます。`);
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
        alert('システムを完全に初期化しました');
        await this.fetchStatus();
      }
    } catch (e) {
      alert('リセット処理に失敗しました');
    }
  },

  renderBooths(statuses) {
    const container = document.getElementById('manager-booth-grid');
    if (!container) return;
    container.innerHTML = '';

    const rooms = [
      { key: 'room1', title: '第1問 ブース [Alpha]' },
      { key: 'room2', title: '第2問 ブース [Beta]' },
      { key: 'room3', title: '第3問 ブース [Core]' },
      { key: 'exit',  title: '出口 / リザルト機' }
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
        lowBattery: false,
        isCongested: false
      };

      const card = document.createElement('div');
      card.className = `manager-detail-card ${b.status === 'playing' ? 'is-playing' : ''}`;

      const statusBadgeClass = b.status === 'ready' ? 'badge-correct' : (b.status === 'playing' ? 'badge-warning' : 'badge-secondary');
      const statusText = b.status === 'ready' ? '待機中' : (b.status === 'playing' ? '侵入攻略中' : '未接続');

      card.innerHTML = `
        <div class="manager-card-head">
          <div>
            <strong class="manager-booth-name">${r.title}</strong>
            <span class="group-pill-sm">${b.groupId ? (b.isEx ? '[EX] ' : '') + b.groupId : '空室'}</span>
          </div>
          <div class="manager-head-badges">
            ${b.lowBattery ? '<span class="battery-alert"><span class="material-symbols-outlined icon-xs">battery_alert</span>給電要請</span>' : ''}
            ${b.isCongested ? '<span class="badge badge-danger">混雑中</span>' : ''}
            <span class="result-judge-badge ${statusBadgeClass}">${statusText}</span>
          </div>
        </div>

        <div class="manager-card-body">
          <div class="manager-stat-row">
            <span class="stat-label">難易度:</span>
            <span class="stat-value font-bold">${b.difficulty.toUpperCase()}</span>
          </div>

          ${r.key !== 'exit' ? `
            <div class="manager-stat-row">
              <span class="stat-label">出題QID:</span>
              <span class="stat-value font-mono">${b.currentQuestionId || '--'}</span>
            </div>
            <div class="manager-stat-row question-snippet">
              <span class="stat-label">問題概要:</span>
              <span class="stat-value snippet-text">${b.currentQuestionText || '（出題待機中）'}</span>
            </div>
            <div class="manager-stat-row">
              <span class="stat-label">正解KEY:</span>
              <span class="stat-value text-highlight font-bold">${b.currentAnswer || '--'}</span>
            </div>
            <div class="manager-stat-row">
              <span class="stat-label">残り制限時間:</span>
              <span class="stat-value timer-val font-mono">${b.timeLeft} 秒</span>
            </div>
          ` : `
            <div class="manager-stat-row">
              <span class="stat-label">稼働モード:</span>
              <span class="stat-value">${b.status === 'playing' ? '成績発表中' : '案内待機中'}</span>
            </div>
          `}

          <div class="manager-stat-row">
            <span class="stat-label">直前判定:</span>
            <span class="stat-value">
              ${b.lastJudge === true ? '<span class="text-success font-bold">⭕ 正解 [突破]</span>' : (b.lastJudge === false ? '<span class="text-danger font-bold">❌ 不正解 [防衛]</span>' : '--')}
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