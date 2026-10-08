(function () {
  const STORAGE_KEY = "isc2_ccsp_mastery_state_v1";

  // Merge all 6 domains + extra cards + bonus questions
  const rawDomains = [
    window.CCSP_DOMAIN_1,
    window.CCSP_DOMAIN_2,
    window.CCSP_DOMAIN_3,
    window.CCSP_DOMAIN_4,
    window.CCSP_DOMAIN_5,
    window.CCSP_DOMAIN_6,
  ].filter(Boolean);

  const extra = window.CCSP_EXTRA_CONTENT || { extraCards: {}, bonusQuestions: [], referenceTables: {} };

  const DOMAINS = rawDomains.map((dom) => {
    const extraCardsForDom = (extra.extraCards && extra.extraCards[dom.id]) || [];
    const bonusQsForDom = (extra.bonusQuestions || []).filter((q) => q.domainId === dom.id);
    const mergedCards = [...(dom.cards || []), ...extraCardsForDom].map((c) => ({
      ...c,
      domainId: dom.id,
      domainNumber: dom.number,
      domainTitle: dom.title,
      domainColor: dom.color,
    }));
    const mergedQuestions = [...(dom.questions || []), ...bonusQsForDom].map((q) => ({
      ...q,
      domainId: dom.id,
      domainNumber: dom.number,
      domainTitle: dom.title,
      domainColor: dom.color,
    }));
    return {
      ...dom,
      cards: mergedCards,
      questions: mergedQuestions,
    };
  });

  const ALL_CARDS = DOMAINS.flatMap((d) => d.cards);
  const ALL_QUESTIONS = DOMAINS.flatMap((d) => d.questions);

  // Default persistent state
  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          theme: parsed.theme || "dark",
          cardStatus: parsed.cardStatus || {}, // { [cardId]: 'learning' | 'mastered' }
          cardBookmarks: parsed.cardBookmarks || {}, // { [cardId]: true }
          questionHistory: parsed.questionHistory || {}, // { [qId]: { correct: boolean, lastChoice: number, attempts: number } }
          questionBookmarks: parsed.questionBookmarks || {}, // { [qId]: true }
        };
      }
    } catch (e) {
      console.warn("Could not read localStorage state:", e);
    }
    return {
      theme: "dark",
      cardStatus: {},
      cardBookmarks: {},
      questionHistory: {},
      questionBookmarks: {},
    };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Could not save localStorage state:", e);
    }
  }

  let state = loadState();

  // Lightweight Markdown-to-HTML formatter for deep-dive cards
  function formatMarkdown(md) {
    if (!md) return "";
    const lines = md.split("\n");
    let html = "";
    let inList = null; // 'ul' | 'ol'
    let inTable = false;
    let tableRows = [];

    function flushList() {
      if (inList) {
        html += `</${inList}>`;
        inList = null;
      }
    }

    function flushTable() {
      if (inTable && tableRows.length > 0) {
        html += `<div class="md-table-wrapper"><table class="md-table">`;
        tableRows.forEach((row, idx) => {
          const cells = row
            .split("|")
            .slice(1, -1)
            .map((c) => c.trim());
          if (idx === 0) {
            html += `<thead><tr>${cells.map((c) => `<th>${inlineFormat(c)}</th>`).join("")}</tr></thead><tbody>`;
          } else if (idx === 1 && cells.every((c) => /^[:\-]+$/.test(c))) {
            // separator row
          } else {
            html += `<tr>${cells.map((c) => `<td>${inlineFormat(c)}</td>`).join("")}</tr>`;
          }
        });
        html += `</tbody></table></div>`;
        inTable = false;
        tableRows = [];
      }
    }

    function inlineFormat(str) {
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>");
    }

    for (let rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        flushList();
        flushTable();
        continue;
      }
      if (line.startsWith("|") && line.endsWith("|")) {
        flushList();
        inTable = true;
        tableRows.push(line);
        continue;
      } else {
        flushTable();
      }

      if (line.startsWith("### ")) {
        flushList();
        html += `<h3>${inlineFormat(line.slice(4))}</h3>`;
      } else if (/^\d+\.\s+/.test(line)) {
        if (inList !== "ol") {
          flushList();
          inList = "ol";
          html += "<ol>";
        }
        html += `<li>${inlineFormat(line.replace(/^\d+\.\s+/, ""))}</li>`;
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        if (inList !== "ul") {
          flushList();
          inList = "ul";
          html += "<ul>";
        }
        html += `<li>${inlineFormat(line.slice(2))}</li>`;
      } else {
        flushList();
        html += `<p style="margin-bottom:0.75rem;">${inlineFormat(line)}</p>`;
      }
    }
    flushList();
    flushTable();
    return html;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  // App UI runtime state
  const app = {
    currentTab: "dashboard",
    cardMode: "deck", // 'deck' | 'grid'
    filteredCards: [...ALL_CARDS],
    currentCardIndex: 0,
    isCardRevealed: true,

    // Quiz setup & active session
    quizConfig: {
      mode: "learn", // 'learn' | 'exam'
      domain: "all",
      pool: "all",
      count: 20,
    },
    activeQuiz: null,
    qbankRevealAll: false,
    qbankRevealedIds: {},

    init() {
      document.documentElement.setAttribute("data-theme", state.theme || "dark");
      document.getElementById("nav-cards-count").textContent = ALL_CARDS.length;
      document.getElementById("nav-qbank-count").textContent = ALL_QUESTIONS.length;

      this.renderDashboard();
      this.renderCardsView();
      this.renderQBankView();
      this.renderReferenceAll();

      // Keyboard navigation for study cards
      window.addEventListener("keydown", (e) => {
        if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
        if (this.currentTab === "cards" && this.cardMode === "deck") {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            this.nextCard();
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            this.prevCard();
          } else if (e.key === " ") {
            e.preventDefault();
            this.toggleRevealCard();
          }
        }
      });
    },

    toggleTheme() {
      state.theme = state.theme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", state.theme);
      saveState();
    },

    resetProgressPrompt() {
      if (confirm("Reset all your saved study card mastery, bookmarks, and quiz history?")) {
        state = {
          theme: state.theme,
          cardStatus: {},
          cardBookmarks: {},
          questionHistory: {},
          questionBookmarks: {},
        };
        saveState();
        this.renderDashboard();
        this.renderCardsView();
        this.renderQBankView();
      }
    },

    switchTab(tabId) {
      this.currentTab = tabId;
      document.querySelectorAll(".nav-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.tab === tabId);
      });
      document.querySelectorAll(".view-section").forEach((sec) => {
        sec.classList.toggle("active", sec.id === `view-${tabId}`);
      });
      if (tabId === "dashboard") this.renderDashboard();
      if (tabId === "cards") this.renderCardsView();
      if (tabId === "qbank") this.renderQBankView();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    // ==================== DASHBOARD ====================
    renderDashboard() {
      const totalCards = ALL_CARDS.length;
      const masteredCount = ALL_CARDS.filter((c) => state.cardStatus[c.id] === "mastered").length;
      const learningCount = ALL_CARDS.filter((c) => state.cardStatus[c.id] === "learning").length;
      const cardPct = totalCards ? Math.round((masteredCount / totalCards) * 100) : 0;

      const totalQs = ALL_QUESTIONS.length;
      const answeredIds = Object.keys(state.questionHistory);
      const answeredCount = answeredIds.length;
      const correctCount = answeredIds.filter((id) => state.questionHistory[id]?.correct).length;
      const qPct = totalQs ? Math.round((answeredCount / totalQs) * 100) : 0;
      const accPct = answeredCount ? Math.round((correctCount / answeredCount) * 100) : null;

      const bookmarkedTotal =
        Object.keys(state.cardBookmarks).filter((k) => state.cardBookmarks[k]).length +
        Object.keys(state.questionBookmarks).filter((k) => state.questionBookmarks[k]).length;

      document.getElementById("stat-cards-mastered").textContent = `${masteredCount} / ${totalCards}`;
      document.getElementById("bar-cards-mastered").style.width = `${cardPct}%`;
      document.getElementById("stat-cards-sub").textContent = `${cardPct}% mastered (${learningCount} in review)`;

      document.getElementById("stat-q-answered").textContent = `${answeredCount} / ${totalQs}`;
      document.getElementById("bar-q-answered").style.width = `${qPct}%`;
      document.getElementById("stat-q-sub").textContent = `${totalQs - answeredCount} unanswered questions remaining`;

      document.getElementById("stat-accuracy").textContent = accPct !== null ? `${accPct}%` : "—";
      document.getElementById("bar-accuracy").style.width = `${accPct || 0}%`;
      document.getElementById("stat-accuracy-sub").textContent =
        accPct !== null
          ? `${correctCount} correct of ${answeredCount} answered (Target: 80%+)`
          : "Take a quiz to measure accuracy";

      document.getElementById("stat-bookmarked").textContent = bookmarkedTotal;

      // Render 6 Domains Grid
      const grid = document.getElementById("dashboard-domains-grid");
      grid.innerHTML = DOMAINS.map((dom) => {
        const dCards = dom.cards.length;
        const dMastered = dom.cards.filter((c) => state.cardStatus[c.id] === "mastered").length;
        const dCardPct = dCards ? Math.round((dMastered / dCards) * 100) : 0;

        const dQs = dom.questions.length;
        const dAnswered = dom.questions.filter((q) => state.questionHistory[q.id]).length;
        const dCorrect = dom.questions.filter((q) => state.questionHistory[q.id]?.correct).length;
        const dAcc = dAnswered ? `${Math.round((dCorrect / dAnswered) * 100)}%` : "—";

        return `
          <div class="domain-card">
            <div>
              <div class="domain-card-top">
                <span class="domain-number-badge" style="background:${dom.color}">Domain ${dom.number}</span>
                <span class="domain-weight-badge">Exam Weight: ${dom.weight}</span>
              </div>
              <h4>${escapeHtml(dom.title)}</h4>
              <p class="domain-mindset-preview">${escapeHtml(dom.examMindset)}</p>
            </div>
            <div>
              <div class="domain-metrics">
                <div>
                  <div style="color:var(--text-muted);font-weight:600;">Study Cards</div>
                  <div style="font-weight:800;font-size:0.95rem;">${dMastered} / ${dCards} Mastered (${dCardPct}%)</div>
                </div>
                <div>
                  <div style="color:var(--text-muted);font-weight:600;">Quiz Accuracy</div>
                  <div style="font-weight:800;font-size:0.95rem;">${dAcc} (${dAnswered}/${dQs} done)</div>
                </div>
              </div>
              <div class="domain-actions">
                <button class="btn btn-outline btn-sm" onclick="app.startStudyDeck('${dom.id}')">
                  🗂️ Study Cards (${dCards})
                </button>
                <button class="btn btn-primary btn-sm" onclick="app.quickStartQuiz('learn', '${dom.id}', 15)">
                  🎯 Practice Quiz (${dQs})
                </button>
              </div>
            </div>
          </div>
        `;
      }).join("");

      // Render Exam Mindset Golden Rules
      const mindsetGrid = document.getElementById("dashboard-mindset-grid");
      const rules = (extra.referenceTables && extra.referenceTables.examMindsetRules) || [];
      mindsetGrid.innerHTML = rules
        .map(
          (r) => `
        <div class="mindset-card">
          <h4>${escapeHtml(r.title)}</h4>
          <p>${escapeHtml(r.detail)}</p>
        </div>
      `
        )
        .join("");
    },

    // ==================== INTERACTIVE STUDY CARDS ====================
    startStudyDeck(domainId) {
      document.getElementById("cards-domain-filter").value = domainId || "all";
      document.getElementById("cards-status-filter").value = "all";
      document.getElementById("cards-search").value = "";
      this.currentCardIndex = 0;
      this.switchTab("cards");
    },

    setCardMode(mode) {
      this.cardMode = mode;
      document.getElementById("btn-mode-deck").classList.toggle("active", mode === "deck");
      document.getElementById("btn-mode-grid").classList.toggle("active", mode === "grid");
      document.getElementById("cards-deck-container").classList.toggle("hidden", mode !== "deck");
      document.getElementById("cards-grid-container").classList.toggle("hidden", mode !== "grid");
      this.renderCardsView();
    },

    getFilteredCards() {
      const q = (document.getElementById("cards-search")?.value || "").trim().toLowerCase();
      const domFilter = document.getElementById("cards-domain-filter")?.value || "all";
      const statusFilter = document.getElementById("cards-status-filter")?.value || "all";

      return ALL_CARDS.filter((c) => {
        if (domFilter !== "all" && c.domainId !== domFilter) return false;
        const st = state.cardStatus[c.id] || "unread";
        if (statusFilter === "unread" && st !== "unread") return false;
        if (statusFilter === "learning" && st !== "learning") return false;
        if (statusFilter === "mastered" && st !== "mastered") return false;
        if (statusFilter === "bookmarked" && !state.cardBookmarks[c.id]) return false;

        if (q) {
          const hay = `${c.title} ${c.topic} ${c.superficialView} ${c.deepDive} ${c.realWorldScenario} ${c.examTrap} ${(c.standards || []).join(" ")}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    },

    renderCardsView() {
      this.filteredCards = this.getFilteredCards();
      if (this.currentCardIndex >= this.filteredCards.length) {
        this.currentCardIndex = 0;
      }

      // Show domain mindset banner if filtered to a single domain
      const domFilter = document.getElementById("cards-domain-filter")?.value || "all";
      const banner = document.getElementById("cards-domain-mindset-banner");
      if (domFilter !== "all") {
        const domObj = DOMAINS.find((d) => d.id === domFilter);
        if (domObj) {
          banner.classList.remove("hidden");
          banner.style.borderLeftColor = domObj.color;
          banner.innerHTML = `<strong>💡 Domain ${domObj.number} Exam Mindset (${escapeHtml(domObj.title)} — ${domObj.weight}):</strong> ${escapeHtml(domObj.examMindset)}`;
        }
      } else {
        banner.classList.add("hidden");
      }

      if (this.cardMode === "deck") {
        this.renderDeckStage();
      } else {
        this.renderCardsGrid();
      }
    },

    renderCardInnerHtml(card, isModal = false) {
      const st = state.cardStatus[card.id] || "unread";
      const isBookmarked = !!state.cardBookmarks[card.id];
      const revealed = isModal ? true : this.isCardRevealed;

      return `
        <div class="card-meta-header">
          <div class="card-badges">
            <span class="badge badge-domain" style="background:${card.domainColor}">Domain ${card.domainNumber}</span>
            <span class="badge badge-topic">${escapeHtml(card.topic)}</span>
            <span class="badge ${card.importance.includes("Critical") ? "badge-critical" : "badge-high"}">
              🔥 ${escapeHtml(card.importance)}
            </span>
          </div>
          <div style="display:flex;gap:0.5rem;align-items:center;">
            <button class="status-btn" onclick="app.toggleCardBookmark('${card.id}', ${isModal})" title="Bookmark this concept">
              ${isBookmarked ? "⭐ Bookmarked" : "☆ Bookmark"}
            </button>
            ${
              isModal
                ? `<button class="status-btn" onclick="app.closeCardModal()">✕ Close</button>`
                : ""
            }
          </div>
        </div>

        <h2 class="study-card-title">${escapeHtml(card.title)}</h2>

        <div class="superficial-box">
          <div class="superficial-label">🧐 Common Superficial View (What Beginners Think)</div>
          <div class="superficial-text">"${escapeHtml(card.superficialView)}"</div>
        </div>

        ${
          !revealed
            ? `
          <div class="flip-reveal-prompt" onclick="app.toggleRevealCard()">
            <div style="font-size:1.3rem;font-weight:800;color:var(--primary);margin-bottom:0.35rem;">
              🔓 Click or Press [Space] to Reveal Full CCSP Architect Deep-Dive
            </div>
            <div style="font-size:0.88rem;color:var(--text-muted);">
              Includes technical architecture, real-world scenario, shared responsibility, standards, and ISC2 exam traps
            </div>
          </div>
        `
            : `
          <div class="deep-dive-body">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
              <span style="font-size:0.8rem;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--success);">
                🎓 Deep CCSP Architect Reality &amp; Full Explanation
              </span>
              ${
                !isModal
                  ? `<button class="btn btn-outline btn-sm" onclick="app.toggleRevealCard()">🙈 Collapse Deep-Dive</button>`
                  : ""
              }
            </div>
            <div class="deep-dive-content">
              ${formatMarkdown(card.deepDive)}
            </div>

            <div class="card-callouts-grid">
              <div class="callout-box scenario">
                <div class="callout-title" style="color:var(--primary);">🏢 Real-World Cloud Scenario</div>
                <div>${escapeHtml(card.realWorldScenario)}</div>
              </div>
              <div class="callout-box shared">
                <div class="callout-title" style="color:var(--success);">🤝 Shared Responsibility Breakdown</div>
                <div>${escapeHtml(card.sharedResponsibility)}</div>
              </div>
              <div class="callout-box trap">
                <div class="callout-title" style="color:var(--danger);">⚠️ ISC2 Exam Trap — Watch Out For This!</div>
                <div><strong>${escapeHtml(card.examTrap)}</strong></div>
              </div>
            </div>

            <div class="standards-tags">
              <span style="font-size:0.78rem;font-weight:700;color:var(--text-muted);align-self:center;">Key Standards &amp; Frameworks:</span>
              ${(card.standards || []).map((s) => `<span class="std-tag">📜 ${escapeHtml(s)}</span>`).join("")}
            </div>
          </div>
        `
        }

        <div class="card-footer-actions">
          <div class="mastery-buttons">
            <span style="font-size:0.84rem;color:var(--text-muted);align-self:center;margin-right:0.25rem;">Mark Mastery:</span>
            <button class="status-btn ${st === "learning" ? "active-learning" : ""}" onclick="app.setCardStatus('${card.id}', 'learning', ${isModal})">
              🔄 Still Learning / Review Again
            </button>
            <button class="status-btn ${st === "mastered" ? "active-mastered" : ""}" onclick="app.setCardStatus('${card.id}', 'mastered', ${isModal})">
              ✅ Mastered Concept
            </button>
          </div>
          ${
            !isModal
              ? `
            <div style="display:flex;gap:0.5rem;">
              <button class="btn btn-outline btn-sm" onclick="app.prevCard()">← Previous Card</button>
              <button class="btn btn-primary btn-sm" onclick="app.nextCard()">Next Card →</button>
            </div>
          `
              : ""
          }
        </div>
      `;
    },

    renderDeckStage() {
      const container = document.getElementById("cards-deck-container");
      if (this.filteredCards.length === 0) {
        container.innerHTML = `
          <div class="study-card-stage" style="text-align:center;padding:3rem;">
            <h3>No Study Cards Match Your Current Filters</h3>
            <p style="color:var(--text-muted);margin:0.5rem 0 1.25rem;">Try clearing your search query or switching the status filter back to "All Statuses".</p>
            <button class="btn btn-primary" onclick="app.startStudyDeck('all')">Reset Filters</button>
          </div>
        `;
        return;
      }

      const card = this.filteredCards[this.currentCardIndex];
      container.innerHTML = `
        <div class="deck-nav-bar">
          <div class="deck-counter">
            Showing Card <strong>${this.currentCardIndex + 1}</strong> of <strong>${this.filteredCards.length}</strong>
            <span style="margin-left:0.75rem;font-weight:500;font-size:0.82rem;color:var(--text-subtle);">
              (Tip: Use ⬅️ ➡️ arrow keys to navigate, [Space] to expand/collapse)
            </span>
          </div>
          <div class="deck-controls">
            <button class="btn btn-outline btn-sm" onclick="app.prevCard()">← Prev</button>
            <button class="btn btn-outline btn-sm" onclick="app.shuffleCards()">🔀 Shuffle Deck</button>
            <button class="btn btn-primary btn-sm" onclick="app.nextCard()">Next →</button>
          </div>
        </div>
        <div class="study-card-stage">
          ${this.renderCardInnerHtml(card, false)}
        </div>
      `;
    },

    renderCardsGrid() {
      const container = document.getElementById("cards-grid-container");
      if (this.filteredCards.length === 0) {
        container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2.5rem;color:var(--text-muted);">No cards match your filter.</div>`;
        return;
      }
      container.innerHTML = this.filteredCards
        .map((c) => {
          const st = state.cardStatus[c.id] || "unread";
          const stBadge =
            st === "mastered"
              ? `<span class="badge" style="background:var(--success-bg);color:var(--success);">✅ Mastered</span>`
              : st === "learning"
              ? `<span class="badge" style="background:var(--warning-bg);color:var(--warning);">🔄 Learning</span>`
              : `<span class="badge badge-topic">🆕 Unread</span>`;

          return `
            <div class="grid-card-item" onclick="app.openCardModal('${c.id}')">
              <div>
                <div style="display:flex;justify-content:space-between;gap:0.5rem;flex-wrap:wrap;">
                  <span class="badge badge-domain" style="background:${c.domainColor}">Domain ${c.domainNumber}</span>
                  ${stBadge}
                </div>
                <h4>${escapeHtml(c.title)}</h4>
                <p><strong>Superficial myth:</strong> "${escapeHtml(c.superficialView)}"</p>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding-top:0.75rem;border-top:1px solid var(--border-color);font-size:0.8rem;color:var(--primary);font-weight:700;">
                <span>${escapeHtml(c.topic)}</span>
                <span>Open Deep-Dive →</span>
              </div>
            </div>
          `;
        })
        .join("");
    },

    openCardModal(cardId) {
      const card = ALL_CARDS.find((c) => c.id === cardId);
      if (!card) return;
      const modal = document.getElementById("card-modal-backdrop");
      const body = document.getElementById("card-modal-body");
      body.innerHTML = this.renderCardInnerHtml(card, true);
      modal.classList.remove("hidden");
    },

    closeCardModal() {
      document.getElementById("card-modal-backdrop").classList.add("hidden");
    },

    prevCard() {
      if (!this.filteredCards.length) return;
      this.currentCardIndex =
        (this.currentCardIndex - 1 + this.filteredCards.length) % this.filteredCards.length;
      this.renderDeckStage();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    nextCard() {
      if (!this.filteredCards.length) return;
      this.currentCardIndex = (this.currentCardIndex + 1) % this.filteredCards.length;
      this.renderDeckStage();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    shuffleCards() {
      for (let i = this.filteredCards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.filteredCards[i], this.filteredCards[j]] = [this.filteredCards[j], this.filteredCards[i]];
      }
      this.currentCardIndex = 0;
      this.renderDeckStage();
    },

    toggleRevealCard() {
      this.isCardRevealed = !this.isCardRevealed;
      this.renderDeckStage();
    },

    setCardStatus(cardId, status, isModal = false) {
      if (state.cardStatus[cardId] === status) {
        delete state.cardStatus[cardId];
      } else {
        state.cardStatus[cardId] = status;
      }
      saveState();
      if (isModal) {
        this.openCardModal(cardId);
      }
      this.renderCardsView();
    },

    toggleCardBookmark(cardId, isModal = false) {
      state.cardBookmarks[cardId] = !state.cardBookmarks[cardId];
      if (!state.cardBookmarks[cardId]) delete state.cardBookmarks[cardId];
      saveState();
      if (isModal) {
        this.openCardModal(cardId);
      }
      this.renderCardsView();
    },

    // ==================== QUIZ & EXAM SIMULATOR ====================
    selectQuizMode(mode) {
      this.quizConfig.mode = mode;
      document.querySelectorAll("#quiz-mode-selector .radio-card").forEach((el) => {
        const input = el.querySelector("input");
        const match = input && input.value === mode;
        if (input) input.checked = match;
        el.classList.toggle("selected", match);
      });
    },

    setQuizCount(n) {
      this.quizConfig.count = n;
      document.querySelectorAll("#quiz-count-pills .count-pill").forEach((btn) => {
        const val = parseInt(btn.textContent, 10) || 999;
        btn.classList.toggle("active", val === n);
      });
    },

    quickStartQuiz(poolOrMode, domainId, count) {
      this.switchTab("quiz");
      if (poolOrMode === "missed") {
        this.selectQuizMode("learn");
        document.getElementById("quiz-domain-select").value = domainId || "all";
        document.getElementById("quiz-pool-select").value = "missed";
        this.setQuizCount(count || 20);
      } else {
        this.selectQuizMode(poolOrMode || "learn");
        document.getElementById("quiz-domain-select").value = domainId || "all";
        document.getElementById("quiz-pool-select").value = "all";
        this.setQuizCount(count || 15);
      }
      this.launchConfiguredQuiz();
    },

    launchConfiguredQuiz() {
      const domain = document.getElementById("quiz-domain-select").value;
      const pool = document.getElementById("quiz-pool-select").value;
      const mode = this.quizConfig.mode;
      const count = this.quizConfig.count;

      let candidates = ALL_QUESTIONS.filter((q) => {
        if (domain !== "all" && q.domainId !== domain) return false;
        const hist = state.questionHistory[q.id];
        if (pool === "unanswered" && hist) return false;
        if (pool === "missed" && (!hist || hist.correct)) return false;
        if (pool === "bookmarked" && !state.questionBookmarks[q.id]) return false;
        if (pool === "hard" && q.difficulty !== "Hard") return false;
        return true;
      });

      if (candidates.length === 0) {
        // Fallback if user has no missed/bookmarked questions yet
        if (pool === "missed") {
          alert("You don't have any missed questions in this domain yet! Launching with unanswered/all questions instead.");
          candidates = ALL_QUESTIONS.filter((q) => domain === "all" || q.domainId === domain);
        } else {
          alert("No questions matched your filter criteria. Please broaden your selection.");
          return;
        }
      }

      // Shuffle candidates
      const shuffled = [...candidates];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const selectedQuestions = shuffled.slice(0, Math.min(count, shuffled.length));

      if (this.activeQuiz && this.activeQuiz.timerInterval) {
        clearInterval(this.activeQuiz.timerInterval);
      }

      this.activeQuiz = {
        mode, // 'learn' | 'exam'
        questions: selectedQuestions,
        currentIndex: 0,
        answers: {}, // { [idx]: chosenOptionIndex }
        flagged: {}, // { [idx]: true }
        startTime: Date.now(),
        elapsedSeconds: 0,
        totalSecondsAllowed: selectedQuestions.length * 75, // ~1.25 min per question
        timerInterval: null,
        finished: false,
      };

      this.activeQuiz.timerInterval = setInterval(() => {
        if (!this.activeQuiz || this.activeQuiz.finished) return;
        this.activeQuiz.elapsedSeconds++;
        const timerEl = document.getElementById("quiz-live-timer");
        if (timerEl) {
          if (this.activeQuiz.mode === "exam") {
            const rem = Math.max(0, this.activeQuiz.totalSecondsAllowed - this.activeQuiz.elapsedSeconds);
            timerEl.textContent = `⏳ ${this.formatTime(rem)}`;
            if (rem === 0) {
              this.finishQuiz();
            }
          } else {
            timerEl.textContent = `⏱️ ${this.formatTime(this.activeQuiz.elapsedSeconds)}`;
          }
        }
      }, 1000);

      document.getElementById("quiz-setup-panel").classList.add("hidden");
      document.getElementById("quiz-results-panel").classList.add("hidden");
      document.getElementById("quiz-active-panel").classList.remove("hidden");

      this.renderActiveQuizQuestion();
    },

    formatTime(sec) {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    },

    renderActiveQuizQuestion() {
      const qz = this.activeQuiz;
      if (!qz) return;
      const idx = qz.currentIndex;
      const q = qz.questions[idx];
      const chosen = qz.answers[idx];
      const hasAnswered = chosen !== undefined;
      const isLearnMode = qz.mode === "learn";
      const isFlagged = !!qz.flagged[idx];
      const isBookmarked = !!state.questionBookmarks[q.id];

      const panel = document.getElementById("quiz-active-panel");
      const letters = ["A", "B", "C", "D"];

      panel.innerHTML = `
        <div class="quiz-topbar">
          <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
            <span class="badge badge-domain" style="background:${q.domainColor}">Domain ${q.domainNumber}</span>
            <span style="font-weight:700;">Question ${idx + 1} of ${qz.questions.length}</span>
            <span class="badge badge-topic">${escapeHtml(q.topic)}</span>
            <span class="badge badge-topic">Difficulty: ${escapeHtml(q.difficulty)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:0.6rem;">
            <span class="quiz-timer-badge" id="quiz-live-timer">
              ${
                qz.mode === "exam"
                  ? `⏳ ${this.formatTime(Math.max(0, qz.totalSecondsAllowed - qz.elapsedSeconds))}`
                  : `⏱️ ${this.formatTime(qz.elapsedSeconds)}`
              }
            </span>
            <button class="btn btn-outline btn-sm" onclick="app.toggleQuizFlag(${idx})">
              ${isFlagged ? "🚩 Flagged" : "🏳️ Flag"}
            </button>
            <button class="btn btn-outline btn-sm" onclick="app.toggleQuestionBookmark('${q.id}', true)">
              ${isBookmarked ? "⭐ Saved" : "☆ Bookmark"}
            </button>
            <button class="btn btn-outline btn-sm" onclick="app.exitQuizToSetup()">✕ Quit</button>
          </div>
        </div>

        <div class="quiz-question-card">
          <div class="quiz-q-stem">${escapeHtml(q.question)}</div>

          <div class="quiz-options-list">
            ${q.options
              .map((optText, optIdx) => {
                let cls = "quiz-option-btn";
                if (hasAnswered) {
                  if (isLearnMode) {
                    if (optIdx === q.correctIndex) cls += " correct-choice";
                    else if (optIdx === chosen && chosen !== q.correctIndex) cls += " wrong-choice";
                  } else {
                    if (optIdx === chosen) cls += " selected-exam";
                  }
                }
                const disabledAttr = isLearnMode && hasAnswered ? "disabled" : "";
                return `
                  <button class="${cls}" ${disabledAttr} onclick="app.submitQuizAnswer(${optIdx})">
                    <span class="opt-letter">${letters[optIdx]}</span>
                    <span>${escapeHtml(optText)}</span>
                  </button>
                `;
              })
              .join("")}
          </div>

          ${
            isLearnMode && hasAnswered
              ? `
            <div class="quiz-explanation-panel ${chosen === q.correctIndex ? "" : "wrong-banner"}">
              <div class="exp-verdict" style="color:${chosen === q.correctIndex ? "var(--success)" : "var(--danger)"}">
                ${
                  chosen === q.correctIndex
                    ? "✅ Correct! Deep-Dive Architectural Explanation:"
                    : `❌ Not Quite — You selected ${letters[chosen]}, but the correct answer is ${letters[q.correctIndex]}:`
                }
              </div>
              <div class="exp-core">
                <strong>Why ${letters[q.correctIndex]} is Correct:</strong> ${escapeHtml(q.explanation)}
              </div>
              ${
                q.distractorAnalysis && q.distractorAnalysis.length
                  ? `
                <div class="distractor-box">
                  <h5>🔍 Why the Other Options (Distractors) Fail:</h5>
                  <ul>
                    ${q.distractorAnalysis.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}
                  </ul>
                </div>
              `
                  : ""
              }
              <div class="exam-tip-callout">
                <strong>🎯 ISC2 Exam Tip:</strong> ${escapeHtml(q.examTip)}
              </div>
            </div>
          `
              : ""
          }

          <div class="card-footer-actions">
            <button class="btn btn-outline" ${idx === 0 ? "disabled" : ""} onclick="app.goToQuizIndex(${idx - 1})">
              ← Previous Question
            </button>
            <div style="display:flex;gap:0.65rem;">
              ${
                idx < qz.questions.length - 1
                  ? `<button class="btn btn-primary" onclick="app.goToQuizIndex(${idx + 1})">Next Question →</button>`
                  : `<button class="btn btn-success btn-large" onclick="app.finishQuiz()">🏁 Finish &amp; View Diagnostic Report</button>`
              }
              ${
                Object.keys(qz.answers).length > 0 && idx < qz.questions.length - 1
                  ? `<button class="btn btn-outline" onclick="app.finishQuiz()">Finish Early</button>`
                  : ""
              }
            </div>
          </div>
        </div>

        <!-- Question Navigator Palette -->
        <div class="quiz-palette">
          ${qz.questions
            .map((item, i) => {
              let dotCls = "palette-dot";
              if (i === idx) dotCls += " current";
              if (qz.answers[i] !== undefined) {
                if (isLearnMode) {
                  dotCls += qz.answers[i] === item.correctIndex ? " dot-correct" : " dot-wrong";
                } else {
                  dotCls += " dot-answered";
                }
              }
              if (qz.flagged[i]) dotCls += " dot-flagged";
              return `<button class="${dotCls}" onclick="app.goToQuizIndex(${i})" title="Jump to Question ${i + 1}">${i + 1}</button>`;
            })
            .join("")}
        </div>
      `;
    },

    submitQuizAnswer(optIdx) {
      const qz = this.activeQuiz;
      if (!qz) return;
      const idx = qz.currentIndex;
      const q = qz.questions[idx];

      qz.answers[idx] = optIdx;

      // Record in persistent history immediately in Learn mode
      if (qz.mode === "learn") {
        const prev = state.questionHistory[q.id] || { attempts: 0 };
        state.questionHistory[q.id] = {
          correct: optIdx === q.correctIndex,
          lastChoice: optIdx,
          attempts: prev.attempts + 1,
        };
        saveState();
      }

      this.renderActiveQuizQuestion();
    },

    goToQuizIndex(newIdx) {
      if (!this.activeQuiz) return;
      if (newIdx < 0 || newIdx >= this.activeQuiz.questions.length) return;
      this.activeQuiz.currentIndex = newIdx;
      this.renderActiveQuizQuestion();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    toggleQuizFlag(idx) {
      if (!this.activeQuiz) return;
      this.activeQuiz.flagged[idx] = !this.activeQuiz.flagged[idx];
      this.renderActiveQuizQuestion();
    },

    toggleQuestionBookmark(qId, fromActiveQuiz = false) {
      state.questionBookmarks[qId] = !state.questionBookmarks[qId];
      if (!state.questionBookmarks[qId]) delete state.questionBookmarks[qId];
      saveState();
      if (fromActiveQuiz) this.renderActiveQuizQuestion();
      else this.renderQBankView();
    },

    finishQuiz() {
      const qz = this.activeQuiz;
      if (!qz) return;
      qz.finished = true;
      if (qz.timerInterval) clearInterval(qz.timerInterval);

      const letters = ["A", "B", "C", "D"];
      let correctTotal = 0;
      const domainStats = {};

      qz.questions.forEach((q, idx) => {
        const chosen = qz.answers[idx];
        const isCorrect = chosen === q.correctIndex;
        if (isCorrect) correctTotal++;

        if (chosen !== undefined && qz.mode === "exam") {
          const prev = state.questionHistory[q.id] || { attempts: 0 };
          state.questionHistory[q.id] = {
            correct: isCorrect,
            lastChoice: chosen,
            attempts: prev.attempts + 1,
          };
        }

        if (!domainStats[q.domainId]) {
          domainStats[q.domainId] = {
            number: q.domainNumber,
            title: q.domainTitle,
            color: q.domainColor,
            total: 0,
            correct: 0,
          };
        }
        domainStats[q.domainId].total++;
        if (isCorrect) domainStats[q.domainId].correct++;
      });

      saveState();

      const total = qz.questions.length;
      const pct = total ? Math.round((correctTotal / total) * 100) : 0;
      const passed = pct >= 70;

      document.getElementById("quiz-active-panel").classList.add("hidden");
      const resPanel = document.getElementById("quiz-results-panel");
      resPanel.classList.remove("hidden");

      resPanel.innerHTML = `
        <div class="study-card-stage" style="max-width:1020px;margin:0 auto;">
          <div style="text-align:center;padding-bottom:1.5rem;border-bottom:1px solid var(--border-color);">
            <div class="badge ${passed ? "badge-high" : "badge-critical"}" style="font-size:0.9rem;padding:0.35rem 1rem;margin-bottom:0.75rem;">
              ${passed ? "🏆 STRONG PERFORMANCE (PASSING PACE)" : "📚 KEEP STUDYING — REVIEW EXPLANATIONS BELOW"}
            </div>
            <h2 style="font-size:2.2rem;font-weight:800;margin-bottom:0.35rem;">
              You Scored ${correctTotal} / ${total} (${pct}%)
            </h2>
            <p style="color:var(--text-muted);">
              Time Elapsed: <strong>${this.formatTime(qz.elapsedSeconds)}</strong> &bull;
              Mode: <strong>${qz.mode === "learn" ? "Deep-Learn Practice" : "Timed Exam Simulation"}</strong>
            </p>
            <div style="display:flex;justify-content:center;gap:0.75rem;margin-top:1.25rem;flex-wrap:wrap;">
              <button class="btn btn-primary" onclick="app.exitQuizToSetup()">🔄 Configure New Quiz</button>
              <button class="btn btn-outline" onclick="app.quickStartQuiz('missed', 'all', 20)">🎯 Retry Missed Questions</button>
              <button class="btn btn-outline" onclick="app.switchTab('dashboard')">📊 Return to Dashboard</button>
            </div>
          </div>

          <h3 style="margin:1.5rem 0 0.85rem;">Domain-by-Domain Diagnostic Breakdown</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:0.85rem;margin-bottom:2rem;">
            ${Object.values(domainStats)
              .sort((a, b) => a.number - b.number)
              .map((ds) => {
                const dPct = Math.round((ds.correct / ds.total) * 100);
                return `
                  <div class="stat-card">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem;">
                      <span class="badge badge-domain" style="background:${ds.color}">Domain ${ds.number}</span>
                      <span style="font-weight:800;">${ds.correct}/${ds.total} (${dPct}%)</span>
                    </div>
                    <div style="font-size:0.85rem;font-weight:600;margin-bottom:0.5rem;">${escapeHtml(ds.title)}</div>
                    <div class="progress-bar">
                      <div class="progress-fill" style="width:${dPct}%;background:${dPct >= 75 ? "var(--success)" : dPct >= 50 ? "var(--warning)" : "var(--danger)"}"></div>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>

          <h3 style="margin-bottom:1rem;">Full Question-by-Question Review &amp; Explanations</h3>
          <div class="qbank-list-container">
            ${qz.questions
              .map((q, idx) => {
                const chosen = qz.answers[idx];
                const isCorrect = chosen === q.correctIndex;
                return `
                  <div class="qbank-item" style="border-left:5px solid ${isCorrect ? "var(--success)" : "var(--danger)"}">
                    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.65rem;">
                      <div style="display:flex;gap:0.5rem;align-items:center;">
                        <span class="badge badge-domain" style="background:${q.domainColor}">Domain ${q.domainNumber}</span>
                        <span class="badge badge-topic">${escapeHtml(q.topic)}</span>
                      </div>
                      <span style="font-weight:800;color:${isCorrect ? "var(--success)" : "var(--danger)"}">
                        ${
                          chosen === undefined
                            ? `⚪ Unanswered (Correct: ${letters[q.correctIndex]})`
                            : isCorrect
                            ? `✅ Correct (${letters[chosen]})`
                            : `❌ Your Answer: ${letters[chosen]} | Correct: ${letters[q.correctIndex]}`
                        }
                      </span>
                    </div>
                    <div style="font-weight:700;font-size:1.02rem;margin-bottom:0.85rem;">
                      ${idx + 1}. ${escapeHtml(q.question)}
                    </div>
                    <div class="qbank-options">
                      ${q.options
                        .map((o, oi) => {
                          let style = "";
                          if (oi === q.correctIndex) style = "border-color:var(--success);background:var(--success-bg);font-weight:700;";
                          else if (oi === chosen && !isCorrect) style = "border-color:var(--danger);background:var(--danger-bg);";
                          return `<div class="qbank-opt" style="${style}"><strong>${letters[oi]}.</strong> ${escapeHtml(o)}</div>`;
                        })
                        .join("")}
                    </div>
                    <div class="exp-core" style="margin-top:0.75rem;font-size:0.9rem;">
                      <strong>Explanation:</strong> ${escapeHtml(q.explanation)}
                    </div>
                    <div class="exam-tip-callout" style="margin-top:0.6rem;">
                      <strong>🎯 Exam Tip:</strong> ${escapeHtml(q.examTip)}
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    exitQuizToSetup() {
      if (this.activeQuiz && this.activeQuiz.timerInterval) {
        clearInterval(this.activeQuiz.timerInterval);
      }
      this.activeQuiz = null;
      document.getElementById("quiz-active-panel").classList.add("hidden");
      document.getElementById("quiz-results-panel").classList.add("hidden");
      document.getElementById("quiz-setup-panel").classList.remove("hidden");
    },

    // ==================== QUESTION BANK REFERENCE EXPLORER ====================
    toggleRevealAllQBank() {
      this.qbankRevealAll = !this.qbankRevealAll;
      document.getElementById("qbank-reveal-all-btn").textContent = this.qbankRevealAll
        ? "🙈 Hide All Explanations"
        : "👁️ Reveal All Explanations";
      this.renderQBankView();
    },

    toggleSingleQBankReveal(qId) {
      this.qbankRevealedIds[qId] = !this.qbankRevealedIds[qId];
      this.renderQBankView();
    },

    renderQBankView() {
      const search = (document.getElementById("qbank-search")?.value || "").trim().toLowerCase();
      const domFilter = document.getElementById("qbank-domain-filter")?.value || "all";
      const diffFilter = document.getElementById("qbank-diff-filter")?.value || "all";
      const statusFilter = document.getElementById("qbank-status-filter")?.value || "all";

      const filtered = ALL_QUESTIONS.filter((q) => {
        if (domFilter !== "all" && q.domainId !== domFilter) return false;
        if (diffFilter !== "all" && q.difficulty !== diffFilter) return false;

        const hist = state.questionHistory[q.id];
        if (statusFilter === "missed" && (!hist || hist.correct)) return false;
        if (statusFilter === "correct" && (!hist || !hist.correct)) return false;
        if (statusFilter === "unanswered" && hist) return false;
        if (statusFilter === "bookmarked" && !state.questionBookmarks[q.id]) return false;

        if (search) {
          const hay = `${q.question} ${q.topic} ${q.explanation} ${q.examTip} ${q.options.join(" ")}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      });

      document.getElementById("qbank-results-meta").textContent = `Showing ${filtered.length} of ${ALL_QUESTIONS.length} Reference Scenario Questions`;

      const letters = ["A", "B", "C", "D"];
      const container = document.getElementById("qbank-list-container");

      if (filtered.length === 0) {
        container.innerHTML = `<div class="qbank-item" style="text-align:center;color:var(--text-muted);padding:2.5rem;">No questions match your current filters.</div>`;
        return;
      }

      container.innerHTML = filtered
        .map((q, idx) => {
          const isRevealed = this.qbankRevealAll || !!this.qbankRevealedIds[q.id];
          const isBookmarked = !!state.questionBookmarks[q.id];
          const hist = state.questionHistory[q.id];
          const histBadge = !hist
            ? `<span class="badge badge-topic">⚪ Unanswered</span>`
            : hist.correct
            ? `<span class="badge" style="background:var(--success-bg);color:var(--success);">✅ Answered Correctly</span>`
            : `<span class="badge" style="background:var(--danger-bg);color:var(--danger);">❌ Missed Previously</span>`;

          return `
            <div class="qbank-item">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem;">
                <div style="display:flex;gap:0.45rem;flex-wrap:wrap;align-items:center;">
                  <span class="badge badge-domain" style="background:${q.domainColor}">Domain ${q.domainNumber}</span>
                  <span class="badge badge-topic">${escapeHtml(q.topic)}</span>
                  <span class="badge badge-topic">${escapeHtml(q.difficulty)}</span>
                  ${histBadge}
                </div>
                <div style="display:flex;gap:0.45rem;">
                  <button class="status-btn" onclick="app.toggleQuestionBookmark('${q.id}', false)">
                    ${isBookmarked ? "⭐ Bookmarked" : "☆ Bookmark"}
                  </button>
                  <button class="btn btn-outline btn-sm" onclick="app.toggleSingleQBankReveal('${q.id}')">
                    ${isRevealed ? "🙈 Hide Answer" : "👁️ Show Answer &amp; Deep Explanation"}
                  </button>
                </div>
              </div>

              <div style="font-weight:700;font-size:1.05rem;margin-bottom:0.85rem;">
                ${idx + 1}. ${escapeHtml(q.question)}
              </div>

              <div class="qbank-options">
                ${q.options
                  .map(
                    (opt, oi) => `
                  <div class="qbank-opt ${isRevealed && oi === q.correctIndex ? "revealed-correct" : ""}">
                    <strong>${letters[oi]}.</strong> ${escapeHtml(opt)}
                  </div>
                `
                  )
                  .join("")}
              </div>

              ${
                isRevealed
                  ? `
                <div class="quiz-explanation-panel" style="margin-top:1rem;">
                  <div class="exp-verdict" style="color:var(--success);">
                    ✅ Correct Answer: ${letters[q.correctIndex]}
                  </div>
                  <div class="exp-core">${escapeHtml(q.explanation)}</div>
                  ${
                    q.distractorAnalysis && q.distractorAnalysis.length
                      ? `
                    <div class="distractor-box">
                      <h5>🔍 Distractor Analysis (Why Other Choices Fail):</h5>
                      <ul>
                        ${q.distractorAnalysis.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}
                      </ul>
                    </div>
                  `
                      : ""
                  }
                  <div class="exam-tip-callout">
                    <strong>🎯 ISC2 Exam Tip:</strong> ${escapeHtml(q.examTip)}
                  </div>
                </div>
              `
                  : ""
              }
            </div>
          `;
        })
        .join("");
    },

    // ==================== STANDARDS & CHEAT SHEETS ====================
    switchRefTab(tabName) {
      document.querySelectorAll(".ref-tab").forEach((b) => {
        b.classList.toggle("active", b.dataset.reftab === tabName);
      });
      ["standards", "shared", "numbers"].forEach((name) => {
        const el = document.getElementById(`ref-content-${name}`);
        if (el) el.classList.toggle("hidden", name !== tabName);
      });
    },

    renderReferenceAll() {
      this.renderStandardsTable();
      this.renderSharedMatrix();
      this.renderNumbersCheatSheet();
    },

    renderStandardsTable() {
      const q = (document.getElementById("standards-search")?.value || "").trim().toLowerCase();
      const stds = (extra.referenceTables && extra.referenceTables.standards) || [];
      const filtered = stds.filter((s) => {
        if (!q) return true;
        return `${s.code} ${s.name} ${s.domain} ${s.keyPoint}`.toLowerCase().includes(q);
      });

      document.getElementById("standards-table-container").innerHTML = `
        <table class="ref-table">
          <thead>
            <tr>
              <th style="width:170px;">Standard / Code</th>
              <th style="width:260px;">Official Title / Focus</th>
              <th style="width:130px;">CCSP Domain</th>
              <th>What You MUST Know for the Exam</th>
            </tr>
          </thead>
          <tbody>
            ${filtered
              .map(
                (s) => `
              <tr>
                <td><strong>${escapeHtml(s.code)}</strong></td>
                <td>${escapeHtml(s.name)}</td>
                <td><span class="badge badge-topic">${escapeHtml(s.domain)}</span></td>
                <td>${escapeHtml(s.keyPoint)}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      `;
    },

    renderSharedMatrix() {
      const rows = (extra.referenceTables && extra.referenceTables.sharedResponsibility) || [];
      const pill = (val) => {
        const cls = val.includes("Customer")
          ? "owner-customer"
          : val.includes("Shared")
          ? "owner-shared"
          : "owner-csp";
        return `<span class="owner-pill ${cls}">${escapeHtml(val)}</span>`;
      };

      document.getElementById("shared-matrix-container").innerHTML = `
        <table class="ref-table">
          <thead>
            <tr>
              <th>Architectural Layer</th>
              <th>On-Premises</th>
              <th>IaaS (Infra)</th>
              <th>PaaS (Platform)</th>
              <th>SaaS (Software)</th>
              <th>Exam Key Takeaway</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) => `
              <tr>
                <td><strong>${escapeHtml(r.layer)}</strong></td>
                <td>${pill(r.onPrem)}</td>
                <td>${pill(r.iaas)}</td>
                <td>${pill(r.paas)}</td>
                <td>${pill(r.saas)}</td>
                <td style="color:var(--text-muted);font-size:0.85rem;">${escapeHtml(r.note)}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      `;
    },

    renderNumbersCheatSheet() {
      const container = document.getElementById("ref-content-numbers");
      container.innerHTML = `
        <div class="domains-grid">
          <div class="domain-card">
            <h4>🌡️ Datacenter Physical &amp; Environmental (Domain 3)</h4>
            <ul style="padding-left:1.2rem;font-size:0.9rem;margin-top:0.5rem;">
              <li><strong>ASHRAE Temperature (Cold Aisle Intake):</strong> 64.4°F to 80.6°F (18°C to 27°C)</li>
              <li><strong>Relative Humidity Range:</strong> 40% to 60% RH (Dew point 15.8°F to 59°F / -9°C to 15°C)</li>
              <li><strong>High Humidity Risk (&gt;60%):</strong> Water condensation, corrosion, short circuits</li>
              <li><strong>Low Humidity Risk (&lt;20%):</strong> Electrostatic Discharge (ESD / static sparks)</li>
              <li><strong>Uptime Tier I:</strong> Basic (N, single path, 99.671% uptime)</li>
              <li><strong>Uptime Tier II:</strong> Redundant Components (N+1, single path, 99.741% uptime)</li>
              <li><strong>Uptime Tier III:</strong> <em>Concurrently Maintainable</em> (N+1, multiple paths, 99.982% uptime)</li>
              <li><strong>Uptime Tier IV:</strong> <em>Fault Tolerant</em> (2N / 2(N+1), active dual paths, 99.995% uptime)</li>
            </ul>
          </div>

          <div class="domain-card">
            <h4>💰 Quantitative Risk &amp; BCDR Formulas (Domain 1 &amp; 6)</h4>
            <ul style="padding-left:1.2rem;font-size:0.9rem;margin-top:0.5rem;">
              <li><strong>SLE (Single Loss Expectancy):</strong> <code>SLE = Asset Value (AV) × Exposure Factor (EF)</code></li>
              <li><strong>ALE (Annualized Loss Expectancy):</strong> <code>ALE = SLE × Annualized Rate of Occurrence (ARO)</code></li>
              <li><strong>Cost-Benefit Analysis (CBA):</strong> <code>Net Value = ALE_before - ALE_after - ACS</code></li>
              <li><strong>RPO (Recovery Point Objective):</strong> Max acceptable <em>Data Loss</em> measured in time (backwards)</li>
              <li><strong>RTO (Recovery Time Objective):</strong> Max acceptable <em>Downtime to Recover</em> (forwards)</li>
              <li><strong>MTD / MAD (Max Tolerable Downtime):</strong> Absolute survival ceiling (<code>RTO &le; MTD</code> always!)</li>
              <li><strong>Residual Risk Formula:</strong> <code>Residual Risk = Inherent Risk - Control Effectiveness</code></li>
            </ul>
          </div>

          <div class="domain-card">
            <h4>🔑 Identity &amp; Federation Protocols (Domain 3 &amp; 4)</h4>
            <ul style="padding-left:1.2rem;font-size:0.9rem;margin-top:0.5rem;">
              <li><strong>SAML 2.0:</strong> XML-based OASIS standard for Browser Enterprise SSO (Authentication + Authorization assertions).</li>
              <li><strong>OAuth 2.0:</strong> JSON/HTTP framework strictly for <em>Delegated Authorization</em> (Access Tokens—NOT Authentication!).</li>
              <li><strong>OpenID Connect (OIDC):</strong> Lightweight JSON/REST <em>Authentication</em> layer built on top of OAuth 2.0 using JWT ID Tokens (best for Mobile &amp; SPAs).</li>
              <li><strong>SCIM:</strong> REST/JSON standard for automated User Account Provisioning &amp; Deprovisioning across SaaS apps.</li>
              <li><strong>IdP vs SP:</strong> Identity Provider (IdP) authenticates user &amp; signs token; Service Provider (SP / Relying Party) verifies signature.</li>
            </ul>
          </div>

          <div class="domain-card">
            <h4>🧪 AppSec Testing &amp; Defense Matrix (Domain 4)</h4>
            <ul style="padding-left:1.2rem;font-size:0.9rem;margin-top:0.5rem;">
              <li><strong>SAST (Static):</strong> White-Box; scans uncompiled source code at rest (Early SDLC / Coding phase).</li>
              <li><strong>DAST (Dynamic):</strong> Black-Box; probes running app from outside over HTTP without source code (Testing/QA phase).</li>
              <li><strong>IAST (Interactive):</strong> Grey-Box sensor inside runtime during QA tests; low false positives.</li>
              <li><strong>SCA (Software Composition Analysis):</strong> Scans open-source libraries/dependencies for CVEs &amp; licenses; builds SBOM.</li>
              <li><strong>RASP (Runtime App Self-Protection):</strong> Lives inside Production runtime (JVM/.NET) to block real-time attacks.</li>
              <li><strong>Cloud SSRF Target IP:</strong> <code>169.254.169.254</code> (Instance Metadata Service — fix with IMDSv2!).</li>
            </ul>
          </div>

          <div class="domain-card">
            <h4>🕵️ Digital Forensics &amp; Syslog Numbers (Domain 5)</h4>
            <ul style="padding-left:1.2rem;font-size:0.9rem;margin-top:0.5rem;">
              <li><strong>Order of Volatility (RFC 3227):</strong> 1. CPU Registers/Cache &rarr; 2. RAM / Routing / ARP &rarr; 3. Swap/Temp &rarr; 4. Disk Volumes &rarr; 5. Remote Logs &rarr; 6. Archival Media.</li>
              <li><strong>NIST SP 800-61 IR Phases:</strong> 1. Preparation &rarr; 2. Detection &amp; Analysis &rarr; 3. Containment, Eradication &amp; Recovery &rarr; 4. Post-Incident Activity.</li>
              <li><strong>Syslog Severity 0 to 7:</strong> 0=Emergency (Most Critical), 1=Alert, 2=Critical, 3=Error, 4=Warning, 5=Notice, 6=Info, 7=Debug (Least Critical).</li>
              <li><strong>Secure Syslog Port:</strong> TCP Port 6514 with TLS (RFC 5425) instead of cleartext UDP 514.</li>
            </ul>
          </div>

          <div class="domain-card">
            <h4>⚖️ Legal, Privacy &amp; Data Security Rules (Domain 2 &amp; 6)</h4>
            <ul style="padding-left:1.2rem;font-size:0.9rem;margin-top:0.5rem;">
              <li><strong>Cloud Data Lifecycle (CSUADS):</strong> Create (Classify here!) &rarr; Store &rarr; Use &rarr; Share &rarr; Archive &rarr; Destroy (Crypto-Shredding).</li>
              <li><strong>GDPR Breach Notification:</strong> Data Controller must notify Supervisory Authority within <strong>72 hours</strong>.</li>
              <li><strong>GDPR Cross-Border Transfers:</strong> Same corporate group = <strong>BCRs</strong>; External vendor/CSP = <strong>SCCs</strong>; Approved country = <strong>Adequacy Decision</strong>.</li>
              <li><strong>CASB Modes:</strong> Unmanaged BYOD inline = <strong>Reverse Proxy</strong>; Managed corporate Shadow IT = <strong>Forward Proxy</strong>; Data at rest scan = <strong>API Mode</strong>.</li>
            </ul>
          </div>
        </div>
      `;
    },
  };

  window.app = app;
  window.addEventListener("DOMContentLoaded", () => app.init());
})();
