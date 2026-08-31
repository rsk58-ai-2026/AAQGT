/**
 * quiz.js - 第1問〜第3問 ブース機用ロジック
 */
const QuizApp = {
  roomKey: null,         // 'room1', 'room2', 'room3'
  roomNumber: 1,         // 1, 2, 3
  currentGroupId: null,  // 担当中のグループID
  isExMode: false,       // EXモードフラグ
  pollingTimer: null,

  // クイズ状態
  cachedQuestions: [],
  currentQuestion: null,
  currentDifficulty: 'normal',
  hintsRevealedCount: 0,
  timeLeft: 0,
  timerInterval: null,
  pendingJudgeResult: null, // モーダル用判定保留 { isCorrect: boolean }

  /**
   * 初期化
   */
  async init() {
    const role = AppStorage.getRole();
    if (!role || !['room1', 'room2', 'room3'].includes(role)) {
      return; // 自身の役割ではない
    }

    this.roomKey = role;
    this.roomNumber = CONFIG.ROOM_NUMBERS[role];

    // UI初期設定
    document.getElementById('quiz-screen').classList.remove('hidden');
    document.getElementById('quiz-room-badge').textContent = `${CONFIG.ROLE_NAMES[role]}`;

    // 問題マスタを事前に取得してキャッシュ
    await this.preloadQuestions();

    // 進行待機ポーリング開始
    this.startPolling();
  },

  /**
   * 問題一覧をGASから取得・キャッシュ
   */
  async preloadQuestions() {
    try {
      const res = await API.getQuestions(this.roomNumber);
      if (res && res.success) {
        this.cachedQuestions = res.questions;
        AppStorage.cacheQuestions(this.cachedQuestions);
      }
    } catch (e) {
      console.warn('問題の事前ロード失敗（キャッシュを使用します）:', e);
      this.cachedQuestions = AppStorage.getCachedQuestions() || [];
    }
  },

  /**
   * statusシートのポーリング（進行合図の監視）
   */
  startPolling() {
    this.checkStatus();
    if (this.pollingTimer) clearInterval(this.pollingTimer);

    this.pollingTimer = setInterval(() => {
      this.checkStatus();
    }, CONFIG.POLLING_INTERVAL_MS);
  },

  /**
   * 自身の部屋の状態を確認
   */
  async checkStatus() {
    try {
      const res = await API.getStatus();
      if (!res || !res.success) return;

      const myStatus = res.statuses[this.roomKey];
      if (!myStatus) return;

      const newGroupId = myStatus.groupId;
      const isEx = myStatus.isEx;

      // 新しいグループが割り当てられた場合（待機状態 -> ゲーム開始へ）
      if (newGroupId && newGroupId !== this.currentGroupId) {
        this.currentGroupId = newGroupId;
        this.isExMode = isEx;
        this.onNewGroupArrived();
      } else if (!newGroupId && this.currentGroupId) {
        // 空室になった場合
        this.currentGroupId = null;
        this.showWaitingView();
      }
    } catch (e) {
      console.error('Quiz polling error:', e);
    }
  },

  /**
   * 新しいグループが到達した時の処理
   */
  async onNewGroupArrived() {
    // ヘッダー情報更新
    document.getElementById('quiz-group-badge').textContent = `グループ: ${this.currentGroupId}`;
    const exBadge = document.getElementById('quiz-ex-badge');
    if (this.isExMode) {
      exBadge.classList.remove('hidden');
    } else {
      exBadge.classList.add('hidden');
    }

    // ブース状態を「プレイ中 (playing)」に更新
    await API.updateRoomStatus(this.roomKey, 'playing');

    if (this.isExMode) {
      // EXモードなら難易度選択をスキップして即EX問題出題
      this.startQuiz('ex');
    } else {
      // 通常モードなら難易度選択画面を表示
      this.showDifficultyView();
    }
  },

  // ==========================================
  // 画面遷移切り替え
  // ==========================================
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

  // ==========================================
  // クイズ出題・進行
  // ==========================================
  async chooseDifficulty(diff) {
    this.startQuiz(diff);
  },

  async startQuiz(difficulty) {
    this.currentDifficulty = difficulty;
    this.hintsRevealedCount = 0;

    // 問題を難易度からランダムに1問選択
    let candidates = this.cachedQuestions.filter(q => q.difficulty === difficulty);
    
    // EXモード時、該当部屋にEX問題がなければroom='ex'から取得
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

    // 画面に問題を描画
    this.renderQuestion();
    this.showPlayView();

    // タイマー開始
    this.timeLeft = CONFIG.TIME_LIMITS[difficulty] || 180;
    this.startTimer();
  },

  renderQuestion() {
    document.getElementById('current-diff-tag').textContent = this.currentDifficulty.toUpperCase();
    document.getElementById('quiz-q-id').textContent = this.currentQuestion.id;
    document.getElementById('quiz-question-text').textContent = this.currentQuestion.question_text;

    // 画像の有無
    const imgContainer = document.getElementById('quiz-image-container');
    const imgElem = document.getElementById('quiz-image');
    if (this.currentQuestion.image_url) {
      imgElem.src = this.currentQuestion.image_url;
      imgContainer.classList.remove('hidden');
    } else {
      imgContainer.classList.add('hidden');
    }

    // ヒント領域初期化
    const hintList = document.getElementById('hint-list');
    hintList.innerHTML = '<div class="hint-empty">まだヒントは開示されていません</div>';
    document.getElementById('btn-next-hint').disabled = false;
  },

  /**
   * 段階的ヒント表示（スタッフ操作）
   */
  revealNextHint() {
    if (!this.currentQuestion || !this.currentQuestion.hints) return;

    const totalHints = this.currentQuestion.hints.length;
    if (this.hintsRevealedCount >= totalHints) {
      alert('これ以上のヒントはありません。');
      return;
    }

    const hintList = document.getElementById('hint-list');
    if (this.hintsRevealedCount === 0) {
      hintList.innerHTML = ''; // 「まだヒントはありません」をクリア
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

  // ==========================================
  // タイマー制御
  // ==========================================
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

    // 残り30秒以下で警告色
    if (this.timeLeft <= 30 && timerBox) {
      timerBox.classList.add('timer-warning');
    } else if (timerBox) {
      timerBox.classList.remove('timer-warning');
    }
  },

  // ==========================================
  // 解答判定 & 結果送信
  // ==========================================
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
        // 送信完了後は即座に待機画面へ移行
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

// DOMロード完了時に問題機として初期化
document.addEventListener('DOMContentLoaded', () => {
  QuizApp.init();
});