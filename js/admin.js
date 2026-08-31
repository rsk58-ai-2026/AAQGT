/**
 * admin.js - 入口／運営管理用ロジック
 */
const AdminApp = {
  pollingTimer: null,
  isAdvancing: false,

  /**
   * 初期化処理
   */
  init() {
    const savedRole = AppStorage.getRole();

    if (!savedRole) {
      // 役割未設定なら役割選択画面を表示
      document.getElementById('role-select-screen').classList.remove('hidden');
      return;
    }

    if (savedRole === CONFIG.ROLES.ENTRY) {
      // 自身が入口機の場合
      document.getElementById('admin-screen').classList.remove('hidden');
      this.startPolling();
    } else {
      // 問題機・出口機の場合（ステップ4で実装するメインハブへ委譲）
      console.log(`Current device role: ${savedRole}`);
    }
  },

  /**
   * 役割を選択して保存
   */
  selectRole(role) {
    AppStorage.setRole(role);
    location.reload(); // リロードして選択した画面を起動
  },

  /**
   * 端末の役割を再設定（リセット）
   */
  resetDeviceRole() {
    if (confirm('この端末の役割設定をリセットしますか？')) {
      AppStorage.clearAll();
      location.reload();
    }
  },

  /**
   * statusシートのポーリング監視を開始
   */
  startPolling() {
    this.fetchStatus(); // 初回実行

    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = setInterval(() => {
      this.fetchStatus();
    }, CONFIG.POLLING_INTERVAL_MS);
  },

  /**
   * ステータスを取得して画面に反映
   */
  async fetchStatus() {
    const syncDot = document.getElementById('sync-dot');
    const syncText = document.getElementById('sync-text');

    try {
      syncDot.className = 'sync-dot syncing';
      syncText.textContent = '同期中...';

      const res = await API.getStatus();

      if (res && res.success) {
        syncDot.className = 'sync-dot';
        syncText.textContent = `最終更新: ${new Date().toLocaleTimeString()}`;
        this.renderStatuses(res.statuses, res.canAdvance);
      } else {
        throw new Error(res.error || 'Status fetch failed');
      }
    } catch (error) {
      console.error('Polling error:', error);
      syncDot.className = 'sync-dot error';
      syncText.textContent = '通信エラー（再試行中）';
    }
  },

  /**
   * 各ブースのカード・ランプ・進行ボタンを描画
   */
  renderStatuses(statuses, canAdvance) {
    const rooms = ['room1', 'room2', 'room3', 'exit'];

    rooms.forEach(roomKey => {
      const roomData = statuses[roomKey] || { status: 'unknown', groupId: '', isEx: false };
      const card = document.getElementById(`card-${roomKey}`);
      const groupBadge = document.getElementById(`group-${roomKey}`);
      const statusLabel = document.getElementById(`status-label-${roomKey}`);

      if (!card) return;

      // クラス初期化
      card.className = 'room-card';

      if (roomData.status === 'ready') {
        card.classList.add('status-ready');
        statusLabel.textContent = '待機中（完了）';
      } else if (roomData.status === 'playing') {
        card.classList.add('status-playing');
        statusLabel.textContent = '進行中（プレイ中）';
      } else {
        card.classList.add('status-unknown');
        statusLabel.textContent = '未接続';
      }

      // グループIDとEXバッジの表示
      if (roomData.groupId) {
        const exPrefix = roomData.isEx ? '🔥 [EX] ' : '';
        groupBadge.textContent = `${exPrefix}${roomData.groupId}`;
      } else {
        groupBadge.textContent = '（空室）';
      }
    });

    // 進行ボタンの活性 / 非活性制御
    const advanceBtn = document.getElementById('btn-advance');
    const warning = document.getElementById('advance-warning');

    if (canAdvance && !this.isAdvancing) {
      advanceBtn.disabled = false;
      warning.classList.add('hidden');
    } else {
      advanceBtn.disabled = true;
      if (!this.isAdvancing) {
        warning.classList.remove('hidden');
      }
    }
  },

  /**
   * 次へ進行（一斉進行）を実行
   */
  async triggerAdvance() {
    if (this.isAdvancing) return;

    const nextGroupIdInput = document.getElementById('next-group-id');
    const nextIsExInput = document.getElementById('next-is-ex');
    const newGroupId = nextGroupIdInput.value.trim();
    const isExMode = nextIsExInput.checked;

    if (!newGroupId) {
      alert('投入するグループIDを入力してください（例: G-01）。');
      return;
    }

    if (!confirm(`グループ [ ${newGroupId} ] ${isExMode ? '【EXモード】' : ''} を投入して全体を1つ進めますか？`)) {
      return;
    }

    this.isAdvancing = true;
    const advanceBtn = document.getElementById('btn-advance');
    const warning = document.getElementById('advance-warning');
    advanceBtn.disabled = true;
    advanceBtn.innerHTML = '進行処理中...';

    try {
      const res = await API.advancePipeline(newGroupId, isExMode);
      if (res && res.success) {
        // 次のグループIDを自動インクリメント（例: G-01 -> G-02）
        this.incrementGroupId();
        nextIsExInput.checked = false; // EXフラグをリセット

        // 即座に最新ステータスを再取得
        await this.fetchStatus();
      } else {
        alert('進行エラーが発生しました: ' + (res.error || '不明なエラー'));
      }
    } catch (error) {
      alert('通信に失敗しました。もう一度お試しください。');
    } finally {
      this.isAdvancing = false;
      advanceBtn.innerHTML = '<span class="btn-icon">➡️</span><span class="btn-text">全ブースを一斉進行（次へ）</span>';
    }
  },

  /**
   * グループID番号を +1 する便利関数 (G-01 -> G-02)
   */
  incrementGroupId() {
    const input = document.getElementById('next-group-id');
    const current = input.value.trim();
    const match = current.match(/^(.*?)(\d+)$/);

    if (match) {
      const prefix = match[1];
      const num = parseInt(match[2], 10) + 1;
      const paddedNum = String(num).padStart(match[2].length, '0');
      input.value = `${prefix}${paddedNum}`;
    } else {
      input.value = current ? `${current}-1` : 'G-01';
    }
  }
};

// DOMロード完了時に初期化
document.addEventListener('DOMContentLoaded', () => {
  AdminApp.init();
});