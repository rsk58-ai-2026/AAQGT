/**
 * result.js - 出口／リザルト端末用ロジック
 */
const ResultApp = {
  pollingTimer: null,
  currentGroupId: null,
  isExMode: false,

  // EX挑戦権獲得時に客へ伝える合言葉（任意に変更可能）
  EX_SECRET_KEYWORD: 'フェニックス',

  /**
   * 初期化
   */
  async init() {
    const role = AppStorage.getRole();
    if (role !== CONFIG.ROLES.EXIT) {
      return; // 自身の役割ではない
    }

    // 画面表示
    document.getElementById('result-screen').classList.remove('hidden');

    // 待機ポーリング開始
    this.startPolling();
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
   * 出口ブースのステータスを確認
   */
  async checkStatus() {
    try {
      const res = await API.getStatus();
      if (!res || !res.success) return;

      const exitStatus = res.statuses['exit'];
      if (!exitStatus) return;

      const newGroupId = exitStatus.groupId;
      const isEx = exitStatus.isEx;

      // 新しいグループが到着した場合
      if (newGroupId && newGroupId !== this.currentGroupId) {
        this.currentGroupId = newGroupId;
        this.isExMode = isEx;
        await this.loadAndShowResult(newGroupId);
      } else if (!newGroupId && this.currentGroupId) {
        this.currentGroupId = null;
        this.showWaitingView();
      }
    } catch (e) {
      console.error('Result polling error:', e);
    }
  },

  /**
   * グループ成績を取得してリザルトを描画
   */
  async loadAndShowResult(groupId) {
    this.showLoadingView(groupId);

    try {
      // 出口端末を「playing」に更新（案内中）
      await API.updateRoomStatus('exit', 'playing');

      const res = await API.getGroupResult(groupId);
      if (res && res.success) {
        this.renderResult(res.result);
      } else {
        alert('成績データの取得に失敗しました: ' + (res.error || '不明なエラー'));
        this.showWaitingView();
      }
    } catch (e) {
      alert('通信エラーが発生しました。');
      this.showWaitingView();
    }
  },

  /**
   * リザルト画面のレンダリング
   */
  renderResult(data) {
    document.getElementById('result-group-id').textContent = data.groupId;
    
    const exBanner = document.getElementById('result-ex-banner');
    const normalBanner = document.getElementById('result-normal-banner');

    // EX挑戦権（全問Hard & 全問正解）判定
    if (data.exQualified) {
      exBanner.classList.remove('hidden');
      normalBanner.classList.add('hidden');
      document.getElementById('ex-secret-word').textContent = this.EX_SECRET_KEYWORD;
    } else {
      exBanner.classList.add('hidden');
      normalBanner.classList.remove('hidden');
    }

    // 第1問〜第3問のカード描画
    const questions = [
      { key: 'q1', num: 1, info: data.q1 },
      { key: 'q2', num: 2, info: data.q2 },
      { key: 'q3', num: 3, info: data.q3 }
    ];

    const container = document.getElementById('result-cards-container');
    container.innerHTML = '';

    questions.forEach(q => {
      const card = document.createElement('div');
      const isCorrect = q.info.isCorrect;
      card.className = `result-question-card ${isCorrect ? 'is-correct' : 'is-wrong'}`;

      const diffLabel = {
        easy: 'かんたん',
        normal: 'ふつう',
        hard: 'むずかしい',
        ex: 'EX'
      }[q.info.difficulty] || q.info.difficulty;

      card.innerHTML = `
        <div class="result-card-header">
          <span class="result-q-title">第${q.num}問 (${diffLabel})</span>
          <span class="result-judge-badge ${isCorrect ? 'badge-correct' : 'badge-wrong'}">
            ${isCorrect ? '⭕ 正解' : '❌ 不正解'}
          </span>
        </div>
        <div class="result-card-body">
          <p class="result-q-text"><strong>問題:</strong> ${q.info.questionText || '（記録なし）'}</p>
          <p class="result-q-answer"><strong>模範解答:</strong> <span class="text-highlight">${q.info.answer || '---'}</span></p>
          ${q.info.explanation ? `<p class="result-q-exp"><strong>解説:</strong> ${q.info.explanation}</p>` : ''}
          <div class="result-q-time">残り時間: <strong>${q.info.timeLeft || 0}秒</strong></div>
        </div>
      `;
      container.appendChild(card);
    });

    this.showContentVIew();
  },

  /**
   * スタッフ操作：案内完了（待機状態に戻す）
   */
  async finishAndReady() {
    if (!confirm('客の案内を完了し、待機状態にしますか？')) return;

    const btn = document.getElementById('btn-finish-result');
    btn.disabled = true;
    btn.textContent = '更新中...';

    try {
      const res = await API.updateRoomStatus('exit', 'ready');
      if (res && res.success) {
        this.showWaitingView();
      } else {
        alert('待機状態への更新に失敗しました。');
      }
    } catch (e) {
      alert('通信エラーが発生しました。');
    } finally {
      btn.disabled = false;
      btn.textContent = '✅ 案内完了（待機状態にする）';
    }
  },

  // ==========================================
  // 表示ビュー切り替え
  // ==========================================
  showWaitingView() {
    document.getElementById('result-view-waiting').classList.remove('hidden');
    document.getElementById('result-view-loading').classList.add('hidden');
    document.getElementById('result-view-content').classList.add('hidden');
  },

  showLoadingView(groupId) {
    document.getElementById('loading-group-text').textContent = `グループ [ ${groupId} ] の成績を集計中...`;
    document.getElementById('result-view-waiting').classList.add('hidden');
    document.getElementById('result-view-loading').classList.remove('hidden');
    document.getElementById('result-view-content').classList.add('hidden');
  },

  showContentVIew() {
    document.getElementById('result-view-waiting').classList.add('hidden');
    document.getElementById('result-view-loading').classList.add('hidden');
    document.getElementById('result-view-content').classList.remove('hidden');
  }
};

// DOMロード時に初期化
document.addEventListener('DOMContentLoaded', () => {
  ResultApp.init();
});