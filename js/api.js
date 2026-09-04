/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/api.js - 通信レイヤー (リトライ・指数バックオフ・全面リニューアル対応)
 */
const API = {
  /**
   * 指数バックオフ付き高信頼性フェッチ
   * 通信瞬断・GASタイムアウト・排他ロック競合時に最大3回自動リトライ
   */
  async fetchWithRetry(url, options = {}, maxRetries = 3) {
    let attempt = 0;
    let delay = 1000;

    while (attempt < maxRetries) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT_MS || 10000);
      const fetchOptions = { ...options, signal: controller.signal };

      try {
        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP_${response.status}`);
        }

        const data = await response.json();

        // GAS側のLockTimeout等のエラーを検知した場合はリトライ対象にする
        if (data && data.success === false && data.error && String(data.error).includes('LockTimeout')) {
          throw new Error('GAS_LOCK_TIMEOUT');
        }

        return data;
      } catch (error) {
        clearTimeout(timeoutId);
        attempt++;
        console.warn(`[API Attempt ${attempt}/${maxRetries} Failed]:`, error.message || error);

        if (attempt >= maxRetries) {
          console.error(`[API Error]: 最大試行回数(${maxRetries})を超過しました。`);
          throw error;
        }

        // ジッター付き指数バックオフ待機
        const jitter = Math.random() * 300;
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
        delay *= 2;
      }
    }
  },

  async get(params = {}) {
    const url = new URL(CONFIG.GAS_API_URL);
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined && params[key] !== null) {
        url.searchParams.append(key, params[key]);
      }
    });

    return await this.fetchWithRetry(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
  },

  async post(payload = {}) {
    return await this.fetchWithRetry(CONFIG.GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
  },

  // ==========================================
  // 1. 入口機 (Entry) API
  // ==========================================

  /**
   * スタッフQRをスキャンしてグループ受付・登録
   * @param {Object} payload { device_id, group_name, staff_name, difficulty, is_ex_entry }
   */
  async registerGroup(payload) {
    return await this.post({
      action: 'registerGroup',
      ...payload
    });
  },

  /**
   * 入口モニタ用: 全ブース（room1, room2, room3, shooting）の稼働状況取得
   */
  async getBoothStatus() {
    return await this.get({
      action: 'getBoothStatus'
    });
  },

  // ==========================================
  // 2. クイズ問題機 (Room 1〜3) API
  // ==========================================

  /**
   * スタッフQRをスキャンして出題開始
   * @param {Object} payload { booth_id, device_id }
   */
  async startQuizRoom(payload) {
    return await this.post({
      action: 'startQuizRoom',
      ...payload
    });
  },

  /**
   * 解答判定送信
   * @param {Object} payload { booth_id, device_id, group_id, question_id, is_correct, time_left, miss_count }
   */
  async submitQuizAnswer(payload) {
    return await this.post({
      action: 'submitQuizAnswer',
      ...payload
    });
  },

  // ==========================================
  // 3. 射撃フェーズ機 (Shooting) API
  // ==========================================

  /**
   * 射撃得点の保存
   * @param {Object} payload { device_id, shooting_score }
   */
  async submitShootingScore(payload) {
    return await this.post({
      action: 'submitShootingScore',
      ...payload
    });
  },

  // ==========================================
  // 4. 出口／リザルト機 (Exit) API
  // ==========================================

  /**
   * 最終成績集計の取得 & スタッフ端末の紐付け解除
   * @param {Object} payload { device_id }
   */
  async getGroupSummaryAndRelease(payload) {
    return await this.post({
      action: 'getGroupSummaryAndRelease',
      ...payload
    });
  },

  /**
   * 最終結果直接保存（バックアップ用）
   * @param {Object} payload { groupId, totalScore, totalMisses, exQualified }
   */
  async submitFinalResult(payload) {
    return await this.post({
      action: 'submitFinalResult',
      ...payload
    });
  },

  /**
   * 終了済み全グループの成績一覧取得
   * @param {string} sortType 'latest' (新着順) | 'score' (ハイスコア順)
   */
  async getFinishedResultsList(sortType = 'latest') {
    return await this.get({
      action: 'getFinishedResultsList',
      sort: sortType
    });
  },

  /**
   * 総合ランキング一覧取得
   */
  async getRanking() {
    return await this.get({
      action: 'getRanking'
    });
  },

  // ==========================================
  // 5. 共通マスタ・参照 API
  // ==========================================

  /**
   * 問題マスタ一覧取得
   * @param {string} [room]
   * @param {string} [difficulty]
   */
  async getQuestions(room = '', difficulty = '') {
    const params = { action: 'getQuestions' };
    if (room) params.room = room;
    if (difficulty) params.difficulty = difficulty;
    return await this.get(params);
  },

  /**
   * 現在のシステムルール・全体状態取得
   */
  async getSystemRules() {
    return await this.get({
      action: 'getSystemRules'
    });
  },

  /**
   * getStatus (getSystemRules へのエイリアス)
   */
  async getStatus() {
    return await this.getSystemRules();
  },

  // ==========================================
  // 6. 管理者／システム制御 API
  // ==========================================

  /**
   * システムルールの一括保存
   * @param {Object} rules { globalTimeLimit, penaltyRule, penaltyDeductSeconds, exConditionType, exConditionValue }
   */
  async saveSystemRules(rules) {
    return await this.post({
      action: 'saveSystemRules',
      ...rules
    });
  },

  /**
   * 全体制限時間の更新
   * @param {number} timeLimit
   */
  async setGlobalTimeLimit(timeLimit) {
    return await this.post({
      action: 'setGlobalTimeLimit',
      timeLimit: timeLimit
    });
  },

  /**
   * 緊急一時停止の切り替え
   * @param {boolean} isPaused
   */
  async toggleEmergencyPause(isPaused) {
    return await this.post({
      action: 'toggleEmergencyPause',
      isPaused: !!isPaused
    });
  },

  /**
   * 機材調整中/待機画面表示の切り替え
   * @param {boolean} isPaused
   */
  async toggleInfoPause(isPaused) {
    return await this.post({
      action: 'toggleInfoPause',
      isPaused: !!isPaused
    });
  },

  /**
   * ペースシグナル指示の送信 ('none' | 'wait' | 'push')
   * @param {string} paceSignal
   */
  async setPaceSignal(paceSignal) {
    return await this.post({
      action: 'setPaceSignal',
      paceSignal: paceSignal
    });
  },

  /**
   * 全システムステータスの初期化
   */
  async resetAllStatus() {
    return await this.post({
      action: 'resetAllStatus'
    });
  },

  /**
   * 出口混雑状況の報告
   * @param {boolean} isCongested
   */
  async reportExitCongestion(isCongested) {
    return await this.post({
      action: 'reportExitCongestion',
      isCongested: !!isCongested
    });
  }
};