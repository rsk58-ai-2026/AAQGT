/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/entry.js - 入口機制御 (QR受付 & 全ブース稼働監視シンプルモニタ)
 */

const EntryApp = {
  pollingTimer: null,

  init() {
    const role = AppStorage.getRole();
    if (role !== 'entry') return;

    const screen = document.getElementById('entry-screen');
    if (screen) screen.classList.remove('hidden');

    // 5秒ごとのブース状態ポーリング監視を開始
    this.startMonitoring();
  },

  /**
   * QR受付スキャナー起動
   */
  openRegisterScanner() {
    CameraScanner.start(async (data) => {
      await this.handleRegister(data);
    });
  },

  /**
   * 受付API呼び出し
   */
  async handleRegister(qrData) {
    if (!qrData || !qrData.device_id) {
      alert('無効なスタッフQRコードです。');
      return;
    }

    try {
      const payload = {
        device_id: qrData.device_id,
        group_name: qrData.group_name || '新規グループ',
        staff_name: qrData.staff_name || 'スタッフ',
        difficulty: qrData.difficulty || 'normal',
        is_ex_entry: qrData.is_ex_entry === true
      };

      const res = await API.registerGroup(payload);
      if (res && res.success) {
        this.renderRecentRegistered(res);
        // ブース監視を即時更新
        this.fetchBoothStatuses();
      } else {
        alert('受付登録に失敗しました: ' + (res.error || 'エラー'));
      }
    } catch (e) {
      alert('受付登録通信エラーが発生しました。');
    }
  },

  renderRecentRegistered(data) {
    const box = document.getElementById('entry-recent-registered');
    const gidElem = document.getElementById('recent-group-id');
    const nameElem = document.getElementById('recent-group-name');
    const diffBadge = document.getElementById('recent-diff-badge');

    if (!box) return;
    box.classList.remove('hidden');

    if (gidElem) gidElem.textContent = data.groupId;
    if (nameElem) nameElem.textContent = `${data.groupName} (${data.staffName}班)`;
    if (diffBadge) diffBadge.textContent = String(data.difficulty).toUpperCase();
  },

  /**
   * 5秒ごとの定期ポーリング監視
   */
  startMonitoring() {
    this.fetchBoothStatuses();
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = setInterval(() => {
      this.fetchBoothStatuses();
    }, 5000);
  },

  async fetchBoothStatuses() {
    try {
      const res = await API.getBoothStatus();
      if (res && res.success && res.statuses) {
        this.renderBooths(res.statuses);
      }
    } catch (e) {
      console.warn('[EntryApp] ブースステータス取得エラー:', e);
    }
  },

  renderBooths(statuses) {
    const booths = ['room1', 'room2', 'room3', 'shooting'];

    booths.forEach(boothId => {
      const bInfo = statuses[boothId] || { status: 'idle', currentGroupId: '' };
      const card = document.getElementById(`booth-card-${boothId}`);
      const groupPill = document.getElementById(`booth-group-${boothId}`);
      const stateInd = document.getElementById(`booth-state-${boothId}`);

      if (!card) return;

      const isInUse = bInfo.status === 'in_use';

      // カード色制御
      card.className = `simple-booth-card ${isInUse ? 'state-in-use' : 'state-idle'}`;

      if (groupPill) {
        groupPill.textContent = isInUse && bInfo.currentGroupId ? bInfo.currentGroupId : '空室';
      }

      if (stateInd) {
        stateInd.textContent = isInUse ? '使用中 (IN USE)' : '空室 (IDLE)';
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  EntryApp.init();
});