/**
 * quiz.js - 問題機（第1問〜第3問）
 */
const QuizApp = {
  roomKey: null,
  roomNumber: 1,
  currentGroupId: null,
  isLowBattery: false,
  pollingTimer: null,

  cachedQuestions: [],
  currentQuestion: null,
  currentDifficulty: 'normal',
  hintsRevealedCount: 0,
  timeLeft: 0,
  timerInterval: null,
  pendingJudgeResult: null,

  async init() {
    const role = AppStorage.getRole();
    if (!role || !['room1', 'room2', 'room3'].includes(role)) return;

    this.roomKey = role;
    this.roomNumber = CONFIG.ROOM_NUMBERS[role];

    document.getElementById('quiz-screen').classList.remove('hidden');
    document.getElementById('quiz-room-badge').textContent = CONFIG.ROLE_NAMES[role];

    this.setupExitListeners();

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

  async toggleBatteryAlert() {
    this.isLowBattery = !this.isLowBattery;
    const btn = document.getElementById('btn-battery-quiz');
    btn.classList.toggle('active', this.isLowBattery);
    btn.textContent = this.isLowBattery ? '🪫 充電低下 報告中' : '🔋 充電低下報告';
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

      const myStatus = res.statuses[this.roomKey];
      if (!myStatus) return;

      const newGroupId = myStatus.groupId;
      const assignedDiff = myStatus.difficulty || 'normal';
      const customTime = myStatus.timeLimit || 180;

      // 新しいグループの到着検知
      if (newGroupId && newGroupId !== this.currentGroupId) {
        this.currentGroupId = newGroupId;
        this.currentDifficulty = assignedDiff;
        this.onNewGroupArrived(customTime);
      } else if (!newGroupId && this.currentGroupId) {
        this.currentGroupId = null;
        this.showWaitingView();
      }
    } catch (e) {
      console.error('Quiz polling error:', e);
    }
  },

  async onNewGroupArrived(customTime) {
    document.getElementById('quiz-group-badge').textContent = `グループ: ${this.currentGroupId}`;
    const exBadge = document.getElementById('quiz-ex-badge');
    if (this.currentDifficulty === 'ex') {
      exBadge.classList.remove('hidden');
    } else {
      exBadge.classList.add('hidden');
    }

    await API.updateRoomStatus(this.roomKey, 'playing');
    // 入口で指定された難易度・制限時間で即座に出題
    this.startQuiz(this.currentDifficulty, customTime);
  },

  showWaitingView() {
    this.stopTimer();
    document.getElementById('quiz-view-waiting').classList.remove('hidden');
    document.getElementById('quiz-view-move').classList.add('hidden');
    document.getElementById('quiz-view-play').classList.add('hidden');
  },

  showMoveView() {
    this.stopTimer();
    document.getElementById('quiz-view-waiting').classList.add('hidden');
    document.getElementById('quiz-view-move').classList.remove('hidden');
    document.getElementById('quiz-view-play').classList.add('hidden');
  },

  showPlayView() {
    document.getElementById('quiz-view-waiting').classList.add('hidden');
    document.getElementById('quiz-view-move').classList.add('hidden');
    document.getElementById('quiz-view-play').classList.remove('hidden');
  },

  async startQuiz(difficulty, customTime) {
    this.hintsRevealedCount = 0;

    let candidates = this.cachedQuestions.filter(q => q.difficulty === difficulty);
    if (difficulty === 'ex' && candidates.length === 0) {
      try {
        const exRes = await API.getQuestions('ex', 'ex');
        candidates = exRes.questions;
      } catch (e) {}
    }

    if (candidates.length === 0) {
      alert(`問題が見つかりません [${difficulty}]`);
      return;
    }

    this.currentQuestion = candidates[Math.floor(Math.random() * candidates.length)];
    this.renderQuestion();
    this.showPlayView();

    // 入口指定の制限時間をセット
    this.timeLeft = customTime || 180;
    this.startTimer();
  },

  renderQuestion() {
    document.getElementById('current-diff-tag').textContent = this.currentDifficulty.toUpperCase();
    document.getElementById('quiz-q-id').textContent = this.currentQuestion.id;
    document.getElementById('quiz-question-text').textContent = this.currentQuestion.question_text;

    // 画像・動画の表示処理
    const mediaContainer = document.getElementById('quiz-media-container');
    mediaContainer.innerHTML = '';
    const mediaUrl = this.currentQuestion.media_url;

    if (mediaUrl) {
      mediaContainer.classList.remove('hidden');
      if (mediaUrl.match(/\.(mp4|webm|mov)$/i)) {
        const video = document.createElement('video');
        video.src = mediaUrl;
        video.controls = true;
        video.autoplay = true;
        video.className = 'quiz-media';
        mediaContainer.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.src = mediaUrl;
        img.className = 'quiz-media';
        mediaContainer.appendChild(img);
      }
    } else {
      mediaContainer.classList.add('hidden');
    }

    const hintList = document.getElementById('hint-list');
    hintList.innerHTML = '<div class="hint-empty">--</div>';
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
    hintItem.textContent = `ヒント${this.hintsRevealedCount}: ${nextHintText}`;
    hintList.appendChild(hintItem);

    if (this.hintsRevealedCount >= totalHints) {
      document.getElementById('btn-next-hint').disabled = true;
    }
  },

  startTimer() {
    this.updateTimerDisplay();
    this.stopTimer();

    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      this.updateTimerDisplay();

      // 時間切れ時の自動誤答・自動待機送信
      if (this.timeLeft <= 0) {
        this.stopTimer();
        this.autoSubmitOnTimeUp();
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

    if (this.timeLeft <= 30 && timerBox) {
      timerBox.classList.add('timer-warning');
    } else if (timerBox) {
      timerBox.classList.remove('timer-warning');
    }
  },

  async autoSubmitOnTimeUp() {
    const payload = {
      groupId: this.currentGroupId,
      roomNumber: this.roomNumber,
      difficulty: this.currentDifficulty,
      questionId: this.currentQuestion ? this.currentQuestion.id : 'TIMEUP',
      isCorrect: false,
      timeLeft: 0
    };
    try {
      await API.submitAnswer(payload);
    } catch (e) {}
    this.showMoveView();
  },

  openJudgeModal(isCorrect) {
    this.pendingJudgeResult = isCorrect;
    const modal = document.getElementById('judge-modal');
    const title = document.getElementById('judge-modal-title');
    const answer = document.getElementById('modal-correct-answer');
    const time = document.getElementById('modal-time-left');

    title.textContent = isCorrect ? '⭕ 正解' : '❌ 不正解';
    title.style.color = isCorrect ? '#22c55e' : '#ef4444';
    answer.textContent = this.currentQuestion.answer || '--';
    time.textContent = Math.max(0, this.timeLeft);

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

    const payload = {
      groupId: this.currentGroupId,
      roomNumber: this.roomNumber,
      difficulty: this.currentDifficulty,
      questionId: this.currentQuestion.id,
      isCorrect: isCorrect,
      timeLeft: Math.max(0, this.timeLeft)
    };

    try {
      const res = await API.submitAnswer(payload);
      if (res && res.success) {
        this.closeJudgeModal();
        this.showMoveView(); // 先にお進みください画面を表示
      }
    } catch (e) {
      alert('送信失敗');
    } finally {
      submitBtn.disabled = false;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  QuizApp.init();
});
