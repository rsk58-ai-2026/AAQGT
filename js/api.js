/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * api.js - 通信レイヤー (リトライ・指数バックオフ・排他保護対応)
 */
const API = {
  /**
   * 指数バックオフ付き高信頼性フェッチ
   * 通信瞬断・GASタイムアウト・競合時に最大3回自動リトライ
   */
  async fetchWithRetry(url, options = {}, maxRetries = 3) {
    let attempt = 0;
    let delay = 1000;

    while (attempt < maxRetries) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT_MS);
      const fetchOptions = { ...options, signal: controller.signal };

      try {
        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP_${response.status}`);
        }

        const data = await response.json();

        // GAS側のLockTimeout等のエラーを検知した場合はリトライ対象にする
        if (data && data.success === false && data.error && data.error.includes('LockTimeout')) {
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
  // 自律分散バトンリレー API
  // ==========================================

  /**
   * Room 1: STARTボタン押下で新規グループ割当 & 難易度選択開始
   */
  async startRoom1(groupId = '') {
    return await this.post({
      action: 'startRoom1',
      groupId: groupId
    });
  },

  /**
   * Room 1: 難易度選択の確定 & 出題開始
   */
  async confirmRoom1Difficulty(difficulty, questionId) {
    return await this.post({
      action: 'confirmRoom1Difficulty',
      difficulty: difficulty,
      questionId: questionId
    });
  },

  /**
   * Room 2 / Room 3: 30秒経過または開始ボタン押下で出題開始
   */
  async startRoomPlaying(roomKey, questionId) {
    return await this.post({
      action: 'startRoomPlaying',
      roomKey: roomKey,
      questionId: questionId
    });
  },

  /**
   * 各ブース: 解答確定・提出 (自動バトンパス処理)
   */
  async submitRoomAnswer(payload) {
    return await this.post({
      action: 'submitRoomAnswer',
      ...payload
    });
  },

  // ==========================================
  // 共通データ取得 & 状態同期
  // ==========================================

  async getStatus() {
    return await this.get({ action: 'getStatus' });
  },

  async getQuestions(room = '', difficulty = '') {
    const params = { action: 'getQuestions' };
    if (room) params.room = room;
    if (difficulty) params.difficulty = difficulty;
    return await this.get(params);
  },

  async updateRoomStatus(roomKey, status, questionId, timeLeft, lastJudge) {
    return await this.post({
      action: 'updateRoomStatus',
      roomKey: roomKey,
      status: status,
      questionId: questionId,
      timeLeft: timeLeft,
      lastJudge: lastJudge
    });
  },

  async reportLowBattery(roomKey, isLow) {
    return await this.post({
      action: 'reportLowBattery',
      roomKey: roomKey,
      lowBattery: !!isLow
    });
  },

  // ==========================================
  // 出口機専用 API
  // ==========================================

  async getPendingResults() {
    return await this.get({ action: 'getPendingResults' });
  },

  async getGroupResult(groupId) {
    return await this.get({ action: 'getGroupResult', groupId: groupId });
  },

  async finishGroupResult(groupId) {
    return await this.post({
      action: 'finishGroupResult',
      groupId: groupId
    });
  },

  async reportExitCongestion(isCongested) {
    return await this.post({
      action: 'reportExitCongestion',
      isCongested: !!isCongested
    });
  },

  // ==========================================
  // 管理者機専用 API
  // ==========================================

  async setPaceSignal(paceSignal) {
    return await this.post({
      action: 'setPaceSignal',
      paceSignal: paceSignal
    });
  },

  async toggleInfoPause(isPaused) {
    return await this.post({
      action: 'toggleInfoPause',
      isPaused: !!isPaused
    });
  },

  async setGlobalTimeLimit(timeLimit) {
    return await this.post({
      action: 'setGlobalTimeLimit',
      timeLimit: timeLimit
    });
  },

  async toggleEmergencyPause(isPaused) {
    return await this.post({
      action: 'toggleEmergencyPause',
      isPaused: !!isPaused
    });
  },

  async resetAllStatus() {
    return await this.post({
      action: 'resetAllStatus'
    });
  }
};