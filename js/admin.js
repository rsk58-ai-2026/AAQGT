/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * admin.js - 入口／進行機（オンライン判定＆モニタリングダッシュボード）
 */
const AdminApp = {
  pollingTimer: null,

  init() {
    const savedRole = AppStorage.getRole();

    if (!savedRole) {
      const roleScreen = document.getElementById('role-select-screen');
      if (roleScreen) roleScreen.classList.remove('hidden');
      return;
    }

    if (savedRole === CONFIG.ROLES.ENTRY) {
      const adminScreen = document.getElementById('admin-screen');
      if (adminScreen) adminScreen.classList.remove('hidden');
      this.startPolling();
    }
  },

  selectRole(role) {
    AppStorage.setRole(role);
    location.reload();
  },

  resetDeviceRole() {
    if (confirm('端末の役割設定を変更しますか？')) {
      AppStorage.clearRole();
      location.reload();
    }
  },

  startPolling() {
    this.fetchStatus();
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = setInterval(() => {
      this.fetchStatus();
    }, CONFIG.POLLING_INTERVAL_MS);
  },

  async fetchStatus() {
    const syncDot = document.getElementById('sync-dot');
    const syncText = document.getElementById('sync-text');

    try {
      if (syncDot) syncDot.className = 'sync-dot syncing';
      const res = await API.getStatus();

      if (res && res.success) {
        if (syncDot) syncDot.className = 'sync-dot';
        if (syncText) syncText.textContent = new Date().toLocaleTimeString();

        // 1. 出口混雑警報バナー
        const exitAlertBanner = document.getElementById('entry-exit-congested-alert');
        if (exitAlertBanner) {
          exitAlertBanner.classList.toggle('hidden', !res.isExitCongested);
        }

        // 2. 管理機からのPACE指示バナー (WAIT / PUSH)
        this.renderPaceSignalBanner(res.paceSignal);

        // 3. 各部屋のリアルタイムモニタリング表示 (オンライン状態含む)
        this.renderMonitoringDashboard(res.statuses, res.serverTime);
      }
    } catch (error) {
      if (syncDot) syncDot.className = 'sync-dot error';
    }
  },

  renderPaceSignalBanner(signal) {
    const paceBanner = document.getElementById('entry-pace-banner');
    const paceTitle = document.getElementById('entry-pace-title');
    const paceDesc = document.getElementById('entry-pace-desc');

    if (!paceBanner) return;

    if (signal === CONFIG.PACE_SIGNALS.WAIT) {
      paceBanner.className = 'pace-signal-banner pace-wait';
      paceBanner.classList.remove('hidden');
      paceTitle.textContent = '【進行待機指示】管理機より投入ストップ要請中';
      paceDesc.textContent = '出口混雑またはブース調整のため、スタッフの案内があるまで投入を見合わせてください。';
    } else if (signal === CONFIG.PACE_SIGNALS.PUSH) {
      paceBanner.className = 'pace-signal-banner pace-push';
      paceBanner.classList.remove('hidden');
      paceTitle.textContent = '【進行促進指示】管理機より回転率アップ要請中';
      paceDesc.textContent = '待機列が延長しています。Readyになり次第、速やかに次グループを投入してください。';
    } else {
      paceBanner.classList.add('hidden');
    }
  },

  renderMonitoringDashboard(statuses, serverTime) {
    const rooms = [
      { key: 'room1', name: 'NODE 1 [ALPHA]' },
      { key: 'room2', name: 'NODE 2 [BETA]' },
      { key: 'room3', name: 'NODE 3 [CORE]' }
    ];

    const now = serverTime || new Date().getTime();

    rooms.forEach(r => {
      const b = statuses[r.key] || {
        status: 'idle',
        groupId: '',
        difficulty: 'normal',
        currentQuestionId: '',
        timeLeft: 0,
        lowBattery: false,
        isOnline: false,
        updatedAt: null
      };

      const card = document.getElementById(`monitor-card-${r.key}`);
      const groupBadge = document.getElementById(`monitor-group-${r.key}`);
      const stateBadge = document.getElementById(`monitor-state-${r.key}`);
      const diffElem = document.getElementById(`monitor-diff-${r.key}`);
      const timerElem = document.getElementById(`monitor-timer-${r.key}`);
      const batteryAlert = document.getElementById(`battery-${r.key}`);
      const onlineBadge = document.getElementById(`monitor-online-${r.key}`);

      if (!card) return;

      // カードのアクティブ枠線制御
      card.className = `monitor-card card-state-${b.status}`;

      // オンライン／オフライン判定表示 (20秒以内に通信があるか)
      if (onlineBadge) {
        let isDeviceOnline = b.isOnline;
        if (b.updatedAt) {
          const diffMs = now - new Date(b.updatedAt).getTime();
          isDeviceOnline = diffMs >= 0 && diffMs <= 20000;
        }

        if (isDeviceOnline) {
          onlineBadge.className = 'monitor-online-badge online font-cyber';
          onlineBadge.innerHTML = '<span class="online-dot-icon"></span> ONLINE';
        } else {
          onlineBadge.className = 'monitor-online-badge offline font-cyber';
          onlineBadge.innerHTML = '<span class="online-dot-icon"></span> OFFLINE';
        }
      }

      if (batteryAlert) {
        batteryAlert.classList.toggle('hidden', !b.lowBattery);
      }

      if (groupBadge) {
        groupBadge.textContent = b.groupId ? `${b.isEx ? '[EX] ' : ''}${b.groupId}` : '空室 (EMPTY)';
      }

      if (stateBadge) {
        let stateText = '待機中 (IDLE)';
        let stateClass = 'state-badge-idle';

        if (b.status === 'ready') {
          stateText = '準備中 (READY 30s)';
          stateClass = 'state-badge-ready';
        } else if (b.status === 'playing') {
          stateText = '攻略中 (PLAYING)';
          stateClass = 'state-badge-playing';
        } else if (b.status === 'answered') {
          stateText = '解答済・移動案内中';
          stateClass = 'state-badge-answered';
        }

        stateBadge.className = `monitor-state-badge ${stateClass}`;
        stateBadge.textContent = stateText;
      }

      if (diffElem) {
        diffElem.textContent = b.groupId ? String(b.difficulty).toUpperCase() : '--';
      }

      if (timerElem) {
        if (b.status === 'playing') {
          const safeTime = Math.max(0, Math.floor(Number(b.timeLeft) || 0));
          timerElem.textContent = `${safeTime} 秒`;
        } else if (b.status === 'ready') {
          timerElem.textContent = '30 秒準備中';
        } else {
          timerElem.textContent = '--';
        }
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  AdminApp.init();
});