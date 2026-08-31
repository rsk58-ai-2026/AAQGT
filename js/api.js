/**
 * api.js - 通信レイヤー
 */
const API = {
  async get(params = {}) {
    const url = new URL(CONFIG.GAS_API_URL);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

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

  async getQuestions(room = '', difficulty = '') {
    const params = { action: 'getQuestions' };
    if (room) params.room = room;
    if (difficulty) params.difficulty = difficulty;
    return await this.get(params);
  },

  async getStatus() {
    return await this.get({ action: 'getStatus' });
  },

  async getGroupResult(groupId) {
    return await this.get({ action: 'getGroupResult', groupId: groupId });
  },

  async updateRoomStatus(roomKey, status) {
    return await this.post({
      action: 'updateRoomStatus',
      roomKey: roomKey,
      status: status
    });
  },

  async reportLowBattery(roomKey, isLow) {
    return await this.post({
      action: 'reportLowBattery',
      roomKey: roomKey,
      lowBattery: isLow
    });
  },

  async submitAnswer(resultData) {
    return await this.post({
      action: 'submitAnswer',
      ...resultData
    });
  },

  async advancePipeline(newGroupId, difficulty, timeLimit) {
    return await this.post({
      action: 'advancePipeline',
      newGroupId: newGroupId,
      difficulty: difficulty,
      timeLimit: timeLimit
    });
  }
};
