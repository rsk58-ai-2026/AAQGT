/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * api.js - 通信レイヤー
 */
const API = {
  async get(params = {}) {
    const url = new URL(CONFIG.GAS_API_URL);
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined && params[key] !== null) {
        url.searchParams.append(key, params[key]);
      }
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url.toString(), { method: 'GET', signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('[API GET Error]', error);
      throw error;
    }
  },

  async post(payload = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(CONFIG.GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('[API POST Error]', error);
      throw error;
    }
  },

  // --- 共通・データ取得API ---
  async getStatus() {
    return await this.get({ action: 'getStatus' });
  },

  async getQuestions(room = '', difficulty = '') {
    const params = { action: 'getQuestions' };
    if (room) params.room = room;
    if (difficulty) params.difficulty = difficulty;
    return await this.get(params);
  },

  async getGroupResult(groupId) {
    return await this.get({ action: 'getGroupResult', groupId: groupId });
  },

  async getPendingResults() {
    return await this.get({ action: 'getPendingResults' });
  },

  // --- 端末ステータス更新 ---
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

  // --- クイズ回答送信 ---
  async submitAnswer(resultData) {
    return await this.post({
      action: 'submitAnswer',
      ...resultData
    });
  },

  // --- 入口進行・パイプラインシフト ---
  async advancePipeline(newGroupId, difficulty) {
    return await this.post({
      action: 'advancePipeline',
      newGroupId: newGroupId,
      difficulty: difficulty
    });
  },

  // --- 出口機専用API ---
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

  // --- 管理機専用API ---
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