/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/api.js - 通信レイヤー (事前アサイン対応版)
 */
const API = {
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
  async registerGroup(payload) {
    return await this.post({
      action: 'registerGroup',
      device_id: payload.device_id,
      group_name: payload.group_name,
      staff_name: payload.staff_name,
      difficulty: payload.difficulty,
      is_ex_entry: payload.is_ex_entry
    });
  },

  async getBoothStatus() {
    return await this.get({
      action: 'getBoothStatus'
    });
  },

  // ==========================================
  // 2. スタッフスマホ用 割り当て問題取得 API
  // ==========================================
  async getAssignedQuestions(deviceId) {
    return await this.get({
      action: 'getAssignedQuestions',
      device_id: deviceId
    });
  },

  // ==========================================
  // 3. クイズ問題機 (Room 1〜3) API
  // ==========================================
  async startQuizRoom(payload) {
    return await this.post({
      action: 'startQuizRoom',
      booth_id: payload.booth_id,
      device_id: payload.device_id,
      difficulty: payload.difficulty || 'normal'
    });
  },

  async submitQuizAnswer(payload) {
    return await this.post({
      action: 'submitQuizAnswer',
      ...payload
    });
  },

  // ==========================================
  // 4. 射撃フェーズ機 (Shooting) API
  // ==========================================
  async submitShootingScore(payload) {
    return await this.post({
      action: 'submitShootingScore',
      ...payload
    });
  },

  // ==========================================
  // 5. 出口／リザルト機 (Exit) API
  // ==========================================
  async getGroupSummaryAndRelease(payload) {
    return await this.post({
      action: 'getGroupSummaryAndRelease',
      ...payload
    });
  },

  async submitFinalResult(payload) {
    return await this.post({
      action: 'submitFinalResult',
      ...payload
    });
  },

  async getFinishedResultsList(sortType = 'latest') {
    return await this.get({
      action: 'getFinishedResultsList',
      sort: sortType
    });
  },

  async getRanking() {
    return await this.get({
      action: 'getRanking'
    });
  },

  // ==========================================
  // 6. 共通マスタ・参照 API
  // ==========================================
  async getQuestions(room = '', difficulty = '') {
    const params = { action: 'getQuestions' };
    if (room) params.room = room;
    if (difficulty) params.difficulty = difficulty;
    return await this.get(params);
  },

  async getSystemRules() {
    return await this.get({
      action: 'getSystemRules'
    });
  },

  async getStatus() {
    return await this.getSystemRules();
  },

  // ==========================================
  // 7. 管理者／システム制御 API
  // ==========================================
  async saveSystemRules(rules) {
    return await this.post({
      action: 'saveSystemRules',
      ...rules
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

  async toggleInfoPause(isPaused) {
    return await this.post({
      action: 'toggleInfoPause',
      isPaused: !!isPaused
    });
  },

  async setPaceSignal(paceSignal) {
    return await this.post({
      action: 'setPaceSignal',
      paceSignal: paceSignal
    });
  },

  async resetAllStatus() {
    return await this.post({
      action: 'resetAllStatus'
    });
  },

  async reportExitCongestion(isCongested) {
    return await this.post({
      action: 'reportExitCongestion',
      isCongested: !!isCongested
    });
  }
};