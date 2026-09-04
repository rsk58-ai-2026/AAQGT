/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * result.js - 出口／リザルト機（QRコード0秒即時集計 & バックグラウンド非同期保存）
 */
const ResultApp = {
  currentMode: 'detail', // 'detail' (個別成績発表) | 'ranking' (総合ランキング)
  activeResultData: null,
  questionsMap: {},
  isCongested: false,
  isLowBattery: false,
  EX_SECRET_KEYWORD: 'しらす',

  async init() {
    const role = AppStorage.getRole();
    if (role !== CONFIG.ROLES.EXIT) return;

    const screen = document.getElementById('result-screen');
    if (screen) screen.classList.remove('hidden');

    this.setupMediaFullscreenModal();
    this.showWaitingView();

    // 問題マスタのキャッシュロード & バックグラウンド事前取得
    this.loadCachedQuestionsMap();
    this.preloadAllQuestions();
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

  loadCachedQuestionsMap() {
    const cached = AppStorage.getCachedQuestions() || [];
    cached.forEach(q => {
      if (q && q.id) {
        this.questionsMap[String(q.id).trim()] = q;
      }
    });
  },

  async preloadAllQuestions() {
    try {
      const res = await API.getQuestions();
      if (res && res.success && Array.isArray(res.questions)) {
        res.questions.forEach(q => {
          if (q && q.id) {
            this.questionsMap[String(q.id).trim()] = q;
          }
        });
        AppStorage.cacheQuestions(res.questions);
      }
    } catch (e) {
      console.warn('[ResultApp] 問題マスタ更新スキップ（キャッシュ利用）:', e);
    }
  },

  // ==========================================
  // 1. QRスキャン & テンキー入力による成績受領
  // ==========================================

  openScanner() {
    QRSync.startScanner('qr-reader', (data) => {
      this.handleFinalResultReceived(data);
    });
  },

  openPasscodeInput() {
    QRSync.openPasscodeInput((data) => {
      this.handleFinalResultReceived(data);
    });
  },

  /**
   * 最終QRコード読み取り時の0秒即時展開処理
   * @param {Object} data
   */
  handleFinalResultReceived(data) {
    if (!data || !data.groupId) {
      alert('無効なリザルトデータです。');
      return;
    }

    this.activeResultData = data;

    // ① 0.01秒で画面に成績を描画
    this.renderResultDetail(data);

    // ② 裏で1回だけスプレッドシート（GAS）へ非同期保存（ユーザーを待たせない）
    this.saveFinalResultToGAS(data);
  },

  /**
   * スプレッドシート（GAS）へのバックグラウンド非同期保存
   * @param {Object} data
   */
  async saveFinalResultToGAS(data) {
    try {
      const payload = {
        action: 'submitFinalResult',
        groupId: data.groupId,
        difficulty: data.difficulty || 'normal',
        isExEntry: data.difficulty === 'ex',
        q1: data.q1 || {},
        q2: data.q2 || {},
        q3: data.q3 || {},
        totalScore: data.totalScore || 0,
        totalMisses: data.totalMisses || 0,
        exQualified: !!data.exQualified,
        timestamp: new Date().toISOString()
      };

      // API経由でGASに保存
      if (typeof API.submitFinalResult === 'function') {
        await API.submitFinalResult(payload);
      } else {
        await API.post(payload);
      }
      console.log('[ResultApp] スプレッドシート非同期保存完了:', data.groupId);
    } catch (error) {
      console.warn('[ResultApp] スプレッドシート非同期保存エラー (ローカル表示は継続):', error);
    }
  },

  // ==========================================
  // 2. 成績表示メインレンダラー
  // ==========================================

  renderResultDetail(data) {
    const groupIdElem = document.getElementById('result-group-id');
    if (groupIdElem) groupIdElem.textContent = data.groupId;

    // スコア・誤答回数表示
    const scoreVal = document.getElementById('result-total-score');
    if (scoreVal) scoreVal.textContent = Math.max(0, Math.floor(Number(data.totalScore) || 0));

    const missVal = document.getElementById('result-total-misses');
    if (missVal) missVal.textContent = Math.max(0, Math.floor(Number(data.totalMisses) || 0));

    // パーフェクトボーナス獲得判定 (全問正解)
    const q1Ok = data.q1 ? (data.q1.ok === true) : false;
    const q2Ok = data.q2 ? (data.q2.ok === true) : false;
    const q3Ok = data.q3 ? (data.q3.ok === true) : false;
    const isPerfect = q1Ok && q2Ok && q3Ok;

    const bonusBadge = document.getElementById('result-bonus-badge');
    if (bonusBadge) {
      bonusBadge.classList.toggle('hidden', !isPerfect);
    }

    // EXモード挑戦権獲得バナー制御
    const exBanner = document.getElementById('result-ex-banner');
    const normalBanner = document.getElementById('result-normal-banner');

    if (data.exQualified) {
      if (exBanner) exBanner.classList.remove('hidden');
      if (normalBanner) normalBanner.classList.add('hidden');
      const secretWordElem = document.getElementById('ex-secret-word');
      if (secretWordElem) secretWordElem.textContent = this.EX_SECRET_KEYWORD;
    } else {
      if (exBanner) exBanner.classList.add('hidden');
      if (normalBanner) normalBanner.classList.remove('hidden');
    }

    // 各問題の詳細カード生成
    const questions = [
      { num: 1, info: data.q1 },
      { num: 2, info: data.q2 },
      { num: 3, info: data.q3 }
    ];

    const container = document.getElementById('result-cards-container');
    if (container) {
      container.innerHTML = '';

      questions.forEach(q => {
        const qInfo = q.info || {};
        const qId = String(qInfo.id || `Q${q.num}-01`).trim();
        const master = this.questionsMap[qId] || {};

        const isCorrect = qInfo.ok === true;
        const diffText = String(qInfo.diff || master.difficulty || 'normal').toUpperCase();
        const safeTimeLeft = Math.max(0, Math.floor(Number(qInfo.t) || 0));
        const safeMissCount = Math.max(0, Math.floor(Number(qInfo.m) || 0));

        const qText = master.question_text || `第${q.num}問の課題`;
        const qAns = master.answer || '--';
        const qExp = master.explanation || '';
        const mediaUrl = master.media_url || '';
        const isVideo = !!mediaUrl.match(/\.(mp4|webm|mov)$/i);

        const card = document.createElement('div');
        card.className = `result-question-card ${isCorrect ? 'is-correct' : 'is-wrong'}`;

        card.innerHTML = `
          <div class="result-card-header">
            <span class="result-q-title font-cyber">第${q.num}問 [${diffText}] (${qId})</span>
            <span class="result-judge-badge ${isCorrect ? 'badge-correct' : 'badge-wrong'}">
              <span class="material-symbols-outlined icon-xs">${isCorrect ? 'check_circle' : 'cancel'}</span>
              ${isCorrect ? '正解 [クリア]' : '不正解 [防衛失敗]'}
            </span>
          </div>
          <div class="result-card-body">
            <p class="result-q-text"><strong>問題:</strong> ${qText}</p>

            ${mediaUrl ? `
              <div class="result-media-wrapper">
                ${isVideo ? `
                  <video src="${mediaUrl}" class="result-media-thumb clickable-media" title="タップで全画面表示"></video>
                ` : `
                  <img src="${mediaUrl}" class="result-media-thumb clickable-media" alt="問題画像" title="タップで全画面表示">
                `}
                <span class="media-zoom-hint text-muted"><span class="material-symbols-outlined icon-xs">zoom_in</span> タップで拡大</span>
              </div>
            ` : ''}

            <p class="result-q-answer">模範解答: <span class="text-highlight font-bold font-mono">${qAns}</span></p>
            ${qExp ? `<p class="result-q-exp"><strong>解説:</strong> ${qExp}</p>` : ''}
            <div class="result-q-stats-row font-mono">
              <span>残り時間: <strong class="text-highlight">${safeTimeLeft}秒</strong></span>
              <span>誤答ペナルティ: <strong class="text-warning">${safeMissCount}回</strong></span>
            </div>
          </div>
        `;

        if (mediaUrl) {
          const thumbElem = card.querySelector('.result-media-thumb');
          if (thumbElem) {
            thumbElem.addEventListener('click', (e) => {
              e.stopPropagation();
              this.openMediaFullscreen(mediaUrl, isVideo);
            });
          }
        }

        container.appendChild(card);
      });
    }

    this.showContentView();
  },

  /**
   * 「次のお客様をスキャン」ボタンで待機画面にリセット
   */
  resetToWaiting() {
    this.activeResultData = null;
    const groupIdElem = document.getElementById('result-group-id');
    if (groupIdElem) groupIdElem.textContent = '未スキャン';
    this.showWaitingView();
  },

  // ==========================================
  // 3. 総合ランキング機能
  // ==========================================

  switchMode(mode) {
    this.currentMode = mode;

    const btnDetail = document.getElementById('btn-tab-mode-detail');
    const btnRanking = document.getElementById('btn-tab-mode-ranking');
    const viewWaiting = document.getElementById('result-view-waiting');
    const viewLoading = document.getElementById('result-view-loading');
    const viewContent = document.getElementById('result-view-content');
    const viewRanking = document.getElementById('result-view-ranking');

    if (btnDetail) btnDetail.classList.toggle('active', mode === 'detail');
    if (btnRanking) btnRanking.classList.toggle('active', mode === 'ranking');

    if (mode === 'detail') {
      if (viewRanking) viewRanking.classList.add('hidden');
      if (this.activeResultData) {
        if (viewContent) viewContent.classList.remove('hidden');
        if (viewWaiting) viewWaiting.classList.add('hidden');
      } else {
        if (viewContent) viewContent.classList.add('hidden');
        if (viewWaiting) viewWaiting.classList.remove('hidden');
      }
    } else if (mode === 'ranking') {
      if (viewWaiting) viewWaiting.classList.add('hidden');
      if (viewLoading) viewLoading.classList.add('hidden');
      if (viewContent) viewContent.classList.add('hidden');
      if (viewRanking) viewRanking.classList.remove('hidden');

      this.fetchRanking();
    }
  },

  async fetchRanking() {
    const listContainer = document.getElementById('ranking-list-container');
    if (listContainer) {
      listContainer.innerHTML = '<div class="text-center text-muted py-4 font-cyber">最新ランキングを集計中...</div>';
    }

    try {
      const res = await API.getRanking();
      if (res && res.success) {
        this.renderRanking(res.ranking || []);
      } else {
        if (listContainer) listContainer.innerHTML = '<div class="text-center text-danger py-4">ランキング取得エラー</div>';
      }
    } catch (e) {
      if (listContainer) listContainer.innerHTML = '<div class="text-center text-danger py-4">通信エラーが発生しました</div>';
    }
  },

  renderRanking(rankingList) {
    const container = document.getElementById('ranking-list-container');
    if (!container) return;

    container.innerHTML = '';
    if (rankingList.length === 0) {
      container.innerHTML = '<div class="text-center text-muted py-4">記録されたランキングデータがありません</div>';
      return;
    }

    rankingList.forEach(item => {
      const row = document.createElement('div');
      row.className = `ranking-item-row ${item.rank <= 3 ? `top-${item.rank}` : ''}`;

      let rankBadgeHtml = `<span class="rank-num font-cyber">${item.rank}</span>`;
      if (item.rank === 1) {
        rankBadgeHtml = `<span class="rank-crown crown-gold font-cyber">🥇 1st</span>`;
      } else if (item.rank === 2) {
        rankBadgeHtml = `<span class="rank-crown crown-silver font-cyber">🥈 2nd</span>`;
      } else if (item.rank === 3) {
        rankBadgeHtml = `<span class="rank-crown crown-bronze font-cyber">🥉 3rd</span>`;
      }

      row.innerHTML = `
        <div class="ranking-col-rank">
          ${rankBadgeHtml}
        </div>
        <div class="ranking-col-group">
          <strong class="ranking-group-id font-mono">${item.groupId}</strong>
          ${item.isExEntry || item.exQualified ? '<span class="badge badge-ex font-cyber">EX OVERRIDE</span>' : ''}
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
      `;
      container.appendChild(row);
    });
  },

  // ==========================================
  // 4. アラート & ビュー切り替え
  // ==========================================

  async toggleCongestionAlert() {
    this.isCongested = !this.isCongested;
    const btn = document.getElementById('btn-exit-congestion');
    if (btn) {
      btn.classList.toggle('btn-danger', this.isCongested);
      btn.classList.toggle('btn-secondary', !this.isCongested);
      btn.innerHTML = this.isCongested
        ? '<span class="material-symbols-outlined icon-sm">warning</span> 出口混雑中 [警報中]'
        : '<span class="material-symbols-outlined icon-sm">group</span> 出口混雑を報告';
    }
    try {
      await API.reportExitCongestion(this.isCongested);
    } catch (e) {}
  },

  async toggleBatteryAlert() {
    this.isLowBattery = !this.isLowBattery;
    const btn = document.getElementById('btn-battery-result');
    if (btn) {
      btn.classList.toggle('active', this.isLowBattery);
      btn.innerHTML = this.isLowBattery
        ? '<span class="material-symbols-outlined icon-sm">battery_alert</span> 給電要請'
        : '<span class="material-symbols-outlined icon-sm">battery_alert</span> 給電';
    }
  },

  showWaitingView() {
    const viewWaiting = document.getElementById('result-view-waiting');
    const viewLoading = document.getElementById('result-view-loading');
    const viewContent = document.getElementById('result-view-content');
    if (viewWaiting) viewWaiting.classList.remove('hidden');
    if (viewLoading) viewLoading.classList.add('hidden');
    if (viewContent) viewContent.classList.add('hidden');
  },

  showLoadingView() {
    const viewWaiting = document.getElementById('result-view-waiting');
    const viewLoading = document.getElementById('result-view-loading');
    const viewContent = document.getElementById('result-view-content');
    if (viewWaiting) viewWaiting.classList.add('hidden');
    if (viewLoading) viewLoading.classList.remove('hidden');
    if (viewContent) viewContent.classList.add('hidden');
  },

  showContentView() {
    const viewWaiting = document.getElementById('result-view-waiting');
    const viewLoading = document.getElementById('result-view-loading');
    const viewContent = document.getElementById('result-view-content');
    if (viewWaiting) viewWaiting.classList.add('hidden');
    if (viewLoading) viewLoading.classList.add('hidden');
    if (viewContent) viewContent.classList.remove('hidden');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  ResultApp.init();
});