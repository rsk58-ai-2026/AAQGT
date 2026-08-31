/**
 * storage.js - localStorageによる状態永続化・復旧マネージャー
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
      console.warn('LocalStorage is not available:', e);
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
      console.warn('LocalStorage is not available:', e);
      return null;
    }
  },

  /**
   * 端末の役割をリセット（役割選択画面に戻す場合など）
   */
  clearRole() {
    try {
      localStorage.removeItem(CONFIG.STORAGE_KEYS.ROLE);
    } catch (e) {
      console.warn('LocalStorage is not available:', e);
    }
  },

  /**
   * 現在の画面状態・進行コンテキストを保存
   * （プレイ中の問題ID、選択難易度、残り時間などのクラッシュ保護用）
   * @param {Object} stateObj
   */
  saveCurrentState(stateObj) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.CURRENT_STATE, JSON.stringify(stateObj));
    } catch (e) {
      console.warn('Failed to save state to localStorage:', e);
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
      console.warn('Failed to load state from localStorage:', e);
      return null;
    }
  },

  /**
   * 保存された進行状態をクリア（問題終了時や進行時に呼ぶ）
   */
  clearCurrentState() {
    try {
      localStorage.removeItem(CONFIG.STORAGE_KEYS.CURRENT_STATE);
    } catch (e) {
      console.warn('Failed to clear state:', e);
    }
  },

  /**
   * 問題データをローカルキャッシュに保存（オフライン耐性・高速化）
   * @param {Array} questions
   */
  cacheQuestions(questions) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.CACHED_QUESTIONS, JSON.stringify(questions));
    } catch (e) {
      console.warn('Failed to cache questions:', e);
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
      console.warn('Failed to load cached questions:', e);
      return null;
    }
  },

  /**
   * すべてのアプリデータを初期化
   */
  clearAll() {
    try {
      localStorage.removeItem(CONFIG.STORAGE_KEYS.ROLE);
      localStorage.removeItem(CONFIG.STORAGE_KEYS.CURRENT_STATE);
      localStorage.removeItem(CONFIG.STORAGE_KEYS.CACHED_QUESTIONS);
    } catch (e) {
      console.warn('Failed to clear all storage:', e);
    }
  }
};