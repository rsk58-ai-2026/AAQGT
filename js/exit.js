/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/exit.js - 出口／リザルト機制御 (成績発表・EX合言葉・ランキング)
 */

const ExitApp = {
  currentTab: 'detail',
  cachedQuestionsMap: {},

  async init() {
    const role = AppStorage.getRole();
    if (role !== 'exit') return;

    const screen = document.getElementById('exit-screen');
    if (screen) screen.classList.remove('hidden');

    this.resetToWaiting();
    this.preloadQuestionsMap();
  },

  async preloadQuestionsMap() {
    try {
      const res = await API.getQuestions();
      if (res && res.success && Array.isArray(res.questions)) {
        res.questions.forEach(q => {
          if (q && q.id) {
            this.cachedQuestionsMap[String(q.id).trim()] = q;
          }
        });
      }
    } catch (e) {}
  },

  /**
   * QRスキャナー起動
   */
  openScanner() {
    CameraScanner.start(async (data) => {
      await this.handleFinalResult(data);
    });
  },

  /**
   * 成績集計 & 端末解除API
   */
  async handleFinalResult(qrData) {
    if (!qrData || !qrData.device_id) {
      alert('無効なスタッフQRコードです。');
      return;
    }

    try {
      const res = await API.getGroupSummaryAndRelease({
        device_id: qrData.device_id
      });

      if (res && res.success && res.summary) {
        this.renderResultDetail(res.summary);
      } else {
        alert('成績発表エラー: ' + (res.error || '該当データがありません'));
      }
    } catch (e) {
      alert('通信エラーが発生しました。もう一度スキャンしてください。');
    }
  },

  /**
   * 成績画面レンダリング
   */
  renderResultDetail(summary) {
    this.renderViewState('content');

    document.getElementById('exit-group-badge').textContent = `GROUP: ${summary.groupId} (${summary.groupName})`;
    document.getElementById('exit-quiz-score').textContent = summary.quizScore;
    document.getElementById('exit-shooting-score').textContent = summary.shootingScore;
    document.getElementById('exit-total-score').textContent = summary.totalScore;

    // パーフェクトボーナス表示
    const bonusBadge = document.getElementById('exit-bonus-badge');
    if (bonusBadge) bonusBadge.classList.toggle('hidden', !summary.isPerfect);

    // EX達成バナー制御
    const exBanner = document.getElementById('exit-ex-banner');
    const normalBanner = document.getElementById('exit-normal-banner');

    if (summary.exQualified) {
      if (exBanner) exBanner.classList.remove('hidden');
      if (normalBanner) normalBanner.classList.add('hidden');
    } else {
      if (exBanner) exBanner.classList.add('hidden');
      if (normalBanner) normalBanner.classList.remove('hidden');
    }

    // 各問成績カード生成
    const questions = [
      { num: 1, info: summary.r1 },
      { num: 2, info: summary.r2 },
      { num: 3, info: summary.r3 }
    ];

    const container = document.getElementById('exit-cards-container');
    if (container) {
      container.innerHTML = questions.map(q => {
        const qInfo = q.info || {};
        const qId = qInfo.qid || `Q${q.num}-01`;
        const master = this.cachedQuestionsMap[qId] || {};
        const isOk = qInfo.ok === true;
        const diffText = String(qInfo.diff || master.difficulty || 'normal').toUpperCase();

        return `
          <div class="result-question-card ${isOk ? 'is-correct' : 'is-wrong'}">
            <div class="result-card-header">
              <span class="result-q-title font-cyber">第${q.num}問 [${diffText}] (${qId})</span>
              <span class="result-judge-badge ${isOk ? 'badge-correct' : 'badge-wrong'}">
                <span class="material-symbols-outlined icon-xs">${isOk ? 'check_circle' : 'cancel'}</span>
                ${isOk ? '正解 [クリア]' : '不正解 [失敗]'}
              </span>
            </div>
            <div class="result-card-body">
              <p class="result-q-text"><strong>問題:</strong> ${master.question_text || '問題課題'}</p>
              ${master.media_url ? `
                <div class="result-media-wrapper">
                  <img src="${master.media_url}" class="result-media-thumb" alt="問題画像" onclick="AppUI.openMediaFullscreen('${master.media_url}', false)">
                </div>
              ` : ''}
              <p class="result-q-answer">模範解答: <span class="text-highlight font-bold font-mono">${master.answer || '--'}</span></p>
              ${master.explanation ? `<p class="result-q-exp"><strong>解説:</strong> ${master.explanation}</p>` : ''}
              <div class="result-q-stats-row font-mono">
                <span>残り時間: <strong class="text-highlight">${qInfo.time || 0}秒</strong></span>
                <span>誤答ペナルティ: <strong class="text-warning">${qInfo.miss || 0}回</strong></span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  },

  resetToWaiting() {
    this.renderViewState('waiting');
    document.getElementById('exit-group-badge').textContent = 'GROUP: --';
  },

  switchTab(tabName) {
    this.currentTab = tabName;

    const btnDetail = document.getElementById('btn-exit-tab-detail');
    const btnRanking = document.getElementById('btn-exit-tab-ranking');
    const viewWaiting = document.getElementById('exit-view-waiting');
    const viewContent = document.getElementById('exit-view-content');
    const viewRanking = document.getElementById('exit-view-ranking');

    if (btnDetail) btnDetail.classList.toggle('active', tabName === 'detail');
    if (btnRanking) btnRanking.classList.toggle('active', tabName === 'ranking');

    if (tabName === 'detail') {
      if (viewRanking) viewRanking.classList.add('hidden');
      if (document.getElementById('exit-total-score').textContent !== '0') {
        if (viewContent) viewContent.classList.remove('hidden');
      } else {
        if (viewWaiting) viewWaiting.classList.remove('hidden');
      }
    } else if (tabName === 'ranking') {
      if (viewWaiting) viewWaiting.classList.add('hidden');
      if (viewContent) viewContent.classList.add('hidden');
      if (viewRanking) viewRanking.classList.remove('hidden');
      this.fetchRanking();
    }
  },

  async fetchRanking() {
    const listContainer = document.getElementById('exit-ranking-list-container');
    if (listContainer) listContainer.innerHTML = '<div class="text-center text-muted py-4 font-cyber">最新ランキングを集計中...</div>';

    try {
      const res = await API.getRanking();
      if (res && res.success && Array.isArray(res.ranking)) {
        this.renderRankingList(res.ranking);
      }
    } catch (e) {
      if (listContainer) listContainer.innerHTML = '<div class="text-center text-danger py-4">ランキング取得エラー</div>';
    }
  },

  renderRankingList(ranking) {
    const container = document.getElementById('exit-ranking-list-container');
    if (!container) return;

    if (ranking.length === 0) {
      container.innerHTML = '<div class="text-center text-muted py-4">記録されたランキングデータがありません</div>';
      return;
    }

    container.innerHTML = ranking.map(item => `
      <div class="ranking-item-row ${item.rank <= 3 ? `top-${item.rank}` : ''}">
        <div class="ranking-col-rank">
          <span class="rank-num font-cyber">${item.rank}</span>
        </div>
        <div class="ranking-col-group">
          <strong class="ranking-group-id font-mono">${item.groupId}</strong>
          <span class="font-bold">${item.groupName}</span>
          ${item.isExEntry || item.exQualified ? '<span class="badge badge-ex font-cyber">EX</span>' : ''}
        </div>
        <div class="ranking-col-score">
          <span class="ranking-score-val font-cyber">${item.totalScore} <small>pts</small></span>
        </div>
        <div class="ranking-col-miss font-mono text-warning">
          <span>MISS: ${item.totalMisses}</span>
        </div>
        <div class="ranking-col-time text-muted font-mono">
          <span>${item.timestamp || ''}</span>
        </div>
      </div>
    `).join('');
  },

  renderViewState(state) {
    const viewWaiting = document.getElementById('exit-view-waiting');
    const viewContent = document.getElementById('exit-view-content');
    const viewRanking = document.getElementById('exit-view-ranking');

    if (state === 'waiting') {
      if (viewWaiting) viewWaiting.classList.remove('hidden');
      if (viewContent) viewContent.classList.add('hidden');
      if (viewRanking) viewRanking.classList.add('hidden');
    } else if (state === 'content') {
      if (viewWaiting) viewWaiting.classList.add('hidden');
      if (viewContent) viewContent.classList.remove('hidden');
      if (viewRanking) viewRanking.classList.add('hidden');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  ExitApp.init();
});