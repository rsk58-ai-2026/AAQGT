/**
 * api.js - GAS Web App通信レイヤー
 */
const API = {
  /**
   * 共通Fetchラッパー（GET）
   */
  async get(params = {}) {
    const url = new URL(CONFIG.GAS_API_URL);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('[API GET Error]', error);
      throw error;
    }
  },

  /**
   * 共通Fetchラッパー（POST）
   * ※GASのCORSプリフライトを回避するため text/plain でJSON文字列を送信
   */
  async post(payload = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(CONFIG.GAS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('[API POST Error]', error);
      throw error;
    }
  },

  // ==========================================
  // 個別APIメソッド
  // ==========================================

  /**
   * 問題一覧を取得
   * @param {string|number} room - 1 | 2 | 3 | 'ex' (省略可)
   * @param {string} difficulty - 'easy' | 'normal' | 'hard' | 'ex' (省略可)
   */
  async getQuestions(room = '', difficulty = '') {
    const params = { action: 'getQuestions' };
    if (room) params.room = room;
    if (difficulty) params.difficulty = difficulty;
    return await this.get(params);
  },

  /**
   * 全端末のリアルタイム状態（status）を取得
   */
  async getStatus() {
    return await this.get({ action: 'getStatus' });
  },

  /**
   * 特定グループのリザルトデータを取得（出口機用）
   * @param {string} groupId
   */
  async getGroupResult(groupId) {
    return await this.get({ action: 'getGroupResult', groupId: groupId });
  },

  /**
   * 端末のステータス（待機中 / プレイ中）を更新
   * @param {string} roomKey - 'room1' | 'room2' | 'room3' | 'exit'
   * @param {string} status - 'ready' | 'playing'
   */
  async updateRoomStatus(roomKey, status) {
    return await this.post({
      action: 'updateRoomStatus',
      roomKey: roomKey,
      status: status
    });
  },

  /**
   * 解答結果を送信して記録
   * @param {Object} resultData
   * @param {string} resultData.groupId
   * @param {number} resultData.roomNumber - 1 | 2 | 3
   * @param {string} resultData.difficulty - 'easy' | 'normal' | 'hard' | 'ex'
   * @param {string} resultData.questionId
   * @param {boolean} resultData.isCorrect
   * @param {number} resultData.timeLeft
   */
  async submitAnswer(resultData) {
    return await this.post({
      action: 'submitAnswer',
      ...resultData
    });
  },

  /**
   * 入口機から「次へ進行」を実行（パイプラインシフト）
   * @param {string} newGroupId - 新しくroom1に入るグループID
   * @param {boolean} isExMode - EXモードでの突入フラグ
   */
  async advancePipeline(newGroupId, isExMode = false) {
    return await this.post({
      action: 'advancePipeline',
      newGroupId: newGroupId,
      isExMode: isExMode
    });
  }
};