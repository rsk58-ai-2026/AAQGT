/**
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
        this.renderStatuses(res.statuses, res.canAdvance);

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

  renderStatuses(statuses, canAdvance) {
    const rooms = ['room1', 'room2', 'room3', 'exit'];

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
        statusLabel.textContent = '待機中';
      } else if (roomData.status === 'playing') {
        card.classList.add('status-playing');
        statusLabel.textContent = '進行中';
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

    const advanceBtn = document.getElementById('btn-advance');
    const warning = document.getElementById('advance-warning');

    if (canAdvance && !this.isAdvancing) {
      advanceBtn.disabled = false;
      warning.classList.add('hidden');
    } else {
      advanceBtn.disabled = true;
      if (!this.isAdvancing) warning.classList.remove('hidden');
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

    if (!confirm(`[ ${nextGroupId} ] (難易度: ${selectedDifficulty}) を投入して全体を1つ進めますか？`)) {
      return;
    }

    this.isAdvancing = true;
    const advanceBtn = document.getElementById('btn-advance');
    advanceBtn.disabled = true;
    advanceBtn.innerHTML = '<span class="material-symbols-outlined icon-md">sync</span> 進行処理中...';

    try {
      const res = await API.advancePipeline(nextGroupId, selectedDifficulty);
      if (res && res.success) {
        await this.fetchStatus();
      } else {
        alert('エラー: ' + (res.error || ''));
      }
    } catch (error) {
      alert('通信に失敗しました');
    } finally {
      this.isAdvancing = false;
      advanceBtn.innerHTML = '<span class="material-symbols-outlined icon-md">fast_forward</span> 全ブースを一斉進行';
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  AdminApp.init();
});