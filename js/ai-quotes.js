// ai-quotes.js — প্রতিবার নতুন করে AI দিয়ে উক্তি তৈরি করে।
// কিছুই সেভ/ক্যাশ করা হয় না (localStorage, array, ইতিহাস — কিছুই নেই)।
// ব্যবহার: modal খোলার সময় AIQuote.mount(document.getElementById('your-quote-element'));
const AIQuote = (() => {
  const THEMES = [
    { id: 'life',  w: 4, brief: 'জীবন সম্পর্কে এমন একটি উক্তি যা পড়লে চোখ খুলে যায় — সময়, সাহস, ক্ষতি, নীরবতা, বেড়ে ওঠা বা বেঁচে থাকার অর্থ নিয়ে এক অপ্রত্যাশিত সত্য।' },
    { id: 'love',  w: 4, brief: 'ভালোবাসা নিয়ে গভীর, উষ্ণ ও কোমল একটি উক্তি — যত্ন, অপেক্ষা, কাছে থাকা বা মন ছুঁয়ে যাওয়ার অনুভূতি।' },
    { id: 'lit-philosophy', w: 2, brief: 'সাহিত্যিক ভাষায় জীবনদর্শনের একটি উক্তি — রূপক ও চিত্রকল্পে সাজানো, কবিতার মতো গভীর।' },
    { id: 'lit-romantic',   w: 2, brief: 'সাহিত্যিক ভাষায় রোমান্টিক একটি উক্তি — জোছনা, বৃষ্টি, নদী, পথ, আকাশের মতো চিত্রকল্পে ভরা ভালোবাসার কথা।' }
  ];
  const IMAGERY = ['আকাশ', 'নদী', 'বৃষ্টি', 'আলো', 'পথ', 'ঘুম', 'ঋতু', 'সন্ধ্যা', 'ঢেউ', 'বীজ', 'আয়না', 'হাওয়া', 'ঘড়ি', 'চিঠি', 'জানালা', 'পাখি', 'সমুদ্র', 'পাহাড়', 'প্রদীপ', 'শূন্যতা', 'ভোর', 'জোছনা'];
  const TONES = ['শান্ত', 'দৃঢ়', 'কোমল', 'গভীর', 'আশাবাদী', 'বিষণ্ণ-সুন্দর', 'প্রাণবন্ত'];
  // কোনো লিঙ্গ নির্দেশ করে এমন শব্দ ধরার জন্য (নিরাপত্তা-জাল)
  const GENDERED = /ছেলে|মেয়ে|পুরুষ|নারী|মহিলা|প্রেমিকা|প্রেমিক|স্বামী|স্ত্রী|বউ|বধূ|রমণী|কন্যা|পুত্র|ভাই|বোন|বাবা|মা(?![নঝ-হ])|বন্ধুটি|সে\s+(?:একজন\s+)?(?:পুরুষ|নারী)/;

  const rand = n => Math.floor(Math.random() * n);
  const pick = a => a[rand(a.length)];
  function pickTheme() {
    const total = THEMES.reduce((s, t) => s + t.w, 0);
    let r = Math.random() * total;
    for (const t of THEMES) { if ((r -= t.w) < 0) return t; }
    return THEMES[0];
  }
  function buildPrompt(theme) {
    const imgs = [pick(IMAGERY), pick(IMAGERY)].filter((v, i, a) => a.indexOf(v) === i);
    const nonce = Math.random().toString(36).slice(2, 10);
    const system =
      `তুমি একজন দক্ষ বাংলা সাহিত্যিক ও চিন্তক। প্রতিটি অনুরোধে সম্পূর্ণ মৌলিক ও নতুন একটি উক্তি লেখো।\n` +
      `নিয়ম:\n` +
      `- ভাষা: সুন্দর, স্বাভাবিক বাংলা। ১–২টি বাক্য, সর্বোচ্চ ৩০ শব্দ।\n` +
      `- লিঙ্গ-নিরপেক্ষ: কোনো লিঙ্গ নির্দেশ করবে না। ছেলে/মেয়ে/পুরুষ/নারী/প্রেমিক/প্রেমিকা/স্বামী/স্ত্রী/ভাই/বোন ইত্যাদি লিখবে না। "মানুষ", "মন", "হৃদয়", "আমরা", "তুমি", "কেউ" — এ ধরনের নিরপেক্ষ শব্দ ব্যবহার করো।\n` +
      `- জনপ্রিয় বা পরিচিত উক্তি, কোনো লেখকের লাইন বা প্রবাদ হুবহু দেবে না; কারও নামে চালাবে না।\n` +
      `- ক্লিশে (যেমন "জীবন একটি যাত্রা") এড়াও।\n` +
      `শুধু JSON ফেরত দাও: {"quote":"..."}`;
    const user =
      `ধরন: ${theme.brief}\nসুর: ${pick(TONES)}\nসম্ভব হলে এই চিত্রকল্প থেকে অনুপ্রেরণা নাও: ${imgs.join(', ')}\nঅনন্য সংকেত: ${nonce}`;
    return [{ role: 'system', content: system }, { role: 'user', content: user }];
  }
  function extract(raw) {
    const p = typeof safeParseAIJson === 'function' ? safeParseAIJson(raw, null) : null;
    let q = p && typeof p.quote === 'string' ? p.quote : (typeof raw === 'string' && !raw.trim().startsWith('{') ? raw : '');
    return String(q || '').replace(/^["“”«»\s]+|["“”«»\s]+$/g, '').trim();
  }
  // প্রতিবার নতুন AI কল। কিছু সেভ হয় না।
  async function generate() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const theme = pickTheme();
      const res = await callAIAPI(buildPrompt(theme), { forceJson: true, temperature: 1.0, maxTokens: undefined });
      const q = extract(res && res.content);
      if (q && q.length >= 12 && !GENDERED.test(q)) return { text: q, theme: theme.id };
    }
    return null;
  }

  // একই element-এ দ্রুত বারবার খুললে পুরোনো (দেরিতে আসা) উত্তর যেন নতুনটাকে ঢেকে না দেয়
  const _tokens = new WeakMap();
  async function mount(el, { loadingText = '✨ নতুন উক্তি তৈরি হচ্ছে…' } = {}) {
    if (!el) return;
    const token = Symbol('quote');
    _tokens.set(el, token);
    el.textContent = loadingText;          // পুরোনো উক্তি সঙ্গে সঙ্গে মুছে যায়
    el.dataset.quoteTheme = '';
    try {
      const q = await generate();
      if (_tokens.get(el) !== token || !el.isConnected) return;   // ততক্ষণে নতুন অনুরোধ হয়েছে
      if (q) { el.textContent = q.text; el.dataset.quoteTheme = q.theme; }
      else el.textContent = '';
    } catch (e) {
      if (_tokens.get(el) === token) el.textContent = '';
      console.warn('[AIQuote] failed:', e && e.message);
    }
  }
  return { generate, mount };
})();
if (typeof window !== 'undefined') window.AIQuote = AIQuote;
