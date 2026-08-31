/**
 * quiz.js - 第1問〜第3問 ブース機用ロジック（離脱検知対応版）
 */
const QuizApp = {
  roomKey: null,
  roomNumber: 1,
  currentGroupId: null,
  isExMode: false,
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
    if (!role || !['room1', 'room2', 'room3'].includes(role)) {
      return;
    }

    this.roomKey = role;
    this.roomNumber = CONFIG.ROOM_NUMBERS[role];

    document.getElementById('quiz-screen').classList.remove('hidden');
    document.getElementById('quiz-room-badge').textContent = `${CONFIG.ROLE_NAMES[role]}`;

    // 離脱・バックグラウンド検知イベントの登録
    this.setupExitListeners();

    // 接続通知
    try {
      await API.updateRoomStatus(this.roomKey, 'ready');
    } catch (e) {
      console.warn('初期接続通知失敗:', e);
    }

    await this.preloadQuestions();
    this.startPolling();
  },

  /**
   * ★画面離脱・タブ閉じ・スリープ時の検知リスナー
   */
  setupExitListeners() {
    const notifyExit = () => {
      // 画面を離れる瞬間にunknownステータスを送信 (keepaliveで確実に届かせる)
      const payload = JSON.stringify({
        action: 'updateRoomStatus',
        roomKey: this.roomKey,
        status: 'unknown'
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(CONFIG.GAS_API_URL, payload);
      }
    };

    // タブを閉じる・リロード・ページ移動時
    window.addEventListener('pagehide', notifyExit);
    window.addEventListener('beforeunload', notifyExit);

    // iPadでホーム画面に戻ったり画面ロックされた時
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        notifyExit();
      } else if (document.visibilityState === 'visible') {
        // 再び画面を開いたら ready を再通知
        API.updateRoomStatus(this.roomKey, this.currentGroupId ? 'playing' : 'ready');
      }
    });
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

    this.pollingTimer = setInterval(() => {
      this.checkStatus();
    }, CONFIG.POLLING_INTERVAL_MS);
  },

  async checkStatus() {
    try {
      const res = await API.getStatus();
      if (!res || !res.success) return;

      const myStatus = res.statuses[this.roomKey];
      if (!myStatus) return;

      const newGroupId = myStatus.groupId;
      const isEx = myStatus.isEx;

      if (newGroupId && newGroupId !== this.currentGroupId) {
        this.currentGroupId = newGroupId;
        this.isExMode = isEx;
        this.onNewGroupArrived();
      } else if (!newGroupId && this.currentGroupId) {
        this.currentGroupId = null;
        this.showWaitingView();
      }
    } catch (e) {
      console.error('Quiz polling error:', e);
    }
  },

  async onNewGroupArrived() {
    document.getElementById('quiz-group-badge').textContent = `グループ: ${this.currentGroupId}`;
    const exBadge = document.getElementById('quiz-ex-badge');
    if (this.isExMode) {
      exBadge.classList.remove('hidden');
    } else {
      exBadge.classList.add('hidden');
    }

    await API.updateRoomStatus(this.roomKey, 'playing');

    if (this.isExMode) {
      this.startQuiz('ex');
    } else {
      this.showDifficultyView();
    }
  },

  showWaitingView() {
    this.stopTimer();
    document.getElementById('quiz-view-waiting').classList.remove('hidden');
    document.getElementById('quiz-view-difficulty').classList.add('hidden');
    document.getElementById('quiz-view-play').classList.add('hidden');
  },

  showDifficultyView() {
    this.stopTimer();
    document.getElementById('quiz-view-waiting').classList.add('hidden');
    document.getElementById('quiz-view-difficulty').classList.remove('hidden');
    document.getElementById('quiz-view-play').classList.add('hidden');
  },

  showPlayView() {
    document.getElementById('quiz-view-waiting').classList.add('hidden');
    document.getElementById('quiz-view-difficulty').classList.add('hidden');
    document.getElementById('quiz-view-play').classList.remove('hidden');
  },

  async chooseDifficulty(diff) {
    this.startQuiz(diff);
  },

  async startQuiz(difficulty) {
    this.currentDifficulty = difficulty;
    this.hintsRevealedCount = 0;

    let candidates = this.cachedQuestions.filter(q => q.difficulty === difficulty);
    
    if (difficulty === 'ex' && candidates.length === 0) {
      try {
        const exRes = await API.getQuestions('ex', 'ex');
        candidates = exRes.questions;
      } catch (e) {
        console.error('EX問題の取得失敗:', e);
      }
    }

    if (candidates.length === 0) {
      alert(`難易度 [${difficulty}] の問題が見つかりません。`);
      return;
    }

    this.currentQuestion = candidates[Math.floor(Math.random() * candidates.length)];
    this.renderQuestion();
    this.showPlayView();

    this.timeLeft = CONFIG.TIME_LIMITS[difficulty] || 180;
    this.startTimer();
  },

  renderQuestion() {
    document.getElementById('current-diff-tag').textContent = this.currentDifficulty.toUpperCase();
    document.getElementById('quiz-q-id').textContent = this.currentQuestion.id;
    document.getElementById('quiz-question-text').textContent = this.currentQuestion.question_text;

    const imgContainer = document.getElementById('quiz-image-container');
    const imgElem = document.getElementById('quiz-image');
    if (this.currentQuestion.image_url) {
      imgElem.src = this.currentQuestion.image_url;
      imgContainer.classList.remove('hidden');
    } else {
      imgContainer.classList.add('hidden');
    }

    const hintList = document.getElementById('hint-list');
    hintList.innerHTML = '<div class="hint-empty">まだヒントは開示されていません</div>';
    document.getElementById('btn-next-hint').disabled = false;
  },

  revealNextHint() {
    if (!this.currentQuestion || !this.currentQuestion.hints) return;

    const totalHints = this.currentQuestion.hints.length;
    if (this.hintsRevealedCount >= totalHints) {
      alert('これ以上のヒントはありません。');
      return;
    }

    const hintList = document.getElementById('hint-list');
    if (this.hintsRevealedCount === 0) {
      hintList.innerHTML = '';
    }

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

      if (this.timeLeft <= 0) {
        this.stopTimer();
        alert('⏰ 制限時間終了です！スタッフの指示に従ってください。');
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

  openJudgeModal(isCorrect) {
    this.pendingJudgeResult = isCorrect;
    const modal = document.getElementById('judge-modal');
    const title = document.getElementById('judge-modal-title');
    const answer = document.getElementById('modal-correct-answer');
    const time = document.getElementById('modal-time-left');

    title.textContent = isCorrect ? '⭕ 【正解】として記録しますか？' : '❌ 【不正解】として記録しますか？';
    title.style.color = isCorrect ? '#22c55e' : '#ef4444';
    answer.textContent = this.currentQuestion.answer || '（未設定）';
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
    submitBtn.textContent = '送信中...';

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
        this.showWaitingView();
      } else {
        alert('送信エラー: ' + (res.error || '不明なエラー'));
      }
    } catch (e) {
      alert('通信に失敗しました。もう一度送信してください。');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '確定して送信';
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  QuizApp.init();
});
