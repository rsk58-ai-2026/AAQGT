/**
 * config.js - システム設定・定数定義
 */
const CONFIG = {
  // 1. Google Apps Script のデプロイURL
  GAS_API_URL: 'https://script.google.com/macros/s/AKfycbyT2HilVPYZHSvOQML-cJ5YH5tGmtNBJoyBSfut7PXn7QOxT6QeoDGMEpCjQVFX38j7/exec',

  // 2. 端末の役割定義 (計6種類)
  ROLES: {
    ENTRY:   'entry',   // 入口進行機
    MANAGER: 'manager', // 管理者機 (バックヤード統括)
    ROOM1:   'room1',   // 第1問機
    ROOM2:   'room2',   // 第2問機
    ROOM3:   'room3',   // 第3問機
    EXIT:    'exit'     // 出口・リザルト機
  },

  ROLE_NAMES: {
    entry:   '入口 / 進行機',
    manager: '管理者機 (バックヤード統括)',
    room1:   '第1問 ブース',
    room2:   '第2問 ブース',
    room3:   '第3問 ブース',
    exit:    '出口 / リザルト機'
  },

  // 3. ブース（問題機）の設定
  ROOM_NUMBERS: {
    room1: 1,
    room2: 2,
    room3: 3
  },

  // 4. 通信・ポーリング設定
  POLLING_INTERVAL_MS: 3000,    // status監視ポーリング間隔 (3秒)
  FETCH_TIMEOUT_MS: 10000,      // API通信タイムアウト (10秒)
  MAX_RETRY_COUNT: 2,           // 通信失敗時の最大リトライ回数

  // 5. ストレージキー名
  STORAGE_KEYS: {
    ROLE: 'festival_app_role',
    CURRENT_STATE: 'festival_app_current_state',
    CACHED_QUESTIONS: 'festival_app_cached_questions'
  }
};

Object.freeze(CONFIG);
Object.freeze(CONFIG.ROLES);
Object.freeze(CONFIG.ROLE_NAMES);
Object.freeze(CONFIG.ROOM_NUMBERS);
Object.freeze(CONFIG.STORAGE_KEYS);