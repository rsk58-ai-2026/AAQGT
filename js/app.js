/**
 * PROJECT AI 〜人類最後のアップデートが始まる〜
 * js/app.js - メインコントローラー / 役割振り分け / 共通モーダル制御
 */

const AppEngine = {
  init() {
    const savedRole = AppStorage.getRole();

    // 役割が未設定の場合は役割選択画面を必ず表示
    if (!savedRole) {
      const roleScreen = document.getElementById('role-select-screen');
      if (roleScreen) {
        roleScreen.classList.remove('hidden');
      }
    }
  },

  /**
   * 端末の役割を選択して保存しリロード
   * @param {string} role
   */
  selectRole(role) {
    AppStorage.setRole(role);
    location.reload();
  },

  /**
   * 端末の役割をリセットして選択画面へ戻す
   */
  resetRole() {
    if (confirm('端末の役割設定を変更しますか？\n（役割選択画面へ戻ります）')) {
      AppStorage.clearRole();
      location.reload();
    }
  }
};

const AppUI = {
  /**
   * メディア（画像・動画）を全画面モーダルで表示
   * @param {string} mediaUrl
   * @param {boolean} isVideo
   */
  openMediaFullscreen(mediaUrl, isVideo = false) {
    const modal = document.getElementById('media-fullscreen-modal');
    const container = document.getElementById('fullscreen-media-content');
    if (!modal || !container || !mediaUrl) return;

    container.innerHTML = '';

    if (isVideo || mediaUrl.match(/\.(mp4|webm|mov)$/i)) {
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
      img.alt = '全画面プレビュー';
      container.appendChild(img);
    }

    modal.classList.remove('hidden');
  },

  /**
   * メディア全画面モーダルを閉じる
   */
  closeMediaFullscreen() {
    const modal = document.getElementById('media-fullscreen-modal');
    const container = document.getElementById('fullscreen-media-content');
    if (modal) modal.classList.add('hidden');
    if (container) container.innerHTML = '';
  }
};

const ManualModal = {
  cachedQuestions: [],
  currentFilter: 'all',

  open() {
    const modal = document.getElementById('manual-modal');
    if (modal) {
      modal.classList.remove('hidden');
      this.switchTab('flow');
      this.loadQuestions();
    }
  },

  close() {
    const modal = document.getElementById('manual-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
  },

  switchTab(tabName) {
    const btnFlow = document.getElementById('tab-btn-flow');
    const btnDb = document.getElementById('tab-btn-db');
    const contentFlow = document.getElementById('manual-content-flow');
    const contentDb = document.getElementById('manual-content-db');

    if (btnFlow) btnFlow.classList.toggle('active', tabName === 'flow');
    if (btnDb) btnDb.classList.toggle('active', tabName === 'db');

    if (contentFlow) contentFlow.classList.toggle('hidden', tabName !== 'flow');
    if (contentDb) contentDb.classList.toggle('hidden', tabName !== 'db');
  },

  async loadQuestions() {
    const listContainer = document.getElementById('manual-questions-list');
    if (this.cachedQuestions.length > 0) {
      this.renderQuestionsList();
      return;
    }

    try {
      const cached = AppStorage.getCachedQuestions();
      if (cached && cached.length > 0) {
        this.cachedQuestions = cached;
        this.renderQuestionsList();
      }

      const res = await API.getQuestions();
      if (res && res.success && Array.isArray(res.questions)) {
        this.cachedQuestions = res.questions;
        AppStorage.cacheQuestions(res.questions);
        this.renderQuestionsList();
      } else {
        if (listContainer && this.cachedQuestions.length === 0) {
          listContainer.innerHTML = '<div class="text-center text-muted py-4 font-cyber">問題データがありません</div>';
        }
      }
    } catch (e) {
      if (listContainer && this.cachedQuestions.length === 0) {
        listContainer.innerHTML = '<div class="text-center text-danger py-4 font-cyber">問題データの取得に失敗しました</div>';
      }
    }
  },

  filterQuestions(filter) {
    this.currentFilter = filter;
    const buttons = document.querySelectorAll('.db-filter-chip');
    buttons.forEach(btn => {
      btn.classList.remove('active');
      const onclickAttr = btn.getAttribute('onclick') || '';
      if (onclickAttr.includes(`'${filter}'`)) {
        btn.classList.add('active');
      }
    });

    this.renderQuestionsList();
  },

  renderQuestionsList() {
    const container = document.getElementById('manual-questions-list');
    if (!container) return;

    let filtered = this.cachedQuestions;
    if (this.currentFilter === '1' || this.currentFilter === '2' || this.currentFilter === '3') {
      filtered = filtered.filter(q => String(q.room) === this.currentFilter);
    } else if (this.currentFilter === 'ex') {
      filtered = filtered.filter(q => String(q.difficulty).toLowerCase() === 'ex');
    }

    if (filtered.length === 0) {
      container.innerHTML = '<div class="text-center text-muted py-4 font-cyber">該当する問題がありません</div>';
      return;
    }

    container.innerHTML = filtered.map(q => {
      const hintsHtml = (q.hints && q.hints.length > 0)
        ? `<div class="cheat-exp"><strong>ヒント:</strong> ${q.hints.join(' / ')}</div>`
        : '';

      return `
        <div class="manual-db-card">
          <div class="cheat-item-head">
            <span class="badge badge-secondary font-mono">${q.id || '--'}</span>
            <span class="badge badge-admin font-cyber">NODE ${q.room || '-'}</span>
            <span class="font-cyber font-bold text-highlight">[${String(q.difficulty || '').toUpperCase()}]</span>
          </div>
          <p class="cheat-qtext mt-1"><strong>問題:</strong> ${q.question_text || ''}</p>
          <div class="cheat-ans-box mt-1">
            <span class="cheat-label">正解:</span>
            <strong class="text-success font-mono font-bold">${q.answer || '--'}</strong>
          </div>
          ${hintsHtml}
          ${q.explanation ? `<div class="cheat-exp mt-1"><strong>解説:</strong> ${q.explanation}</div>` : ''}
        </div>
      `;
    }).join('');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  AppEngine.init();
});