/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * quiz.js - 問題機ブース端末（自律分散ステートマシン）
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

  // 30秒カウントダウン用（Readyおよび難易度選択）
  readyTimeLeft: 30,
  readyTimerInterval: null,

  // Room 3 解答後 30秒自動スタンバイ復帰タイマー
  room3AutoResetTimer: null,
  room3AutoResetTimeLeft: 30,

  // UI・通信フラグ
  isLowBattery: false,
  isEmergencyPaused: false,
  isInfoPaused: false,
  pollingTimer: null,
  pendingJudgeResult: null,

  // スワイプ検知用（Room1 EX用）
  touchStartY: 0,
  isExUnlocked: false,

  async init() {
    const role = AppStorage.getRole();
    if (!role || !['room1', 'room2', 'room3'].includes(role)) return;

    this.roomKey = role;
    this.roomNumber = CONFIG.ROOM_NUMBERS[role];

    // CSSによるロール別DOM強制分離のためにdataset.roleを設定
    document.body.dataset.role = this.roomKey;

    const screen = document.getElementById('quiz-screen');
    if (screen) screen.classList.remove('hidden');

    const badge = document.getElementById('quiz-room-badge');
    if (badge) badge.textContent = CONFIG.ROLE_NAMES[role];

    this.setupExitListeners();
    this.setupMediaFullscreenModal();
    this.setupRoomSpecificEvents();

    await this.preloadQuestions();

    // 画面初期状態を描画 (各部屋に応じたidle画面を表示)
    this.renderState('idle');
    this.startPolling();
  },

  setupExitListeners() {
    const notifyExit = () => {
      this.stopRoom3AutoResetCountdown();
      const payload = JSON.stringify({
        action: 'updateRoomStatus',
        roomKey: this.roomKey,
        status: 'idle'
      });
      if (navigator.sendBeacon) navigator.sendBeacon(CONFIG.GAS_API_URL, payload);
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
    // Room1: 画面上スワイプ検知でEXモード記号を露出
    if (this.roomKey === 'room1') {
      const selectView = document.getElementById('quiz-view-select-diff');
      if (selectView) {
        selectView.addEventListener('touchstart', (e) => {
          this.touchStartY = e.touches[0].clientY;
        }, { passive: true });

        selectView.addEventListener('touchend', (e) => {
          const touchEndY = e.changedTouches[0].clientY;
          const deltaY = this.touchStartY - touchEndY;
          // Y軸上方へ80px以上の強い上スワイプを検知
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

  async preloadQuestions() {
    try {
      const res = await API.getQuestions(this.roomNumber);
      if (res && res.success) {
        this.cachedQuestions = res.questions;
        AppStorage.cacheQuestions(this.cachedQuestions);
      }
    } catch (e) {
      this.cachedQuestions = AppStorage.getCachedQuestions() || [];
    }
  },

  startPolling() {
    this.checkStatus();
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = setInterval(() => this.checkStatus(), CONFIG.POLLING_INTERVAL_MS);
  },

  async checkStatus() {
    try {
      const res = await API.getStatus();
      if (!res || !res.success) return;

      // 1. 緊急一時停止の監視
      const pauseOverlay = document.getElementById('pause-lock-overlay');
      if (res.systemPaused) {
        if (!this.isEmergencyPaused) {
          this.isEmergencyPaused = true;
          this.stopTimer();
          this.stopReadyTimer();
          this.stopRoom3AutoResetCountdown();
          if (pauseOverlay) pauseOverlay.classList.remove('hidden');
        }
        return;
      } else {
        if (this.isEmergencyPaused) {
          this.isEmergencyPaused = false;
          if (pauseOverlay) pauseOverlay.classList.add('hidden');
          if (this.currentState === 'playing' && this.timeLeft > 0) this.startTimer();
          if (this.currentState === 'ready' && this.readyTimeLeft > 0) this.startReadyTimer();
        }
      }

      // 2. 機材調整待機（Info Pause）の監視
      const infoPauseOverlay = document.getElementById('info-pause-overlay');
      if (res.infoPaused) {
        if (!this.isInfoPaused) {
          this.isInfoPaused = true;
          this.stopTimer();
          this.stopReadyTimer();
          this.stopRoom3AutoResetCountdown();
          if (infoPauseOverlay) infoPauseOverlay.classList.remove('hidden');
        }
        return;
      } else {
        if (this.isInfoPaused) {
          this.isInfoPaused = false;
          if (infoPauseOverlay) infoPauseOverlay.classList.add('hidden');
          if (this.currentState === 'playing' && this.timeLeft > 0) this.startTimer();
          if (this.currentState === 'ready' && this.readyTimeLeft > 0) this.startReadyTimer();
        }
      }

      // 3. 自律分散ステートマシンの同期処理
      const myData = res.statuses[this.roomKey];
      if (!myData) return;

      if (this.roomKey === 'room1') {
        this.syncStateRoom1(myData, res.statuses);
      } else if (this.roomKey === 'room2') {
        this.syncStateRoom2(myData, res.statuses);
      } else if (this.roomKey === 'room3') {
        this.syncStateRoom3(myData, res.statuses);
      }
    } catch (e) {
      console.warn('Polling check error:', e);
    }
  },

  // ==========================================
  // Room 1 固有ステートマシン (前室攻略中待機連動)
  // ==========================================

  syncStateRoom1(myData, allStatuses) {
    const serverStatus = myData.status;

    // Room 1 が answered 状態の時: Room 2の状況を監視
    if (this.currentState === 'answered') {
      const room2 = allStatuses.room2 || {};
      const room2Status = room2.status || 'idle';
      const room2Group = room2.groupId || '';

      // Room 2が自グループでplayingになったら、客が移動完了したためRoom 1をidleへリセット
      if (room2Status === 'playing' && room2Group === this.currentGroupId) {
        this.currentGroupId = null;
        this.renderState('idle');
        return;
      }

      const waitNotice = document.getElementById('quiz-view-answered-wait');
      const moveNotice = document.getElementById('quiz-view-answered-move');
      const waitTarget = document.getElementById('answered-wait-target-node');
      if (waitTarget) waitTarget.textContent = 'NODE 2 [BETA]';

      // Room 2が他のお客様で攻略中の場合は待機画面、そうでなければ進行案内
      if (room2Status === 'playing' && room2Group !== this.currentGroupId) {
        if (waitNotice) waitNotice.classList.remove('hidden');
        if (moveNotice) moveNotice.classList.add('hidden');
      } else {
        if (waitNotice) waitNotice.classList.add('hidden');
        if (moveNotice) moveNotice.classList.remove('hidden');
      }
    }

    if (serverStatus === 'idle' && this.currentState !== 'idle') {
      this.currentGroupId = null;
      this.renderState('idle');
    }
  },

  /**
   * Room 1: STARTボタン押下時 (即時フィードバック & ローディング演出)
   */
  async handleRoom1Start() {
    const btn = document.getElementById('btn-room1-start');
    if (!btn || btn.classList.contains('is-loading')) return;

    this.playStartupChime();
    this.triggerCyberBurstFlash();

    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.innerHTML = `
      <span class="giant-start-icon material-symbols-outlined icon-spin">sync</span>
      <span class="giant-start-text">CONNECTING...</span>
    `;

    try {
      const res = await API.startRoom1();
      if (res && res.success) {
        this.currentGroupId = res.groupId;
        this.updateGroupBadge(this.currentGroupId);
        this.isExUnlocked = false;

        const exBtn = document.getElementById('btn-symbol-ex');
        if (exBtn) exBtn.classList.add('hidden');

        // 難易度選択ステートへ遷移
        this.renderState('select-diff');
        this.startDifficultySelectTimer();
      } else {
        alert(res.error || '開始処理に失敗しました');
        this.resetRoom1StartButton();
      }
    } catch (e) {
      alert('通信エラーが発生しました。再度お試しください。');
      this.resetRoom1StartButton();
    }
  },

  resetRoom1StartButton() {
    const btn = document.getElementById('btn-room1-start');
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('is-loading');
      btn.innerHTML = `
        <span class="giant-start-icon material-symbols-outlined">power_settings_new</span>
        <span class="giant-start-text">MISSION START</span>
      `;
    }
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
        // 30秒超過時は「簡単（▲ / easy）」を自動決定
        this.selectDifficultyAndStart('easy', true);
      }
    }, 1000);
  },

  updateDiffSelectTimerDisplay() {
    const elem = document.getElementById('diff-select-timer');
    if (elem) {
      elem.textContent = String(this.readyTimeLeft).padStart(2, '0');
    }
  },

  async selectDifficultyAndStart(diffSymbol, isAuto = false) {
    this.stopReadyTimer();
    this.currentDifficulty = diffSymbol;

    const confirmBtn = document.getElementById('btn-confirm-diff');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.classList.add('is-loading');
      confirmBtn.innerHTML = '<span class="material-symbols-outlined icon-md icon-spin">sync</span> 展開中...';
      this.playStartupChime();
    }

    // 問題選定
    let candidates = this.cachedQuestions.filter(q => q.difficulty === diffSymbol);
    if (diffSymbol === 'ex' && candidates.length === 0) {
      try {
        const exRes = await API.getQuestions('ex', 'ex');
        candidates = exRes.questions;
      } catch (e) {}
    }

    if (candidates.length === 0) {
      alert(`該当する問題データが存在しません [${diffSymbol}]`);
      this.resetConfirmDiffButton();
      this.renderState('idle');
      return;
    }

    this.currentQuestion = candidates[Math.floor(Math.random() * candidates.length)];

    try {
      await API.confirmRoom1Difficulty(diffSymbol, this.currentQuestion.id);
      this.startPlay();
    } catch (e) {
      alert('難易度確定の通信に失敗しました。');
      this.resetConfirmDiffButton();
      this.renderState('idle');
    }
  },

  resetConfirmDiffButton() {
    const confirmBtn = document.getElementById('btn-confirm-diff');
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.classList.remove('is-loading');
      confirmBtn.innerHTML = '<span class="material-symbols-outlined icon-md">play_arrow</span> 決定して開始';
    }
  },

  // ==========================================
  // Room 2 固有ステートマシン
  // ==========================================

  syncStateRoom2(myData, allStatuses) {
    const serverStatus = myData.status;

    // 1. Idle状態: 前部屋(room1)からの信号待ち (グリッチ待機画面)
    if (serverStatus === 'idle' && this.currentState !== 'idle') {
      this.currentGroupId = null;
      this.renderState('idle');
      return;
    }

    // 2. Ready状態: Room1からバトンを受け取った
    if (serverStatus === 'ready' && this.currentState !== 'ready') {
      this.currentGroupId = myData.groupId;
      this.currentDifficulty = myData.difficulty || 'normal';
      this.updateGroupBadge(this.currentGroupId);

      this.renderState('ready');
      this.startReadyCountdown(myData.timeLimit || 60);
      return;
    }

    // 3. Answered状態: Room3の状態を監視して案内表示を切り替え
    if (this.currentState === 'answered') {
      const room3 = allStatuses.room3 || {};
      const room3Status = room3.status || 'idle';
      const room3Group = room3.groupId || '';

      // Room 3が自グループで攻略中(playing)になったら、自身はidleへリセット
      if (room3Status === 'playing' && room3Group === this.currentGroupId) {
        this.currentGroupId = null;
        this.renderState('idle');
        return;
      }

      const waitNotice = document.getElementById('quiz-view-answered-wait');
      const moveNotice = document.getElementById('quiz-view-answered-move');
      const waitTarget = document.getElementById('answered-wait-target-node');
      if (waitTarget) waitTarget.textContent = 'NODE 3 [CORE]';

      if (room3Status === 'playing' && room3Group !== this.currentGroupId) {
        if (waitNotice) waitNotice.classList.remove('hidden');
        if (moveNotice) moveNotice.classList.add('hidden');
      } else {
        if (waitNotice) waitNotice.classList.add('hidden');
        if (moveNotice) moveNotice.classList.remove('hidden');
      }
    }
  },

  // ==========================================
  // Room 3 固有ステートマシン
  // ==========================================

  syncStateRoom3(myData, allStatuses) {
    const serverStatus = myData.status;

    // 次のグループからReadyを受信した場合は、30秒自動リセットタイマーを即座に破棄してReadyへ遷移
    if (serverStatus === 'ready' && this.currentState !== 'ready') {
      this.stopRoom3AutoResetCountdown();
      this.currentGroupId = myData.groupId;
      this.currentDifficulty = myData.difficulty || 'normal';
      this.updateGroupBadge(this.currentGroupId);

      this.renderState('ready');
      this.startReadyCountdown(myData.timeLimit || 60);
      return;
    }

    if (serverStatus === 'idle' && this.currentState !== 'idle') {
      this.stopRoom3AutoResetCountdown();
      this.currentGroupId = null;
      this.renderState('idle');
    }
  },

  // ==========================================
  // Room 3 解答後 30秒自動スタンバイ復帰 & 手動復帰処理
  // ==========================================

  startRoom3AutoResetCountdown() {
    this.stopRoom3AutoResetCountdown();
    this.room3AutoResetTimeLeft = 30;

    const noticeElem = document.getElementById('room3-auto-reset-notice');
    const timerElem = document.getElementById('room3-reset-timer-val');

    if (noticeElem) noticeElem.classList.remove('hidden');
    if (timerElem) timerElem.textContent = this.room3AutoResetTimeLeft;

    this.room3AutoResetTimer = setInterval(async () => {
      if (this.isEmergencyPaused || this.isInfoPaused) return;

      this.room3AutoResetTimeLeft--;
      if (timerElem) timerElem.textContent = Math.max(0, this.room3AutoResetTimeLeft);

      if (this.room3AutoResetTimeLeft <= 0) {
        this.stopRoom3AutoResetCountdown();

        // 30秒経過: 自身をidle（サイバーグリッチ待機）へリセット
        this.currentGroupId = null;
        this.renderState('idle');

        // サーバー（GAS）へもidle通知を送信して空室同期
        try {
          await API.updateRoomStatus(this.roomKey, 'idle');
        } catch (e) {
          console.warn('Room3 auto-reset status update error:', e);
        }
      }
    }, 1000);
  },

  stopRoom3AutoResetCountdown() {
    if (this.room3AutoResetTimer) {
      clearInterval(this.room3AutoResetTimer);
      this.room3AutoResetTimer = null;
    }
    const noticeElem = document.getElementById('room3-auto-reset-notice');
    if (noticeElem) noticeElem.classList.add('hidden');
  },

  /**
   * Room 3: 手動で即座に待機画面（idle）へ戻す処理
   */
  async handleRoom3ManualReset() {
    this.stopRoom3AutoResetCountdown();
    this.currentGroupId = null;
    this.renderState('idle');

    try {
      await API.updateRoomStatus(this.roomKey, 'idle');
    } catch (e) {
      console.warn('Room3 manual reset status update error:', e);
    }
  },

  // ==========================================
  // Room 2 / Room 3 共通: 30秒カウントダウン (Ready)
  // ==========================================

  startReadyCountdown(customTimeLimit) {
    this.readyTimeLeft = 30;
    this.updateReadySevenSegment(this.readyTimeLeft);
    this.stopReadyTimer();
    this.resetReadyStartButton();

    this.readyTimerInterval = setInterval(() => {
      if (this.isEmergencyPaused || this.isInfoPaused) return;

      this.readyTimeLeft--;
      this.updateReadySevenSegment(this.readyTimeLeft);

      if (this.readyTimeLeft <= 0) {
        this.stopReadyTimer();
        this.confirmStartPlaying(customTimeLimit);
      }
    }, 1000);
  },

  stopReadyTimer() {
    if (this.readyTimerInterval) {
      clearInterval(this.readyTimerInterval);
      this.readyTimerInterval = null;
    }
  },

  updateReadySevenSegment(sec) {
    const elem = document.getElementById('ready-seven-segment');
    if (elem) {
      elem.textContent = String(Math.max(0, sec)).padStart(2, '0');
    }
  },

  async confirmStartPlaying(customTimeLimit = 60) {
    this.stopReadyTimer();

    this.playStartupChime();
    this.triggerCyberBurstFlash();

    const readyBtn = document.querySelector('.btn-ready-start');
    if (readyBtn) {
      readyBtn.disabled = true;
      readyBtn.classList.add('is-loading');
      readyBtn.innerHTML = '<span class="material-symbols-outlined icon-lg icon-spin">sync</span> 起動中...';
    }

    // 出題問題の選定
    let candidates = this.cachedQuestions.filter(q => q.difficulty === this.currentDifficulty);
    if (candidates.length === 0) {
      candidates = this.cachedQuestions;
    }
    if (candidates.length === 0) {
      alert('出題可能な問題データが見つかりません');
      this.resetReadyStartButton();
      this.renderState('idle');
      return;
    }

    this.currentQuestion = candidates[Math.floor(Math.random() * candidates.length)];

    try {
      await API.startRoomPlaying(this.roomKey, this.currentQuestion.id);
      this.startPlay(customTimeLimit);
    } catch (e) {
      alert('攻略開始の同期に失敗しました。');
      this.resetReadyStartButton();
    }
  },

  resetReadyStartButton() {
    const readyBtn = document.querySelector('.btn-ready-start');
    if (readyBtn) {
      readyBtn.disabled = false;
      readyBtn.classList.remove('is-loading');
      readyBtn.innerHTML = '<span class="material-symbols-outlined icon-lg">play_circle</span> 開始 (START)';
    }
  },

  // ==========================================
  // 出題・攻略ステート (Playing) 共通処理
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
    if (diffTag) diffTag.textContent = this.currentDifficulty.toUpperCase();

    const qIdElem = document.getElementById('quiz-q-id');
    if (qIdElem) qIdElem.textContent = this.currentQuestion.id;

    const qTextElem = document.getElementById('quiz-question-text');
    if (qTextElem) qTextElem.textContent = this.currentQuestion.question_text;

    const mediaContainer = document.getElementById('quiz-media-container');
    mediaContainer.innerHTML = '';
    const mediaUrl = this.currentQuestion.media_url;

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

  async autoSubmitOnTimeUp() {
    const safeTime = 0; // 時間切れのため確実に0
    const payload = {
      groupId: this.currentGroupId,
      roomNumber: this.roomNumber,
      difficulty: this.currentDifficulty,
      questionId: this.currentQuestion ? this.currentQuestion.id : 'TIMEUP',
      isCorrect: false,
      timeLeft: safeTime,
      missCount: this.missCount
    };

    try {
      await API.submitRoomAnswer(payload);
    } catch (e) {}

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
    const submitBtn = document.getElementById('btn-confirm-judge');
    submitBtn.disabled = true;

    if (isCorrect) {
      this.playAudioTone(880, 0.4, 'sine');
      const overlay = document.getElementById('effect-overlay-purged');
      if (overlay) {
        overlay.classList.remove('hidden');
        await new Promise(r => setTimeout(r, 1600));
        overlay.classList.add('hidden');
      }
    }

    // 残り秒数を0以上の整数に補正して負数バグを完全防止
    const safeTimeLeft = Math.max(0, Math.floor(Number(this.timeLeft) || 0));

    const payload = {
      groupId: this.currentGroupId,
      roomNumber: this.roomNumber,
      difficulty: this.currentDifficulty,
      questionId: this.currentQuestion ? this.currentQuestion.id : '',
      isCorrect: isCorrect,
      timeLeft: safeTimeLeft,
      missCount: this.missCount
    };

    try {
      const res = await API.submitRoomAnswer(payload);
      if (res && res.success) {
        this.closeJudgeModal();
        this.renderState('answered');
      } else {
        alert('解答の記録に失敗しました。');
      }
    } catch (e) {
      alert('通信エラーが発生しました。再度送信をお試しください。');
    } finally {
      submitBtn.disabled = false;
    }
  },

  // ==========================================
  // 画面ステート切り替え描画 (完全分離ガード)
  // ==========================================

  renderState(state) {
    this.currentState = state;

    if (state !== 'answered') {
      this.stopRoom3AutoResetCountdown();
    }

    const views = {
      room1Start: document.getElementById('quiz-view-room1-start'),
      glitchStandby: document.getElementById('quiz-view-glitch-standby'),
      selectDiff: document.getElementById('quiz-view-select-diff'),
      ready: document.getElementById('quiz-view-ready'),
      play: document.getElementById('quiz-view-play'),
      answered: document.getElementById('quiz-view-answered')
    };

    // 全クイズビューを確実に一度非表示にする（他部屋の残存ガード）
    Object.values(views).forEach(v => {
      if (v) v.classList.add('hidden');
    });

    if (state === 'idle') {
      if (this.roomKey === 'room1') {
        this.resetRoom1StartButton();
        if (views.room1Start) views.room1Start.classList.remove('hidden');
      } else {
        if (views.glitchStandby) views.glitchStandby.classList.remove('hidden');
      }
      this.updateGroupBadge('--');
    } else if (state === 'select-diff') {
      this.resetConfirmDiffButton();
      if (this.roomKey === 'room1' && views.selectDiff) {
        views.selectDiff.classList.remove('hidden');
      }
    } else if (state === 'ready') {
      this.resetReadyStartButton();
      if ((this.roomKey === 'room2' || this.roomKey === 'room3') && views.ready) {
        views.ready.classList.remove('hidden');
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

  renderAnsweredViewDetails() {
    const waitNotice = document.getElementById('quiz-view-answered-wait');
    const moveNotice = document.getElementById('quiz-view-answered-move');
    const waitTarget = document.getElementById('answered-wait-target-node');
    const room3ManualBox = document.getElementById('room3-manual-reset-box');

    if (room3ManualBox) room3ManualBox.classList.add('hidden');

    if (this.roomKey === 'room1') {
      if (waitTarget) waitTarget.textContent = 'NODE 2 [BETA]';
      if (waitNotice) waitNotice.classList.add('hidden');
      if (moveNotice) moveNotice.classList.remove('hidden');
    } else if (this.roomKey === 'room2') {
      if (waitTarget) waitTarget.textContent = 'NODE 3 [CORE]';
      if (waitNotice) waitNotice.classList.add('hidden');
      if (moveNotice) moveNotice.classList.remove('hidden');
    } else if (this.roomKey === 'room3') {
      if (waitNotice) waitNotice.classList.add('hidden');
      if (moveNotice) moveNotice.classList.remove('hidden');
      if (room3ManualBox) room3ManualBox.classList.remove('hidden');
      this.startRoom3AutoResetCountdown();
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
        : '<span class="material-symbols-outlined icon-sm">battery_alert</span> バッテリー';
    }
    await API.reportLowBattery(this.roomKey, this.isLowBattery);
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