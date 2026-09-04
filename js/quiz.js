/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * quiz.js - 問題機ブース端末（完全自律型・QRコードバトンリレー駆動）
 */
const QuizApp = {
  roomKey: null,
  roomNumber: 1,
  currentGroupId: null,
  currentDifficulty: 'normal',
  currentState: 'idle', // 'idle' | 'select-diff' | 'ready' | 'playing' | 'answered'

  cachedQuestions: [],
  currentQuestion: null,
  hintsRevealedCount: 0,
  timeLeft: 0,
  missCount: 0,
  timerInterval: null,

  // 30秒カウントダウン用（難易度選択）
  readyTimeLeft: 30,
  readyTimerInterval: null,

  // バトンデータ（前室からの引き継ぎ・蓄積データ）
  batonData: {
    groupId: '',
    difficulty: 'normal',
    fromRoom: 0,
    q1: null,
    q2: null,
    q3: null,
    totalScore: 0,
    totalMisses: 0,
    exQualified: false
  },

  // UI・制御フラグ
  isLowBattery: false,
  isEmergencyPaused: false,
  isInfoPaused: false,
  pendingJudgeResult: null,

  // スワイプ検知用（Room 1 EX用）
  touchStartY: 0,
  isExUnlocked: false,

  init() {
    const role = AppStorage.getRole();
    if (!role || !['room1', 'room2', 'room3'].includes(role)) return;

    this.roomKey = role;
    this.roomNumber = CONFIG.ROOM_NUMBERS[role];

    // CSSによるロール別DOM強制分離
    document.body.dataset.role = this.roomKey;

    const screen = document.getElementById('quiz-screen');
    if (screen) screen.classList.remove('hidden');

    const badge = document.getElementById('quiz-room-badge');
    if (badge) badge.textContent = CONFIG.ROLE_NAMES[role];

    // ① キャッシュファースト: ローカルストレージから問題を即時読込
    this.cachedQuestions = AppStorage.getCachedQuestions() || [];

    // ② 初期画面状態を描画
    this.renderState('idle');

    // イベントリスナーの登録
    this.setupExitListeners();
    this.setupMediaFullscreenModal();
    this.setupRoomSpecificEvents();

    // ③ バックグラウンドで最新問題データを更新（非同期）
    this.preloadQuestions();
  },

  setupExitListeners() {
    const notifyExit = () => {
      this.stopTimer();
      this.stopReadyTimer();
    };
    window.addEventListener('pagehide', notifyExit);
    window.addEventListener('beforeunload', notifyExit);
  },

  setupMediaFullscreenModal() {
    const modal = document.getElementById('media-fullscreen-modal');
    if (!modal) return;
    modal.addEventListener('click', () => {
      modal.classList.add('hidden');
      const container = document.getElementById('fullscreen-media-content');
      if (container) container.innerHTML = '';
    });
  },

  openMediaFullscreen(mediaUrl, isVideo = false) {
    const modal = document.getElementById('media-fullscreen-modal');
    const container = document.getElementById('fullscreen-media-content');
    if (!modal || !container) return;

    container.innerHTML = '';
    if (isVideo) {
      const video = document.createElement('video');
      video.src = mediaUrl;
      video.controls = true;
      video.autoplay = true;
      video.className = 'fullscreen-media-elem';
      container.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.src = mediaUrl;
      img.className = 'fullscreen-media-elem';
      container.appendChild(img);
    }
    modal.classList.remove('hidden');
  },

  setupRoomSpecificEvents() {
    // Room 1: 画面上スワイプ検知でEXモード記号を解放
    if (this.roomKey === 'room1') {
      const selectView = document.getElementById('quiz-view-select-diff');
      if (selectView) {
        selectView.addEventListener('touchstart', (e) => {
          this.touchStartY = e.touches[0].clientY;
        }, { passive: true });

        selectView.addEventListener('touchend', (e) => {
          const touchEndY = e.changedTouches[0].clientY;
          const deltaY = this.touchStartY - touchEndY;
          if (deltaY > 80) {
            this.unlockExSymbol();
          }
        }, { passive: true });
      }
    }
  },

  unlockExSymbol() {
    if (this.isExUnlocked) return;
    this.isExUnlocked = true;
    const exBtn = document.getElementById('btn-symbol-ex');
    if (exBtn) {
      exBtn.classList.remove('hidden');
      exBtn.classList.add('anim-slide-up');
      this.playStartupChime();
    }
  },

  /**
   * 問題データのローカル事前取得・更新
   */
  async preloadQuestions() {
    try {
      const res = await API.getQuestions(this.roomNumber);
      if (res && res.success && Array.isArray(res.questions) && res.questions.length > 0) {
        this.cachedQuestions = res.questions.map(q => ({
          ...q,
          id: String(q.id || '').trim(),
          difficulty: String(q.difficulty || '').trim().toLowerCase()
        }));
        AppStorage.cacheQuestions(this.cachedQuestions);
      }
    } catch (e) {
      console.warn('[QuizApp] 問題取得スキップ（既存キャッシュ利用）:', e);
      if (!this.cachedQuestions || this.cachedQuestions.length === 0) {
        this.cachedQuestions = AppStorage.getCachedQuestions() || [];
      }
    }
  },

  /**
   * 手動更新ボタン（問題マスタの強制再読込）
   */
  async manualSync() {
    const btn = document.getElementById('btn-manual-sync-quiz');
    if (btn) {
      btn.classList.add('is-syncing');
      btn.innerHTML = '<span class="material-symbols-outlined icon-sm icon-spin">sync</span> 更新中...';
    }

    this.playAudioTone(1200, 0.08, 'sine');
    await this.preloadQuestions();
    this.playAudioTone(1600, 0.12, 'triangle');

    setTimeout(() => {
      if (btn) {
        btn.classList.remove('is-syncing');
        btn.innerHTML = '<span class="material-symbols-outlined icon-sm">sync</span> 更新';
      }
    }, 400);
  },

  // ==========================================
  // 1. Room 1: スタート & 難易度選択
  // ==========================================

  /**
   * Room 1 ローカル採番（G-01, G-02...）
   */
  generateLocalGroupId() {
    const key = 'PROJAI_LOCAL_GROUP_SEQ';
    let current = parseInt(localStorage.getItem(key) || '0', 10);
    current++;
    localStorage.setItem(key, String(current));
    return 'G-' + String(current).padStart(2, '0');
  },

  handleRoom1Start() {
    this.playStartupChime();
    this.triggerCyberBurstFlash();

    this.currentGroupId = this.generateLocalGroupId();
    this.updateGroupBadge(this.currentGroupId);

    // バトンデータ初期化
    this.batonData = {
      groupId: this.currentGroupId,
      difficulty: 'normal',
      fromRoom: 1,
      q1: null,
      q2: null,
      q3: null,
      totalScore: 0,
      totalMisses: 0,
      exQualified: false
    };

    this.isExUnlocked = false;
    const exBtn = document.getElementById('btn-symbol-ex');
    if (exBtn) exBtn.classList.add('hidden');

    this.renderState('select-diff');
    this.startDifficultySelectTimer();
  },

  startDifficultySelectTimer() {
    this.readyTimeLeft = 30;
    this.updateDiffSelectTimerDisplay();
    this.stopReadyTimer();

    this.readyTimerInterval = setInterval(() => {
      if (this.isEmergencyPaused || this.isInfoPaused) return;

      this.readyTimeLeft--;
      this.updateDiffSelectTimerDisplay();

      if (this.readyTimeLeft <= 0) {
        this.stopReadyTimer();
        this.selectDifficultyAndStart('easy');
      }
    }, 1000);
  },

  stopReadyTimer() {
    if (this.readyTimerInterval) {
      clearInterval(this.readyTimerInterval);
      this.readyTimerInterval = null;
    }
  },

  updateDiffSelectTimerDisplay() {
    const elem = document.getElementById('diff-select-timer');
    if (elem) {
      elem.textContent = String(Math.max(0, this.readyTimeLeft)).padStart(2, '0');
    }
  },

  async selectDifficultyAndStart(diffSymbol) {
    this.stopReadyTimer();
    const cleanDiff = String(diffSymbol || 'easy').trim().toLowerCase();
    this.currentDifficulty = cleanDiff;
    this.batonData.difficulty = cleanDiff;

    this.playStartupChime();
    this.triggerCyberBurstFlash();

    // 出題問題の選定
    let candidates = this.cachedQuestions.filter(q => q.difficulty === cleanDiff);
    if (candidates.length === 0) {
      candidates = this.cachedQuestions;
    }

    if (candidates.length === 0) {
      // フォールバック用ダミー問題
      this.currentQuestion = {
        id: `Q${this.roomNumber}-01`,
        room: String(this.roomNumber),
        difficulty: cleanDiff,
        question_text: `AI中枢 第${this.roomNumber}防壁プロトコルを実行せよ。`,
        media_url: '',
        answer: 'PASS',
        hints: ['システム基本設定を確認してください。'],
        explanation: '標準認証手順です。'
      };
    } else {
      this.currentQuestion = candidates[Math.floor(Math.random() * candidates.length)];
    }

    this.startPlay(60);
  },

  // ==========================================
  // 2. Room 2 / Room 3: QRスキャン & データ受領
  // ==========================================

  openScanner() {
    QRSync.startScanner('qr-reader', (data) => {
      this.handleBatonReceived(data);
    });
  },

  openPasscodeInput() {
    QRSync.openPasscodeInput((data) => {
      this.handleBatonReceived(data);
    });
  },

  /**
   * 前室のQRコード / パスコードからデータを受領して0秒即時出題開始
   * @param {Object} data
   */
  handleBatonReceived(data) {
    if (!data || !data.groupId) {
      alert('無効なデータ形式です。');
      return;
    }

    this.batonData = {
      groupId: data.groupId,
      difficulty: data.difficulty || 'normal',
      fromRoom: this.roomNumber,
      q1: data.q1 || null,
      q2: data.q2 || null,
      q3: data.q3 || null,
      totalScore: data.totalScore || 0,
      totalMisses: data.totalMisses || 0,
      exQualified: !!data.exQualified
    };

    this.currentGroupId = this.batonData.groupId;
    this.currentDifficulty = this.batonData.difficulty;
    this.updateGroupBadge(this.currentGroupId);

    this.playStartupChime();
    this.triggerCyberBurstFlash();

    // 問題選定
    const cleanDiff = String(this.currentDifficulty).trim().toLowerCase();
    let candidates = this.cachedQuestions.filter(q => q.difficulty === cleanDiff);
    if (candidates.length === 0) {
      candidates = this.cachedQuestions;
    }

    if (candidates.length === 0) {
      this.currentQuestion = {
        id: `Q${this.roomNumber}-01`,
        room: String(this.roomNumber),
        difficulty: cleanDiff,
        question_text: `AI中枢 第${this.roomNumber}防壁プロトコルを実行せよ。`,
        media_url: '',
        answer: 'PASS',
        hints: ['システム基本設定を確認してください。'],
        explanation: '標準認証手順です。'
      };
    } else {
      this.currentQuestion = candidates[Math.floor(Math.random() * candidates.length)];
    }

    // 0秒で出題スタート
    this.startPlay(60);
  },

  // ==========================================
  // 3. 出題・攻略ステート (Playing) 共通処理
  // ==========================================

  startPlay(customTime = 60) {
    this.renderState('playing');
    this.hintsRevealedCount = 0;
    this.missCount = 0;
    this.updateMissCounterUI();

    this.renderQuestionData();

    this.timeLeft = Math.max(0, Math.floor(Number(customTime) || 60));
    this.startTimer();
  },

  renderQuestionData() {
    const diffTag = document.getElementById('current-diff-tag');
    if (diffTag) diffTag.textContent = String(this.currentDifficulty || '').toUpperCase();

    const qIdElem = document.getElementById('quiz-q-id');
    if (qIdElem) qIdElem.textContent = String(this.currentQuestion.id || '').trim();

    const qTextElem = document.getElementById('quiz-question-text');
    if (qTextElem) qTextElem.textContent = this.currentQuestion.question_text || '';

    const mediaContainer = document.getElementById('quiz-media-container');
    mediaContainer.innerHTML = '';
    const mediaUrl = String(this.currentQuestion.media_url || '').trim();

    if (mediaUrl) {
      mediaContainer.classList.remove('hidden');
      const isVideo = !!mediaUrl.match(/\.(mp4|webm|mov)$/i);

      if (isVideo) {
        const video = document.createElement('video');
        video.src = mediaUrl;
        video.controls = true;
        video.autoplay = true;
        video.className = 'quiz-media clickable-media';
        video.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openMediaFullscreen(mediaUrl, true);
        });
        mediaContainer.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.src = mediaUrl;
        img.className = 'quiz-media clickable-media';
        img.addEventListener('click', () => {
          this.openMediaFullscreen(mediaUrl, false);
        });
        mediaContainer.appendChild(img);
      }
    } else {
      mediaContainer.classList.add('hidden');
    }

    const hintList = document.getElementById('hint-list');
    hintList.innerHTML = '<div class="hint-empty">開示された解析ヒントはありません</div>';
    const hintBtn = document.getElementById('btn-next-hint');
    if (hintBtn) hintBtn.disabled = false;
  },

  revealNextHint() {
    if (!this.currentQuestion || !this.currentQuestion.hints) return;
    const totalHints = this.currentQuestion.hints.length;
    if (this.hintsRevealedCount >= totalHints) return;

    const hintList = document.getElementById('hint-list');
    if (this.hintsRevealedCount === 0) hintList.innerHTML = '';

    const nextHintText = this.currentQuestion.hints[this.hintsRevealedCount];
    this.hintsRevealedCount++;

    const hintItem = document.createElement('div');
    hintItem.className = 'hint-item';
    hintItem.innerHTML = `<span class="material-symbols-outlined icon-xs icon-gold">lightbulb</span> <strong>解析HINT ${this.hintsRevealedCount}:</strong> ${nextHintText}`;
    hintList.appendChild(hintItem);

    if (this.hintsRevealedCount >= totalHints) {
      const hintBtn = document.getElementById('btn-next-hint');
      if (hintBtn) hintBtn.disabled = true;
    }
  },

  handleWrongAttempt() {
    this.missCount++;
    this.updateMissCounterUI();
    this.triggerGlitchAlertEffect();
    this.playAudioTone(220, 0.25, 'sawtooth');
  },

  updateMissCounterUI() {
    const counter = document.getElementById('quiz-miss-counter');
    if (counter) counter.textContent = this.missCount;
  },

  triggerGlitchAlertEffect() {
    const playView = document.getElementById('quiz-view-play');
    if (playView) {
      playView.classList.add('effect-wrong-shock');
      setTimeout(() => playView.classList.remove('effect-wrong-shock'), 600);
    }
  },

  startTimer() {
    this.updateTimerDisplay();
    this.stopTimer();

    this.timerInterval = setInterval(() => {
      if (this.isEmergencyPaused || this.isInfoPaused) return;

      this.timeLeft--;
      this.updateTimerDisplay();

      if (this.timeLeft <= 0) {
        this.stopTimer();
        this.triggerCriticalBreachEffect();
      }
    }, 1000);
  },

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  },

  updateTimerDisplay() {
    const safeTime = Math.max(0, Math.floor(Number(this.timeLeft) || 0));
    const min = Math.floor(safeTime / 60);
    const sec = safeTime % 60;
    const formatted = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

    const timerElem = document.getElementById('quiz-timer');
    const timerBox = document.getElementById('timer-box');
    if (timerElem) timerElem.textContent = formatted;

    if (safeTime <= 15 && timerBox) {
      timerBox.classList.add('timer-warning');
    } else if (timerBox) {
      timerBox.classList.remove('timer-warning');
    }
  },

  async triggerCriticalBreachEffect() {
    this.playAudioTone(130, 0.8, 'square');
    const overlay = document.getElementById('effect-overlay-breach');
    if (overlay) {
      overlay.classList.remove('hidden');
      await new Promise(r => setTimeout(r, 2000));
      overlay.classList.add('hidden');
    }
    this.autoSubmitOnTimeUp();
  },

  autoSubmitOnTimeUp() {
    this.recordRoomAnswer(false, 0);
    this.renderState('answered');
  },

  openJudgeModal(isCorrect) {
    this.pendingJudgeResult = isCorrect;
    const modal = document.getElementById('judge-modal');
    const title = document.getElementById('judge-modal-title');
    const answer = document.getElementById('modal-correct-answer');
    const time = document.getElementById('modal-time-left');
    const miss = document.getElementById('modal-miss-count');

    if (isCorrect) {
      title.innerHTML = '<span class="material-symbols-outlined icon-md text-success">check_circle</span> 正解として記録';
      title.style.color = 'var(--signal-green)';
    } else {
      title.innerHTML = '<span class="material-symbols-outlined icon-md text-danger">cancel</span> 終了 / 不正解として記録';
      title.style.color = 'var(--signal-red)';
    }

    answer.textContent = this.currentQuestion ? (this.currentQuestion.answer || '--') : '--';
    time.textContent = Math.max(0, Math.floor(Number(this.timeLeft) || 0));
    if (miss) miss.textContent = this.missCount;

    modal.classList.remove('hidden');
  },

  closeJudgeModal() {
    document.getElementById('judge-modal').classList.add('hidden');
    this.pendingJudgeResult = null;
  },

  async confirmAnswer() {
    if (this.pendingJudgeResult === null) return;

    this.stopTimer();
    const isCorrect = this.pendingJudgeResult;

    if (isCorrect) {
      this.playAudioTone(880, 0.4, 'sine');
      const overlay = document.getElementById('effect-overlay-purged');
      if (overlay) {
        overlay.classList.remove('hidden');
        await new Promise(r => setTimeout(r, 1600));
        overlay.classList.add('hidden');
      }
    }

    const safeTimeLeft = Math.max(0, Math.floor(Number(this.timeLeft) || 0));
    this.recordRoomAnswer(isCorrect, safeTimeLeft);

    this.closeJudgeModal();
    this.renderState('answered');
  },

  /**
   * 自室の解答結果をバトンデータに統合・蓄積
   */
  recordRoomAnswer(isCorrect, safeTimeLeft) {
    const qResult = {
      id: this.currentQuestion ? String(this.currentQuestion.id || '') : `Q${this.roomNumber}-01`,
      diff: this.currentDifficulty,
      ok: isCorrect,
      t: safeTimeLeft,
      m: this.missCount
    };

    if (this.roomNumber === 1) {
      this.batonData.q1 = qResult;
    } else if (this.roomNumber === 2) {
      this.batonData.q2 = qResult;
    } else if (this.roomNumber === 3) {
      this.batonData.q3 = qResult;
    }

    this.batonData.fromRoom = this.roomNumber;

    // スコア計算
    let totalScore = 0;
    let totalMiss = 0;

    const calcQScore = (q) => {
      if (!q || !q.ok) return 0;
      switch (String(q.diff).toLowerCase()) {
        case 'easy': return 10;
        case 'normal': return 20;
        case 'hard': return 30;
        case 'ex': return 40;
        default: return 20;
      }
    };

    if (this.batonData.q1) {
      totalScore += calcQScore(this.batonData.q1);
      totalMiss += this.batonData.q1.m;
    }
    if (this.batonData.q2) {
      totalScore += calcQScore(this.batonData.q2);
      totalMiss += this.batonData.q2.m;
    }
    if (this.batonData.q3) {
      totalScore += calcQScore(this.batonData.q3);
      totalMiss += this.batonData.q3.m;
    }

    // パーフェクトボーナス (+30)
    if (this.batonData.q1 && this.batonData.q1.ok &&
        this.batonData.q2 && this.batonData.q2.ok &&
        this.batonData.q3 && this.batonData.q3.ok) {
      totalScore += 30;
    }

    // EX判定
    const isExQualified = (
      this.batonData.q1 && this.batonData.q1.diff === 'hard' && this.batonData.q1.ok &&
      this.batonData.q2 && this.batonData.q2.diff === 'hard' && this.batonData.q2.ok &&
      this.batonData.q3 && this.batonData.q3.diff === 'hard' && this.batonData.q3.ok
    );

    this.batonData.totalScore = totalScore;
    this.batonData.totalMisses = totalMiss;
    this.batonData.exQualified = isExQualified;
  },

  // ==========================================
  // 4. 解答後ステート (Answered): QRコード生成表示
  // ==========================================

  renderAnsweredViewDetails() {
    // QRコード生成 & 4桁パスコード取得
    const passcode = QRSync.generateQRCode('qr-code-output', this.batonData);

    const passcodeElem = document.getElementById('backup-passcode-display');
    if (passcodeElem) {
      passcodeElem.textContent = passcode || '----';
    }
  },

  /**
   * 「次のお客様へ（初期画面に戻る）」ボタン押下時
   */
  resetToIdle() {
    this.stopTimer();
    this.stopReadyTimer();
    this.currentGroupId = null;
    this.currentQuestion = null;
    this.renderState('idle');
  },

  // ==========================================
  // 5. 画面ステート切り替え描画
  // ==========================================

  renderState(state) {
    this.currentState = state;

    const views = {
      room1Start: document.getElementById('quiz-view-room1-start'),
      glitchStandby: document.getElementById('quiz-view-glitch-standby'),
      selectDiff: document.getElementById('quiz-view-select-diff'),
      ready: document.getElementById('quiz-view-ready'),
      play: document.getElementById('quiz-view-play'),
      answered: document.getElementById('quiz-view-answered')
    };

    Object.values(views).forEach(v => {
      if (v) v.classList.add('hidden');
    });

    if (state === 'idle') {
      if (this.roomKey === 'room1') {
        if (views.room1Start) views.room1Start.classList.remove('hidden');
      } else {
        if (views.glitchStandby) views.glitchStandby.classList.remove('hidden');
      }
      this.updateGroupBadge('--');
    } else if (state === 'select-diff') {
      if (this.roomKey === 'room1' && views.selectDiff) {
        views.selectDiff.classList.remove('hidden');
      }
    } else if (state === 'playing') {
      if (views.play) views.play.classList.remove('hidden');
    } else if (state === 'answered') {
      if (views.answered) {
        views.answered.classList.remove('hidden');
        this.renderAnsweredViewDetails();
      }
    }
  },

  updateGroupBadge(groupId) {
    const badge = document.getElementById('quiz-group-badge');
    if (badge) badge.textContent = groupId ? `GROUP: ${groupId}` : '--';
  },

  async toggleBatteryAlert() {
    this.isLowBattery = !this.isLowBattery;
    const btn = document.getElementById('btn-battery-quiz');
    if (btn) {
      btn.classList.toggle('active', this.isLowBattery);
      btn.innerHTML = this.isLowBattery
        ? '<span class="material-symbols-outlined icon-sm">battery_alert</span> 給電要請'
        : '<span class="material-symbols-outlined icon-sm">battery_alert</span> 給電';
    }
  },

  // ==========================================
  // サウンド & サイバー視覚演出ヘルパー
  // ==========================================

  playAudioTone(freq, duration, type = 'sine') {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  },

  playStartupChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1320, now);
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.08);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1760, now + 0.09);
      gain2.gain.setValueAtTime(0.25, now + 0.09);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.09);
      osc2.stop(now + 0.22);
    } catch (e) {
      this.playAudioTone(1500, 0.15, 'sine');
    }
  },

  triggerCyberBurstFlash() {
    document.body.classList.remove('cyber-burst-active');
    void document.body.offsetWidth;
    document.body.classList.add('cyber-burst-active');
    setTimeout(() => {
      document.body.classList.remove('cyber-burst-active');
    }, 450);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  QuizApp.init();
});