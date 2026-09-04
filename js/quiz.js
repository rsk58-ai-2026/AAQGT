/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/quiz.js - 問題機ブース端末 (第1問〜第3問) 制御
 * （2択スタッフ判定・管理者ルール連動ペナルティ・MISSカウント撤廃）
 */

const QuizApp = {
  roomKey: null,
  roomNumber: 1,
  activeDeviceId: null,
  activeGroupId: null,
  currentQuestion: null,
  hintsRevealedCount: 0,
  timeLeft: 60,
  timerInterval: null,
  rules: {
    globalTimeLimit: 60,
    penaltyRule: 'instant_out',
    penaltyDeductSeconds: 15,
    exConditionType: 'hard_perfect',
    exConditionValue: '100'
  },

  init() {
    const role = AppStorage.getRole();
    if (!role || !['room1', 'room2', 'room3'].includes(role)) return;

    this.roomKey = role;
    this.roomNumber = CONFIG.ROOM_NUMBERS[role] || 1;

    const screen = document.getElementById('quiz-screen');
    if (screen) screen.classList.remove('hidden');

    const badge = document.getElementById('quiz-room-badge');
    if (badge) badge.textContent = CONFIG.ROLE_NAMES[role] || `NODE ${this.roomNumber}`;

    this.resetToIdle();
    this.fetchSystemRules();
  },

  /**
   * 現在のシステムルールをサーバーから取得
   */
  async fetchSystemRules() {
    try {
      const res = await API.getSystemRules();
      if (res && res.success) {
        this.rules = {
          globalTimeLimit: res.globalTimeLimit || 60,
          penaltyRule: res.penaltyRule || 'instant_out',
          penaltyDeductSeconds: res.penaltyDeductSeconds || 15,
          exConditionType: res.exConditionType || 'hard_perfect',
          exConditionValue: res.exConditionValue || '100'
        };
      }
    } catch (e) {
      console.warn('[QuizApp] ルール取得スキップ (デフォルト適用):', e);
    }
  },

  /**
   * 問題データの手動最新化
   */
  async refreshQuestionsMaster() {
    try {
      const res = await API.getQuestions();
      if (res && res.success && Array.isArray(res.questions)) {
        AppStorage.cacheQuestions(res.questions);
        alert('最新の問題マスタを取得・更新しました');
      } else {
        alert('問題データの更新に失敗しました');
      }
    } catch (e) {
      alert('通信エラーが発生しました');
    }
  },

  /**
   * QRスキャナー起動
   */
  openScanner() {
    CameraScanner.start(async (data) => {
      await this.handleStartQuiz(data);
    });
  },

  /**
   * 出題開始
   * @param {Object} qrData
   */
  async handleStartQuiz(qrData) {
    if (!qrData || !qrData.device_id) {
      alert('無効なスタッフQRコードです。');
      return;
    }

    this.activeDeviceId = qrData.device_id;

    try {
      const res = await API.startQuizRoom({
        booth_id: this.roomKey,
        device_id: this.activeDeviceId
      });

      if (res && res.success && res.question) {
        this.activeGroupId = res.group ? res.group.groupId : 'G-??';
        this.currentQuestion = res.question;

        // サーバーから返却された最新ルールを適用
        if (res.rules) {
          this.rules = {
            globalTimeLimit: res.rules.globalTimeLimit || 60,
            penaltyRule: res.rules.penaltyRule || 'instant_out',
            penaltyDeductSeconds: res.rules.penaltyDeductSeconds || 15,
            exConditionType: res.rules.exConditionType || 'hard_perfect',
            exConditionValue: res.rules.exConditionValue || '100'
          };
        }

        const diff = (res.group && res.group.difficulty) ? res.group.difficulty : (qrData.difficulty || 'normal');
        this.startPlay(diff);
      } else {
        alert('出題開始エラー: ' + (res.error || 'グループが特定できません'));
      }
    } catch (e) {
      alert('通信エラーが発生しました。もう一度スキャンしてください。');
    }
  },

  /**
   * 攻略画面の初期化・開始
   */
  startPlay(diff) {
    this.renderViewState('play');
    this.hintsRevealedCount = 0;

    const groupBadge = document.getElementById('quiz-group-badge');
    const diffTag = document.getElementById('quiz-diff-tag');
    const qIdElem = document.getElementById('quiz-q-id');
    const qTextElem = document.getElementById('quiz-question-text');

    if (groupBadge) groupBadge.textContent = `GROUP: ${this.activeGroupId}`;
    if (diffTag) diffTag.textContent = diff.toUpperCase();
    if (qIdElem) qIdElem.textContent = this.currentQuestion.id || `Q${this.roomNumber}-01`;
    if (qTextElem) qTextElem.textContent = this.currentQuestion.question_text || '';

    // メディア描画
    this.renderMedia(this.currentQuestion.media_url);

    // ヒント初期化
    const hintList = document.getElementById('quiz-hint-list');
    if (hintList) hintList.innerHTML = '<div class="hint-empty">開示された解析ヒントはありません</div>';
    const hintBtn = document.getElementById('btn-next-hint');
    if (hintBtn) hintBtn.disabled = false;

    // 制限時間のセット & タイマースタート
    this.timeLeft = this.rules.globalTimeLimit || 60;
    this.startTimer();
  },

  renderMedia(mediaUrl) {
    const container = document.getElementById('quiz-media-container');
    if (!container) return;
    container.innerHTML = '';

    if (!mediaUrl) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    const isVideo = !!mediaUrl.match(/\.(mp4|webm|mov)$/i);

    if (isVideo) {
      const video = document.createElement('video');
      video.src = mediaUrl;
      video.controls = true;
      video.autoplay = true;
      video.className = 'quiz-media';
      video.onclick = () => AppUI.openMediaFullscreen(mediaUrl, true);
      container.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.src = mediaUrl;
      img.className = 'quiz-media';
      img.alt = '問題画像';
      img.onclick = () => AppUI.openMediaFullscreen(mediaUrl, false);
      container.appendChild(img);
    }
  },

  revealNextHint() {
    if (!this.currentQuestion || !this.currentQuestion.hints) return;
    const hints = this.currentQuestion.hints;
    if (this.hintsRevealedCount >= hints.length) return;

    const list = document.getElementById('quiz-hint-list');
    if (this.hintsRevealedCount === 0 && list) list.innerHTML = '';

    const nextHint = hints[this.hintsRevealedCount];
    this.hintsRevealedCount++;

    const item = document.createElement('div');
    item.className = 'hint-item';
    item.innerHTML = `<span class="material-symbols-outlined icon-xs icon-gold">lightbulb</span> <strong>解析HINT ${this.hintsRevealedCount}:</strong> ${nextHint}`;
    if (list) list.appendChild(item);

    if (this.hintsRevealedCount >= hints.length) {
      const btn = document.getElementById('btn-next-hint');
      if (btn) btn.disabled = true;
    }
  },

  startTimer() {
    this.updateTimerUI();
    this.stopTimer();

    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      this.updateTimerUI();

      if (this.timeLeft <= 0) {
        this.stopTimer();
        this.submitJudge(false);
      }
    }, 1000);
  },

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  },

  updateTimerUI() {
    const timerElem = document.getElementById('quiz-timer');
    const timerBox = document.getElementById('quiz-timer-box');
    const safeTime = Math.max(0, this.timeLeft);
    const min = Math.floor(safeTime / 60);
    const sec = safeTime % 60;
    const formatted = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

    if (timerElem) timerElem.textContent = formatted;
    if (timerBox) {
      timerBox.classList.toggle('timer-warning', this.timeLeft <= 15);
    }
  },

  /**
   * スタッフによる判定処理（⭕正解 / ❌誤答 の2択）
   */
  handleJudge(isCorrect) {
    if (isCorrect) {
      // ⭕ 正解 -> クリア処理
      this.submitJudge(true);
    } else {
      // ❌ 誤答 -> 管理者ルールに従って分岐
      if (this.rules.penaltyRule === 'instant_out') {
        // ルール①: 誤答即アウト
        this.submitJudge(false);
      } else {
        // ルール②: 時間減算ペナルティ
        const deduct = this.rules.penaltyDeductSeconds || 15;
        this.timeLeft = Math.max(0, this.timeLeft - deduct);
        this.updateTimerUI();
        this.triggerWrongEffect();

        // 減算によって0秒以下になった場合は不正解終了
        if (this.timeLeft <= 0) {
          this.stopTimer();
          this.submitJudge(false);
        }
      }
    }
  },

  triggerWrongEffect() {
    const playView = document.getElementById('quiz-view-play');
    if (playView) {
      playView.classList.add('effect-wrong-shock');
      setTimeout(() => playView.classList.remove('effect-wrong-shock'), 500);
    }
    this.playWarningBeep();
  },

  playWarningBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  },

  /**
   * 解答結果送信 & 演出
   * @param {boolean} isCorrect
   */
  async submitJudge(isCorrect) {
    this.stopTimer();

    // 演出表示
    if (isCorrect) {
      const overlay = document.getElementById('effect-overlay-purged');
      if (overlay) {
        overlay.classList.remove('hidden');
        await new Promise(r => setTimeout(r, 1500));
        overlay.classList.add('hidden');
      }
    } else {
      const overlay = document.getElementById('effect-overlay-breach');
      if (overlay) {
        overlay.classList.remove('hidden');
        await new Promise(r => setTimeout(r, 1500));
        overlay.classList.add('hidden');
      }
    }

    try {
      await API.submitQuizAnswer({
        booth_id: this.roomKey,
        device_id: this.activeDeviceId,
        group_id: this.activeGroupId,
        question_id: this.currentQuestion ? this.currentQuestion.id : '',
        is_correct: isCorrect,
        time_left: this.timeLeft,
        miss_count: 0
      });
    } catch (e) {
      console.warn('[QuizApp] 解答送信エラー (待機画面へ復帰):', e);
    }

    // 待機画面へリセット
    this.resetToIdle();
  },

  resetToIdle() {
    this.stopTimer();
    this.activeDeviceId = null;
    this.activeGroupId = null;
    this.currentQuestion = null;
    this.renderViewState('idle');
    const groupBadge = document.getElementById('quiz-group-badge');
    if (groupBadge) groupBadge.textContent = 'GROUP: --';
  },

  renderViewState(state) {
    const idleView = document.getElementById('quiz-view-idle');
    const playView = document.getElementById('quiz-view-play');

    if (state === 'idle') {
      if (idleView) idleView.classList.remove('hidden');
      if (playView) playView.classList.add('hidden');
    } else if (state === 'play') {
      if (idleView) idleView.classList.add('hidden');
      if (playView) playView.classList.remove('hidden');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  QuizApp.init();
});