// ========================================================================
// UI HELPERS - Toast, Progress, Theme, and General UI Utilities
// ========================================================================

// ===== TOAST NOTIFICATION =====
let toastHideTimer = null;

function displayToastNotification(msg) {
  const toast = document.getElementById('toast-notification');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastHideTimer);
  toastHideTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============================================================
// AI-GENERATED BENGALI QUOTES ENGINE — LIVE GENERATION
// ============================================================

const QUOTE_CACHE_KEY = 'ai_bengali_quotes_cache';
const QUOTE_TIMESTAMP_KEY = 'ai_bengali_quotes_timestamp';
// ক্যাশের মেয়াদ ১ ঘন্টা (আগে ছিল ৩ দিন)
const QUOTE_CACHE_HOURS = 1;
const QUOTE_CACHE_MS = QUOTE_CACHE_HOURS * 60 * 60 * 1000;
// কোটেশন রোটেশন সময় ১২ সেকেন্ড
const QUOTE_ROTATION_INTERVAL_MS = 12000;

// ---- Seed fallback quotes (emergency only) ----
const SEED_QUOTES_BENGALI = [
  { text: 'জীবনটা একটা অসম্পূর্ণ কবিতা, তুমি নিজেই লেখো বাকিটা।', attribution: 'AI' },
  { text: 'ভালোবাসা মানে আয়নার সামনে দাঁড়িয়ে নিজের চেয়ে বেশি করে অন্যকেই দেখা।', attribution: 'AI' },
  { text: 'তোমার মনের সমুদ্রে ডুব দাও, তবেই জানবে তুমি কত গভীর।', attribution: 'AI' },
  { text: 'সাহিত্য হলো সেই আলো, যেখানে অন্ধকারেও পথ দেখা যায়।', attribution: 'AI' },
  { text: 'পাহাড় যত উঁচু, চূড়ায় দাঁড়ানোর আনন্দ তত বেশি।', attribution: 'AI' },
  { text: 'শান্তি পেতে হলে যুদ্ধ ছাড়তে হয় না, আত্মার সাথে মিত্রতা করতে হয়।', attribution: 'AI' },
  { text: 'সময় থেমে থাকে না, কিন্তু ভালোবাসা থেমে গেলে সময় মরে যায়।', attribution: 'AI' },
  { text: 'স্বপ্ন দেখাটা বোকামি নয়, স্বপ্নকে না দেখাটাই বোকামি।', attribution: 'AI' },
  { text: 'মানুষ যেমন পাখি, খাঁচা বানিয়ে দেয় মানুষই, আবার উড়তেও শেখায় মানুষই।', attribution: 'AI' },
  { text: 'আত্মবিশ্বাস হলো সেই অস্ত্র, যা কারো কাছ থেকে চুরি করা যায় না।', attribution: 'AI' },
  { text: 'নিজের সাথে সৎ থাকো, তাহলে সারা বিশ্ব তোমার সাথে সৎ হবে।', attribution: 'AI' },
  { text: 'অন্ধকারের পরেই আলো আসে, কিন্তু আলো দেখার জন্য চোখ খোলা রাখতে হয়।', attribution: 'AI' },
  { text: 'ভালোবাসা শুধু অনুভূতি নয়, তা একটি শিল্প।', attribution: 'AI' },
  { text: 'জীবনের আসল অর্থ খুঁজে পাওয়া যায় না, বরং নিজেকে দিয়ে তা তৈরি করতে হয়।', attribution: 'AI' },
  { text: 'মনের শান্তি বাইরে নয়, ভিতরে।', attribution: 'AI' },
  { text: 'যে নিজেকে চেনে, সে পৃথিবীকে চেনে।', attribution: 'AI' },
  { text: 'অসম্ভব শব্দটা শুধু সম্ভবের অপেক্ষায় থাকে।', attribution: 'AI' },
  { text: 'প্রতিটি সূর্যাস্ত নতুন সূর্যোদয়ের প্রতিশ্রুতি দেয়।', attribution: 'AI' },
  { text: 'মন যদি উদার হয়, পৃথিবীও উদার হয়।', attribution: 'AI' },
  { text: 'আলোর পথে হাঁটতে গেলে অন্ধকারকে ভয় পাওয়া চলে না।', attribution: 'AI' },
];

// ===== কোটেশন জেনারেট করার ফাংশন (AI কল) =====
async function _generateFreshQuotesViaAI() {
  try {
    if (typeof callAIAPI !== 'function') {
      console.warn('[Quotes] callAIAPI not available');
      return null;
    }
    const activeModel = typeof getActiveAIModel === 'function' ? getActiveAIModel() : null;
    if (!activeModel) {
      console.warn('[Quotes] No active AI model');
      return null;
    }

    const prompt = `You are a modern Bengali poet. Generate 30 unique, short, heart-touching quotes in Bangla (Bengali). 
Topics: জীবন (life), ভালোবাসা (love), মন (mind), সাহিত্য (literature), সংগ্রাম (struggle), শান্তি (peace), সৃজনশীলতা (creativity), সময় (time), স্বপ্ন (dream), and আত্মবিশ্বাস (confidence).
Each quote must be between 10-20 words. Avoid clichés. Make them feel like they were written by a wise friend.
CRITICAL: Every quote must be DIFFERENT and UNIQUE. Do not repeat any quote.
Output ONLY a valid JSON array of objects with keys: "text" (the quote) and "attribution" (always "AI").
Example: [{"text": "জীবনটা একটা অসম্পূর্ণ কবিতা...", "attribution": "AI"}]
Return ONLY the JSON array, no other text.`;

    const result = await callAIAPI([
      { role: 'system', content: 'You are a Bengali poet. Output only valid JSON. Every quote must be unique and different.' },
      { role: 'user', content: prompt }
    ], { forceJson: true, maxTokens: 3000 });

    let quotes = null;
    try {
      const parsed = typeof safeParseAIJson === 'function' ? safeParseAIJson(result.content, null) : JSON.parse(result.content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        quotes = parsed.filter(q => q && q.text && q.text.trim().length > 5);
        // নিশ্চিত করা যে সব কোটেশন ইউনিক
        const seen = new Set();
        quotes = quotes.filter(q => {
          const key = q.text.trim().toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    } catch (_) {}

    if (quotes && quotes.length >= 10) {
      // ক্যাশে সংরক্ষণ
      try {
        localStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify(quotes));
        localStorage.setItem(QUOTE_TIMESTAMP_KEY, String(Date.now()));
      } catch (_) {}
      return quotes;
    }
    return null;
  } catch (error) {
    console.warn('[Quotes] AI generation failed:', error);
    return null;
  }
}

// ===== ক্যাশে থেকে কোটেশন লোড (যদি expire না হয়) =====
function _getCachedQuotes() {
  try {
    const raw = localStorage.getItem(QUOTE_CACHE_KEY);
    if (!raw) return null;
    const ts = parseInt(localStorage.getItem(QUOTE_TIMESTAMP_KEY) || '0', 10);
    if (Date.now() - ts > QUOTE_CACHE_MS) {
      // ক্যাশে expire
      localStorage.removeItem(QUOTE_CACHE_KEY);
      localStorage.removeItem(QUOTE_TIMESTAMP_KEY);
      return null;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // ডুপ্লিকেট চেক
      const seen = new Set();
      const unique = parsed.filter(q => {
        if (!q || !q.text) return false;
        const key = q.text.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return unique;
    }
    return null;
  } catch (_) { return null; }
}

// ===== লাইভ কোটেশন লোড (AI কল + ক্যাশে) =====
async function _loadLiveQuotes() {
  // প্রথমে ক্যাশে চেক
  let cached = _getCachedQuotes();
  if (cached && cached.length >= 10) {
    return cached;
  }

  // ক্যাশে নেই বা expire, তাই AI কল
  try {
    const fresh = await _generateFreshQuotesViaAI();
    if (fresh && fresh.length >= 10) {
      return fresh;
    }
  } catch (_) {}

  // সব ব্যর্থ হলে সিড কোটেশন (শাফল করে)
  const shuffled = [...SEED_QUOTES_BENGALI];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============================================================
// GLOBAL PROGRESS UI (ENHANCED)
// ============================================================

const ProgressUI = {
  _interval: null,
  _startTime: 0,
  _estimatedMs: 0,
  _stepStartTime: 0,
  _totalSteps: 0,
  _stepDone: 0,
  _lastPct: 0,
  _mode: 'idle',
  _stageStartPct: 0,
  _stageEndPct: 0,
  _stageStartedAt: 0,
  _previewContainer: null,
  _fileProgressItems: new Map(),
  _pageCount: 0,
  _totalPages: 0,
  
  // ---- Quote Engine ----
  _quotes: [],
  _quoteInterval: null,
  _currentQuoteIndex: -1,
  _usedQuoteIndices: [], // ইতিমধ্যে ব্যবহৃত কোটেশন ট্র্যাক করতে
  _isQuoteGenerationInProgress: false,

  _els() {
    return {
      overlay: document.getElementById('global-progress-overlay'),
      title: document.getElementById('progress-overlay-title'),
      subtitle: document.getElementById('progress-overlay-subtitle'),
      fill: document.getElementById('progress-bar-fill'),
      percent: document.getElementById('progress-bar-percent'),
      time: document.getElementById('progress-bar-time'),
      preview: document.getElementById('progress-live-preview-scroll'),
      previewWrap: document.getElementById('progress-live-preview-wrap'),
      badge: document.getElementById('progress-model-badge'),
      scope: document.getElementById('progress-scope'),
      steps: document.getElementById('progress-steps'),
      pageCount: document.getElementById('progress-page-count'),
      ringFill: document.getElementById('progress-ring-fill'),
      ringPercent: document.getElementById('progress-ring-percent'),
      quoteText: document.getElementById('progress-quote-text'),
      quoteContent: document.getElementById('progress-quote-content'),
      quoteAttribution: document.getElementById('progress-quote-attribution'),
      previewPageLabel: document.getElementById('progress-preview-page-label')
    };
  },

  _RING_CIRC: 2 * Math.PI * 27,

  _formatTime(ms) {
    const sec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    if (sec < 60) return sec + 's';
    return Math.floor(sec / 60) + 'm ' + String(sec % 60).padStart(2, '0') + 's';
  },

  _elapsed() {
    return this._formatTime(Date.now() - this._startTime);
  },

  _setPercent(p, force = false) {
    p = Math.max(0, Math.min(100, Number(p) || 0));
    if (!force && p < this._lastPct) p = this._lastPct;
    this._lastPct = p;
    const { fill, percent, ringFill, ringPercent } = this._els();
    if (fill) {
      fill.classList.remove('indeterminate');
      fill.style.width = p + '%';
      fill.style.transform = '';
    }
    if (percent) percent.textContent = Math.round(p) + '%';
    if (ringFill) {
      ringFill.classList.remove('indeterminate');
      const offset = this._RING_CIRC * (1 - p / 100);
      ringFill.style.strokeDasharray = this._RING_CIRC;
      ringFill.style.strokeDashoffset = offset;
    }
    if (ringPercent) ringPercent.textContent = Math.round(p) + '%';
  },

  _setIndeterminate() {
    const { fill, ringFill } = this._els();
    if (fill) fill.classList.add('indeterminate');
    if (ringFill) ringFill.classList.add('indeterminate');
  },

  _setVisualStage(n) {
    const wrap = this._els().steps;
    if (!wrap) return;
    const spans = Array.from(wrap.querySelectorAll('[data-step]'));
    const lines = Array.from(wrap.querySelectorAll('i'));
    spans.forEach(el => {
      const step = Number(el.dataset.step || 0);
      el.classList.toggle('done', step < n);
      el.classList.toggle('active', step === n);
    });
    lines.forEach((el, i) => el.classList.toggle('done', i + 1 < n));
  },

  _startTicker() {
    if (this._interval) clearInterval(this._interval);
    this._interval = setInterval(() => {
      if (typeof isCancellationRequested !== 'undefined' && isCancellationRequested) return;
      if (!this._startTime) return;
      const now = Date.now(),
        elapsed = now - this._startTime;
      const { time, fill } = this._els();

      if (this._mode === 'indeterminate') {
        if (fill) fill.classList.add('indeterminate');
        if (time) time.textContent = `Elapsed ${this._formatTime(elapsed)} • AI processing…`;
      } else if (this._mode === 'steps') {
        const remain = Math.max(0, this._totalSteps - this._stepDone);
        if (this._stepDone > 0 && remain > 0) {
          const avg = (now - this._stepStartTime) / this._stepDone;
          if (time) time.textContent = `Elapsed ${this._formatTime(elapsed)} • ~${this._formatTime(avg * remain)} remaining`;
        } else if (time) {
          time.textContent = `Elapsed ${this._formatTime(elapsed)} • ${remain ? 'Estimating…' : 'Finishing…'}`;
        }
      } else if (this._mode === 'estimate') {
        const rem = Math.max(0, this._estimatedMs - elapsed);
        const span = Math.max(1, this._stageEndPct - this._stageStartPct);
        const target = this._stageStartPct + span * (1 - Math.exp(-elapsed / Math.max(6500, this._estimatedMs * 0.65)));
        this._setPercent(Math.max(this._lastPct, target));
        if (time) {
          time.textContent = rem > 1000 ?
            `Elapsed ${this._formatTime(elapsed)} • estimated ~${this._formatTime(rem)} remaining` :
            `Elapsed ${this._formatTime(elapsed)} • finishing…`;
        }
      } else {
        const span = Math.max(1, this._stageEndPct - this._stageStartPct);
        const stageElapsed = now - this._stageStartedAt;
        const target = this._stageStartPct + Math.min(span * 0.82, span * (1 - Math.exp(-stageElapsed / 9000)));
        this._setPercent(Math.max(this._lastPct, target));
        if (time) time.textContent = `Elapsed ${this._formatTime(elapsed)} • Working…`;
      }
      
      this._updatePageCountDisplay();
    }, 250);
  },

  _updatePageCountDisplay() {
    const el = this._els().pageCount;
    if (!el) return;
    if (this._totalPages > 0) {
      el.textContent = `📄 পৃষ্ঠা ${this._pageCount} এর ${this._totalPages}`;
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  },

  // ===== QUOTE ENGINE — LIVE & UNIQUE =====
  async _loadQuotes() {
    if (this._isQuoteGenerationInProgress) {
      // ইতিমধ্যে জেনারেশন চলছে, অপেক্ষা করি
      await new Promise(resolve => {
        const check = () => {
          if (!this._isQuoteGenerationInProgress) resolve();
          else setTimeout(check, 200);
        };
        check();
      });
      return this._quotes;
    }

    this._isQuoteGenerationInProgress = true;
    try {
      const quotes = await _loadLiveQuotes();
      if (quotes && quotes.length > 0) {
        this._quotes = quotes;
        this._usedQuoteIndices = [];
      } else {
        // ফলব্যাক: সিড কোটেশন শাফল
        const shuffled = [...SEED_QUOTES_BENGALI];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        this._quotes = shuffled;
        this._usedQuoteIndices = [];
      }
    } catch (_) {
      // শেষ ফলব্যাক
      const shuffled = [...SEED_QUOTES_BENGALI];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      this._quotes = shuffled;
      this._usedQuoteIndices = [];
    }
    this._isQuoteGenerationInProgress = false;
    return this._quotes;
  },

  _getNextUniqueQuote() {
    if (!this._quotes || this._quotes.length === 0) {
      // ফলব্যাক
      const shuffled = [...SEED_QUOTES_BENGALI];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      this._quotes = shuffled;
      this._usedQuoteIndices = [];
    }

    const total = this._quotes.length;
    if (total === 0) return { text: 'জীবন সুন্দর, মনকে সুন্দর রাখো।', attribution: 'AI' };

    // যদি সব কোটেশন ব্যবহার করা হয়ে যায়, তাহলে রিসেট
    if (this._usedQuoteIndices.length >= total) {
      this._usedQuoteIndices = [];
    }

    // ব্যবহৃত নয় এমন একটি ইনডেক্স খুঁজি
    let availableIndices = [];
    for (let i = 0; i < total; i++) {
      if (!this._usedQuoteIndices.includes(i)) {
        availableIndices.push(i);
      }
    }

    if (availableIndices.length === 0) {
      this._usedQuoteIndices = [];
      availableIndices = Array.from({ length: total }, (_, i) => i);
    }

    const randomIdx = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    this._usedQuoteIndices.push(randomIdx);
    this._currentQuoteIndex = randomIdx;
    return this._quotes[randomIdx];
  },

  _showQuote(quote) {
    const { quoteContent, quoteAttribution, quoteText } = this._els();
    if (!quoteContent || !quoteText) return;
    
    quoteText.classList.remove('visible');
    
    setTimeout(() => {
      quoteContent.textContent = quote.text || 'জীবন সুন্দর, মনকে সুন্দর রাখো।';
      if (quoteAttribution) {
        quoteAttribution.textContent = quote.attribution ? `— ${quote.attribution}` : '— AI';
      }
      quoteText.classList.add('visible');
    }, 300);
  },

  _rotateQuote() {
    const quote = this._getNextUniqueQuote();
    this._showQuote(quote);
  },

  _startQuoteRotation() {
    this._stopQuoteRotation();
    // লাইভ কোটেশন লোড করুন
    this._loadQuotes().then(() => {
      const firstQuote = this._getNextUniqueQuote();
      this._showQuote(firstQuote);
    }).catch(() => {
      // ফলব্যাক
      const fallback = this._quotes.length > 0 ? this._quotes[0] : { text: 'জীবন সুন্দর, মনকে সুন্দর রাখো।', attribution: 'AI' };
      this._showQuote(fallback);
    });

    // ইন্টারভাল শুরু
    this._quoteInterval = setInterval(() => {
      this._rotateQuote();
    }, QUOTE_ROTATION_INTERVAL_MS);
  },

  _stopQuoteRotation() {
    if (this._quoteInterval) {
      clearInterval(this._quoteInterval);
      this._quoteInterval = null;
    }
  },

  // ===== LIVE PAGE NUMBER UPDATE (NO CONTENT PREVIEW) =====
  updateLivePageNumber(pageNumber, totalPages) {
    this._pageCount = Math.max(0, Number(pageNumber) || 0);
    this._totalPages = Math.max(0, Number(totalPages) || 0);
    this._updatePageCountDisplay();
    const label = this._els().previewPageLabel;
    if (label) {
      label.textContent = totalPages ? `পৃষ্ঠা ${pageNumber || 1} এর ${totalPages}` : `পৃষ্ঠা ${pageNumber || 1}`;
    }
  },

  // ===== SHOW =====
  show(title, subtitle) {
    const e = this._els();
    e.overlay.style.display = 'flex';
    e.title.textContent = title || 'Working...';
    e.subtitle.textContent = subtitle || '';
    if (e.badge) e.badge.textContent = '';
    if (e.scope) e.scope.textContent = '';
    if (e.time) e.time.textContent = 'Elapsed 0s';

    this._startTime = Date.now();
    this._stepStartTime = this._startTime;
    this._estimatedMs = 0;
    this._totalSteps = 0;
    this._stepDone = 0;
    // প্রোগ্রেস বার ০% থেকে শুরু
    this._lastPct = 0;
    this._mode = 'stage';
    this._stageStartPct = 0;
    this._stageEndPct = 0;
    this._stageStartedAt = this._startTime;
    this._pageCount = 0;
    this._totalPages = 0;
    this._setPercent(0, true);
    this._fileProgressItems.clear();
    
    if (e.preview) e.preview.innerHTML = '';
    this._previewContainer = e.preview;
    if (e.previewWrap) e.previewWrap.classList.remove('has-items');

    this._setVisualStage(1);
    this._updatePageCountDisplay();

    // লাইভ কোটেশন শুরু
    this._startQuoteRotation();

    const cancel = document.getElementById('cancel-processing-btn');
    if (cancel) cancel.disabled = false;
    if (typeof resetCancellationState === 'function') resetCancellationState();

    this._startTicker();
  },

  setLabel(t) {
    const e = this._els().subtitle;
    if (e) e.textContent = t || '';
  },

  setScope(t) {
    const e = this._els().scope;
    if (e) e.textContent = t || '';
  },

  setStage(label, startPct, endPct, { indeterminate = false } = {}) {
    this._mode = indeterminate ? 'indeterminate' : 'stage';
    this._stageStartPct = Math.max(0, Math.min(100, startPct || 0));
    this._stageEndPct = Math.max(this._stageStartPct, Math.min(100, endPct || 0));
    this._stageStartedAt = Date.now();
    const stage = this._stageStartPct < 25 ? 1 : (this._stageStartPct < 72 ? 2 : (this._stageStartPct < 94 ? 3 : 4));
    this._setVisualStage(stage);
    if (label) this.setLabel(label);
    this._setPercent(this._stageStartPct);
    if (indeterminate) this._setIndeterminate();
    this._startTicker();
  },

  startAutoEstimate(seconds) {
    this._setVisualStage(1);
    this._estimatedMs = Math.max(Number(seconds) || 1, 1) * 1000;
    this._totalSteps = 0;
    this._mode = 'estimate';
    this._stageStartPct = 0;
    this._stageEndPct = 92;
    this._stageStartedAt = this._startTime;
    this._startTicker();
  },

  startStepEstimate(total) {
    this._setVisualStage(2);
    if (this._interval) clearInterval(this._interval);
    this._totalSteps = Math.max(Number(total) || 1, 1);
    this._stepDone = 0;
    this._stepStartTime = Date.now();
    this._mode = 'steps';
    this._setPercent(0, true);
    this._startTicker();
  },

  reportStepComplete(done) {
    if (typeof isCancellationRequested !== 'undefined' && isCancellationRequested) return;
    if (Number(done) >= this._totalSteps) this._setVisualStage(3);
    this._stepDone = Math.max(0, Math.min(this._totalSteps, Number(done) || 0));
    this._setPercent((this._stepDone / this._totalSteps) * 100);
    const remain = this._totalSteps - this._stepDone;
    const now = Date.now(),
      elapsed = now - this._startTime;
    const e = this._els().time;
    if (e) {
      e.textContent = remain ?
        `Elapsed ${this._formatTime(elapsed)} • ~${this._formatTime(((now - this._stepStartTime) / Math.max(this._stepDone, 1)) * remain)} remaining` :
        `Elapsed ${this._formatTime(elapsed)} • Finishing…`;
    }
  },

  finish() {
    if (this._interval) { clearInterval(this._interval);
      this._interval = null; }
    this._setVisualStage(4);
    this._mode = 'done';
    this._setPercent(100, true);
    const e = this._els();
    if (e.fill) e.fill.classList.remove('indeterminate');
    if (e.time) e.time.textContent = `Done • ${this._elapsed()}`;
    this._updatePageCountDisplay();
    this._stopQuoteRotation();
    // শেষ কোটেশন দেখানোর জন্য
    const finalQuote = this._getNextUniqueQuote();
    this._showQuote(finalQuote);
  },

  setActiveModel(name) {
    const e = this._els().badge;
    if (e) e.textContent = name ? '🤖 ' + name : '';
  },

  setPageCount(current, total) {
    this._pageCount = Math.max(0, Number(current) || 0);
    this._totalPages = Math.max(0, Number(total) || 0);
    this._updatePageCountDisplay();
  },

  incrementPage() {
    if (this._totalPages > 0 && this._pageCount < this._totalPages) {
      this._pageCount++;
      this._updatePageCountDisplay();
      const label = this._els().previewPageLabel;
      if (label) {
        label.textContent = `পৃষ্ঠা ${this._pageCount} এর ${this._totalPages}`;
      }
    }
  },

  // ===== FILE PROGRESS (for OCR) =====
  addFileProgress(key, fileName, phase = 'Queued', meta = '') {
    if (!this._previewContainer) return null;
    const existing = this._fileProgressItems.get(key);
    if (existing) return existing;

    const div = document.createElement('div');
    div.className = 'progress-file-item';
    div.dataset.progressFileKey = String(key);
    div.innerHTML = `
      <div class="progress-file-head">
        <span class="progress-file-name"></span>
        <span class="progress-file-status">Queued</span>
      </div>
      <div class="progress-file-meta"></div>
      <div class="progress-file-track"><div class="progress-file-fill"></div></div>
    `;
    div.querySelector('.progress-file-name').textContent = fileName || 'File';
    div.querySelector('.progress-file-status').textContent = phase || 'Queued';
    div.querySelector('.progress-file-meta').textContent = meta || '';

    this._previewContainer.appendChild(div);
    this._fileProgressItems.set(key, div);
    this._previewContainer.scrollTop = this._previewContainer.scrollHeight;
    const wrap = this._els().previewWrap;
    if (wrap) wrap.classList.add('has-items');
    return div;
  },

  updateFileProgress(key, pct, phase, meta = '', state = 'working') {
    const div = this._fileProgressItems.get(key);
    if (!div) return;
    pct = Math.max(0, Math.min(100, Number(pct) || 0));

    const fill = div.querySelector('.progress-file-fill');
    const status = div.querySelector('.progress-file-status');
    const metaEl = div.querySelector('.progress-file-meta');

    if (fill) fill.style.width = pct + '%';
    if (status) {
      status.className = 'progress-file-status' +
        (state === 'done' ? ' done' : state === 'error' ? ' error' : state === 'fallback' ? ' fallback' : '');
      status.textContent = phase || (state === 'done' ? 'Done' : state === 'error' ? 'Error' : 'Working');
    }
    if (metaEl) metaEl.textContent = (meta || '') + (meta ? ' • ' : '') + Math.round(pct) + '%';
  },

  addPagePreview(label, content, status) {
    // আর ব্যবহার হচ্ছে না — শুধু পেজ নম্বর দেখানো হয়
  },

  clearPreview() {
    if (this._previewContainer) this._previewContainer.innerHTML = '';
    this._fileProgressItems.clear();
    const wrap = this._els().previewWrap;
    if (wrap) wrap.classList.remove('has-items');
  },

  hide() {
    if (this._interval) { clearInterval(this._interval);
      this._interval = null; }
    this._stopQuoteRotation();
    const e = this._els();
    e.overlay.style.display = 'none';
    if (e.badge) e.badge.textContent = '';
    if (e.scope) e.scope.textContent = '';
    if (e.fill) e.fill.classList.remove('indeterminate');
    if (e.ringFill) e.ringFill.classList.remove('indeterminate');
    if (e.previewWrap) e.previewWrap.classList.remove('has-items');
    this._pageCount = 0;
    this._totalPages = 0;
    this._updatePageCountDisplay();
  }
};

// ===== THEME MANAGEMENT =====
function applyCurrentTheme() {
  const icon = document.getElementById('theme-toggle-icon');
  const themeState = (window.APP_STATE && APP_STATE.theme) || 'light';
  const finalDark = themeState === 'dark';
  document.body.classList.toggle('dark', finalDark);
  document.documentElement.classList.toggle('dark', finalDark);
  if (typeof syncActiveModelVisualTheme === 'function') syncActiveModelVisualTheme();
  if (icon) {
    icon.innerHTML = finalDark ?
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' :
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  }
}

function toggleDarkMode() {
  if (typeof APP_STATE === 'undefined') {
    window.APP_STATE = window.APP_STATE || { theme: 'light' };
  }
  APP_STATE.theme = APP_STATE.theme === 'light' ? 'dark' : 'light';
  document.body.classList.toggle('dark', APP_STATE.theme === 'dark');
  document.documentElement.classList.toggle('dark', APP_STATE.theme === 'dark');
  applyCurrentTheme();
  if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
  if (typeof TAB_MANAGER !== 'undefined' && TAB_MANAGER.activeId) {
    TAB_MANAGER._captureCurrentState(TAB_MANAGER.activeId);
    TAB_MANAGER._persist();
  }
  if (typeof invalidatePDFPreviewCache === 'function') {
    invalidatePDFPreviewCache();
    const pdfView = document.getElementById('pdf-view-container');
    if (pdfView && pdfView.style.display !== 'none' && typeof generateLivePDFIframePreview === 'function') {
      generateLivePDFIframePreview();
    }
  }
}

// ===== MODE BUTTON =====
function updateModeButtonText() {
  const btn = document.getElementById('mode-toggle-btn');
  if (!btn) return;
  const isMono = document.body.classList.contains('photocopy-mode');
  const icon = document.getElementById('mode-toggle-icon');
  const label = document.getElementById('mode-toggle-label');

  if (icon) {
    icon.innerHTML = isMono ?
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' :
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="9" cy="10" r=".9" fill="currentColor"/><circle cx="15" cy="10" r=".9" fill="currentColor"/><path d="M8.5 14.5c2 1.8 5 1.8 7 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  }
  if (label) label.textContent = isMono ? 'Monochrome' : 'Color';
  btn.setAttribute('aria-pressed', isMono ? 'true' : 'false');
  btn.title = isMono ? 'Switch to Color mode' : 'Switch to Monochrome mode';
}

function togglePhotocopyMode() {
  const isNowMonochrome = !document.body.classList.contains('photocopy-mode');
  document.body.classList.toggle('photocopy-mode', isNowMonochrome);

  updateModeButtonText();
  if (typeof applyMonochromeDocumentStyles === 'function') applyMonochromeDocumentStyles();

  if (typeof TAB_MANAGER !== 'undefined' && TAB_MANAGER.activeId) {
    TAB_MANAGER._captureCurrentState(TAB_MANAGER.activeId);
    TAB_MANAGER._persist();
  }
  if (typeof invalidatePDFPreviewCache === 'function') {
    invalidatePDFPreviewCache();
    const pdfView = document.getElementById('pdf-view-container');
    if (pdfView && pdfView.style.display !== 'none' && typeof generateLivePDFIframePreview === 'function') {
      generateLivePDFIframePreview();
    }
  }
  displayToastNotification(isNowMonochrome ? 'Monochrome Mode Enabled' : 'Color Mode Enabled');
}

// ===== TEXTAREA AUTO-RESIZE =====
function autoResizeTextarea(ta) {
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}

// ===== DESKTOP WORKSPACE ZOOM / FIT =====
const DESKTOP_WORKSPACE_FIT = {
  minWidth: 1180,
  minHeight: 680,
  minZoom: 0.72,
  maxZoom: 1.0
};

function applyDesktopWorkspaceZoom() {
  const workspace = document.getElementById('main-container');
  if (!workspace) return;

  const viewportWidth = Math.max(window.innerWidth || document.documentElement.clientWidth || DESKTOP_WORKSPACE_FIT.minWidth, 1);
  const viewportHeight = Math.max(window.innerHeight || document.documentElement.clientHeight || DESKTOP_WORKSPACE_FIT.minHeight, 1);

  const scaleWidth = viewportWidth / DESKTOP_WORKSPACE_FIT.minWidth;
  const scaleHeight = viewportHeight / DESKTOP_WORKSPACE_FIT.minHeight;
  const scale = Math.min(DESKTOP_WORKSPACE_FIT.maxZoom, Math.max(DESKTOP_WORKSPACE_FIT.minZoom, Math.min(scaleWidth, scaleHeight)));

  workspace.style.zoom = Number.parseFloat(scale.toFixed(4));
  workspace.style.minWidth = DESKTOP_WORKSPACE_FIT.minWidth + 'px';
  workspace.style.minHeight = DESKTOP_WORKSPACE_FIT.minHeight + 'px';
}

if (typeof window !== 'undefined') {
  const runWorkspaceZoom = () => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyDesktopWorkspaceZoom);
    } else {
      applyDesktopWorkspaceZoom();
    }
  };

  runWorkspaceZoom();
  window.addEventListener('resize', () => {
    window.setTimeout(applyDesktopWorkspaceZoom, 80);
  });
}

// ===== SIDEBAR RESIZE =====
function initializeSidebarResize(event) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const startX = event.clientX;
  const startWidth = sidebar.offsetWidth;

  function onMouseMove(ev) {
    const newWidth = startWidth + (ev.clientX - startX);
    if (newWidth >= 300 && newWidth <= 550) sidebar.style.width = newWidth + 'px';
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// ===== MOBILE / DESKTOP TOPBAR MORE MENU =====
let __topbarMenuOpen = false;

function setTopbarMenuOpen(open) {
  const menu = document.getElementById('topbar-actions');
  const btn = document.getElementById('topbar-more-btn');
  if (!menu || !btn) return;
  __topbarMenuOpen = !!open;
  menu.classList.toggle('open', __topbarMenuOpen);
  btn.classList.toggle('active', __topbarMenuOpen);
  btn.setAttribute('aria-expanded', __topbarMenuOpen ? 'true' : 'false');
  menu.setAttribute('aria-hidden', __topbarMenuOpen ? 'false' : 'true');
  if (isMobileDeviceLayout()) document.body.classList.toggle('topbar-menu-open', __topbarMenuOpen);
}

function toggleTopbarMenu(forceClose) {
  if (forceClose === true) { setTopbarMenuOpen(false); return; }
  setTopbarMenuOpen(!__topbarMenuOpen);
}

function closeTopbarMenu() { setTopbarMenuOpen(false); }

// ===== MOBILE READING VIEW (reflow, not scale) =====
// On phones the A4 canvas is scaled to ~0.48x, making 12pt text unreadable.
// Reading mode reflows the document into a full-width, readable layout.
let _mobileReadingActive = false;

function _extractReadingHTML() {
  const pages = Array.from(document.querySelectorAll('#document-view-container .doc-page-canvas'));
  if (!pages.length) return '';
  const parts = [];
  pages.forEach(page => {
    const clone = page.cloneNode(true);
    // Strip page footers and any export-measure helper classes
    clone.querySelectorAll('.page-footer-number, .pdf-export-measure-page').forEach(f => f.remove());
    // Take the inner HTML (children) so the A4-canvas wrapper styles don't leak in
    const inner = (clone.innerHTML || '').trim();
    if (inner) parts.push(inner);
  });
  return parts.join('\n');
}

function _syncReadingPanel() {
  const panel = document.getElementById('mobile-reading-content');
  if (!panel) return;
  const html = _extractReadingHTML();
  panel.innerHTML = html || '<p style="color:var(--text-secondary);text-align:center;margin-top:40px;">No content yet. Ask AI on the left to generate notes.</p>';
}

function toggleMobileReadingView() {
  const isMobile = typeof isMobileDeviceLayout === 'function' && isMobileDeviceLayout();
  if (!isMobile) {
    // On desktop, just toggle the preview panel visibility (no-op)
    return;
  }
  _mobileReadingActive = !_mobileReadingActive;
  const docContainer = document.getElementById('document-view-container');
  const readingPanel = document.getElementById('mobile-reading-panel');
  const toggleBtn = document.getElementById('mobile-reading-toggle');
  const previewArea = document.getElementById('preview-content-area');

  if (_mobileReadingActive) {
    if (docContainer) docContainer.style.display = 'none';
    if (readingPanel) { readingPanel.style.display = 'flex'; _syncReadingPanel(); }
    if (toggleBtn) toggleBtn.classList.add('active');
    if (previewArea) { previewArea.style.flexDirection = 'column'; previewArea.style.overflow = 'hidden'; }
    displayToastNotification('📖 Reading mode — full-width reflow');
  } else {
    if (docContainer) docContainer.style.display = '';
    if (readingPanel) readingPanel.style.display = 'none';
    if (toggleBtn) toggleBtn.classList.remove('active');
    if (previewArea) { previewArea.style.flexDirection = ''; previewArea.style.overflow = ''; }
    displayToastNotification('Editor view restored');
  }
}

function isMobileReadingActive() { return _mobileReadingActive; }

// Auto-show reading toggle only on mobile + editor view
function _maybeShowReadingToggle() {
  const toggleBtn = document.getElementById('mobile-reading-toggle');
  if (!toggleBtn) return;
  const isMobile = typeof isMobileDeviceLayout === 'function' && isMobileDeviceLayout();
  const isEditorView = (document.getElementById('main-container') || {}).className && document.getElementById('main-container').className.includes('mobile-view-editor');
  toggleBtn.style.display = (isMobile && isEditorView) ? 'flex' : 'none';
  if (!_mobileReadingActive) return;
  // If we switched away from editor view while reading, exit reading mode
  if (!isEditorView && _mobileReadingActive) { toggleMobileReadingView(); }
}

function bindTopbarMoreMenu() {
  const btn = document.getElementById('topbar-more-btn');
  const menu = document.getElementById('topbar-actions');
  if (!btn || !menu || btn.dataset.moreMenuBound === '1') return;
  btn.dataset.moreMenuBound = '1';
  btn.type = 'button';
  btn.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-hidden', 'true');

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleTopbarMenu();
  }, false);

  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault();
      toggleTopbarMenu(); } else if (e.key === 'Escape') closeTopbarMenu();
  });

  document.addEventListener('pointerdown', (e) => {
    if (!__topbarMenuOpen) return;
    const target = e.target;
    if (target && (btn.contains(target) || menu.contains(target))) return;
    closeTopbarMenu();
  }, false);

  document.addEventListener('click', (e) => {
    if (!__topbarMenuOpen) return;
    const target = e.target;
    if (target && (btn.contains(target) || menu.contains(target))) return;
    closeTopbarMenu();
  }, false);

  window.addEventListener('resize', () => {
    if (!isMobileDeviceLayout()) closeTopbarMenu();
  }, { passive: true });
}

// ===== PAGE RANGE MODAL =====
let pageRangeResolve = null;

function promptForPageRange(totalPages) {
  return new Promise((resolve) => {
    const modal = document.getElementById('page-range-modal');
    if (!modal) {
      resolve(null);
      return;
    }
    const startInput = document.getElementById('range-start');
    const endInput = document.getElementById('range-end');
    const badge = document.getElementById('page-range-total-badge');
    if (startInput) startInput.value = 1;
    if (endInput) endInput.value = totalPages;
    if (badge) badge.textContent = `Total: ${totalPages} pages`;
    modal.dataset.totalPages = totalPages;
    modal.style.display = 'flex';
    pageRangeResolve = resolve;
  });
}

function closePageRangeModal() {
  const modal = document.getElementById('page-range-modal');
  if (!modal) return;
  modal.style.display = 'none';
  if (pageRangeResolve) {
    pageRangeResolve(null);
    pageRangeResolve = null;
  }
}

function confirmPageRange() {
  const modal = document.getElementById('page-range-modal');
  if (!modal) return;
  const start = parseInt(document.getElementById('range-start').value) || 1;
  const end = parseInt(document.getElementById('range-end').value) || 1;
  const total = parseInt(modal.dataset.totalPages) || 1;
  const validStart = Math.max(1, Math.min(start, total));
  const validEnd = Math.max(validStart, Math.min(end, total));
  modal.style.display = 'none';
  if (pageRangeResolve) {
    pageRangeResolve({ start: validStart, end: validEnd });
    pageRangeResolve = null;
  }
}

// ===== EDIT PAGE MODAL =====
let _editModalResolve = null;

function openEditPageModal() {
  return new Promise((resolve) => {
    const modal = document.getElementById('edit-page-modal');
    if (!modal) {
      resolve(null);
      return;
    }
    const input = document.getElementById('edit-page-input');
    const hint = document.getElementById('edit-page-hint');
    const chips = document.getElementById('edit-page-chips');
    
    const totalPages = document.querySelectorAll('.doc-page-canvas').length || 0;
    if (hint) hint.textContent = `Document has ${totalPages} page${totalPages !== 1 ? 's' : ''}`;
    
    if (input) input.value = '';
    if (chips) chips.innerHTML = '';
    
    if (input) {
      input.oninput = function() {
        const raw = this.value.trim();
        if (!chips) return;
        chips.innerHTML = '';
        if (!raw) return;
        const numbers = raw.split(/\s+/).filter(p => p.length > 0).map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 0);
        numbers.forEach(num => {
          const chip = document.createElement('span');
          chip.className = 'page-chip';
          chip.textContent = num;
          chips.appendChild(chip);
        });
      };
    }
    
    modal.style.display = 'flex';
    _editModalResolve = resolve;
    setTimeout(() => { if (input) input.focus(); }, 100);
  });
}

function closeEditPageModal() {
  const modal = document.getElementById('edit-page-modal');
  if (!modal) return;
  modal.style.display = 'none';
  if (_editModalResolve) {
    _editModalResolve(null);
    _editModalResolve = null;
  }
}

function confirmEditPages() {
  const input = document.getElementById('edit-page-input');
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) {
    displayToastNotification('⚠️ Please enter at least one page number.');
    return;
  }
  const parts = raw.split(/\s+/).filter(p => p.length > 0);
  const numbers = parts.map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 0);
  if (numbers.length === 0) {
    displayToastNotification('⚠️ Invalid page numbers. Use numbers separated by spaces (e.g., 9 10 11).');
    return;
  }
  const modal = document.getElementById('edit-page-modal');
  if (modal) modal.style.display = 'none';
  if (_editModalResolve) {
    _editModalResolve(numbers);
    _editModalResolve = null;
  }
}

// ===== VIEW TOGGLES =====
let _desktopView = 'editor';

function switchPreviewTabDesktop(view) {
  _desktopView = view;
  const btnChat = document.getElementById('tab-chat-btn-desktop');
  const btnEditor = document.getElementById('tab-editor-btn-desktop');
  const btnPdf = document.getElementById('tab-pdf-btn-desktop');
  if (btnChat) btnChat.classList.toggle('active', view === 'chat');
  if (btnEditor) btnEditor.classList.toggle('active', view === 'editor');
  if (btnPdf) btnPdf.classList.toggle('active', view === 'pdf');
  if (typeof switchPreviewTab === 'function') switchPreviewTab(view);
}

function setMobileView(viewName) {
  const safeView = (viewName === 'editor' || viewName === 'pdf' || viewName === 'chat') ? viewName : 'chat';
  if (typeof APP_STATE !== 'undefined') APP_STATE.currentMobileView = safeView;
  const main = document.getElementById('main-container');
  if (!main) return;
  main.classList.remove('mobile-view-chat', 'mobile-view-editor', 'mobile-view-pdf');
  main.classList.add('mobile-view-' + safeView);
  document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById('mob-btn-' + safeView);
  if (activeBtn) activeBtn.classList.add('active');

  const backBtn = document.getElementById('mobile-back-to-chat-btn');
  if (backBtn) backBtn.style.display = (safeView === 'editor') ? 'inline-flex' : 'none';

  if (safeView === 'pdf') {
    if (typeof switchPreviewTab === 'function') switchPreviewTab('pdf');
  } else if (viewName === 'editor') {
    if (typeof switchPreviewTab === 'function') switchPreviewTab('editor');
    requestAnimationFrame(() => {
      try { if (typeof fitEditorPagesToScreen === 'function') fitEditorPagesToScreen(); } catch (_) {}
      setTimeout(() => {
        try { if (typeof fitEditorPagesToScreen === 'function') fitEditorPagesToScreen(); } catch (_) {}
      }, 200);
    });
  }

  if (!isMobileDeviceLayout()) {
    if (viewName === 'pdf') switchPreviewTabDesktop('pdf');
    else if (viewName === 'editor') switchPreviewTabDesktop('editor');
  }
}

// ===== CANCELLATION =====
let isCancellationRequested = false;
let activeRequestAbortController = null;
let lastCancellationAt = 0;

function requestCancelProcessing() {
  if (isCancellationRequested) return;
  isCancellationRequested = true;
  lastCancellationAt = Date.now();
  try { if (activeRequestAbortController) activeRequestAbortController.abort(); } catch (e) {}
  try {
    if (typeof terminateOcrWorkersForCancellation === 'function') terminateOcrWorkersForCancellation();
  } catch (e) {}
  const cancelBtn = document.getElementById('cancel-processing-btn');
  if (cancelBtn) { cancelBtn.disabled = true;
    cancelBtn.textContent = 'Cancelling…'; }
  if (ProgressUI && typeof ProgressUI.hide === 'function') ProgressUI.hide();
  displayToastNotification('Cancelled — processing stopped immediately.');
}

function resetCancellationState() {
  isCancellationRequested = false;
  lastCancellationAt = 0;
  activeRequestAbortController = null;
  const cancelBtn = document.getElementById('cancel-processing-btn');
  if (cancelBtn) { cancelBtn.disabled = false;
    cancelBtn.textContent = 'Cancel'; }
}

async function waitWhilePaused() {
  // No-op - kept for compatibility
  return;
}

// ============================================================
// WINDOW EXPOSURE – UI Helpers
// ============================================================
window.ProgressUI = ProgressUI;
window.toggleDarkMode = toggleDarkMode;
window.applyCurrentTheme = applyCurrentTheme;
window.displayToastNotification = displayToastNotification;
window.autoResizeTextarea = autoResizeTextarea;
window.initializeSidebarResize = initializeSidebarResize;
window.openEditPageModal = openEditPageModal;
window.closeEditPageModal = closeEditPageModal;
window.confirmEditPages = confirmEditPages;
window.promptForPageRange = promptForPageRange;
window.closePageRangeModal = closePageRangeModal;
window.confirmPageRange = confirmPageRange;
window.switchPreviewTabDesktop = switchPreviewTabDesktop;
window.setMobileView = setMobileView;
window.requestCancelProcessing = requestCancelProcessing;
window.resetCancellationState = resetCancellationState;
window.waitWhilePaused = waitWhilePaused;
window.bindTopbarMoreMenu = bindTopbarMoreMenu;
window.toggleTopbarMenu = toggleTopbarMenu;
window.closeTopbarMenu = closeTopbarMenu;
window.togglePhotocopyMode = togglePhotocopyMode;
window.updateModeButtonText = updateModeButtonText;
window.toggleMobileReadingView = toggleMobileReadingView;
window.isMobileReadingActive = isMobileReadingActive;
window._maybeShowReadingToggle = _maybeShowReadingToggle;
window._syncReadingPanel = _syncReadingPanel;

window._syncMobileTabFab = _syncMobileTabFab;
window.openMobileTabSheet = openMobileTabSheet;
window.closeMobileTabSheet = closeMobileTabSheet;

// ===== MOBILE TAB SWITCHER SHEET =====
function openMobileTabSheet() {
  const sheet = document.getElementById('mobile-tab-sheet');
  const list = document.getElementById('mobile-tab-list');
  if (!sheet || !list) return;
  list.innerHTML = '';
  const tabs = (TAB_MANAGER && TAB_MANAGER.tabs) || [];
  const activeId = (TAB_MANAGER && TAB_MANAGER.activeId) || null;
  tabs.forEach(tab => {
    const row = document.createElement('button');
    row.type = 'button';
    row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%; text-align:left; padding:11px 14px; border:1px solid var(--border-color); border-radius:var(--radius-sm); background:var(--surface-color); color:var(--text-primary); font:600 .88rem var(--font-ui); cursor:pointer; touch-action:manipulation;';
    if (tab.id === activeId) {
      row.style.background = 'var(--primary-light)';
      row.style.borderColor = 'var(--primary-color)';
    }
    const name = document.createElement('span');
    name.textContent = tab.name || 'Untitled';
    name.style.overflow = 'hidden';
    name.style.textOverflow = 'ellipsis';
    name.style.whiteSpace = 'nowrap';
    name.style.minWidth = '0';
    name.style.flex = '1';
    row.appendChild(name);
    if (tabs.length > 1) {
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = '✕';
      close.style.cssText = 'width:26px; height:26px; border:none; background:transparent; color:var(--text-secondary); font-size:.9rem; cursor:pointer; border-radius:50%; flex-shrink:0;';
      close.title = 'Close tab';
      close.onclick = (e) => { e.stopPropagation(); TAB_MANAGER.deleteTab(tab.id); openMobileTabSheet(); };
      row.appendChild(close);
    }
    row.onclick = () => { closeMobileTabSheet(); TAB_MANAGER.switchTo(tab.id); };
    list.appendChild(row);
  });
  sheet.style.display = 'flex';
  sheet.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeMobileTabSheet() {
  const sheet = document.getElementById('mobile-tab-sheet');
  if (sheet) { sheet.style.display = 'none'; sheet.classList.remove('open'); }
  document.body.style.overflow = '';
}

function _syncMobileTabFab() {
  const fab = document.getElementById('topbar-tabs-fab-btn');
  if (!fab) return;
  const isMobile = typeof isMobileDeviceLayout === 'function' && isMobileDeviceLayout();
  const hasMultipleTabs = (TAB_MANAGER && TAB_MANAGER.tabs && TAB_MANAGER.tabs.length > 1);
  fab.style.display = (isMobile && hasMultipleTabs) ? 'flex' : 'none';
  if (hasMultipleTabs) document.body.classList.add('has-multiple-tabs');
  else document.body.classList.remove('has-multiple-tabs');
}