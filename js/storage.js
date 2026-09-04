/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/storage.js - localStorageによる状態永続化・復旧マネージャー
 */
const AppStorage = {
  /**
   * 端末の役割（role）を保存
   * @param {string} role - CONFIG.ROLES のいずれか
   */
  setRole(role) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.ROLE, role);
    } catch (e) {
      console.warn('[AppStorage] LocalStorage is not available:', e);
    }
  },

  /**
   * 端末の役割（role）を取得
   * @returns {string|null}
   */
  getRole() {
    try {
      return localStorage.getItem(CONFIG.STORAGE_KEYS.ROLE);
    } catch (e) {
      console.warn('[AppStorage] LocalStorage is not available:', e);
      return null;
    }
  },

  /**
   * 端末の役割をリセット
   */
  clearRole() {
    try {
      localStorage.removeItem(CONFIG.STORAGE_KEYS.ROLE);
    } catch (e) {
      console.warn('[AppStorage] LocalStorage is not available:', e);
    }
  },

  /**
   * スタッフ端末固有ID (DEV-XX) の取得
   * @returns {string}
   */
  getStaffDeviceId() {
    try {
      let devId = localStorage.getItem(CONFIG.STORAGE_KEYS.STAFF_DEVICE_ID);
      if (!devId) {
        const randNum = Math.floor(10 + Math.random() * 90);
        devId = `DEV-${randNum}`;
        this.setStaffDeviceId(devId);
      }
      return devId;
    } catch (e) {
      return 'DEV-01';
    }
  },

  /**
   * スタッフ端末固有IDの保存
   * @param {string} devId
   */
  setStaffDeviceId(devId) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.STAFF_DEVICE_ID, String(devId).trim());
    } catch (e) {
      console.warn('[AppStorage] Failed to save staff device id:', e);
    }
  },

  /**
   * スタッフスマホの担当グループ情報を保存
   * @param {Object} groupData
   */
  saveStaffActiveGroup(groupData) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.STAFF_ACTIVE_GROUP, JSON.stringify(groupData));
    } catch (e) {
      console.warn('[AppStorage] Failed to save staff active group:', e);
    }
  },

  /**
   * スタッフスマホの担当グループ情報を取得
   * @returns {Object|null}
   */
  getStaffActiveGroup() {
    try {
      const data = localStorage.getItem(CONFIG.STORAGE_KEYS.STAFF_ACTIVE_GROUP);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.warn('[AppStorage] Failed to load staff active group:', e);
      return null;
    }
  },

  /**
   * スタッフスマホの担当グループ情報をクリア
   */
  clearStaffActiveGroup() {
    try {
      localStorage.removeItem(CONFIG.STORAGE_KEYS.STAFF_ACTIVE_GROUP);
    } catch (e) {
      console.warn('[AppStorage] Failed to clear staff active group:', e);
    }
  },

  /**
   * 現在の画面状態・進行コンテキストを保存
   * @param {Object} stateObj
   */
  saveCurrentState(stateObj) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.CURRENT_STATE, JSON.stringify(stateObj));
    } catch (e) {
      console.warn('[AppStorage] Failed to save current state:', e);
    }
  },

  /**
   * 現在の画面状態・進行コンテキストを復帰
   * @returns {Object|null}
   */
  getCurrentState() {
    try {
      const data = localStorage.getItem(CONFIG.STORAGE_KEYS.CURRENT_STATE);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.warn('[AppStorage] Failed to load current state:', e);
      return null;
    }
  },

  /**
   * 保存された進行状態をクリア
   */
  clearCurrentState() {
    try {
      localStorage.removeItem(CONFIG.STORAGE_KEYS.CURRENT_STATE);
    } catch (e) {
      console.warn('[AppStorage] Failed to clear current state:', e);
    }
  },

  /**
   * 問題データをローカルキャッシュに保存
   * @param {Array} questions
   */
  cacheQuestions(questions) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.CACHED_QUESTIONS, JSON.stringify(questions));
    } catch (e) {
      console.warn('[AppStorage] Failed to cache questions:', e);
    }
  },

  /**
   * キャッシュされた問題データを取得
   * @returns {Array|null}
   */
  getCachedQuestions() {
    try {
      const data = localStorage.getItem(CONFIG.STORAGE_KEYS.CACHED_QUESTIONS);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.warn('[AppStorage] Failed to load cached questions:', e);
      return null;
    }
  },

  /**
   * すべてのアプリデータを初期化
   */
  clearAll() {
    try {
      localStorage.removeItem(CONFIG.STORAGE_KEYS.ROLE);
      localStorage.removeItem(CONFIG.STORAGE_KEYS.STAFF_DEVICE_ID);
      localStorage.removeItem(CONFIG.STORAGE_KEYS.STAFF_ACTIVE_GROUP);
      localStorage.removeItem(CONFIG.STORAGE_KEYS.CURRENT_STATE);
      localStorage.removeItem(CONFIG.STORAGE_KEYS.CACHED_QUESTIONS);
    } catch (e) {
      console.warn('[AppStorage] Failed to clear all storage:', e);
    }
  }
};