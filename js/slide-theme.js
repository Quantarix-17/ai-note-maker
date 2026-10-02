// ========================================================================
// SLIDE THEME SYSTEM — one source of truth for a deck's look & feel
// ========================================================================
// CONTENT and DESIGN are separate:
//   deck.slides[]  -> words, layouts, data      (never touched by this file)
//   deck.theme     -> { id, overrides }         (colors, fonts, radius, backgrounds)
//
// The same resolved theme feeds all three renderers, so they cannot drift:
//   - live preview / present mode -> CSS variables (--ss-*) on each canvas
//   - PDF export                  -> the same CSS variables on :root
//   - PPTX export                 -> slideThemePptx() (hex colors + font faces)
//
// A deck with NO deck.theme (every deck saved before this file existed) and
// a deck on the untouched "classic" theme render exactly as they did before.
//
// Background precedence (highest first): slide.customBg / slide.bg (manual
// picks) -> deck.backgrounds[bgIndex] (Auto BG: varied/single) -> THEME
// background (hero for title/section/quote slides, content otherwise).
// ========================================================================

// ------------------------------------------------------------------------
// FONT REGISTRY — the only fonts a theme (or the AI) may refer to, by id.
//   css     quoted family names for the browser / PDF
//   pptx    face name written into the .pptx (PowerPoint cannot embed web
//           fonts, so Latin faces map to a safe system analog; Bengali
//           faces use the real name and fall back via the viewer's OS)
//   google  Google Fonts css2 "family=" value, loaded on demand
// ------------------------------------------------------------------------
const SLIDE_FONT_REGISTRY = {
  // ----- Latin -----
  'arial':         { label: 'Arial',            script: 'latin',   css: "Arial",                                   generic: 'sans-serif', pptx: 'Arial' },
  'inter':         { label: 'Inter',            script: 'latin',   css: "'Inter','Segoe UI'",                      generic: 'sans-serif', pptx: 'Arial',   google: 'Inter:wght@400;500;600;700;800' },
  'poppins':       { label: 'Poppins',          script: 'latin',   css: "'Poppins','Segoe UI'",                    generic: 'sans-serif', pptx: 'Arial',   google: 'Poppins:wght@400;500;600;700;800' },
  'space-grotesk': { label: 'Space Grotesk',    script: 'latin',   css: "'Space Grotesk','Segoe UI'",              generic: 'sans-serif', pptx: 'Arial',   google: 'Space+Grotesk:wght@400;500;600;700' },
  'playfair':      { label: 'Playfair Display', script: 'latin',   css: "'Playfair Display','Georgia'",            generic: 'serif',      pptx: 'Georgia', google: 'Playfair+Display:wght@500;700;800' },
  'lora':          { label: 'Lora',             script: 'latin',   css: "'Lora','Georgia'",                        generic: 'serif',      pptx: 'Georgia', google: 'Lora:wght@400;500;600;700' },
  // ----- Bengali -----
  'nirmala':       { label: 'Nirmala UI',       script: 'bengali', css: "'Nirmala UI','Noto Sans Bengali'",        generic: 'sans-serif', pptx: 'Nirmala UI' },
  'noto-sans-bn':  { label: 'Noto Sans Bengali',script: 'bengali', css: "'Noto Sans Bengali','Nirmala UI'",        generic: 'sans-serif', pptx: 'Noto Sans Bengali', google: 'Noto+Sans+Bengali:wght@400;500;600;700;800' },
  'noto-serif-bn': { label: 'Noto Serif Bengali',script:'bengali', css: "'Noto Serif Bengali','Nirmala UI'",       generic: 'serif',      pptx: 'Noto Serif Bengali', google: 'Noto+Serif+Bengali:wght@400;500;600;700;800' },
  'hind-siliguri': { label: 'Hind Siliguri',    script: 'bengali', css: "'Hind Siliguri','Nirmala UI'",            generic: 'sans-serif', pptx: 'Hind Siliguri', google: 'Hind+Siliguri:wght@400;500;600;700' },
  'tiro-bangla':   { label: 'Tiro Bangla',      script: 'bengali', css: "'Tiro Bangla','Nirmala UI'",              generic: 'serif',      pptx: 'Tiro Bangla', google: 'Tiro+Bangla' },
  'anek-bangla':   { label: 'Anek Bangla',      script: 'bengali', css: "'Anek Bangla','Nirmala UI'",              generic: 'sans-serif', pptx: 'Anek Bangla', google: 'Anek+Bangla:wght@400;500;600;700;800' },
  'baloo-da-2':    { label: 'Baloo Da 2',       script: 'bengali', css: "'Baloo Da 2','Nirmala UI'",               generic: 'sans-serif', pptx: 'Baloo Da 2', google: 'Baloo+Da+2:wght@400;500;600;700;800' },
  // Kalpurush is not on Google Fonts. It is used when installed on the device
  // (local()) or when a file URL is supplied via window.SLIDE_FONT_URLS.kalpurush.
  // The `google` entry below loads its fallback (Noto Serif Bengali) so the
  // look degrades gracefully instead of dropping to a system font.
  'kalpurush':     { label: 'কালপুরুষ (Kalpurush)', script: 'bengali', css: "'Kalpurush','Noto Serif Bengali','Nirmala UI'", generic: 'serif', pptx: 'Kalpurush', google: 'Noto+Serif+Bengali:wght@400;600;700', localNames: ['Kalpurush', 'Kalpurush ANSI'] }
};

// ------------------------------------------------------------------------
// THEME REGISTRY
// palette.cardBg may be #hex or rgba(); every other palette entry is #RRGGBB.
// backgrounds.* use the same {label,css,pptx,dark} shape as SLIDE_BACKGROUNDS.
// ------------------------------------------------------------------------
const SLIDE_THEMES = {
  'classic': {
    id: 'classic', label: 'Classic', blurb: 'Clean white, blue accent',
    palette: { accent: '#4f7df3', accent2: '#7aa2ff', text: '#1f2937', title: '#111827', muted: '#64748b', cardBg: 'rgba(100,116,139,0.12)' },
    fonts: { latinHeading: 'arial', latinBody: 'arial', bengaliHeading: 'nirmala', bengaliBody: 'nirmala' },
    radius: 0.5,
    backgrounds: { content: null, hero: null },
    chart: ['22C55E', 'F59E0B', 'EF4444', 'A855F7', '06B6D4', 'EC4899', '84CC16']
  },
  'aurora': {
    id: 'aurora', label: 'Aurora', blurb: 'Modern violet, soft glow',
    palette: { accent: '#6d5dfc', accent2: '#a78bfa', text: '#2a2650', title: '#1e1b4b', muted: '#6b6a8f', cardBg: 'rgba(109,93,252,0.08)' },
    fonts: { latinHeading: 'inter', latinBody: 'inter', bengaliHeading: 'hind-siliguri', bengaliBody: 'hind-siliguri' },
    radius: 0.8,
    backgrounds: {
      content: { label: 'Aurora Mist', css: 'radial-gradient(circle at 92% 6%, rgba(109,93,252,0.16) 0%, transparent 42%), linear-gradient(135deg,#faf9ff 0%,#eef0ff 100%)', pptx: 'F4F3FF', dark: false },
      hero: { label: 'Aurora Night', css: 'linear-gradient(135deg,#3b2a8c 0%,#6d5dfc 60%,#a78bfa 100%)', pptx: '4B3BB0', dark: true }
    },
    chart: ['F59E0B', '22C55E', 'EC4899', '06B6D4', 'EF4444', 'A855F7', '84CC16']
  },
  'midnight': {
    id: 'midnight', label: 'Midnight', blurb: 'Dark, cyan highlights',
    palette: { accent: '#38bdf8', accent2: '#818cf8', text: '#e2e8f0', title: '#f8fafc', muted: '#94a3b8', cardBg: 'rgba(148,163,184,0.12)' },
    fonts: { latinHeading: 'space-grotesk', latinBody: 'inter', bengaliHeading: 'hind-siliguri', bengaliBody: 'hind-siliguri' },
    radius: 0.7,
    backgrounds: {
      content: { label: 'Midnight', css: 'radial-gradient(circle at 12% 0%, rgba(56,189,248,0.16) 0%, transparent 40%), linear-gradient(135deg,#0b1220 0%,#111a2e 100%)', pptx: '0B1220', dark: true },
      hero: { label: 'Midnight Hero', css: 'linear-gradient(135deg,#050816 0%,#1e1b4b 100%)', pptx: '0A0A24', dark: true }
    },
    chart: ['F59E0B', '22C55E', 'EC4899', 'A855F7', 'EF4444', '818CF8', '84CC16']
  },
  'editorial': {
    id: 'editorial', label: 'Editorial', blurb: 'Warm paper, serif headlines',
    palette: { accent: '#b4452b', accent2: '#e07a5f', text: '#2b2623', title: '#1a1613', muted: '#7a6f66', cardBg: 'rgba(180,69,43,0.07)' },
    fonts: { latinHeading: 'playfair', latinBody: 'lora', bengaliHeading: 'noto-serif-bn', bengaliBody: 'noto-serif-bn' },
    radius: 0.15,
    backgrounds: {
      content: { label: 'Paper', css: '#fbf7f0', pptx: 'FBF7F0', dark: false },
      hero: { label: 'Ink', css: 'linear-gradient(135deg,#1f1a17 0%,#3a2e27 100%)', pptx: '1F1A17', dark: true }
    },
    chart: ['0F766E', 'F59E0B', '4F7DF3', 'A855F7', '84CC16', 'EC4899', '06B6D4']
  },
  'textbook': {
    id: 'textbook', label: 'Textbook', blurb: 'Calm teal, notebook paper',
    palette: { accent: '#0f766e', accent2: '#5eead4', text: '#1f2937', title: '#0f172a', muted: '#5b6b73', cardBg: 'rgba(15,118,110,0.08)' },
    fonts: { latinHeading: 'lora', latinBody: 'lora', bengaliHeading: 'kalpurush', bengaliBody: 'kalpurush' },
    radius: 0.35,
    backgrounds: {
      content: { label: 'Notebook', css: 'linear-gradient(180deg,#fffdf5 0%,#f6f3e8 100%)', pptx: 'FAF8EE', dark: false },
      hero: { label: 'Deep Teal', css: 'linear-gradient(135deg,#0f4c4a 0%,#0f766e 100%)', pptx: '0F5D59', dark: true }
    },
    chart: ['F59E0B', '4F7DF3', 'EF4444', 'A855F7', '84CC16', 'EC4899', '06B6D4']
  },
  'sunset': {
    id: 'sunset', label: 'Sunset', blurb: 'Bold orange, pitch energy',
    palette: { accent: '#f97316', accent2: '#fb923c', text: '#3b2314', title: '#2a1810', muted: '#8a6a55', cardBg: 'rgba(249,115,22,0.09)' },
    fonts: { latinHeading: 'poppins', latinBody: 'poppins', bengaliHeading: 'anek-bangla', bengaliBody: 'anek-bangla' },
    radius: 1.0,
    backgrounds: {
      content: { label: 'Peach', css: 'linear-gradient(135deg,#fff7ed 0%,#ffedd5 100%)', pptx: 'FFF3E3', dark: false },
      hero: { label: 'Sunset', css: 'linear-gradient(135deg,#7c2d12 0%,#ea580c 55%,#f59e0b 100%)', pptx: 'C2410C', dark: true }
    },
    chart: ['4F7DF3', '22C55E', 'EF4444', 'A855F7', '06B6D4', 'EC4899', '84CC16']
  },
  'slate': {
    id: 'slate', label: 'Slate', blurb: 'Neutral, report-ready',
    palette: { accent: '#334155', accent2: '#64748b', text: '#1e293b', title: '#0f172a', muted: '#64748b', cardBg: 'rgba(51,65,85,0.07)' },
    fonts: { latinHeading: 'inter', latinBody: 'inter', bengaliHeading: 'noto-sans-bn', bengaliBody: 'noto-sans-bn' },
    radius: 0.3,
    backgrounds: {
      content: { label: 'Slate Light', css: 'linear-gradient(135deg,#f8fafc 0%,#e2e8f0 100%)', pptx: 'EEF2F6', dark: false },
      hero: { label: 'Slate Dark', css: 'linear-gradient(135deg,#0f172a 0%,#334155 100%)', pptx: '1E293B', dark: true }
    },
    chart: ['4F7DF3', '22C55E', 'F59E0B', 'EF4444', 'A855F7', '06B6D4', 'EC4899']
  }
};

// Content-category (see SLIDE_CONTENT_CATEGORIES) -> theme the AI should lean on.
const SLIDE_CATEGORY_DEFAULT_THEME = { academic: 'textbook', business: 'aurora', office: 'slate', general: 'aurora' };

// ------------------------------------------------------------------------
// RESOLUTION
// ------------------------------------------------------------------------
function _stIsObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

function _stMerge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  Object.keys(patch || {}).forEach(k => {
    const pv = patch[k];
    out[k] = (_stIsObj(pv) && _stIsObj(out[k])) ? _stMerge(out[k], pv) : pv;
  });
  return out;
}

function _stDeck(deck) {
  return deck || (typeof APP_STATE !== 'undefined' ? APP_STATE.slideDeck : null);
}

function resolveSlideTheme(deck) {
  const d = _stDeck(deck);
  const ref = d && d.theme;
  const base = (ref && SLIDE_THEMES[ref.id]) || SLIDE_THEMES.classic;
  return (ref && _stIsObj(ref.overrides) && Object.keys(ref.overrides).length) ? _stMerge(base, ref.overrides) : base;
}

// "Themed" = anything other than the untouched classic look. Classic decks
// emit no theme CSS at all, so they are pixel-identical to before.
function isSlideDeckThemed(deck) {
  const d = _stDeck(deck);
  const ref = d && d.theme;
  if (!ref) return false;
  return (ref.id && ref.id !== 'classic') || (_stIsObj(ref.overrides) && Object.keys(ref.overrides).length > 0);
}

function slideThemeFontStack(theme, role) {
  const f = theme.fonts || {};
  const R = SLIDE_FONT_REGISTRY;
  const lat = R[role === 'heading' ? f.latinHeading : f.latinBody] || R.arial;
  const bn = R[role === 'heading' ? f.bengaliHeading : f.bengaliBody] || R.nirmala;
  // Latin first, Bengali second: the browser falls back PER GLYPH, so mixed
  // Bengali/English text picks the right font for each character.
  return `${lat.css}, ${bn.css}, ${lat.generic}`;
}

// force=true always emits every variable (PDF :root); otherwise classic -> ''.
function slideThemeCssVars(theme, force) {
  theme = theme || resolveSlideTheme();
  const p = theme.palette;
  return [
    `--ss-accent:${p.accent}`, `--ss-accent2:${p.accent2}`, `--ss-text:${p.text}`, `--ss-title:${p.title}`,
    `--ss-muted:${p.muted}`, `--ss-card-bg:${p.cardBg}`,
    `--ss-radius:${theme.radius}em`, `--ss-radius-in:${(theme.radius * 0.16).toFixed(3)}in`,
    `--ss-font-body:${slideThemeFontStack(theme, 'body')}`, `--ss-font-heading:${slideThemeFontStack(theme, 'heading')}`
  ].join(';') + ';';
}

function slideThemeCanvasStyle(deck) {
  if (!isSlideDeckThemed(deck)) return '';
  return slideThemeCssVars(resolveSlideTheme(deck)) + 'font-family:var(--ss-font-body);';
}

function slideThemeBackgroundFor(slide, deck) {
  if (!isSlideDeckThemed(deck)) return null;
  const bgs = resolveSlideTheme(deck).backgrounds || {};
  const hero = slide && (slide.layout === 'title' || slide.layout === 'section' || slide.layout === 'quote' ||
    (typeof _isTitleOnlySlide === 'function' && _isTitleOnlySlide(slide)));
  return (hero ? (bgs.hero || bgs.content) : bgs.content) || null;
}

// ----- PPTX view of the theme -----
function slideThemePptx(deck) {
  const t = resolveSlideTheme(deck);
  const hex = c => String(c || '').replace('#', '').toUpperCase().slice(0, 6);
  const R = SLIDE_FONT_REGISTRY, f = t.fonts || {};
  const face = (id, fb) => (R[id] || R[fb]).pptx;
  return {
    accent: hex(t.palette.accent), accent2: hex(t.palette.accent2), text: hex(t.palette.text),
    title: hex(t.palette.title), muted: hex(t.palette.muted),
    chart: [hex(t.palette.accent)].concat((t.chart || []).map(hex)),
    fonts: {
      latinHeading: face(f.latinHeading, 'arial'), latinBody: face(f.latinBody, 'arial'),
      bengaliHeading: face(f.bengaliHeading, 'nirmala'), bengaliBody: face(f.bengaliBody, 'nirmala')
    }
  };
}

function slideThemePptxFont(text, role) {
  const fonts = slideThemePptx().fonts;
  const bn = typeof text === 'string' && /[\u0980-\u09FF]/.test(text);
  if (role === 'heading') return bn ? fonts.bengaliHeading : fonts.latinHeading;
  return bn ? fonts.bengaliBody : fonts.latinBody;
}

// ------------------------------------------------------------------------
// ASSETS: Google Fonts <link>, local() Kalpurush, panel/preview CSS
// ------------------------------------------------------------------------
function slideThemeFontsHref(theme) {
  const f = theme.fonts || {}, R = SLIDE_FONT_REGISTRY;
  const fams = [];
  ['latinHeading', 'latinBody', 'bengaliHeading', 'bengaliBody'].forEach(k => {
    const g = R[f[k]] && R[f[k]].google;
    if (g && fams.indexOf(g) === -1) fams.push(g);
  });
  return fams.length ? `https://fonts.googleapis.com/css2?${fams.map(g => 'family=' + g).join('&')}&display=swap` : '';
}

function slideThemeFontFaceCss(theme) {
  const f = theme.fonts || {}, urls = (typeof window !== 'undefined' && window.SLIDE_FONT_URLS) || {};
  const out = [], seen = {};
  Object.keys(f).forEach(k => {
    const id = f[k], r = SLIDE_FONT_REGISTRY[id];
    if (!r || !r.localNames || seen[id]) return;
    seen[id] = true;
    const src = r.localNames.map(n => `local('${n}')`).concat(urls[id] ? [`url('${String(urls[id]).replace(/'/g, '')}')`] : []).join(',');
    out.push(`@font-face{font-family:'Kalpurush';src:${src};font-display:swap;}`);
  });
  return out.join('');
}

function ensureSlideThemeAssets(deck) {
  if (typeof document === 'undefined' || !document.head) return;
  if (!document.getElementById('slide-theme-base-styles')) {
    const st = document.createElement('style');
    st.id = 'slide-theme-base-styles';
    st.textContent = `
      .slide-canvas-16x9.ss-themed .slide-canvas-title,.slide-canvas-16x9.ss-themed .ss-card-h,.slide-canvas-16x9.ss-themed .ss-stat-v{font-family:var(--ss-font-heading);}
      .slide-canvas-16x9.ss-themed .slide-canvas-title{color:var(--ss-title);}
      .slide-canvas-16x9.ss-themed .slide-canvas-bullets{color:var(--ss-text);}
      .slide-canvas-16x9.ss-themed.slide-canvas-dark-text .slide-canvas-title{color:#ffffff;}
      .slide-canvas-16x9.ss-themed.slide-canvas-dark-text .slide-canvas-bullets{color:#f1f5f9;}
      .sth-sec{margin:0.2em 0 0.5em;font-size:0.8em;font-weight:700;opacity:0.7;letter-spacing:0.03em;text-transform:uppercase;}
      .sth-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px;}
      .sth-card{border:2px solid transparent;border-radius:10px;padding:0;cursor:pointer;background:transparent;text-align:left;overflow:hidden;box-shadow:0 1px 4px rgba(15,23,42,0.18);}
      .sth-card.active{border-color:#4f7df3;}
      .sth-card-prev{height:54px;padding:8px 10px;display:flex;flex-direction:column;justify-content:space-between;}
      .sth-card-bar{width:26px;height:4px;border-radius:2px;}
      .sth-card-aa{font-size:15px;font-weight:700;line-height:1;}
      .sth-card-name{font-size:11px;font-weight:600;padding:5px 8px;background:rgba(255,255,255,0.92);color:#1f2937;}
      .sth-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0;}
      .sth-row select,.sth-row input[type=text]{padding:5px 8px;border-radius:8px;border:1px solid rgba(100,116,139,0.45);font-size:12px;background:#fff;color:#1f2937;min-width:0;}
      .sth-row input[type=text]{flex:1 1 220px;}
      .sth-btn{padding:5px 10px;border-radius:8px;border:1px solid rgba(100,116,139,0.45);background:#fff;color:#1f2937;font-size:12px;font-weight:600;cursor:pointer;}
      .sth-btn.active{background:#4f7df3;border-color:#4f7df3;color:#fff;}
      .sth-btn:disabled{opacity:0.5;cursor:wait;}
      .sth-note{font-size:11px;opacity:0.7;margin:4px 0 0;}`;
    document.head.appendChild(st);
  }
  const theme = resolveSlideTheme(deck);
  let ff = document.getElementById('slide-theme-fontface');
  if (!ff) { ff = document.createElement('style'); ff.id = 'slide-theme-fontface'; document.head.appendChild(ff); }
  // Kalpurush's @font-face is always registered so it works the moment it is picked.
  ff.textContent = slideThemeFontFaceCss({ fonts: { a: 'kalpurush' } });
  const href = slideThemeFontsHref(theme);
  let link = document.getElementById('slide-theme-fonts-link');
  if (href) {
    if (!link) { link = document.createElement('link'); link.id = 'slide-theme-fonts-link'; link.rel = 'stylesheet'; document.head.appendChild(link); }
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  } else if (link) { link.removeAttribute('href'); }
}

// ------------------------------------------------------------------------
// SANITIZE (AI patches and AI-chosen deck theme ids are untrusted input)
// ------------------------------------------------------------------------
const _ST_HEX = /^#[0-9a-fA-F]{6}$/;
const _ST_RGBA = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/;

function sanitizeDeckThemeRef(raw) {
  const id = typeof raw === 'string' ? raw.trim().toLowerCase() : (raw && typeof raw.id === 'string' ? raw.id.trim().toLowerCase() : '');
  return SLIDE_THEMES[id] ? { id, overrides: {} } : null;
}

function sanitizeSlideThemePatch(raw) {
  if (!_stIsObj(raw)) return null;
  const out = {};
  if (typeof raw.base === 'string' && SLIDE_THEMES[raw.base.trim().toLowerCase()]) out.base = raw.base.trim().toLowerCase();
  if (raw.mode === 'dark' || raw.mode === 'light') out.mode = raw.mode;

  if (_stIsObj(raw.palette)) {
    const pal = {};
    ['accent', 'accent2', 'text', 'title', 'muted'].forEach(k => {
      const v = typeof raw.palette[k] === 'string' ? raw.palette[k].trim() : '';
      if (_ST_HEX.test(v)) pal[k] = v.toLowerCase();
    });
    const cb = typeof raw.palette.cardBg === 'string' ? raw.palette.cardBg.trim() : '';
    if (_ST_HEX.test(cb) || _ST_RGBA.test(cb)) pal.cardBg = cb;
    if (Object.keys(pal).length) out.palette = pal;
  }

  if (_stIsObj(raw.fonts)) {
    const fonts = {}, R = SLIDE_FONT_REGISTRY;
    const put = (key, id, script) => { if (typeof id === 'string' && R[id.trim()] && R[id.trim()].script === script) fonts[key] = id.trim(); };
    put('latinHeading', raw.fonts.latin, 'latin'); put('latinBody', raw.fonts.latin, 'latin');
    put('bengaliHeading', raw.fonts.bengali, 'bengali'); put('bengaliBody', raw.fonts.bengali, 'bengali');
    put('latinHeading', raw.fonts.latinHeading, 'latin'); put('latinBody', raw.fonts.latinBody, 'latin');
    put('bengaliHeading', raw.fonts.bengaliHeading, 'bengali'); put('bengaliBody', raw.fonts.bengaliBody, 'bengali');
    if (Object.keys(fonts).length) out.fonts = fonts;
  }

  const r = Number(raw.radius);
  if (raw.radius !== undefined && raw.radius !== null && isFinite(r)) out.radius = Math.max(0, Math.min(1.2, r));

  if (_stIsObj(raw.backgrounds) && typeof _sanitizeCustomBackgroundJSON === 'function') {
    const bgs = {};
    ['content', 'hero'].forEach(k => {
      if (raw.backgrounds[k] === null) bgs[k] = null;
      else { const b = _sanitizeCustomBackgroundJSON(raw.backgrounds[k]); if (b) bgs[k] = b; }
    });
    if (Object.keys(bgs).length) out.backgrounds = bgs;
  }
  return Object.keys(out).length ? out : null;
}

function _stModeBackgrounds(mode, accent) {
  const a = _ST_HEX.test(accent) ? accent : '#4f7df3';
  const glow = 'rgba(' + [1, 3, 5].map(i => parseInt(a.substr(i, 2), 16)).join(',') + ',0.16)';
  return mode === 'dark'
    ? { content: { label: 'Deep Dark', css: `radial-gradient(circle at 12% 0%, ${glow} 0%, transparent 42%), linear-gradient(135deg,#0b1220 0%,#111a2e 100%)`, pptx: '0B1220', dark: true },
        hero: { label: 'Deep Dark Hero', css: 'linear-gradient(135deg,#050816 0%,#14122e 100%)', pptx: '0A0A1E', dark: true } }
    : { content: { label: 'Light', css: 'linear-gradient(135deg,#ffffff 0%,#f1f5f9 100%)', pptx: 'F8FAFC', dark: false }, hero: null };
}

// ------------------------------------------------------------------------
// APPLY (touches deck.theme + background selections ONLY — never content)
// ------------------------------------------------------------------------
let _slideThemeUndoSnapshot = null;

function _stSnapshot(deck) {
  _slideThemeUndoSnapshot = JSON.stringify({
    theme: deck.theme || null, backgrounds: deck.backgrounds || null,
    per: deck.slides.map(s => ({ bg: s.bg || null, customBg: s.customBg || null, bgIndex: s.bgIndex == null ? null : s.bgIndex }))
  });
}

function undoSlideThemeChange() {
  const deck = typeof APP_STATE !== 'undefined' ? APP_STATE.slideDeck : null;
  if (!deck || !_slideThemeUndoSnapshot) return;
  try {
    const snap = JSON.parse(_slideThemeUndoSnapshot);
    deck.theme = snap.theme; deck.backgrounds = snap.backgrounds;
    deck.slides.forEach((s, i) => { const p = snap.per[i]; if (p) { s.bg = p.bg; s.customBg = p.customBg; s.bgIndex = p.bgIndex; } });
    _slideThemeUndoSnapshot = null;
    _stCommit(deck, 'Theme change undone.');
  } catch (e) { console.warn('[SlideTheme] undo failed:', e); }
}

function _stCommit(deck, toast) {
  if (typeof persistSlideDeckToActiveTab === 'function') persistSlideDeckToActiveTab(deck);
  if (typeof renderSlideDeckPreview === 'function') renderSlideDeckPreview(deck);
  if (toast && typeof displayToastNotification === 'function') displayToastNotification(toast);
}

function applySlideThemePatch(patch, opts) {
  const deck = typeof APP_STATE !== 'undefined' ? APP_STATE.slideDeck : null;
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length || !patch) return false;
  const o = opts || {};
  _stSnapshot(deck);

  let ref = deck.theme ? { id: deck.theme.id, overrides: JSON.parse(JSON.stringify(deck.theme.overrides || {})) } : { id: 'classic', overrides: {} };
  if (patch.base) ref = { id: patch.base, overrides: {} };   // a new base theme starts clean
  const ov = ref.overrides;
  if (patch.palette) ov.palette = Object.assign({}, ov.palette, patch.palette);
  if (patch.fonts) ov.fonts = Object.assign({}, ov.fonts, patch.fonts);
  if (patch.radius !== undefined) ov.radius = patch.radius;
  if (patch.mode) {
    const accent = (ov.palette && ov.palette.accent) || (SLIDE_THEMES[ref.id] || SLIDE_THEMES.classic).palette.accent;
    ov.backgrounds = Object.assign({}, ov.backgrounds, _stModeBackgrounds(patch.mode, accent));
  }
  if (patch.backgrounds) ov.backgrounds = Object.assign({}, ov.backgrounds, patch.backgrounds);
  deck.theme = ref;

  const touchesBg = !!(patch.base || patch.mode || patch.backgrounds);
  if (touchesBg && o.resetBackgrounds !== false) {
    deck.backgrounds = null;
    deck.slides.forEach(s => { s.bg = null; s.customBg = null; s.bgIndex = null; });
  }
  _stCommit(deck, o.toast || 'Theme updated — slide content unchanged.');
  return true;
}

function setSlideTheme(id) {
  if (!SLIDE_THEMES[id]) return;
  applySlideThemePatch({ base: id }, { toast: `Theme: ${SLIDE_THEMES[id].label} — content unchanged. Slide backgrounds were reset to the theme (use Undo to revert).` });
}
function setSlideThemeMode(mode) { applySlideThemePatch({ mode }); }
function setSlideThemeFont(kind, id) {
  const fonts = kind === 'bengali' ? { bengaliHeading: id, bengaliBody: id } : { latinHeading: id, latinBody: id };
  const p = sanitizeSlideThemePatch({ fonts });
  if (p) applySlideThemePatch(p, { toast: 'Font changed. PowerPoint needs the same font installed to show it.' });
}

// ------------------------------------------------------------------------
// AI: "make it darker", "keep Bengali font Kalpurush" -> a small JSON patch
// ------------------------------------------------------------------------
function buildSlideThemeSystemPrompt(deck) {
  const themes = Object.keys(SLIDE_THEMES).map(id => `${id} (${SLIDE_THEMES[id].label}: ${SLIDE_THEMES[id].blurb})`).join('; ');
  const fonts = lang => Object.keys(SLIDE_FONT_REGISTRY).filter(id => SLIDE_FONT_REGISTRY[id].script === lang).map(id => `${id}=${SLIDE_FONT_REGISTRY[id].label}`).join(', ');
  const cur = resolveSlideTheme(deck);
  return (
    `You are the THEME DESIGNER for AI PDF Studio's slide decks. The user describes, in ANY language (often Bengali or English), how they want the deck's LOOK to change.\n` +
    `You change ONLY the visual theme. You NEVER change, rewrite, add or remove slide text, layouts, or data.\n` +
    `Return ONLY one JSON object containing JUST the keys that must change (omit everything else): {"base":"<theme id>","mode":"dark"|"light","palette":{"accent":"#RRGGBB","accent2":"#RRGGBB","text":"#RRGGBB","title":"#RRGGBB","muted":"#RRGGBB","cardBg":"#RRGGBB or rgba(r,g,b,a)"},"fonts":{"latin":"<font id>","bengali":"<font id>","latinHeading":"..","latinBody":"..","bengaliHeading":"..","bengaliBody":".."},"radius":0.0-1.2,"backgrounds":{"content":{"label":"..","css":"valid CSS background","pptx":"RRGGBB","dark":true|false},"hero":{...}}}\n` +
    `THEMES (use "base" only when the user asks to switch to a different overall style): ${themes}.\n` +
    `LATIN FONT IDS: ${fonts('latin')}.\nBENGALI FONT IDS: ${fonts('bengali')}.\n` +
    `Use ONLY the font ids above; match fonts by the name the user says (e.g. "কালপুরুষ"/"Kalpurush" -> "kalpurush"). "fonts.bengali"/"fonts.latin" set heading and body together.\n` +
    `RULES: "darker"/"আরও গাঢ়" = use "mode":"dark" (and/or deepen the palette); "lighter"/"হালকা" = "mode":"light"; "rounder"/"sharper" = change "radius". Keep colors with enough contrast. "pptx" is a 6-digit hex approximating the css. "dark":true only if text on that background must be light. Keep everything the user did NOT mention unchanged.\n` +
    `CURRENT THEME: ${JSON.stringify({ id: (deck.theme && deck.theme.id) || 'classic', palette: cur.palette, fonts: cur.fonts, radius: cur.radius })}\n`
  );
}

async function applySlideThemeViaAI(promptText, fileContextString, modelsUsedSet) {
  const deck = typeof APP_STATE !== 'undefined' ? APP_STATE.slideDeck : null;
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) return { ok: false, message: 'No slide deck is available to style.' };
  // Start every request from the model the user currently has selected. The
  // lock is only for keeping one multi-call build on the same model; a stale
  // lock from an earlier turn made the app ignore model switches.
  if (typeof _generationLockedModelConfig !== 'undefined') _generationLockedModelConfig = null;
  const activeCfg = undefined;
  const userPrompt = `DECK TITLE: ${deck.title || ''}\n` + (fileContextString ? `CONTEXT:\n${fileContextString}\n\n` : '') +
    `REQUESTED THEME CHANGE:\n${promptText}\n\nReturn the JSON patch now.`;
  try {
    const result = await callAIAPI(
      [{ role: 'system', content: buildSlideThemeSystemPrompt(deck) }, { role: 'user', content: userPrompt }],
      { forceJson: true, modelsUsedSet, modelConfig: activeCfg, maxTokens: undefined }
    );
    if (result && result.modelConfig && typeof _generationLockedModelConfig !== 'undefined') _generationLockedModelConfig = result.modelConfig;
    let parsed = safeParseAIJson(result.content, null);
    if (!parsed) parsed = attemptRepairAndParse(result.content);
    const patch = sanitizeSlideThemePatch(parsed && parsed.patch ? parsed.patch : parsed);
    if (!patch) return { ok: false, message: 'The AI did not return a usable theme change. Try describing it differently.' };
    applySlideThemePatch(patch);
    return { ok: true, patch };
  } catch (e) {
    console.error('[SlideTheme] AI theme change failed:', e);
    return { ok: false, message: (e && e.message) ? String(e.message) : 'Unknown error.', noModelConfigured: !!(e && e.noModelConfigured) };
  }
}

// Same slot as the text field in the panel; also callable from the chat router.
async function submitSlideThemePrompt() {
  const input = document.getElementById('slide-theme-prompt-input');
  const btn = document.getElementById('slide-theme-prompt-btn');
  const text = input ? input.value.trim() : '';
  if (!text) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Working…'; }
  const res = await applySlideThemeViaAI(text, '', new Set());
  if (!res.ok && typeof displayToastNotification === 'function') displayToastNotification(res.message || 'Theme change failed.');
  if (btn) { btn.disabled = false; btn.textContent = 'Apply'; }
}

// ------------------------------------------------------------------------
// UI: toolbar button + panel (rendered by renderSlideDeckPreview)
// ------------------------------------------------------------------------
let _slideThemePickerOpen = false;

function toggleSlideThemePicker() {
  _slideThemePickerOpen = !_slideThemePickerOpen;
  const panel = document.getElementById('slide-theme-picker-panel');
  const btn = document.getElementById('slide-theme-toggle-btn');
  if (panel) { panel.classList.toggle('open', _slideThemePickerOpen); if (_slideThemePickerOpen) panel.innerHTML = renderSlideThemePanelHTML(); }
  if (btn) btn.setAttribute('aria-expanded', _slideThemePickerOpen ? 'true' : 'false');
}

function renderSlideThemePanelHTML(deck) {
  const d = _stDeck(deck);
  const cur = resolveSlideTheme(d);
  const curId = (d && d.theme && SLIDE_THEMES[d.theme.id]) ? d.theme.id : 'classic';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const cards = Object.keys(SLIDE_THEMES).map(id => {
    const t = SLIDE_THEMES[id], bg = (t.backgrounds.content && t.backgrounds.content.css) || '#ffffff';
    const dark = t.backgrounds.content && t.backgrounds.content.dark;
    return `<button type="button" class="sth-card${id === curId ? ' active' : ''}" onclick="setSlideTheme('${id}')" title="${esc(t.blurb)}">
      <div class="sth-card-prev" style="background:${bg};--f:${slideThemeFontStack(t, 'heading')};">
        <div class="sth-card-bar" style="background:${t.palette.accent};"></div>
        <div class="sth-card-aa" style="font-family:var(--f);color:${dark ? '#ffffff' : t.palette.title};">Aa অ</div>
      </div><div class="sth-card-name">${esc(t.label)}</div></button>`;
  }).join('');
  const opts = (script, sel) => Object.keys(SLIDE_FONT_REGISTRY).filter(id => SLIDE_FONT_REGISTRY[id].script === script)
    .map(id => `<option value="${id}"${id === sel ? ' selected' : ''}>${esc(SLIDE_FONT_REGISTRY[id].label)}</option>`).join('');
  const isDark = !!(cur.backgrounds.content && cur.backgrounds.content.dark);
  return `
    <div class="sth-sec">Theme — changes the look only, never your content</div>
    <div class="sth-grid">${cards}</div>
    <div class="sth-row">
      <button type="button" class="sth-btn${isDark ? '' : ' active'}" onclick="setSlideThemeMode('light')">☀ Light</button>
      <button type="button" class="sth-btn${isDark ? ' active' : ''}" onclick="setSlideThemeMode('dark')">🌙 Dark</button>
      <label>Bengali font <select onchange="setSlideThemeFont('bengali', this.value)">${opts('bengali', cur.fonts.bengaliBody)}</select></label>
      <label>English font <select onchange="setSlideThemeFont('latin', this.value)">${opts('latin', cur.fonts.latinBody)}</select></label>
      <button type="button" class="sth-btn" onclick="undoSlideThemeChange()">↶ Undo</button>
    </div>
    <div class="sth-row">
      <input type="text" id="slide-theme-prompt-input" placeholder="e.g. আরও গাঢ় করো, বাংলা ফন্ট কালপুরুষ রাখো" onkeydown="if(event.key==='Enter'){event.preventDefault();submitSlideThemePrompt();}">
      <button type="button" class="sth-btn" id="slide-theme-prompt-btn" onclick="submitSlideThemePrompt()">Apply</button>
    </div>
    <p class="sth-note">Preview, PDF and PowerPoint all read this one theme. PowerPoint shows a font only if it is installed on that computer.</p>`;
}

function slideThemeToolbarButtonHTML() {
  return `<button type="button" class="slide-edit-btn" id="slide-theme-toggle-btn" onclick="toggleSlideThemePicker()" title="Change the deck's theme: colors, fonts, backgrounds" aria-haspopup="true" aria-expanded="${_slideThemePickerOpen ? 'true' : 'false'}">🎭 Theme</button>`;
}

function slideThemePanelHTML(deck) {
  return `<div class="slide-bg-picker-panel${_slideThemePickerOpen ? ' open' : ''}" id="slide-theme-picker-panel">${renderSlideThemePanelHTML(deck)}</div>`;
}

// ------------------------------------------------------------------------
// AI DECK GENERATION HOOK — appended to the deck JSON schema/rules
// ------------------------------------------------------------------------
function getSlideThemeSchemaKeyForPrompt() { return `,"theme":"theme_id"`; }
function getSlideThemeRuleForPrompt() {
  const list = Object.keys(SLIDE_THEMES).map(id => `${id} (${SLIDE_THEMES[id].blurb})`).join('; ');
  const map = Object.keys(SLIDE_CATEGORY_DEFAULT_THEME).map(c => `${c} -> ${SLIDE_CATEGORY_DEFAULT_THEME[c]}`).join(', ');
  return `- "theme" (top-level, sibling of "slides"): ONE id from this fixed list that best fits the deck's CONTENT CATEGORY and topic: ${list}. Default per category: ${map}. The theme controls colors, fonts and corner style for the whole deck; do not describe colors or fonts anywhere else.\n`;
}

window.SLIDE_FONT_REGISTRY = SLIDE_FONT_REGISTRY;
window.SLIDE_THEMES = SLIDE_THEMES;
window.resolveSlideTheme = resolveSlideTheme;
window.setSlideTheme = setSlideTheme;
window.setSlideThemeMode = setSlideThemeMode;
window.setSlideThemeFont = setSlideThemeFont;
window.undoSlideThemeChange = undoSlideThemeChange;
window.toggleSlideThemePicker = toggleSlideThemePicker;
window.submitSlideThemePrompt = submitSlideThemePrompt;
window.applySlideThemeViaAI = applySlideThemeViaAI;
window.applySlideThemePatch = applySlideThemePatch;