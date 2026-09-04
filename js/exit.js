/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/exit.js - 出口／リザルト機制御
 * （全グループ結果一覧固定表示・「新着順 / ハイスコア順」ワンタップ切替・EX合言葉・解説展開）
 */

const ExitApp = {
  currentSort: 'latest', // 'latest' (新着順) | 'score' (ハイスコア順)
  cachedQuestionsMap: {},
  resultsList: [],
  pollingTimer: null,
  EX_SECRET_KEYWORD: 'しらす',

  async init() {
    const role = AppStorage.getRole();
    if (role !== CONFIG.ROLES.EXIT) return;

    const screen = document.getElementById('exit-screen');
    if (screen) screen.classList.remove('hidden');

    // 問題マスタの事前取得（解説・画像表示用）
    await this.preloadQuestionsMap();

    // 結果一覧の初回取得 & 定期更新
    this.fetchResultsList();
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = setInterval(() => {
      this.fetchResultsList(false);
    }, 10000);
  },

  async preloadQuestionsMap() {
    try {
      const cached = AppStorage.getCachedQuestions();
      if (cached && Array.isArray(cached) && cached.length > 0) {
        cached.forEach(q => {
          if (q && q.id) this.cachedQuestionsMap[String(q.id).trim()] = q;
        });
      }

      const res = await API.getQuestions();
      if (res && res.success && Array.isArray(res.questions)) {
        res.questions.forEach(q => {
          if (q && q.id) {
            this.cachedQuestionsMap[String(q.id).trim()] = q;
          }
        });
        AppStorage.cacheQuestions(res.questions);
      }
    } catch (e) {
      console.warn('[ExitApp] 問題マスタロードスキップ:', e);
    }
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
   * 成績集計 & 端末解除API呼び出し
   * @param {Object} qrData
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
        // 成績登録完了後、一覧を新着順で即座に再取得・更新
        this.currentSort = 'latest';
        this.updateSortButtonsUI();
        await this.fetchResultsList(true);

        // 先頭（今スキャンしたグループ）までスクロール
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        alert('成績発表エラー: ' + (res.error || '該当データがありません'));
      }
    } catch (e) {
      alert('通信エラーが発生しました。もう一度スキャンしてください。');
    }
  },

  /**
   * ソート順の切り替え
   * @param {string} sortType 'latest' | 'score'
   */
  switchSort(sortType) {
    if (this.currentSort === sortType) return;
    this.currentSort = sortType;
    this.updateSortButtonsUI();
    this.fetchResultsList(true);
  },

  updateSortButtonsUI() {
    const btnLatest = document.getElementById('btn-sort-latest');
    const btnScore = document.getElementById('btn-sort-score');

    if (btnLatest) btnLatest.classList.toggle('active', this.currentSort === 'latest');
    if (btnScore) btnScore.classList.toggle('active', this.currentSort === 'score');
  },

  /**
   * 終了済み全グループの成績一覧取得
   * @param {boolean} showLoading
   */
  async fetchResultsList(showLoading = false) {
    const container = document.getElementById('exit-results-list-container');
    if (showLoading && container) {
      container.innerHTML = '<div class="text-center text-muted py-5 font-cyber">最新成績データを集計中...</div>';
    }

    try {
      const res = await API.getFinishedResultsList(this.currentSort);
      if (res && res.success && Array.isArray(res.results)) {
        this.resultsList = res.results;
        this.renderResultsList();
      } else {
        if (showLoading && container) {
          container.innerHTML = '<div class="text-center text-danger py-5 font-cyber">成績一覧の取得に失敗しました</div>';
        }
      }
    } catch (e) {
      console.warn('[ExitApp] 成績一覧取得エラー:', e);
      if (showLoading && container) {
        container.innerHTML = '<div class="text-center text-danger py-5 font-cyber">通信エラーが発生しました</div>';
      }
    }
  },

  /**
   * 結果カード一覧の描画
   */
  renderResultsList() {
    const container = document.getElementById('exit-results-list-container');
    const totalCountElem = document.getElementById('exit-total-groups-count');

    if (totalCountElem) {
      totalCountElem.textContent = `${this.resultsList.length} 組`;
    }

    if (!container) return;

    if (this.resultsList.length === 0) {
      container.innerHTML = `
        <div class="card text-center py-5 cyber-border">
          <span class="material-symbols-outlined icon-hero text-muted">history_toggle_off</span>
          <p class="text-muted mt-3 font-cyber">まだ成績が発表されたグループはありません</p>
          <p class="text-muted font-cyber" style="font-size:12px;">上の「QRコードをスキャンして成績発表」ボタンからスキャンしてください</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.resultsList.map((item, index) => {
      const isTop1 = this.currentSort === 'score' && index === 0;
      const isTop2 = this.currentSort === 'score' && index === 1;
      const isTop3 = this.currentSort === 'score' && index === 2;

      let rankClass = '';
      let rankBadgeHtml = `<span class="result-card-rank font-cyber">#${item.rank || (index + 1)}</span>`;

      if (isTop1) {
        rankClass = 'rank-gold-card';
        rankBadgeHtml = `<span class="result-card-rank font-cyber rank-crown-gold">🥇 1st</span>`;
      } else if (isTop2) {
        rankClass = 'rank-silver-card';
        rankBadgeHtml = `<span class="result-card-rank font-cyber rank-crown-silver">🥈 2nd</span>`;
      } else if (isTop3) {
        rankClass = 'rank-bronze-card';
        rankBadgeHtml = `<span class="result-card-rank font-cyber rank-crown-bronze">🥉 3rd</span>`;
      }

      const isPerfect = item.r1Ok && item.r2Ok && item.r3Ok;

      // 各問の解説HTML
      const questionsDetailHtml = [
        { num: 1, ok: item.r1Ok },
        { num: 2, ok: item.r2Ok },
        { num: 3, ok: item.r3Ok }
      ].map(q => {
        const qId = `Q${q.num}-01`;
        const master = this.cachedQuestionsMap[qId] || {};
        return `
          <div class="exit-q-mini-card ${q.ok ? 'is-correct' : 'is-wrong'}">
            <div class="exit-q-mini-head">
              <span class="font-cyber font-bold">第${q.num}問: ${q.ok ? '⭕ クリア' : '❌ 不正解'}</span>
            </div>
            <p class="exit-q-mini-text"><strong>課題:</strong> ${master.question_text || '問題課題'}</p>
            ${master.media_url ? `
              <div class="exit-q-mini-media">
                <img src="${master.media_url}" class="result-media-thumb" alt="問題画像" onclick="AppUI.openMediaFullscreen('${master.media_url}', false)">
              </div>
            ` : ''}
            <p class="exit-q-mini-ans">模範解答: <strong class="text-highlight font-mono">${master.answer || '--'}</strong></p>
            ${master.explanation ? `<p class="exit-q-mini-exp"><strong>解説:</strong> ${master.explanation}</p>` : ''}
          </div>
        `;
      }).join('');

      return `
        <div class="card result-group-card cyber-border ${rankClass}">
          <!-- カードヘッダー -->
          <div class="result-group-header">
            <div class="result-group-info-left">
              ${rankBadgeHtml}
              <div>
                <div class="result-group-main-title">
                  <span class="font-mono text-highlight font-bold font-lg">${item.groupId || '--'}</span>
                  <span class="group-title-text font-bold">${item.groupName || ''}</span>
                  <span class="badge badge-secondary font-cyber">${String(item.difficulty || 'normal').toUpperCase()}</span>
                  ${item.isExEntry ? '<span class="badge badge-ex font-cyber">EX ENTRY</span>' : ''}
                </div>
                <div class="result-group-sub-info text-muted">
                  <span>担当: ${item.staffName || 'スタッフ'}</span>
                  <span>|</span>
                  <span class="font-mono">${item.timestamp || ''}</span>
                </div>
              </div>
            </div>

            <div class="result-group-score-right">
              <div class="result-total-score-badge font-cyber">
                <span class="score-num font-mono">${item.totalScore}</span>
                <span class="score-unit">PTS</span>
              </div>
            </div>
          </div>

          <!-- EX達成バナー -->
          ${item.exQualified ? `
            <div class="banner-ex-qualified-mini font-cyber">
              <span class="material-symbols-outlined icon-md">stars</span>
              <div class="flex-1">
                <strong>EX MODE OVERRIDE GRANTED!</strong>
                <span class="ex-sub-text">入口スタッフに伝える【解放合言葉】: </span>
                <strong class="secret-word-mini">${this.EX_SECRET_KEYWORD}</strong>
              </div>
            </div>
          ` : ''}

          <!-- スコアブレイクダウン -->
          <div class="result-breakdown-row font-cyber">
            <div class="breakdown-item">
              <span class="label text-muted">クイズ得点:</span>
              <strong class="font-mono">${item.quizScore} pts</strong>
            </div>
            <div class="breakdown-item">
              <span class="label text-muted">射撃スコア:</span>
              <strong class="font-mono text-warning">${item.shootingScore} pts</strong>
            </div>
            ${isPerfect ? `
              <div class="breakdown-item text-highlight">
                <span class="material-symbols-outlined icon-xs">auto_awesome</span> PERFECT BONUS (+30)
              </div>
            ` : ''}
          </div>

          <!-- 各問解説展開エリア (トグル開閉) -->
          <details class="result-details-toggle">
            <summary class="btn-toggle-summary font-cyber">
              <span class="material-symbols-outlined icon-sm">quiz</span> 各問の正誤・解説詳細を確認
            </summary>
            <div class="result-details-content mt-3">
              ${questionsDetailHtml}
            </div>
          </details>
        </div>
      `;
    }).join('');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  ExitApp.init();
});