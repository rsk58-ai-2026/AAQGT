/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/config.js - システム全体設定・定数マスタ
 */
const CONFIG = {
  // 1. Google Apps Script デプロイURL（環境に合わせて書き換えてください）
  GAS_API_URL: 'https://script.google.com/macros/s/AKfycbxaGKmaQs95UTnORqzx1qMW9TwhuJTslBFXrJCc3mFv9MWmaflwGrh_alEhoMa1S22Y-g/exec',

  // 2. 端末役割定義
  ROLES: {
    STAFF:    'staff',    // 付き添いスタッフ機 (スマホ専用)
    ENTRY:    'entry',    // 入口 / 進行受付モニタ機
    MANAGER:  'manager',  // 管理者機 (バックヤード統括)
    ROOM1:    'room1',    // 第1問 ブース機 [NODE 1 : ALPHA]
    ROOM2:    'room2',    // 第2問 ブース機 [NODE 2 : BETA]
    ROOM3:    'room3',    // 第3問 ブース機 [NODE 3 : CORE]
    SHOOTING: 'shooting', // 射撃フェーズ機
    EXIT:     'exit'      // 出口 / リザルト案内機
  },

  ROLE_NAMES: {
    staff:    '付き添いスタッフ機 [STAFF MOBILE]',
    entry:    '入口機 [GATEWAY // MONITOR]',
    manager:  '管理者機 [MASTER CONTROL // BACKYARD]',
    room1:    '第1問 ブース [NODE 1 : ALPHA]',
    room2:    '第2問 ブース [NODE 2 : BETA]',
    room3:    '第3問 ブース [NODE 3 : CORE]',
    shooting: '射撃フェーズ機 [SHOOTING RANGE]',
    exit:     '出口 / リザルト機 [TERMINAL]'
  },

  // 3. ブース番号マッピング
  ROOM_NUMBERS: {
    room1: 1,
    room2: 2,
    room3: 3
  },

  // 4. スコア配点テーブル & ボーナス
  SCORING: {
    EASY: 10,
    NORMAL: 20,
    HARD: 30,
    EX: 40,
    PERFECT_BONUS: 30
  },

  // 5. ルール種別定数
  PENALTY_RULES: {
    INSTANT_OUT: 'instant_out', // 誤答即アウト
    TIME_DEDUCT: 'time_deduct'  // 誤答時に制限時間ペナルティ減算
  },

  EX_CONDITIONS: {
    HARD_PERFECT:    'hard_perfect',    // Hard全問正解
    SCORE_THRESHOLD: 'score_threshold', // 合計スコア〇〇点以上
    DIFF_COUNT:      'diff_count'       // 指定難易度で△問正解
  },

  // 6. ペースコントロールシグナル
  PACE_SIGNALS: {
    NONE: 'none',
    WAIT: 'wait', // 進行待機（混雑等）
    PUSH: 'push'  // 巻き・進行促進
  },

  // 7. 通信・タイマー設定
  POLLING_INTERVAL_MS: 3000,    // ステータス監視（3秒）
  FETCH_TIMEOUT_MS: 10000,      // 通信タイムアウト（10秒）

  // 8. ローカルストレージキー名
  STORAGE_KEYS: {
    ROLE: 'festival_app_role',
    STAFF_DEVICE_ID: 'PROJAI_STAFF_DEVICE_ID',
    STAFF_ACTIVE_GROUP: 'PROJAI_STAFF_ACTIVE_GROUP',
    CURRENT_STATE: 'festival_app_current_state',
    CACHED_QUESTIONS: 'festival_app_cached_questions'
  }
};

Object.freeze(CONFIG);
Object.freeze(CONFIG.ROLES);
Object.freeze(CONFIG.ROLE_NAMES);
Object.freeze(CONFIG.ROOM_NUMBERS);
Object.freeze(CONFIG.SCORING);
Object.freeze(CONFIG.PENALTY_RULES);
Object.freeze(CONFIG.EX_CONDITIONS);
Object.freeze(CONFIG.PACE_SIGNALS);
Object.freeze(CONFIG.STORAGE_KEYS);
