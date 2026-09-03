/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * quiz.js - 問題機ブース端末（第1問〜第3問）
 */
const QuizApp = {
  roomKey: null,
  roomNumber: 1,
  currentGroupId: null,
  isLowBattery: false,
  pollingTimer: null,
  lastPipelineVersion: null,
  hasAnsweredCurrentGroup: false,

  cachedQuestions: [],
  currentQuestion: null,
  currentDifficulty: 'normal',
  hintsRevealedCount: 0,
  timeLeft: 0,
  timerInterval: null,
  isEmergencyPaused: false,
  isInfoPaused: false,
  pendingJudgeResult: null,

  // 誤答トラッカー
  missCount: 0,

  async init() {
    const role = AppStorage.getRole();
    if (!role || !['room1', 'room2', 'room3'].includes(role)) return;

    this.roomKey = role;
    this.roomNumber = CONFIG.ROOM_NUMBERS[role];

    const screen = document.getElementById('quiz-screen');
    screen.classList.remove('hidden');

    // 部屋ごとのグリッチ演出クラスを適用
    const glitchClass = CONFIG.GLITCH_CLASSES[this.roomKey] || 'glitch-low';
    screen.classList.add(glitchClass);

    document.getElementById('quiz-room-badge').textContent = CONFIG.ROLE_NAMES[role];

    this.setupExitListeners();
    this.setupMediaFullscreenModal();

    try {
      await API.updateRoomStatus(this.roomKey, 'ready');
    } catch (e) {
      console.warn('初期接続通知失敗:', e);
    }

    await this.preloadQuestions();
    this.startPolling();
  },

  setupExitListeners() {
    const notifyExit = () => {
      const payload = JSON.stringify({ action: 'updateRoomStatus', roomKey: this.roomKey, status: 'unknown' });
      if (navigator.sendBeacon) navigator.sendBeacon(CONFIG.GAS_API_URL, payload);
    };

    window.addEventListener('pagehide', notifyExit);
    window.addEventListener('beforeunload', notifyExit);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        notifyExit();
      } else if (document.visibilityState === 'visible') {
        API.updateRoomStatus(this.roomKey, this.currentGroupId ? 'playing' : 'ready');
      }
    });
  },

  // 画像・動画のフルスクリーンモーダル設定
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

  async toggleBatteryAlert() {
    this.isLowBattery = !this.isLowBattery;
    const btn = document.getElementById('btn-battery-quiz');
    btn.classList.toggle('active', this.isLowBattery);
    btn.innerHTML = this.isLowBattery
      ? '<span class="material-symbols-outlined icon-sm">battery_alert</span> 給電要請'
      : '<span class="material-symbols-outlined icon-sm">battery_alert</span> バッテリー';
    await API.reportLowBattery(this.roomKey, this.isLowBattery);
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

      // 1. 緊急一時停止の検知
      const pauseOverlay = document.getElementById('pause-lock-overlay');
      if (res.systemPaused) {
        if (!this.isEmergencyPaused) {
          this.isEmergencyPaused = true;
          this.stopTimer();
          pauseOverlay.classList.remove('hidden');
        }
        return;
      } else {
        if (this.isEmergencyPaused) {
          this.isEmergencyPaused = false;
          pauseOverlay.classList.add('hidden');
          const isPlayVisible = !document.getElementById('quiz-view-play').classList.contains('hidden');
          if (isPlayVisible && this.timeLeft > 0 && !this.isInfoPaused) {
            this.startTimer();
          }
        }
      }

      // 2. 待機・機材調整中（非緊急）一時停止の検知
      const infoPauseOverlay = document.getElementById('info-pause-overlay');
      if (res.infoPaused) {
        if (!this.isInfoPaused) {
          this.isInfoPaused = true;
          this.stopTimer();
          if (infoPauseOverlay) infoPauseOverlay.classList.remove('hidden');
        }
        return;
      } else {
        if (this.isInfoPaused) {
          this.isInfoPaused = false;
          if (infoPauseOverlay) infoPauseOverlay.classList.add('hidden');
          const isPlayVisible = !document.getElementById('quiz-view-play').classList.contains('hidden');
          if (isPlayVisible && this.timeLeft > 0 && !this.isEmergencyPaused) {
            this.startTimer();
          }
        }
      }

      // 3. パイプライン進行（一斉進行）の検知
      const currentVer = res.pipelineVersion;
      if (this.lastPipelineVersion !== null && currentVer > this.lastPipelineVersion) {
        if (this.hasAnsweredCurrentGroup) {
          this.showMoveView();
          this.hasAnsweredCurrentGroup = false;
        }
      }
      this.lastPipelineVersion = currentVer;

      // 4. ブースの割当状態を確認
      const myStatus = res.statuses[this.roomKey];
      if (!myStatus) return;

      const newGroupId = myStatus.groupId;
      const assignedDiff = myStatus.difficulty || 'normal';
      const customTime = myStatus.timeLimit || res.globalTimeLimit || 60;

      if (newGroupId && newGroupId !== this.currentGroupId) {
        this.currentGroupId = newGroupId;
        this.currentDifficulty = assignedDiff;
        this.hasAnsweredCurrentGroup = false;
        this.missCount = 0;
        this.onNewGroupArrived(customTime);
      } else if (!newGroupId && this.currentGroupId) {
        this.currentGroupId = null;
        this.missCount = 0;
        this.showWaitingView();
      }
    } catch (e) {
      console.error('Quiz polling error:', e);
    }
  },

  async onNewGroupArrived(customTime) {
    document.getElementById('quiz-group-badge').textContent = `GROUP: ${this.currentGroupId}`;
    const exBadge = document.getElementById('quiz-ex-badge');
    if (this.currentDifficulty === 'ex') {
      exBadge.classList.remove('hidden');
    } else {
      exBadge.classList.add('hidden');
    }

    this.startQuiz(this.currentDifficulty, customTime);
  },

  showWaitingView() {
    this.stopTimer();
    document.getElementById('quiz-view-waiting').classList.remove('hidden');
    document.getElementById('quiz-view-answered').classList.add('hidden');
    document.getElementById('quiz-view-move').classList.add('hidden');
    document.getElementById('quiz-view-play').classList.add('hidden');
  },

  showAnsweredWaitingView() {
    this.stopTimer();
    document.getElementById('quiz-view-waiting').classList.add('hidden');
    document.getElementById('quiz-view-answered').classList.remove('hidden');
    document.getElementById('quiz-view-move').classList.add('hidden');
    document.getElementById('quiz-view-play').classList.add('hidden');
  },

  showMoveView() {
    this.stopTimer();
    document.getElementById('quiz-view-waiting').classList.add('hidden');
    document.getElementById('quiz-view-answered').classList.add('hidden');
    document.getElementById('quiz-view-move').classList.remove('hidden');
    document.getElementById('quiz-view-play').classList.add('hidden');
  },

  showPlayView() {
    document.getElementById('quiz-view-waiting').classList.add('hidden');
    document.getElementById('quiz-view-answered').classList.add('hidden');
    document.getElementById('quiz-view-move').classList.add('hidden');
    document.getElementById('quiz-view-play').classList.remove('hidden');
  },

  async startQuiz(difficulty, customTime) {
    this.hintsRevealedCount = 0;
    this.missCount = 0;
    this.updateMissCounterUI();

    let candidates = this.cachedQuestions.filter(q => q.difficulty === difficulty);
    if (difficulty === 'ex' && candidates.length === 0) {
      try {
        const exRes = await API.getQuestions('ex', 'ex');
        candidates = exRes.questions;
      } catch (e) {}
    }

    if (candidates.length === 0) {
      alert(`該当する問題データが存在しません [${difficulty}]`);
      return;
    }

    this.currentQuestion = candidates[Math.floor(Math.random() * candidates.length)];
    this.renderQuestion();
    this.showPlayView();

    this.timeLeft = customTime || 60;
    this.startTimer();

    API.updateRoomStatus(this.roomKey, 'playing', this.currentQuestion.id, this.timeLeft);
  },

  renderQuestion() {
    document.getElementById('current-diff-tag').textContent = this.currentDifficulty.toUpperCase();
    document.getElementById('quiz-q-id').textContent = this.currentQuestion.id;
    document.getElementById('quiz-question-text').textContent = this.currentQuestion.question_text;

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
        video.title = 'タップで全画面表示';
        video.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openMediaFullscreen(mediaUrl, true);
        });
        mediaContainer.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.src = mediaUrl;
        img.className = 'quiz-media clickable-media';
        img.title = 'タップで全画面表示';
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
    document.getElementById('btn-next-hint').disabled = false;
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
      document.getElementById('btn-next-hint').disabled = true;
    }
  },

  // 誤答カウントアップ処理（即終了させずペナルティ記録）
  handleWrongAttempt() {
    this.missCount++;
    this.updateMissCounterUI();
    this.triggerGlitchAlertEffect();
    this.playAudioTone(220, 0.25, 'sawtooth'); // 不協和音ビープ
  },

  updateMissCounterUI() {
    const counterElem = document.getElementById('quiz-miss-counter');
    if (counterElem) {
      counterElem.textContent = this.missCount;
    }
  },

  triggerGlitchAlertEffect() {
    const playView = document.getElementById('quiz-view-play');
    playView.classList.add('effect-wrong-shock');
    setTimeout(() => {
      playView.classList.remove('effect-wrong-shock');
    }, 600);
  },

  startTimer() {
    this.updateTimerDisplay();
    this.stopTimer();

    this.timerInterval = setInterval(() => {
      if (this.isEmergencyPaused || this.isInfoPaused) return;

      this.timeLeft--;
      this.updateTimerDisplay();

      if (this.timeLeft % 5 === 0) {
        API.updateRoomStatus(this.roomKey, 'playing', this.currentQuestion?.id, this.timeLeft);
      }

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
    const min = Math.floor(Math.max(0, this.timeLeft) / 60);
    const sec = Math.max(0, this.timeLeft) % 60;
    const formatted = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

    const timerElem = document.getElementById('quiz-timer');
    const timerBox = document.getElementById('timer-box');
    if (timerElem) timerElem.textContent = formatted;

    if (this.timeLeft <= 15 && timerBox) {
      timerBox.classList.add('timer-warning');
    } else if (timerBox) {
      timerBox.classList.remove('timer-warning');
    }
  },

  // 時間切れ演出: CRITICAL BREACH
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
    const payload = {
      groupId: this.currentGroupId,
      roomNumber: this.roomNumber,
      difficulty: this.currentDifficulty,
      questionId: this.currentQuestion ? this.currentQuestion.id : 'TIMEUP',
      isCorrect: false,
      timeLeft: 0,
      missCount: this.missCount
    };
    try {
      await API.submitAnswer(payload);
    } catch (e) {}

    this.hasAnsweredCurrentGroup = true;
    this.showAnsweredWaitingView();
  },

  // 正解演出: SYSTEM PURGED
  async triggerSystemPurgedEffect() {
    this.playAudioTone(880, 0.4, 'sine');
    const overlay = document.getElementById('effect-overlay-purged');
    if (overlay) {
      overlay.classList.remove('hidden');
      await new Promise(r => setTimeout(r, 1800));
      overlay.classList.add('hidden');
    }
  },

  openJudgeModal(isCorrect) {
    this.pendingJudgeResult = isCorrect;
    const modal = document.getElementById('judge-modal');
    const title = document.getElementById('judge-modal-title');
    const answer = document.getElementById('modal-correct-answer');
    const time = document.getElementById('modal-time-left');
    const miss = document.getElementById('modal-miss-count');

    if (isCorrect) {
      title.innerHTML = '<span class="material-symbols-outlined icon-md icon-success">check_circle</span> 正解として記録';
      title.style.color = '#22c55e';
    } else {
      title.innerHTML = '<span class="material-symbols-outlined icon-md icon-danger">cancel</span> 終了 / 不正解として記録';
      title.style.color = '#ef4444';
    }

    answer.textContent = this.currentQuestion.answer || '--';
    time.textContent = Math.max(0, this.timeLeft);
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
      await this.triggerSystemPurgedEffect();
    }

    const payload = {
      groupId: this.currentGroupId,
      roomNumber: this.roomNumber,
      difficulty: this.currentDifficulty,
      questionId: this.currentQuestion.id,
      isCorrect: isCorrect,
      timeLeft: Math.max(0, this.timeLeft),
      missCount: this.missCount
    };

    try {
      const res = await API.submitAnswer(payload);
      if (res && res.success) {
        this.closeJudgeModal();
        this.hasAnsweredCurrentGroup = true;
        this.showAnsweredWaitingView();
      }
    } catch (e) {
      alert('通信に失敗しました。再試行してください。');
    } finally {
      submitBtn.disabled = false;
    }
  },

  // 簡易サウンドジェネレータ（Web Audio API）
  playAudioTone(freq, duration, type = 'sine') {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }
};

document.addEventListener('DOMContentLoaded', () => {
  QuizApp.init();
});