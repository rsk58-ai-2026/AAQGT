/**
 * config.js - システム設定・定数定義
 */
const CONFIG = {
  // 1. Google Apps Script のデプロイURL
  // ※ステップ1でデプロイした「ウェブアプリのURL」をここに貼り付けてください
  GAS_API_URL: 'https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/exec',

  // 2. 端末の役割定義
  ROLES: {
    ENTRY: 'entry',   // 運営・入口機
    ROOM1: 'room1',   // 第1問機
    ROOM2: 'room2',   // 第2問機
    ROOM3: 'room3',   // 第3問機
    EXIT:  'exit'     // 出口・リザルト機
  },

  // 役割の日本語表示名
  ROLE_NAMES: {
    entry: '入口 / 運営管理機',
    room1: '第1問 ブース',
    room2: '第2問 ブース',
    room3: '第3問 ブース',
    exit:  '出口 / リザルト機'
  },

  // 3. ブース（問題機）の設定
  ROOM_NUMBERS: {
    room1: 1,
    room2: 2,
    room3: 3
  },

  // 4. 難易度別の制限時間（秒）
  TIME_LIMITS: {
    easy: 120,    // 簡単: 2分
    normal: 180,  // 普通: 3分
    hard: 240,    // 難しい: 4分
    ex: 300       // EXモード: 5分
  },

  // 5. 通信・ポーリング設定
  POLLING_INTERVAL_MS: 3000,    // status監視ポーリング間隔 (3秒)
  FETCH_TIMEOUT_MS: 10000,      // API通信タイムアウト (10秒)
  MAX_RETRY_COUNT: 2,           // 通信失敗時の最大リトライ回数

  // 6. ストレージキー名（localStorage用）
  STORAGE_KEYS: {
    ROLE: 'festival_app_role',
    CURRENT_STATE: 'festival_app_current_state',
    CACHED_QUESTIONS: 'festival_app_cached_questions'
  }
};

// オブジェクトを変更不可にする
Object.freeze(CONFIG);
Object.freeze(CONFIG.ROLES);
Object.freeze(CONFIG.ROLE_NAMES);
Object.freeze(CONFIG.ROOM_NUMBERS);
Object.freeze(CONFIG.TIME_LIMITS);
Object.freeze(CONFIG.STORAGE_KEYS);