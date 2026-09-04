/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/manager.js - 管理者機 (バックヤード統括・ルール一括管理・リアルタイム監視)
 */

const ManagerApp = {
  pollingTimer: null,
  currentRules: {
    globalTimeLimit: 60,
    penaltyRule: 'instant_out',
    penaltyDeductSeconds: 15,
    exConditionType: 'hard_perfect',
    exConditionValue: '100'
  },
  isEmergencyPaused: false,
  isInfoPaused: false,
  currentPaceSignal: 'none',

  init() {
    const role = AppStorage.getRole();
    if (role !== CONFIG.ROLES.MANAGER) return;

    const screen = document.getElementById('manager-screen');
    if (screen) screen.classList.remove('hidden');

    this.startPolling();
  },

  startPolling() {
    this.fetchData();
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = setInterval(() => {
      this.fetchData();
    }, CONFIG.POLLING_INTERVAL_MS);
  },

  async fetchData() {
    const syncDot = document.getElementById('manager-sync-dot');
    const syncText = document.getElementById('manager-sync-text');

    try {
      if (syncDot) syncDot.className = 'sync-dot syncing';

      // 1. システムルール & 制御状態の取得
      const rulesRes = await API.getSystemRules();
      if (rulesRes && rulesRes.success) {
        this.currentRules = {
          globalTimeLimit: rulesRes.globalTimeLimit || 60,
          penaltyRule: rulesRes.penaltyRule || 'instant_out',
          penaltyDeductSeconds: rulesRes.penaltyDeductSeconds || 15,
          exConditionType: rulesRes.exConditionType || 'hard_perfect',
          exConditionValue: rulesRes.exConditionValue || '100'
        };

        this.isEmergencyPaused = rulesRes.systemPaused === true;
        this.isInfoPaused = rulesRes.infoPaused === true;
        this.currentPaceSignal = rulesRes.paceSignal || 'none';

        this.renderRulesUI();
        this.renderControlUI(rulesRes);
      }

      // 2. ブース稼働状況の取得
      const boothRes = await API.getBoothStatus();
      if (boothRes && boothRes.success && boothRes.statuses) {
        this.renderBooths(boothRes.statuses);
      }

      if (syncDot) syncDot.className = 'sync-dot';
      if (syncText) syncText.textContent = new Date().toLocaleTimeString();
    } catch (error) {
      console.warn('[ManagerApp] 同期エラー:', error);
      if (syncDot) syncDot.className = 'sync-dot error';
    }
  },

  /**
   * ルール設定フォームへの値反映
   */
  renderRulesUI() {
    // 制限時間
    const timeInput = document.getElementById('manager-time-limit-input');
    if (timeInput && document.activeElement !== timeInput) {
      timeInput.value = this.currentRules.globalTimeLimit;
    }

    // 誤答ペナルティルール
    const penaltySelect = document.getElementById('manager-penalty-rule-select');
    if (penaltySelect && document.activeElement !== penaltySelect) {
      penaltySelect.value = this.currentRules.penaltyRule;
    }

    const deductGroup = document.getElementById('manager-deduct-seconds-group');
    if (deductGroup) {
      deductGroup.classList.toggle('hidden', this.currentRules.penaltyRule !== 'time_deduct');
    }

    const deductInput = document.getElementById('manager-deduct-seconds-input');
    if (deductInput && document.activeElement !== deductInput) {
      deductInput.value = this.currentRules.penaltyDeductSeconds;
    }

    // EX開放条件
    const exTypeSelect = document.getElementById('manager-ex-type-select');
    if (exTypeSelect && document.activeElement !== exTypeSelect) {
      exTypeSelect.value = this.currentRules.exConditionType;
    }

    const exValGroup = document.getElementById('manager-ex-val-group');
    if (exValGroup) {
      exValGroup.classList.toggle('hidden', this.currentRules.exConditionType === 'hard_perfect');
    }

    const exValInput = document.getElementById('manager-ex-val-input');
    if (exValInput && document.activeElement !== exValInput) {
      exValInput.value = this.currentRules.exConditionValue;
    }
  },

  /**
   * 一時停止・シグナル等のUI制御
   */
  renderControlUI(res) {
    // 緊急一時停止
    const pauseBtn = document.getElementById('btn-emergency-pause');
    const pauseBanner = document.getElementById('manager-paused-banner');
    if (pauseBtn) {
      if (this.isEmergencyPaused) {
        pauseBtn.className = 'btn btn-success btn-sm font-cyber';
        pauseBtn.innerHTML = '<span class="material-symbols-outlined icon-sm">play_circle</span> 緊急停止を解除（再開）';
      } else {
        pauseBtn.className = 'btn btn-danger btn-sm font-cyber';
        pauseBtn.innerHTML = '<span class="material-symbols-outlined icon-sm">pause_circle</span> 緊急一時停止';
      }
    }
    if (pauseBanner) pauseBanner.classList.toggle('hidden', !this.isEmergencyPaused);

    // 待機画面
    const infoBtn = document.getElementById('btn-info-pause');
    const infoBanner = document.getElementById('manager-infopause-banner');
    if (infoBtn) {
      if (this.isInfoPaused) {
        infoBtn.className = 'btn btn-success btn-sm font-cyber';
        infoBtn.innerHTML = '<span class="material-symbols-outlined icon-sm">play_circle</span> 待機中表示を解除';
      } else {
        infoBtn.className = 'btn btn-warning btn-sm font-cyber';
        infoBtn.innerHTML = '<span class="material-symbols-outlined icon-sm">hourglass_top</span> 「しばらくお待ちください」送信';
      }
    }
    if (infoBanner) infoBanner.classList.toggle('hidden', !this.isInfoPaused);

    // 出口混雑警告
    const exitAlert = document.getElementById('manager-exit-congested-box');
    if (exitAlert) {
      exitAlert.classList.toggle('hidden', !res.isExitCongested);
    }
  },

  /**
   * ルール変更の保存
   */
  async saveRules() {
    const timeInput = document.getElementById('manager-time-limit-input');
    const penaltySelect = document.getElementById('manager-penalty-rule-select');
    const deductInput = document.getElementById('manager-deduct-seconds-input');
    const exTypeSelect = document.getElementById('manager-ex-type-select');
    const exValInput = document.getElementById('manager-ex-val-input');

    const globalTimeLimit = parseInt(timeInput ? timeInput.value : 60, 10) || 60;
    const penaltyRule = penaltySelect ? penaltySelect.value : 'instant_out';
    const penaltyDeductSeconds = parseInt(deductInput ? deductInput.value : 15, 10) || 15;
    const exConditionType = exTypeSelect ? exTypeSelect.value : 'hard_perfect';
    const exConditionValue = exValInput ? exValInput.value.trim() : '100';

    if (globalTimeLimit < 10) {
      alert('制限時間は10秒以上を設定してください');
      return;
    }

    try {
      const res = await API.saveSystemRules({
        globalTimeLimit,
        penaltyRule,
        penaltyDeductSeconds,
        exConditionType,
        exConditionValue
      });

      if (res && res.success) {
        alert('システムルール設定を更新しました。\n全端末の次回進行から自動適用されます。');
        await this.fetchData();
      } else {
        alert('設定保存エラー: ' + (res.error || '不明なエラー'));
      }
    } catch (e) {
      alert('設定保存通信エラーが発生しました');
    }
  },

  /**
   * 誤答ペナルティ選択切替時の入力欄表示制御
   */
  handlePenaltyRuleChange(val) {
    const deductGroup = document.getElementById('manager-deduct-seconds-group');
    if (deductGroup) {
      deductGroup.classList.toggle('hidden', val !== 'time_deduct');
    }
  },

  /**
   * EX開放条件選択切替時の入力欄表示制御
   */
  handleExTypeChange(val) {
    const exValGroup = document.getElementById('manager-ex-val-group');
    const exValLabel = document.getElementById('manager-ex-val-label');
    const exValInput = document.getElementById('manager-ex-val-input');

    if (exValGroup) {
      exValGroup.classList.toggle('hidden', val === 'hard_perfect');
    }

    if (val === 'score_threshold') {
      if (exValLabel) exValLabel.textContent = 'EX獲得に必要な合計スコア閾値 (例: 100)';
      if (exValInput) exValInput.placeholder = '100';
    } else if (val === 'diff_count') {
      if (exValLabel) exValLabel.textContent = '指定難易度と必要正解数 (例: hard:2 または 2)';
      if (exValInput) exValInput.placeholder = 'hard:2';
    }
  },

  /**
   * 全ブース稼働状況モニタの描画
   */
  renderBooths(statuses) {
    const booths = [
      { id: 'room1', name: '第1問 [NODE 1: ALPHA]' },
      { id: 'room2', name: '第2問 [NODE 2: BETA]' },
      { id: 'room3', name: '第3問 [NODE 3: CORE]' },
      { id: 'shooting', name: '射撃 [SHOOTING RANGE]' }
    ];

    booths.forEach(b => {
      const bInfo = statuses[b.id] || { status: 'idle', currentGroupId: '' };
      const card = document.getElementById(`manager-booth-${b.id}`);
      const groupElem = document.getElementById(`manager-booth-group-${b.id}`);
      const stateElem = document.getElementById(`manager-booth-state-${b.id}`);

      if (!card) return;

      const isInUse = bInfo.status === 'in_use';

      card.className = `simple-booth-card ${isInUse ? 'state-in-use' : 'state-idle'}`;

      if (groupElem) {
        groupElem.textContent = (isInUse && bInfo.currentGroupId) ? bInfo.currentGroupId : '空室';
      }

      if (stateElem) {
        stateElem.textContent = isInUse ? '使用中 (IN USE)' : '空室 (IDLE)';
      }
    });
  },

  /**
   * 緊急一時停止のトグル
   */
  async toggleEmergencyPause() {
    const nextState = !this.isEmergencyPaused;
    const msg = nextState ? '【緊急一時停止】を発動しますか？' : '緊急一時停止を【解除・再開】しますか？';
    if (!confirm(msg)) return;

    try {
      const res = await API.toggleEmergencyPause(nextState);
      if (res && res.success) {
        this.isEmergencyPaused = nextState;
        this.renderControlUI({ isExitCongested: false });
      }
    } catch (e) {
      alert('通信エラーが発生しました');
    }
  },

  /**
   * 待機画面のトグル
   */
  async toggleInfoPause() {
    const nextState = !this.isInfoPaused;
    const msg = nextState ? '【機材調整中/待機画面】を表示しますか？' : '待機画面表示を【解除・再開】しますか？';
    if (!confirm(msg)) return;

    try {
      const res = await API.toggleInfoPause(nextState);
      if (res && res.success) {
        this.isInfoPaused = nextState;
        this.renderControlUI({ isExitCongested: false });
      }
    } catch (e) {
      alert('通信エラーが発生しました');
    }
  },

  /**
   * 全体リセット
   */
  async resetAllSystem() {
    const pass = prompt('🚨 システムを初期化しますか？\n全ブースの状態が初期状態に戻ります。\n実行する場合は「RESET」と入力してください:');
    if (pass !== 'RESET') {
      if (pass !== null) alert('キャンセルされました');
      return;
    }

    try {
      const res = await API.resetAllStatus();
      if (res && res.success) {
        alert('システムを初期化しました');
        await this.fetchData();
      }
    } catch (e) {
      alert('リセット処理に失敗しました');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  ManagerApp.init();
});