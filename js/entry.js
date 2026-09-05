/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/entry.js - 入口機制御 (QR受付・全ブース稼働監視・現在作戦プロトコル情報バナー)
 */

const EntryApp = {
  pollingTimer: null,

  init() {
    const role = AppStorage.getRole();
    if (role !== CONFIG.ROLES.ENTRY) return;

    const screen = document.getElementById('entry-screen');
    if (screen) screen.classList.remove('hidden');

    this.startMonitoring();
    this.fetchCurrentRules();
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
   * @param {Object} qrData
   */
  async handleRegister(qrData) {
    if (!qrData || !qrData.device_id) {
      alert('無効なスタッフQRコードです。（端末IDが検出できませんでした）');
      return;
    }

    // 読み取り完了を即座にボタンUIへ反映（進行中フィードバック）
    const btn = document.querySelector('.btn-giant-entry');
    const origText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.innerHTML = '<span class="material-symbols-outlined icon-lg" style="animation:spin 1s infinite linear;">sync</span> 受付登録処理中...';
      btn.disabled = true;
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
        this.fetchBoothStatuses();
        alert(`【受付完了】\nグループ: ${res.groupId} (${res.groupName})\n担当: ${res.staffName}\n難易度: ${String(res.difficulty).toUpperCase()}`);
      } else {
        alert('受付登録に失敗しました: ' + (res.error || 'サーバーエラー'));
      }
    } catch (e) {
      console.error('[EntryApp] 受付通信エラー:', e);
      alert('受付通信エラーが発生しました。\nネットワーク接続を確認してください。');
    } finally {
      if (btn) {
        btn.innerHTML = origText;
        btn.disabled = false;
      }
    }
  },

  renderRecentRegistered(data) {
    const box = document.getElementById('entry-recent-registered');
    const gidElem = document.getElementById('recent-group-id');
    const nameElem = document.getElementById('recent-group-name');
    const diffBadge = document.getElementById('recent-diff-badge');

    if (!box) return;
    box.classList.remove('hidden');

    if (gidElem) gidElem.textContent = data.groupId || '--';
    if (nameElem) nameElem.textContent = `${data.groupName || ''} (${data.staffName || ''}班)`;
    if (diffBadge) diffBadge.textContent = String(data.difficulty || 'NORMAL').toUpperCase();
  },

  /**
   * 現在の作戦プロトコル（制限時間・誤答ルール・EX条件）の取得と描画
   */
  async fetchCurrentRules() {
    try {
      const res = await API.getSystemRules();
      if (res && res.success) {
        this.renderRulesBanner(res);
      }
    } catch (e) {
      console.warn('[EntryApp] ルールバナー取得エラー:', e);
    }
  },

  renderRulesBanner(rules) {
    const timeElem = document.getElementById('entry-rule-timelimit');
    const penaltyElem = document.getElementById('entry-rule-penalty');
    const exElem = document.getElementById('entry-rule-ex');

    if (timeElem) {
      timeElem.textContent = `${rules.globalTimeLimit || 60}秒`;
    }

    if (penaltyElem) {
      if (rules.penaltyRule === 'time_deduct') {
        penaltyElem.textContent = `時間減算 (-${rules.penaltyDeductSeconds || 15}秒)`;
        penaltyElem.className = 'rule-val text-warning font-cyber';
      } else {
        penaltyElem.textContent = '誤答即アウト';
        penaltyElem.className = 'rule-val text-danger font-cyber';
      }
    }

    if (exElem) {
      if (rules.exConditionType === 'score_threshold') {
        exElem.textContent = `合計スコア ${rules.exConditionValue || 100}点以上`;
      } else if (rules.exConditionType === 'diff_count') {
        exElem.textContent = `指定難易度クリア (${rules.exConditionValue || '2問'})`;
      } else {
        exElem.textContent = '全問HARD選択 & 全問正解';
      }
    }
  },

  /**
   * 5秒ごとの定期監視ポーリング
   */
  startMonitoring() {
    this.fetchBoothStatuses();
    this.fetchCurrentRules();

    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = setInterval(() => {
      this.fetchBoothStatuses();
      this.fetchCurrentRules();
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

      card.className = `simple-booth-card ${isInUse ? 'state-in-use' : 'state-idle'}`;

      if (groupPill) {
        groupPill.textContent = (isInUse && bInfo.currentGroupId) ? bInfo.currentGroupId : '空室';
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
