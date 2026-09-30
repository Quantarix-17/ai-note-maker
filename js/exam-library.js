// ========================================================================
// EXAM LIBRARY — বহুনির্বাচনি (MCQ) প্রশ্নপত্র + কমপ্যাক্ট OMR
// ------------------------------------------------------------------------
// এই ফাইলটাই "এক্সাম লাইব্রেরী"। AI-এর আচরণ, প্রশ্নপত্রের ফরম্যাট, জিজ্ঞাসার প্রশ্ন,
// কাঠিন্য-মান, বিষয়ভিত্তিক নির্দেশনা, OMR-এর ডিজাইন — সবকিছু নিচের EXAM_LIBRARY
// অবজেক্টে আছে। প্রতিটি রিকোয়েস্টের সময় AI-এর প্রম্পট এখান থেকেই নতুন করে তৈরি হয়,
// তাই এই ফাইলে যা বদলাবেন, পরের রিকোয়েস্ট থেকেই AI সেটা মেনে চলবে
// (app.js বা অন্য কোনো ফাইল আর বদলাতে হবে না)।
//
// কী কোথায় বদলাবেন
//   detect        কোন কথা লিখলে এক্সাম-মোড চালু হবে
//   defaults      সময়/পূর্ণমান/ব্যাচ সাইজ/উত্তরমালা ইত্যাদির ডিফল্ট
//   layout        পেজের মাপ, ফন্ট সাইজ, কলাম, OMR বাবলের আকার
//   labels        বাংলা/ইংরেজি লেবেল (সময়, পূর্ণমান, OMR শিরোনাম...)
//   clarify       AI যে প্রশ্নগুলো জিজ্ঞাসা করবে (পেজ, OMR, কাঠিন্য, সংখ্যা)
//   difficulty    কাঠিন্য-মানের সংজ্ঞা (AI-কে যা বলা হয়)
//   subjects      বিষয়ভিত্তিক বাড়তি নির্দেশনা — নতুন বিষয় যোগ করলেই AI শিখে নেবে
//   promptRules   AI-এর জন্য মূল নিয়মাবলি
//   sampleQuestions  AI-কে ফরম্যাট বোঝানোর নমুনা প্রশ্ন
//
// লোড ক্রম: document-editor.js এবং pdf-export.js-এর পরে, app.js-এর আগে।
// (ব্রাউজার/সার্ভিস ওয়ার্কার ক্যাশ এড়াতে index.html-এ ?v=নম্বর বদলে নিন।)
// ========================================================================
(function () {
  'use strict';

  const root = (typeof window !== 'undefined') ? window : globalThis;

  // ======================================================================
  // ১. সম্পাদনযোগ্য কনফিগ
  // ======================================================================
  const EXAM_LIBRARY = {
    version: '1.0.0',
    enabled: true,

    // ---- কোন রিকোয়েস্টকে "পরীক্ষার প্রশ্ন" ধরা হবে (regex সোর্স, case-insensitive) ----
    detect: {
      patterns: [
        'প্রশ্নপত্র',
        'question\\s*paper',
        'exam\\s*paper',
        'এমসিকিউ',
        '\\bmcqs?\\b',
        'বহুনির্বাচন[িী]',
        'বহুপদী',
        'মডেল\\s*টেস্ট',
        'model\\s*test',
        '(?:পরীক্ষ[াএ]\\S*|exam|test)[^\\n]{0,25}(?:প্রশ্ন|questions?)',
        '(?:প্রশ্ন|questions?)[^\\n]{0,25}(?:পরীক্ষ[াএ]\\S*|exam\\b)'
      ],
      // এগুলো বাদ দিয়ে কোনো বিষয়/অধ্যায় বাকি না থাকলে AI বিষয় জিজ্ঞাসা করবে
      topicFillerWords: [
        'পরীক্ষা', 'পরীক্ষার', 'পরীক্ষায়', 'প্রশ্নপত্র', 'প্রশ্ন', 'প্রশ্নের', 'তৈরি', 'তৈরী', 'বানাও', 'বানিয়ে',
        'বানান', 'দাও', 'দিন', 'করো', 'কর', 'করুন', 'চাই', 'জন্য', 'একটি', 'একটা', 'ওএমআর', 'সহ', 'ছাড়া',
        'পেজ', 'পৃষ্ঠা', 'মডেল', 'টেস্ট', 'এমসিকিউ', 'বহুনির্বাচনি', 'বহুনির্বাচনী', 'বহুপদী', 'নির্বাচনী',
        'মানের', 'মান', 'টি', 'টা', 'নিয়ে', 'আমাকে', 'আমার', 'সহজ', 'মাঝারি', 'কঠিন', 'মিশ্র', 'যুক্ত', 'লাগবে',
        'omr', 'mcq', 'mcqs', 'exam', 'test', 'model', 'question', 'questions', 'paper', 'create', 'make', 'generate',
        'for', 'a', 'an', 'the', 'of', 'with', 'without', 'page', 'pages', 'easy', 'medium', 'hard', 'mixed',
        'please', 'need', 'want', 'me', 'on', 'about', 'and'
      ]
    },

    // ---- ডিফল্ট মান ----
    defaults: {
      optionsPerQuestion: 4,
      minutesPerQuestion: 1,       // সময় বলা না থাকলে: প্রশ্নসংখ্যা × এই মান (মিনিট)
      marksPerQuestion: 1,         // পূর্ণমান বলা না থাকলে: প্রশ্নসংখ্যা × এই মান
      showPerQuestionMark: true,   // হেডারে "প্রতিটি প্রশ্নের মান ১" দেখাবে কিনা
      maxQuestions: 200,
      batchSize: 20,               // এক AI-কলে কতটি প্রশ্ন চাওয়া হবে
      shuffleOptions: true,        // অপশনের ক্রম এলোমেলো করে সঠিক উত্তর সমানভাবে ছড়ায়
      includeAnswerKey: false,     // true করলে শেষে উত্তরমালা পেজ যোগ হবে
      questionsPerPageEstimate: { first: 20, other: 26 }, // শুধু "কতটি প্রশ্ন?" অপশন সাজাতে
      countOptionFractions: [0.5, 0.75, 1, 1.25]   // "কতটি প্রশ্ন?" অপশন = ধারণক্ষমতা × এই ভগ্নাংশ
    },

    // ---- পেজ ও ডিজাইন (px, 96dpi; A4 কনটেন্ট এরিয়া ≈ 678 × 1003) ----
    layout: {
      pageContentWidthPx: 678,
      pageContentHeightPx: 985,    // পেজ-ব্লকের উচ্চতা; এডিটরের সীমা 1003 — ওভারফ্লো হলে কমান
      columnGapPx: 20,
      columnRule: '1px solid #444',
      fontSizesPt: [10, 9.5, 9, 8.5, 8],   // পেজ-সংখ্যায় না আঁটলে ক্রমে ছোট করে চেষ্টা করে
      lineHeight: 1.38,
      questionGapPx: 7,
      optionWideChars: 22,         // কোনো অপশন এর চেয়ে লম্বা হলে অপশনগুলো এক-কলামে সাজায়
      titlePt: 15,
      subtitlePt: 10.5,
      metaPt: 10.5,
      color: '#111',
      fontStack: "'Times New Roman','Tinos','Liberation Serif',Times,'Kalpurush',serif",
      omr: {
        rowsPerBlock: 10,
        blocksPerBand: 6,
        rowHeightPx: 15,
        bubblePx: 12,
        bubbleFontPt: 6.5,
        gapBelowQuestionsPx: 8
      }
    },

    // ---- লেবেল ----
    labels: {
      bn: {
        time: 'সময়', minutes: 'মিনিট', fullMarks: 'পূর্ণমান', perQuestion: 'প্রতিটি প্রশ্নের মান',
        omrTitle: 'OMR উত্তরপত্র', name: 'নাম', roll: 'রোল', cls: 'শ্রেণি', date: 'তারিখ',
        omrNote: 'সঠিক উত্তরের বৃত্তটি কালো কলমে সম্পূর্ণ ভরাট করুন। একটি প্রশ্নে একটির বেশি বৃত্ত ভরাট করবেন না।',
        answerKey: 'উত্তরমালা', options: ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ'], digits: '০১২৩৪৫৬৭৮৯'
      },
      en: {
        time: 'Time', minutes: 'minutes', fullMarks: 'Full Marks', perQuestion: 'Marks per question',
        omrTitle: 'OMR Answer Sheet', name: 'Name', roll: 'Roll', cls: 'Class', date: 'Date',
        omrNote: 'Fill the correct bubble completely with a black pen. Do not mark more than one bubble per question.',
        answerKey: 'Answer Key', options: ['A', 'B', 'C', 'D', 'E', 'F'], digits: '0123456789'
      }
    },

    // ---- AI যে প্রশ্নগুলো জিজ্ঞাসা করবে (ক্রম: order) ----
    // এখানে প্রশ্নের বাক্য বদলালে/অপশন যোগ করলে চ্যাটে সেটাই দেখাবে।
    clarify: {
      order: ['pages', 'omr', 'difficulty', 'count'],
      topic: {
        bn: 'কোন বিষয় বা অধ্যায়ের ওপর পরীক্ষার প্রশ্ন তৈরি করব? বিষয়টি লিখে পাঠান।',
        en: 'Which subject or chapter should the exam cover? Please type it.'
      },
      pages: {
        bn: 'প্রশ্নপত্র কত পেজ জুড়ে তৈরি করব?',
        en: 'How many pages should the question paper span?',
        options: [
          { value: 1, bn: '১ পেজ', en: '1 page' },
          { value: 2, bn: '২ পেজ', en: '2 pages' },
          { value: 3, bn: '৩ পেজ', en: '3 pages' },
          { value: 4, bn: '৪ পেজ', en: '4 pages' }
        ],
        max: 12
      },
      omr: {
        bn: 'কমপ্যাক্ট OMR শিট যুক্ত করব?',
        en: 'Should I add a compact OMR sheet?',
        options: [
          { value: true, bn: 'হ্যাঁ, OMR যুক্ত করুন', en: 'Yes, add OMR' },
          { value: false, bn: 'না, শুধু প্রশ্ন', en: 'No, questions only' }
        ]
      },
      difficulty: {
        bn: 'প্রশ্নের কাঠিন্য মান কেমন হবে?',
        en: 'How difficult should the questions be?',
        options: [
          { value: 'easy', bn: 'সহজ', en: 'Easy' },
          { value: 'medium', bn: 'মাঝারি', en: 'Medium' },
          { value: 'hard', bn: 'কঠিন', en: 'Hard' },
          { value: 'mixed', bn: 'মিশ্র (সহজ + মাঝারি + কঠিন)', en: 'Mixed (easy + medium + hard)' }
        ]
      },
      count: {
        bn: 'মোট কতটি প্রশ্ন তৈরি করব?',
        en: 'How many questions should I create in total?'
      }
    },

    // ---- কাঠিন্য-মান: AI-কে এই বর্ণনাগুলোই দেওয়া হয় ----
    difficulty: {
      easy: {
        label: { bn: 'সহজ', en: 'Easy' },
        guidance: 'EASY: direct recall and basic definitions, single-step, commonly known facts. Distractors clearly different from the answer.'
      },
      medium: {
        label: { bn: 'মাঝারি', en: 'Medium' },
        guidance: 'MEDIUM: understanding and simple application, one or two reasoning steps. Distractors plausible but distinguishable.'
      },
      hard: {
        label: { bn: 'কঠিন', en: 'Hard' },
        guidance: 'HARD: competitive/admission level — multi-step reasoning, subtle distinctions, analytical or tricky application. Distractors very plausible (close values, common misconceptions).'
      },
      mixed: {
        label: { bn: 'মিশ্র', en: 'Mixed' },
        ratio: { easy: 30, medium: 40, hard: 30 },
        guidance: 'MIXED: spread the questions across easy, medium and hard in the given ratio, shuffled (do not group by difficulty).'
      }
    },

    // ---- বিষয়ভিত্তিক নির্দেশনা: match শব্দ প্রম্পটে থাকলে guidance AI-কে যায় ----
    // নতুন বিষয় যোগ করতে একটি { id, match:[...], guidance:'...' } লাইন যোগ করুন।
    subjects: [
      { id: 'bangla', match: ['বাংলা', 'bangla', 'bengali'],
        guidance: 'Bangla language/literature: cover grammar (সন্ধি, সমাস, কারক-বিভক্তি, বাগধারা), literature (author-work, characters, poetry lines) and spelling. Use standard Bangla spelling.' },
      { id: 'english', match: ['ইংরেজি', 'english'],
        guidance: 'English: write the question and options in English (grammar, vocabulary, synonyms/antonyms, fill in the blanks, right form of verbs, prepositions, sentence correction).' },
      { id: 'math', match: ['গণিত', 'math', 'mathematics'],
        guidance: 'Mathematics: keep numbers clean, exactly one correct value, wrong options from typical calculation slips. Write formulas in LaTeX inside $...$ (double-escape backslashes in JSON).' },
      { id: 'physics', match: ['পদার্থ', 'physics'],
        guidance: 'Physics: include units in options, mix conceptual and numerical items, use LaTeX $...$ for formulas.' },
      { id: 'chemistry', match: ['রসায়ন', 'chemistry'],
        guidance: 'Chemistry: use correct symbols/formulas (LaTeX $\\mathrm{H_2O}$ style), balance concept and numerical items.' },
      { id: 'biology', match: ['জীববিজ্ঞান', 'biology'],
        guidance: 'Biology: use standard terminology, include diagram-free conceptual items only.' },
      { id: 'ict', match: ['আইসিটি', 'ict', 'তথ্য ও যোগাযোগ', 'কম্পিউটার', 'computer'],
        guidance: 'ICT: number systems, logic gates, networking, HTML/programming basics, internet — avoid questions that need a figure.' },
      { id: 'gk', match: ['সাধারণ জ্ঞান', 'general knowledge', 'gk', 'বিসিএস', 'bcs', 'নিয়োগ'],
        guidance: 'General knowledge / job-recruitment style: Bangladesh affairs, international affairs, current-affairs-neutral facts, science & tech, mental ability. Use only facts that are stable and verifiable.' },
      { id: 'bd_studies', match: ['বাংলাদেশ ও বিশ্বপরিচয়', 'ইতিহাস', 'history', 'ভূগোল', 'geography', 'পৌরনীতি'],
        guidance: 'History/geography/civics: dates, places, personalities, causes-effects; use only well-established facts.' }
    ],

    // ---- AI-এর মূল নিয়মাবলি (প্রতি লাইন একটি নিয়ম) ----
    promptRules: [
      'You are a professional exam-paper setter for Bangladeshi and international exams. You write ONLY multiple-choice questions (MCQ / বহুনির্বাচনি প্রশ্ন).',
      'Every question has exactly {OPTIONS} options and exactly ONE correct answer. Never write "none/all of the above" more than once per 20 questions. Options that refer to other options (e.g. "ক ও খ") are allowed only when they are genuinely needed.',
      'Questions must be factually correct, unambiguous and answerable without any figure, image or diagram. Never write a question that needs a picture.',
      'Keep each question stem SHORT (ideally one line, two at most) and each option SHORT (a word, a number, a short phrase) — the paper is printed in a compact two-column format.',
      'Do NOT put numbering in the question text and do NOT put labels like (ক), (A), a), 1. in front of options — the layout adds them automatically.',
      'Do not repeat or paraphrase a question, and spread topics across the whole requested scope.',
      'Distractors must be plausible; do not make the correct option systematically longest or always in the same position.',
      'Write in the language of the user request (Bangla request → Bangla questions, except English-language subjects which are written in English). Use standard spelling.',
      'Math/science formulas go inside $...$ as LaTeX; in the JSON string, escape every backslash (\\\\frac). Plain text otherwise; no HTML, no markdown.',
      'If an attached SOURCE MATERIAL is provided, build the questions from that material only.'
    ],

    // ---- ফরম্যাট বোঝাতে নমুনা (AI-কে দেখানো হয়; নিজের ধরনের প্রশ্ন দিয়ে বদলান) ----
    sampleQuestions: [
      { q: 'বাংলাদেশের জাতীয় ফুল কোনটি?', options: ['গোলাপ', 'শাপলা', 'কৃষ্ণচূড়া', 'রজনীগন্ধা'], answer: 1 },
      { q: 'কোনটি সন্ধির উদাহরণ?', options: ['নমস্কার', 'সুধাকর', 'হাতঘড়ি', 'পাঠশালা'], answer: 1 },
      { q: 'পানির রাসায়নিক সংকেত কোনটি?', options: ['$\\mathrm{CO_2}$', '$\\mathrm{H_2O}$', '$\\mathrm{NaCl}$', '$\\mathrm{O_2}$'], answer: 1 }
    ]
  };

  // ======================================================================
  // ২. ছোট সহায়ক ফাংশন
  // ======================================================================
  const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
  const BN_WORD_NUMS = { 'এক': 1, 'দুই': 2, 'দু': 2, 'তিন': 3, 'চার': 4, 'পাঁচ': 5, 'ছয়': 6, 'সাত': 7, 'আট': 8, 'নয়': 9, 'দশ': 10 };

  function toAsciiDigits(s) {
    return String(s == null ? '' : s).replace(/[০-৯]/g, d => String(BN_DIGITS.indexOf(d)));
  }
  function fmtNum(n, lang) {
    const digits = (EXAM_LIBRARY.labels[lang] || EXAM_LIBRARY.labels.en).digits;
    return String(n).replace(/\d/g, d => digits[+d]);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function hasBengali(s) { return /[\u0980-\u09FF]/.test(String(s || '')); }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function isCancelled() {
    try { return typeof isCancellationRequested !== 'undefined' && !!isCancellationRequested; } catch (_) { return false; }
  }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ======================================================================
  // ৩. রিকোয়েস্ট শনাক্তকরণ ও পার্সিং
  // ======================================================================
  function isExamRequest(text) {
    if (!EXAM_LIBRARY.enabled) return false;
    const t = String(text || '');
    return EXAM_LIBRARY.detect.patterns.some(p => { try { return new RegExp(p, 'i').test(t); } catch (_) { return false; } });
  }

  // "[Clarification already given …]" অংশ থেকে মূল রিকোয়েস্ট ও Q/A জোড়া আলাদা করে
  function splitClarification(promptText) {
    const text = String(promptText || '');
    const idx = text.indexOf('[Clarification already given');
    if (idx < 0) return { original: text.trim(), pairs: [] };
    const original = text.slice(0, idx).trim();
    const tail = text.slice(idx).replace(/^\[[^\]]*\]\s*/, '');
    const pairs = [];
    const re = /Q:\s*([\s\S]*?)\nA:\s*([\s\S]*?)(?=\nQ:|$)/g;
    let m;
    while ((m = re.exec(tail))) pairs.push({ q: m[1].trim(), a: m[2].trim() });
    return { original, pairs };
  }

  function clarifyKeyOfQuestion(q) {
    const C = EXAM_LIBRARY.clarify;
    const nq = norm(q);
    for (const key of ['topic', 'pages', 'omr', 'difficulty', 'count']) {
      const def = C[key];
      if (!def) continue;
      for (const lang of ['bn', 'en']) {
        const ref = norm(def[lang]);
        if (ref && (nq === ref || nq.includes(ref.slice(0, 14)))) return key;
      }
    }
    return null;
  }

  function firstInt(s) {
    const m = toAsciiDigits(s).match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }
  function wordNumber(s) {
    for (const w of Object.keys(BN_WORD_NUMS)) if (new RegExp(w).test(s)) return BN_WORD_NUMS[w];
    return null;
  }

  function parseDifficulty(text) {
    const t = String(text || '');
    const hit = {
      mixed: /মিশ্র|mixed|সব\s*ধরনের|all\s*levels?/i.test(t),
      hard: /কঠিন|hard|difficult|challenging|প্রতিযোগিতামূলক/i.test(t),
      medium: /মাঝারি|মধ্যম|medium|moderate/i.test(t),
      easy: /সহজ|easy|beginner/i.test(t)
    };
    if (hit.mixed) return 'mixed';
    const found = ['easy', 'medium', 'hard'].filter(k => hit[k]);
    if (found.length >= 2) return 'mixed';
    return found[0] || undefined;
  }

  function parseYesNo(text, strictStart) {
    const t = String(text || '').trim();
    if (strictStart) {
      if (/^(?:হ্যাঁ|হ্যা|হাঁ|yes|y\b|যুক্ত|হ্যাঁ)/i.test(t)) return true;
      if (/^(?:না\b|না,|না |no\b|n\b|ছাড়া)/i.test(t)) return false;
    }
    if (/(?:ওএমআর|ওমআর|omr)\s*(?:ছাড়া|ছাড়াই|লাগবে\s*না|লাগবেনা|দরকার\s*নেই|না\b)|(?:without|no)\s*omr|ছাড়া\s*(?:ওএমআর|omr)/i.test(t)) return false;
    if (/ওএমআর|ওমআর|omr/i.test(t)) return true;
    return undefined;
  }

  function parseTopicWords(text) {
    let t = ' ' + toAsciiDigits(String(text || '')).toLowerCase() + ' ';
    const fillers = EXAM_LIBRARY.detect.topicFillerWords.slice().sort((a, b) => b.length - a.length);
    fillers.forEach(w => { t = t.split(w.toLowerCase()).join(' '); });
    t = t.replace(/[\d\s.,;:!?()"'“”‘’\-–—_/\\|+*=<>@#$%^&\[\]{}~`]+/g, ' ').trim();
    return t;
  }

  function parseExamRequest(promptText, opts) {
    const o = opts || {};
    const { original, pairs } = splitClarification(promptText);
    const spec = {
      promptText: String(promptText || ''),
      original,
      lang: hasBengali(original) ? 'bn' : 'en',
      isEmptyCanvas: !!o.isEmptyCanvas,
      isReplace: !!o.isReplace,
      hasAttachment: !!o.hasAttachment,
      topicAnswer: ''
    };
    const orig = toAsciiDigits(original);

    // মূল বার্তা থেকে
    let m = orig.match(/(\d+)\s*(?:পেজ|পৃষ্ঠা|পাতা|pages?|pgs?\b)/i);
    if (m) spec.pages = parseInt(m[1], 10);
    else { const w = original.match(/(এক|দুই|তিন|চার|পাঁচ|ছয়|সাত|আট)\s*(?:পেজ|পৃষ্ঠা|পাতা)/); if (w) spec.pages = BN_WORD_NUMS[w[1]]; }

    m = orig.match(/(\d+)\s*(?:টি|টা|ট)?\s*(?:প্রশ্ন|মাল্টিপল|এমসিকিউ|mcqs?|questions?|q\b)/i)
      || orig.match(/(?:প্রশ্ন(?:\s*সংখ্যা)?|questions?|total)\s*[:：\-=]?\s*(\d+)/i)
      || orig.match(/(\d+)\s*(?:টি|টা)(?!\s*(?:পেজ|পৃষ্ঠা))/);
    if (m) spec.count = parseInt(m[1], 10);

    const hours = orig.match(/(\d+(?:\.\d+)?)\s*(?:ঘণ্টা|ঘন্টা|hours?|hrs?)/i);
    const mins = orig.match(/(\d+)\s*(?:মিনিট|minutes?|mins?)/i);
    if (hours || mins) spec.minutes = Math.round((hours ? parseFloat(hours[1]) * 60 : 0) + (mins ? parseInt(mins[1], 10) : 0));
    m = orig.match(/(?:পূর্ণমান|পূর্ণ\s*মান|full\s*marks?|total\s*marks?|marks)\s*[:：\-=]?\s*(\d+)/i);
    if (m) spec.fullMarks = parseInt(m[1], 10);

    spec.omr = parseYesNo(original, false);
    spec.difficulty = parseDifficulty(original);

    // AI-এর প্রশ্নের উত্তর থেকে (উত্তর-ই সর্বশেষ কথা, তাই মূল বার্তাকে ওভাররাইট করে)
    pairs.forEach(({ q, a }) => {
      const key = clarifyKeyOfQuestion(q);
      if (key === 'pages') { const n = firstInt(a) || wordNumber(a); if (n) spec.pages = n; }
      else if (key === 'count') { const n = firstInt(a); if (n) spec.count = n; }
      else if (key === 'omr') { const v = parseYesNo(a, true); if (v !== undefined) spec.omr = v; }
      else if (key === 'difficulty') { const v = parseDifficulty(a); if (v) spec.difficulty = v; }
      else if (key === 'topic') { spec.topicAnswer = (spec.topicAnswer + ' ' + a).trim(); }
    });

    if (spec.pages) spec.pages = Math.min(spec.pages, EXAM_LIBRARY.clarify.pages.max || 12);
    if (spec.count) spec.count = Math.min(spec.count, EXAM_LIBRARY.defaults.maxQuestions);

    const topicText = parseTopicWords(original) || parseTopicWords(spec.topicAnswer);
    spec.hasTopic = spec.hasAttachment || topicText.length >= 3 || parseTopicWords(spec.topicAnswer).length >= 2;
    return spec;
  }

  // পরবর্তী কোন প্রশ্নটি জিজ্ঞাসা করতে হবে (নেই হলে null)
  function nextClarification(spec) {
    const C = EXAM_LIBRARY.clarify;
    const L = spec.lang;
    if (!spec.hasTopic) return { question: C.topic[L] || C.topic.en, options: [] };
    for (const key of C.order) {
      if (spec[key] !== undefined && spec[key] !== null) continue;
      if (key === 'count') {
        return { question: C.count[L] || C.count.en, options: countOptions(spec.pages || 1, L) };
      }
      const def = C[key];
      if (!def) continue;
      return { question: def[L] || def.en, options: def.options.map(op => op[L] || op.en) };
    }
    return null;
  }

  function countOptions(pages, lang) {
    const est = EXAM_LIBRARY.defaults.questionsPerPageEstimate;
    const cap = est.first + Math.max(0, pages - 1) * est.other;
    const set = new Set();
    EXAM_LIBRARY.defaults.countOptionFractions.forEach(f => set.add(Math.max(5, Math.round((cap * f) / 5) * 5)));
    return Array.from(set).sort((a, b) => a - b).map(n => lang === 'bn' ? `${fmtNum(n, 'bn')}টি প্রশ্ন` : `${n} questions`);
  }

  // ======================================================================
  // ৪. AI প্রম্পট (প্রতি রিকোয়েস্টে লাইব্রেরি থেকে নতুন করে তৈরি)
  // ======================================================================
  function matchSubjects(text) {
    const t = norm(text);
    return EXAM_LIBRARY.subjects.filter(s => (s.match || []).some(k => t.includes(norm(k)))).slice(0, 2);
  }

  function difficultyBlock(spec) {
    const D = EXAM_LIBRARY.difficulty;
    const key = D[spec.difficulty] ? spec.difficulty : 'medium';
    let s = D[key].guidance;
    if (key === 'mixed' && D.mixed.ratio) {
      const r = D.mixed.ratio;
      s += ` Ratio: easy ${r.easy}%, medium ${r.medium}%, hard ${r.hard}%.`;
    }
    return s;
  }

  function getExamRulesForPrompt(spec, batchCount, isFirstBatch) {
    const opts = EXAM_LIBRARY.defaults.optionsPerQuestion;
    const rules = EXAM_LIBRARY.promptRules.map((r, i) => `${i + 1}. ${r.replace(/\{OPTIONS\}/g, String(opts))}`).join('\n');
    const subj = matchSubjects(spec.promptText).map(s => `- ${s.guidance}`).join('\n');
    const samples = JSON.stringify(EXAM_LIBRARY.sampleQuestions.map(q => ({ q: q.q, options: q.options, answer: q.answer })));
    return [
      'EXAM LIBRARY RULES:',
      rules,
      subj ? `SUBJECT GUIDANCE:\n${subj}` : '',
      `DIFFICULTY: ${difficultyBlock(spec)}`,
      `FORMAT EXAMPLE (style only — never reuse these questions): ${samples}`,
      `Write exactly ${batchCount} NEW questions in this response.`,
      'OUTPUT: return ONLY one JSON object, no markdown fences, no commentary:',
      `{"action":"exam","title":"exam/paper title","subtitle":"short line such as subject/class/chapter (or empty)","questions":[{"q":"question text","options":[${Array.from({ length: opts }, (_, i) => `"option ${i + 1}"`).join(',')}],"answer":0}]}`,
      '"answer" is the 0-based index of the single correct option.',
      isFirstBatch ? '"title" must be a short, proper paper title derived from the request (e.g. subject + "মডেল টেস্ট"). Do not put the date or marks in the title.' : '"title" and "subtitle" may be empty strings in this response.',
      'If the request has NO identifiable subject/topic at all and no source material, return exactly {"action":"need_topic"} instead.'
    ].filter(Boolean).join('\n');
  }

  // এক্সপোর্ট: অন্য লাইব্রেরিগুলোর মতো (getXCatalogForPrompt) — সংক্ষিপ্ত সারাংশ
  function getExamCatalogForPrompt() {
    const D = EXAM_LIBRARY.defaults;
    return `Exam paper (MCQ) generation is handled by the dedicated Exam Library (v${EXAM_LIBRARY.version}): ${D.optionsPerQuestion} options per question, compact two-column layout, optional compact OMR sheet.`;
  }

  // ======================================================================
  // ৫. AI থেকে প্রশ্ন সংগ্রহ ও পরিষ্কার করা
  // ======================================================================
  const POSITIONAL_REF = /উপরের|সবগুলো|সকল|সবই|কোনটিই|none of|all of the above|both|\b[কখগঘ]\s*(?:ও|এবং|ও\s*[কখগঘ])|\([কখগঘA-D]\)/i;

  function cleanOption(o) {
    let s = (o && typeof o === 'object') ? (o.text || o.label || o.value || '') : o;
    s = String(s == null ? '' : s).trim();
    s = s.replace(/^\s*[\(\[]?(?:[কখগঘঙচ]|[A-Fa-f]|[1-6১-৬])[\)\]\.:]\s+/, '').replace(/^\s*\((?:[কখগঘঙচ]|[A-Fa-f])\)\s*/, '');
    return s.trim();
  }
  function cleanStem(q) {
    return String(q == null ? '' : q).trim().replace(/^\s*(?:প্রশ্ন\s*)?[\(\[]?[\d০-৯]+[\)\]\.:]\s*/, '').trim();
  }
  function answerIndex(a, n) {
    if (typeof a === 'number' && a >= 0 && a < n) return a;
    const s = toAsciiDigits(String(a == null ? '' : a)).trim();
    if (/^\d+$/.test(s)) { const v = parseInt(s, 10); return v >= 0 && v < n ? v : (v >= 1 && v <= n ? v - 1 : -1); }
    const bn = EXAM_LIBRARY.labels.bn.options.indexOf(s.replace(/[()\s]/g, ''));
    if (bn >= 0 && bn < n) return bn;
    const en = 'abcdef'.indexOf(s.replace(/[()\s]/g, '').toLowerCase());
    if (s.length <= 3 && en >= 0 && en < n) return en;
    return -1;
  }

  function normalizeQuestions(arr, seen) {
    const need = EXAM_LIBRARY.defaults.optionsPerQuestion;
    const out = [];
    (Array.isArray(arr) ? arr : []).forEach(item => {
      if (!item) return;
      const q = cleanStem(item.q || item.question || item.stem);
      let options = (Array.isArray(item.options) ? item.options : (Array.isArray(item.choices) ? item.choices : [])).map(cleanOption).filter(Boolean);
      if (!q || options.length < need) return;
      options = options.slice(0, need);
      if (new Set(options.map(norm)).size < need) return;
      const key = norm(q).slice(0, 80);
      if (seen.has(key)) return;
      seen.add(key);
      let ans = answerIndex(item.answer != null ? item.answer : item.correct, need);
      const q2 = { q, options, answer: ans };
      if (EXAM_LIBRARY.defaults.shuffleOptions && ans >= 0 && !options.some(o => POSITIONAL_REF.test(o))) {
        const idx = options.map((_, i) => i);
        for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
        q2.options = idx.map(i => options[i]);
        q2.answer = idx.indexOf(ans);
      }
      out.push(q2);
    });
    return out;
  }

  async function callExamBatch(spec, n, isFirst, prevStems, fileContextString, modelsUsedSet) {
    const system = getExamRulesForPrompt(spec, n, isFirst);
    let user = `USER REQUEST:\n${spec.promptText}\n\n`;
    if (fileContextString) user += `SOURCE MATERIAL (build questions from this):\n${String(fileContextString).slice(0, 24000)}\n\n`;
    if (prevStems.length) user += `ALREADY WRITTEN — do NOT repeat or paraphrase any of these:\n${prevStems.slice(-60).map(s => '- ' + s.slice(0, 70)).join('\n')}\n\n`;
    user += `Return the JSON for ${n} new questions now.`;

    const res = await callAIAPI([{ role: 'system', content: system }, { role: 'user', content: user }], { forceJson: true, modelsUsedSet });
    const raw = String(res && res.content || '');
    const parsed = safeParseAIJson(raw, null) || attemptRepairAndParse(raw);
    return parsed || null;
  }

  // ======================================================================
  // ৬. HTML রেন্ডারিং (সব স্টাইল inline — PDF/প্রিভিউ/ইমেজ-PDF-এ ঠিক থাকে)
  // ======================================================================
  function fmtText(s) {
    let html = esc(s);
    if (/\$|\\\(|\\\[/.test(html) && typeof processMathEquationsToHTML === 'function') {
      try { html = processMathEquationsToHTML(html); } catch (_) { /* মাপার জন্য মেথ ছাড়াই চলবে */ }
    }
    return html;
  }

  function baseStyle(pt) {
    const L = EXAM_LIBRARY.layout;
    return `font-family:${L.fontStack};font-size:${pt}pt;line-height:${L.lineHeight};color:${L.color};text-align:left;`;
  }

  function questionHtml(q, idx, ctx) {
    const L = ctx.labels, LY = EXAM_LIBRARY.layout;
    const wide = q.options.some(o => o.replace(/\s+/g, '').length > LY.optionWideChars);
    const opts = q.options.map((o, i) =>
      `<div style="flex:0 0 ${wide ? 100 : 50}%;box-sizing:border-box;padding-right:4px;display:flex;">` +
      `<span style="flex:0 0 auto;margin-right:3px;">(${esc(L.options[i])})</span>` +
      `<span style="flex:1 1 auto;min-width:0;overflow-wrap:anywhere;">${fmtText(o)}</span></div>`).join('');
    return `<div class="exam-q" style="box-sizing:border-box;padding-bottom:${LY.questionGapPx}px;break-inside:avoid;page-break-inside:avoid;">` +
      `<div style="display:flex;"><span style="flex:0 0 auto;font-weight:700;margin-right:3px;">${fmtNum(idx + 1, ctx.lang)}.</span>` +
      `<span style="flex:1 1 auto;min-width:0;overflow-wrap:anywhere;">${fmtText(q.q)}</span></div>` +
      `<div style="display:flex;flex-wrap:wrap;">${opts}</div></div>`;
  }

  function headerHtml(hd, ctx) {
    const LY = EXAM_LIBRARY.layout, L = ctx.labels;
    const mid = EXAM_LIBRARY.defaults.showPerQuestionMark ? `<span>${esc(L.perQuestion)} ${fmtNum(hd.marksPerQuestion, ctx.lang)}</span>` : '<span></span>';
    return `<div class="exam-header" style="box-sizing:border-box;padding-bottom:6px;">` +
      `<div style="text-align:center;font-weight:800;font-size:${LY.titlePt}pt;line-height:1.25;">${fmtText(hd.title)}</div>` +
      (hd.subtitle ? `<div style="text-align:center;font-size:${LY.subtitlePt}pt;margin-top:1px;">${fmtText(hd.subtitle)}</div>` : '') +
      `<div style="display:flex;justify-content:space-between;align-items:baseline;font-weight:700;font-size:${LY.metaPt}pt;margin-top:5px;padding:3px 0;border-top:1px solid #111;border-bottom:1.5px solid #111;">` +
      `<span>${esc(L.time)}: ${fmtNum(hd.minutes, ctx.lang)} ${esc(L.minutes)}</span>${mid}<span>${esc(L.fullMarks)}: ${fmtNum(hd.fullMarks, ctx.lang)}</span></div></div>`;
  }

  function omrHtml(n, ctx) {
    const O = EXAM_LIBRARY.layout.omr, L = ctx.labels;
    const field = (label, flex) => `<span style="display:flex;align-items:baseline;flex:${flex};min-width:0;"><span>${esc(label)}:</span><span style="flex:1;border-bottom:1px solid #111;margin:0 6px 0 3px;">&nbsp;</span></span>`;
    const bubble = ch => `<span style="display:inline-block;box-sizing:border-box;width:${O.bubblePx}px;height:${O.bubblePx}px;line-height:${O.bubblePx - 2}px;border:1px solid #111;border-radius:50%;text-align:center;font-size:${O.bubbleFontPt}pt;margin-right:3px;">${esc(ch)}</span>`;
    const totalBlocks = Math.ceil(n / O.rowsPerBlock);
    let bands = '';
    for (let b0 = 0; b0 < totalBlocks; b0 += O.blocksPerBand) {
      let blocks = '';
      for (let b = b0; b < Math.min(totalBlocks, b0 + O.blocksPerBand); b++) {
        let rows = '';
        for (let r = 0; r < O.rowsPerBlock; r++) {
          const qn = b * O.rowsPerBlock + r + 1;
          if (qn > n) break;
          rows += `<div style="display:flex;align-items:center;height:${O.rowHeightPx}px;"><span style="flex:0 0 22px;text-align:right;margin-right:4px;font-weight:700;font-size:7.5pt;">${fmtNum(qn, ctx.lang)}</span>` +
            L.options.slice(0, EXAM_LIBRARY.defaults.optionsPerQuestion).map(bubble).join('') + `</div>`;
        }
        blocks += `<div style="flex:0 0 ${(100 / O.blocksPerBand).toFixed(3)}%;box-sizing:border-box;">${rows}</div>`;
      }
      bands += `<div style="display:flex;margin-top:${b0 === 0 ? 4 : 5}px;">${blocks}</div>`;
    }
    return `<div class="exam-omr" style="box-sizing:border-box;border:1.2px solid #111;padding:5px 8px 6px;font-size:8pt;line-height:1.2;">` +
      `<div style="display:flex;align-items:baseline;gap:8px;"><b style="font-size:10pt;white-space:nowrap;">${esc(L.omrTitle)}</b>` +
      field(L.name, 3) + field(L.roll, 1.2) + field(L.cls, 1.2) + field(L.date, 1.4) + `</div>` +
      `<div style="font-size:7pt;margin-top:3px;">${esc(L.omrNote)}</div>${bands}</div>`;
  }

  function answerKeyHtml(questions, ctx) {
    const L = ctx.labels;
    const items = questions.map((q, i) => q.answer >= 0
      ? `<span style="flex:0 0 12.5%;box-sizing:border-box;padding:2px 0;">${fmtNum(i + 1, ctx.lang)} – <b>${esc(L.options[q.answer])}</b></span>` : '').join('');
    return `<div class="exam-key" style="box-sizing:border-box;"><div style="text-align:center;font-weight:800;font-size:12pt;padding-bottom:4px;border-bottom:1px solid #111;margin-bottom:6px;">${esc(L.answerKey)}</div>` +
      `<div style="display:flex;flex-wrap:wrap;font-size:10pt;">${items}</div></div>`;
  }

  function pageHtml(parts) {
    const LY = EXAM_LIBRARY.layout;
    let cols = '';
    if (parts.left) {
      const gap = LY.columnGapPx / 2;
      cols = `<div class="block-exam-cols" style="display:flex;flex:0 0 auto;height:${Math.floor(parts.colsH)}px;overflow:hidden;">` +
        `<div style="flex:1 1 0;min-width:0;box-sizing:border-box;padding-right:${gap}px;">${parts.left}</div>` +
        `<div style="flex:1 1 0;min-width:0;box-sizing:border-box;padding-left:${gap}px;border-left:${LY.columnRule};">${parts.right || ''}</div></div>`;
    }
    return `<div class="block-exam-page" style="box-sizing:border-box;width:100%;height:${LY.pageContentHeightPx}px;overflow:hidden;${baseStyle(parts.pt)}">` +
      `${parts.header || ''}${cols}` +
      (parts.omr ? `<div style="margin-top:${LY.omr.gapBelowQuestionsPx}px;">${parts.omr}</div>` : '') +
      `${parts.extra || ''}</div>`;
  }

  // ======================================================================
  // ৭. মাপ নিয়ে পেজ ভাগ (দুই কলাম, বাম কলাম আগে ভরে)
  // ======================================================================
  function makeHost() {
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;z-index:-1;';
    document.body.appendChild(host);
    return host;
  }

  function estimateHeight(html, widthPx, pt) {
    const text = html.replace(/<[^>]*>/g, '');
    const perLine = Math.max(8, Math.floor(widthPx / (pt * 0.62)));
    const lines = Math.max(2, Math.ceil(text.length / perLine) + 1);
    return lines * pt * 1.333 * EXAM_LIBRARY.layout.lineHeight + EXAM_LIBRARY.layout.questionGapPx;
  }

  function measureBlocks(host, htmlList, widthPx, pt) {
    const wrap = document.createElement('div');
    wrap.style.cssText = `width:${widthPx}px;box-sizing:border-box;${baseStyle(pt)}`;
    wrap.innerHTML = htmlList.join('');
    host.appendChild(wrap);
    const kids = Array.from(wrap.children);
    const hs = kids.map((el, i) => {
      const h = el.getBoundingClientRect().height;
      return h > 0 ? h : estimateHeight(htmlList[i], widthPx, pt);
    });
    host.removeChild(wrap);
    return hs;
  }

  function packColumns(heights, firstH, otherH) {
    const pages = [];
    let cur = { l: [], r: [] }, side = 'l', used = 0, H = firstH;
    heights.forEach((h, i) => {
      if (used + h > H && used > 0) {
        if (side === 'l') { side = 'r'; used = 0; }
        else { pages.push(cur); cur = { l: [], r: [] }; side = 'l'; used = 0; H = otherH; }
      }
      cur[side].push(i);
      used += h;
    });
    pages.push(cur);
    return pages;
  }

  function sumH(idxs, heights) { return idxs.reduce((a, i) => a + heights[i], 0); }

  function balanceSplit(items, heights) {
    let best = { k: items.length, h: sumH(items, heights) };
    for (let k = 0; k <= items.length; k++) {
      const h = Math.max(sumH(items.slice(0, k), heights), sumH(items.slice(k), heights));
      if (h < best.h) best = { k, h };
    }
    return best;
  }

  function layoutAtSize(questions, spec, hd, ctx, pt) {
    const LY = EXAM_LIBRARY.layout;
    const host = makeHost();
    try {
      const colInner = Math.floor((LY.pageContentWidthPx - LY.columnGapPx - 1) / 2);
      const qHtml = questions.map((q, i) => questionHtml(q, i, ctx));
      const heights = measureBlocks(host, qHtml, colInner, pt);
      const header = headerHtml(hd, ctx);
      const headerH = measureBlocks(host, [header], LY.pageContentWidthPx, pt)[0];
      const omr = spec.omr ? omrHtml(questions.length, ctx) : '';
      const omrH = spec.omr ? measureBlocks(host, [omr], LY.pageContentWidthPx, pt)[0] : 0;

      const H = LY.pageContentHeightPx;
      const firstColH = Math.max(120, H - headerH);
      const pages = packColumns(heights, firstColH, H);
      const last = pages[pages.length - 1];
      const lastColH = pages.length === 1 ? firstColH : H;
      let omrOwnPage = false, omrOnLast = false;

      if (spec.omr) {
        const items = last.l.concat(last.r);
        const bal = balanceSplit(items, heights);
        if (bal.h + LY.omr.gapBelowQuestionsPx + omrH <= lastColH) {
          last.l = items.slice(0, bal.k); last.r = items.slice(bal.k); last.forcedColsH = bal.h + 2; omrOnLast = true;
        } else omrOwnPage = true;
      }

      const out = pages.map((p, pi) => {
        const isLast = pi === pages.length - 1;
        return pageHtml({
          pt,
          header: pi === 0 ? header : '',
          left: p.l.map(i => qHtml[i]).join('') || '&nbsp;',
          right: p.r.map(i => qHtml[i]).join(''),
          colsH: p.forcedColsH || (pi === 0 ? firstColH : H),
          omr: (isLast && omrOnLast) ? omr : ''
        });
      });
      if (omrOwnPage) out.push(pageHtml({ pt, omr }));
      if (EXAM_LIBRARY.defaults.includeAnswerKey) out.push(pageHtml({ pt, extra: answerKeyHtml(questions, ctx) }));
      return { pagesHtml: out, questionPages: pages.length, fontPt: pt };
    } finally {
      if (host.parentNode) host.parentNode.removeChild(host);
    }
  }

  async function buildExamPages(questions, spec, hd, ctx) {
    try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, sleep(1500)]); } catch (_) { /* ignore */ }
    const sizes = EXAM_LIBRARY.layout.fontSizesPt;
    let result = null;
    for (const pt of sizes) {
      result = layoutAtSize(questions, spec, hd, ctx, pt);
      if (!spec.pages || result.questionPages <= spec.pages) break;
    }
    return result;
  }

  // ======================================================================
  // ৮. মূল এন্ট্রি: AI-কে জিজ্ঞাসা → প্রশ্ন তৈরি → পেজে বসানো
  // ======================================================================
  async function generateExamPaper(promptText, fileContextString, modelsUsedSet, intentPayload, options) {
    const o = options || {};
    const spec = parseExamRequest(promptText, { isEmptyCanvas: o.isEmptyCanvas, isReplace: o.isReplace, hasAttachment: !!(fileContextString && String(fileContextString).trim()) });
    const sessionId = (typeof APP_STATE !== 'undefined') ? APP_STATE.activeSessionId : null;

    // ক) প্রয়োজনীয় তথ্য না থাকলে জিজ্ঞাসা
    const ask = nextClarification(spec);
    if (ask) return { clarify: ask };

    const D = EXAM_LIBRARY.defaults;
    const target = spec.count;
    const labels = EXAM_LIBRARY.labels[spec.lang] || EXAM_LIBRARY.labels.en;
    const ctx = { lang: spec.lang, labels };

    try {
      if (typeof ProgressUI !== 'undefined' && ProgressUI.show) {
        ProgressUI.show(spec.lang === 'bn' ? 'প্রশ্নপত্র তৈরি হচ্ছে…' : 'Creating exam paper…', spec.lang === 'bn' ? `${fmtNum(target, 'bn')}টি বহুনির্বাচনি প্রশ্ন` : `${target} MCQ questions`);
      }

      // খ) ব্যাচে প্রশ্ন সংগ্রহ
      const all = [], seen = new Set();
      let title = '', subtitle = '', attempts = 0;
      const maxAttempts = Math.ceil(target / D.batchSize) + 3;
      while (all.length < target && attempts < maxAttempts) {
        if (isCancelled()) return { ok: false, aborted: true };
        if (sessionId !== null && APP_STATE.activeSessionId !== sessionId) return { ok: false, aborted: true };
        attempts++;
        const n = Math.min(D.batchSize, target - all.length);
        if (typeof ProgressUI !== 'undefined' && ProgressUI.setStage) {
          const a = 6 + Math.round((all.length / target) * 74);
          ProgressUI.setStage(spec.lang === 'bn' ? `প্রশ্ন লেখা হচ্ছে (${fmtNum(all.length, 'bn')}/${fmtNum(target, 'bn')})…` : `Writing questions (${all.length}/${target})…`, a, Math.min(88, a + Math.round(74 / Math.ceil(target / D.batchSize))));
        }
        const parsed = await callExamBatch(spec, n, all.length === 0, all.map(q => q.q), fileContextString, modelsUsedSet);
        if (parsed && parsed.action === 'need_topic' && all.length === 0) {
          if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide();
          return { clarify: { question: EXAM_LIBRARY.clarify.topic[spec.lang] || EXAM_LIBRARY.clarify.topic.en, options: [] } };
        }
        if (!parsed) continue;
        if (!title && parsed.title) title = String(parsed.title).trim();
        if (!subtitle && parsed.subtitle) subtitle = String(parsed.subtitle).trim();
        normalizeQuestions(parsed.questions, seen).forEach(q => { if (all.length < target) all.push(q); });
      }

      if (!all.length) {
        return { ok: false, message: spec.lang === 'bn' ? 'AI কোনো প্রশ্ন তৈরি করতে পারেনি। আবার চেষ্টা করুন বা AI Models সেটিং দেখুন।' : 'The AI did not return any usable questions. Please try again or check your AI model settings.' };
      }

      // গ) হেডার + পেজ লেআউট
      if (typeof ProgressUI !== 'undefined' && ProgressUI.setStage) ProgressUI.setStage(spec.lang === 'bn' ? 'পেজ সাজানো হচ্ছে…' : 'Laying out pages…', 88, 96);
      const count = all.length;
      const hd = {
        title: title || (spec.lang === 'bn' ? 'মডেল টেস্ট' : 'Model Test'),
        subtitle,
        minutes: spec.minutes || Math.max(1, Math.round(count * D.minutesPerQuestion)),
        fullMarks: spec.fullMarks || Math.round(count * D.marksPerQuestion),
        marksPerQuestion: D.marksPerQuestion
      };
      const built = await buildExamPages(all, spec, hd, ctx);
      const examHtml = built.pagesHtml.join('<div class="manual-page-break"></div>');

      const existing = (!spec.isEmptyCanvas && !spec.isReplace && typeof getAllCanvasHTML === 'function') ? getAllCanvasHTML() : '';
      const finalHtml = existing ? `${existing}<div class="manual-page-break"></div>${examHtml}` : examHtml;

      if (typeof HISTORY !== 'undefined' && HISTORY.saveState) HISTORY.saveState();
      if (typeof setDocumentHTMLAndPaginate === 'function') await setDocumentHTMLAndPaginate(finalHtml, false);

      if (typeof ProgressUI !== 'undefined') {
        if (ProgressUI.finish) ProgressUI.finish();
        setTimeout(() => { if (ProgressUI.hide) ProgressUI.hide(); }, 400);
      }
      return {
        ok: true, questionCount: count, requestedCount: target, questionPages: built.questionPages,
        requestedPages: spec.pages || null, fontPt: built.fontPt, omr: !!spec.omr, minutes: hd.minutes, fullMarks: hd.fullMarks, lang: spec.lang
      };
    } catch (e) {
      console.error('[Exam Library] generation failed:', e);
      if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide();
      return { ok: false, message: (e && e.message) ? String(e.message) : 'Unknown error.' };
    }
  }

  // চ্যাটে দেখানোর সারাংশ বার্তা
  function formatExamSummary(r) {
    if (!r || !r.ok) return '';
    if (r.lang === 'bn') {
      let s = `✅ পরীক্ষার প্রশ্নপত্র তৈরি হয়েছে — ${fmtNum(r.questionCount, 'bn')}টি প্রশ্ন, সময় ${fmtNum(r.minutes, 'bn')} মিনিট, পূর্ণমান ${fmtNum(r.fullMarks, 'bn')}${r.omr ? ', কমপ্যাক্ট OMR সহ' : ''}।`;
      if (r.questionCount < r.requestedCount) s += ` (চাওয়া হয়েছিল ${fmtNum(r.requestedCount, 'bn')}টি; ${fmtNum(r.questionCount, 'bn')}টি বৈধ প্রশ্ন পাওয়া গেছে — আরও চাইলে বলুন।)`;
      if (r.requestedPages && r.questionPages > r.requestedPages) s += ` প্রশ্নসংখ্যা অনুযায়ী ${fmtNum(r.questionPages, 'bn')} পেজ লেগেছে।`;
      return s;
    }
    let s = `✅ Exam paper created — ${r.questionCount} questions, ${r.minutes} minutes, ${r.fullMarks} marks${r.omr ? ', with compact OMR' : ''}.`;
    if (r.questionCount < r.requestedCount) s += ` (${r.requestedCount} were requested; ${r.questionCount} valid questions were produced — ask for more if needed.)`;
    if (r.requestedPages && r.questionPages > r.requestedPages) s += ` The question count needed ${r.questionPages} pages.`;
    return s;
  }

  // ডকুমেন্ট-এডিটরের পেজিনেশন যেন এক্সাম-পেজ ব্লক না ভাঙে
  try {
    if (typeof UNSPLITTABLE_BLOCK_CLASSES !== 'undefined' && Array.isArray(UNSPLITTABLE_BLOCK_CLASSES)) {
      ['block-exam-page', 'block-exam-cols'].forEach(c => { if (!UNSPLITTABLE_BLOCK_CLASSES.includes(c)) UNSPLITTABLE_BLOCK_CLASSES.push(c); });
    }
  } catch (_) { /* এডিটর লোড না থাকলে সমস্যা নেই */ }

  // ======================================================================
  // ৯. গ্লোবাল এক্সপোর্ট
  // ======================================================================
  root.EXAM_LIBRARY = EXAM_LIBRARY;
  root.isExamRequest = isExamRequest;
  root.generateExamPaper = generateExamPaper;
  root.formatExamSummary = formatExamSummary;
  root.getExamCatalogForPrompt = getExamCatalogForPrompt;
  root.parseExamRequest = parseExamRequest;
  root.__examLibraryInternals = { nextClarification, splitClarification, normalizeQuestions, packColumns, balanceSplit, omrHtml, questionHtml, headerHtml, countOptions, fmtNum, parseDifficulty, parseYesNo };
})();
