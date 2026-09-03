/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * result.js - 出口／リザルト機（独立保留トレイ・解説画像拡大・総合ランキングボード完全対応）
 */
const ResultApp = {
  pollingTimer: null,
  activeGroupId: null,
  pendingList: [],
  currentMode: 'detail', // 'detail' (個別リザルト) | 'ranking' (総合ランキング)
  isCongested: false,
  isLowBattery: false,
  EX_SECRET_KEYWORD: 'しらす',

  async init() {
    const role = AppStorage.getRole();
    if (role !== CONFIG.ROLES.EXIT) return;

    const screen = document.getElementById('result-screen');
    if (screen) screen.classList.remove('hidden');

    this.setupExitListeners();
    this.setupMediaFullscreenModal();
    this.setupModeTabs();

    try {
      await API.updateRoomStatus('exit', 'ready');
    } catch (e) {
      console.warn('初期接続通知失敗:', e);
    }

    // 退室ボタン（不要化）の安全な非表示化
    const finishBtn = document.getElementById('btn-finish-result');
    if (finishBtn) finishBtn.classList.add('hidden');

    this.startPolling();
  },

  setupExitListeners() {
    const notifyExit = () => {
      const payload = JSON.stringify({ action: 'updateRoomStatus', roomKey: 'exit', status: 'unknown' });
      if (navigator.sendBeacon) navigator.sendBeacon(CONFIG.GAS_API_URL, payload);
    };

    window.addEventListener('pagehide', notifyExit);
    window.addEventListener('beforeunload', notifyExit);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        notifyExit();
      } else if (document.visibilityState === 'visible') {
        API.updateRoomStatus('exit', this.activeGroupId ? 'playing' : 'ready');
      }
    });
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

  /**
   * 「個別リザルト」と「総合ランキング」のナビゲーションタブ配備
   */
  setupModeTabs() {
    const header = document.querySelector('#result-screen .result-header');
    if (!header) return;

    let tabNav = document.getElementById('result-mode-tab-nav');
    if (!tabNav) {
      tabNav = document.createElement('div');
      tabNav.id = 'result-mode-tab-nav';
      tabNav.className = 'result-tab-nav';
      tabNav.innerHTML = `
        <button id="btn-tab-mode-detail" class="btn btn-sm btn-tab-mode active font-cyber" onclick="ResultApp.switchMode('detail')">
          <span class="material-symbols-outlined icon-sm">person</span> 個別リザルト
        </button>
        <button id="btn-tab-mode-ranking" class="btn btn-sm btn-tab-mode font-cyber" onclick="ResultApp.switchMode('ranking')">
          <span class="material-symbols-outlined icon-sm">leaderboard</span> 総合ランキング
        </button>
      `;
      header.parentNode.insertBefore(tabNav, header.nextSibling);
    }

    // ランキング用ビューコンテナの動的作成（なければ生成）
    let rankingView = document.getElementById('result-view-ranking');
    if (!rankingView) {
      rankingView = document.createElement('div');
      rankingView.id = 'result-view-ranking';
      rankingView.className = 'quiz-view hidden';
      rankingView.innerHTML = `
        <div class="card ranking-card cyber-border">
          <div class="ranking-header">
            <h2 class="ranking-title font-cyber">
              <span class="material-symbols-outlined icon-md text-highlight">trophy</span> TOP HACKERS // 総合ランキング
            </h2>
            <button class="btn btn-secondary btn-sm" onclick="ResultApp.fetchRanking()">
              <span class="material-symbols-outlined icon-sm">refresh</span> 更新
            </button>
          </div>
          <div id="ranking-list-container" class="ranking-list-grid">
            <div class="text-center text-muted py-4">ランキングを集計中...</div>
          </div>
        </div>
      `;
      const resultScreen = document.getElementById('result-screen');
      if (resultScreen) resultScreen.appendChild(rankingView);
    }
  },

  /**
   * モード切り替え（個別リザルト / 総合ランキング）
   */
  switchMode(mode) {
    this.currentMode = mode;

    const btnDetail = document.getElementById('btn-tab-mode-detail');
    const btnRanking = document.getElementById('btn-tab-mode-ranking');
    const queueSection = document.querySelector('#result-screen .queue-section');
    const viewWaiting = document.getElementById('result-view-waiting');
    const viewLoading = document.getElementById('result-view-loading');
    const viewContent = document.getElementById('result-view-content');
    const viewRanking = document.getElementById('result-view-ranking');

    if (btnDetail) btnDetail.classList.toggle('active', mode === 'detail');
    if (btnRanking) btnRanking.classList.toggle('active', mode === 'ranking');

    if (mode === 'detail') {
      if (viewRanking) viewRanking.classList.add('hidden');
      if (queueSection) queueSection.classList.remove('hidden');

      if (this.activeGroupId) {
        if (viewContent) viewContent.classList.remove('hidden');
        if (viewWaiting) viewWaiting.classList.add('hidden');
      } else {
        if (viewContent) viewContent.classList.add('hidden');
        if (viewWaiting) viewWaiting.classList.remove('hidden');
      }
      this.fetchPendingQueue();
    } else if (mode === 'ranking') {
      if (queueSection) queueSection.classList.add('hidden');
      if (viewWaiting) viewWaiting.classList.add('hidden');
      if (viewLoading) viewLoading.classList.add('hidden');
      if (viewContent) viewContent.classList.add('hidden');
      if (viewRanking) viewRanking.classList.remove('hidden');

      this.fetchRanking();
    }
  },

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
    await API.reportExitCongestion(this.isCongested);
  },

  async toggleBatteryAlert() {
    this.isLowBattery = !this.isLowBattery;
    const btn = document.getElementById('btn-battery-result');
    if (btn) {
      btn.classList.toggle('active', this.isLowBattery);
      btn.innerHTML = this.isLowBattery
        ? '<span class="material-symbols-outlined icon-sm">battery_alert</span> 給電要請'
        : '<span class="material-symbols-outlined icon-sm">battery_alert</span> バッテリー';
    }
    await API.reportLowBattery('exit', this.isLowBattery);
  },

  startPolling() {
    this.pollCurrentModeData();
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = setInterval(() => this.pollCurrentModeData(), CONFIG.POLLING_INTERVAL_MS);
  },

  pollCurrentModeData() {
    if (this.currentMode === 'detail') {
      this.fetchPendingQueue();
    } else if (this.currentMode === 'ranking') {
      this.fetchRanking();
    }
  },

  async fetchPendingQueue() {
    try {
      const res = await API.getPendingResults();
      if (res && res.success) {
        this.pendingList = res.pendingResults || [];
        this.renderQueueRack();
      }
    } catch (e) {
      console.error('Pending queue fetch error:', e);
    }
  },

  renderQueueRack() {
    const rack = document.getElementById('pending-queue-rack');
    const badgeCount = document.getElementById('pending-count-badge');
    if (!rack) return;

    if (badgeCount) badgeCount.textContent = `${this.pendingList.length}組`;

    rack.innerHTML = '';
    if (this.pendingList.length === 0) {
      rack.innerHTML = '<div class="queue-empty-msg">到着待ちグループはありません</div>';
      if (!this.activeGroupId && this.currentMode === 'detail') {
        this.showWaitingView();
      }
      return;
    }

    this.pendingList.forEach(item => {
      const card = document.createElement('button');
      card.className = `queue-chip ${this.activeGroupId === item.groupId ? 'active' : ''}`;
      card.innerHTML = `
        <span class="chip-group-id">${item.groupId}</span>
        <span class="chip-score">${Math.max(0, Number(item.totalScore) || 0)}点</span>
        ${item.exQualified ? '<span class="chip-ex-tag">EX</span>' : ''}
      `;
      // チップをタップするとそのグループの成績へ即座に切り替え
      card.onclick = () => this.selectGroupResult(item.groupId);
      rack.appendChild(card);
    });
  },

  async selectGroupResult(groupId) {
    this.activeGroupId = groupId;
    this.renderQueueRack();
    this.showLoadingView();

    try {
      await API.updateRoomStatus('exit', 'playing');
      const res = await API.getGroupResult(groupId);
      if (res && res.success) {
        this.renderResultDetail(res.result);
      } else {
        alert('成績データの取得に失敗しました');
        this.showWaitingView();
      }
    } catch (e) {
      alert('通信エラーが発生しました');
      this.showWaitingView();
    }
  },

  renderResultDetail(data) {
    const groupIdElem = document.getElementById('result-group-id');
    if (groupIdElem) groupIdElem.textContent = data.groupId;

    // スコア・統計表示
    const scoreVal = document.getElementById('result-total-score');
    if (scoreVal) scoreVal.textContent = Math.max(0, Math.floor(Number(data.totalScore) || 0));

    const missVal = document.getElementById('result-total-misses');
    if (missVal) missVal.textContent = Math.max(0, Math.floor(Number(data.totalMisses) || 0));

    // パーフェクトボーナス獲得判定 (全問正解)
    const isPerfect = data.q1.isCorrect && data.q2.isCorrect && data.q3.isCorrect;
    const bonusBadge = document.getElementById('result-bonus-badge');
    if (bonusBadge) {
      bonusBadge.classList.toggle('hidden', !isPerfect);
    }

    // EXバナー制御
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

    // 各問題の詳細カード（問題画像サムネイル＆タップ拡大対応）
    const questions = [
      { key: 'q1', num: 1, info: data.q1 },
      { key: 'q2', num: 2, info: data.q2 },
      { key: 'q3', num: 3, info: data.q3 }
    ];

    const container = document.getElementById('result-cards-container');
    if (container) {
      container.innerHTML = '';

      questions.forEach(q => {
        const card = document.createElement('div');
        const isCorrect = q.info.isCorrect;
        card.className = `result-question-card ${isCorrect ? 'is-correct' : 'is-wrong'}`;

        const safeTimeLeft = Math.max(0, Math.floor(Number(q.info.timeLeft) || 0));
        const safeMissCount = Math.max(0, Math.floor(Number(q.info.missCount) || 0));
        const mediaUrl = q.info.media_url || '';
        const isVideo = !!mediaUrl.match(/\.(mp4|webm|mov)$/i);

        card.innerHTML = `
          <div class="result-card-header">
            <span class="result-q-title font-cyber">第${q.num}問 (${String(q.info.difficulty).toUpperCase()})</span>
            <span class="result-judge-badge ${isCorrect ? 'badge-correct' : 'badge-wrong'}">
              <span class="material-symbols-outlined icon-xs">${isCorrect ? 'check_circle' : 'cancel'}</span>
              ${isCorrect ? '正解 [クリア]' : '不正解 [突破失敗]'}
            </span>
          </div>
          <div class="result-card-body">
            <p class="result-q-text"><strong>問題:</strong> ${q.info.questionText || '--'}</p>

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

            <p class="result-q-answer">模範解答: <span class="text-highlight font-bold font-mono">${q.info.answer || '--'}</span></p>
            ${q.info.explanation ? `<p class="result-q-exp"><strong>解説:</strong> ${q.info.explanation}</p>` : ''}
            <div class="result-q-stats-row font-mono">
              <span>残り時間: <strong class="text-highlight">${safeTimeLeft}秒</strong></span>
              <span>誤答ペナルティ: <strong class="text-warning">${safeMissCount}回</strong></span>
            </div>
          </div>
        `;

        // メディアのタップ全画面拡大イベント登録
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

    // 案内完了・退室ボタンを非表示化（チップ切り替え運用に完全移行）
    const finishBtn = document.getElementById('btn-finish-result');
    if (finishBtn) finishBtn.classList.add('hidden');

    this.showContentView();
  },

  /**
   * 総合ランキング一覧の取得 & 描画
   */
  async fetchRanking() {
    const listContainer = document.getElementById('ranking-list-container');
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

      // 順位バッジの装飾
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
          ${item.exQualified ? '<span class="badge badge-ex font-cyber">EX OVERRIDE</span>' : ''}
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