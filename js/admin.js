/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * admin.js - 入口／進行機
 */
const AdminApp = {
  pollingTimer: null,
  isAdvancing: false,
  lastRoom1Group: null,

  init() {
    const savedRole = AppStorage.getRole();

    if (!savedRole) {
      document.getElementById('role-select-screen').classList.remove('hidden');
      return;
    }

    if (savedRole === CONFIG.ROLES.ENTRY) {
      document.getElementById('admin-screen').classList.remove('hidden');
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
      syncDot.className = 'sync-dot syncing';
      const res = await API.getStatus();

      if (res && res.success) {
        syncDot.className = 'sync-dot';
        syncText.textContent = new Date().toLocaleTimeString();

        // 1. 出口混雑アラートバナー
        const exitAlertBanner = document.getElementById('entry-exit-congested-alert');
        if (exitAlertBanner) {
          if (res.isExitCongested) {
            exitAlertBanner.classList.remove('hidden');
          } else {
            exitAlertBanner.classList.add('hidden');
          }
        }

        // 2. 管理機からのペース指示バナー (WAIT / PUSH)
        this.renderPaceSignalBanner(res.paceSignal);

        // 3. ブース状況の描画（canAdvanceはRoom1〜3のみでGAS側判定済み）
        this.renderStatuses(res.statuses, res.canAdvance);

        // 次グループID自動インクリメント補助
        const r1Group = res.statuses.room1?.groupId;
        if (r1Group && r1Group !== this.lastRoom1Group) {
          this.lastRoom1Group = r1Group;
          this.autoComputeNextGroupId(r1Group);
        }
      }
    } catch (error) {
      syncDot.className = 'sync-dot error';
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

  renderStatuses(statuses, canAdvance) {
    const rooms = ['room1', 'room2', 'room3'];

    rooms.forEach(roomKey => {
      const roomData = statuses[roomKey] || { status: 'unknown', groupId: '', isEx: false, lowBattery: false };
      const card = document.getElementById(`card-${roomKey}`);
      const groupBadge = document.getElementById(`group-${roomKey}`);
      const statusLabel = document.getElementById(`status-label-${roomKey}`);
      const batteryAlert = document.getElementById(`battery-${roomKey}`);

      if (!card) return;
      card.className = 'room-card';

      if (roomData.status === 'ready') {
        card.classList.add('status-ready');
        statusLabel.textContent = '待機中 (READY)';
      } else if (roomData.status === 'playing') {
        card.classList.add('status-playing');
        statusLabel.textContent = `攻略中 (${roomData.timeLeft || 0}s)`;
      } else {
        card.classList.add('status-unknown');
        statusLabel.textContent = '未接続';
      }

      if (batteryAlert) {
        if (roomData.lowBattery) {
          batteryAlert.classList.remove('hidden');
        } else {
          batteryAlert.classList.add('hidden');
        }
      }

      if (roomData.groupId) {
        const exPrefix = roomData.isEx ? '[EX] ' : '';
        groupBadge.textContent = `${exPrefix}${roomData.groupId}`;
      } else {
        groupBadge.textContent = '--';
      }
    });

    // 進行ボタンの活性化制御
    const advanceBtn = document.getElementById('btn-advance');
    const warning = document.getElementById('advance-warning');

    if (canAdvance && !this.isAdvancing) {
      advanceBtn.disabled = false;
      if (warning) warning.classList.add('hidden');
    } else {
      advanceBtn.disabled = true;
      if (warning && !this.isAdvancing) warning.classList.remove('hidden');
    }
  },

  autoComputeNextGroupId(currentR1GroupId) {
    const nextInput = document.getElementById('next-group-id');
    const match = currentR1GroupId.match(/^(.*?)(\d+)$/);
    if (match) {
      const prefix = match[1];
      const num = parseInt(match[2], 10) + 1;
      const padded = String(num).padStart(match[2].length, '0');
      nextInput.value = `${prefix}${padded}`;
    }
  },

  async triggerAdvance() {
    if (this.isAdvancing) return;

    const nextGroupId = document.getElementById('next-group-id').value.trim();
    const diffRadio = document.querySelector('input[name="admin-diff"]:checked');
    const selectedDifficulty = diffRadio ? diffRadio.value : 'normal';

    if (!nextGroupId) {
      alert('グループIDを入力してください');
      return;
    }

    if (!confirm(`[ ${nextGroupId} ] (難易度: ${selectedDifficulty.toUpperCase()}) を投入してパイプラインを一斉進行しますか？`)) {
      return;
    }

    this.isAdvancing = true;
    const advanceBtn = document.getElementById('btn-advance');
    advanceBtn.disabled = true;
    advanceBtn.innerHTML = '<span class="material-symbols-outlined icon-md">sync</span> 進行処理・同期中...';

    try {
      const res = await API.advancePipeline(nextGroupId, selectedDifficulty);
      if (res && res.success) {
        await this.fetchStatus();
      } else {
        alert('進行エラー: ' + (res.error || '不明なエラー'));
      }
    } catch (error) {
      alert('通信に失敗しました。電波状況を確認してください。');
    } finally {
      this.isAdvancing = false;
      advanceBtn.innerHTML = '<span class="material-symbols-outlined icon-md">fast_forward</span> 全ブースを一斉進行';
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  AdminApp.init();
});