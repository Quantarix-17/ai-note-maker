// ========================================================================
// SLIDE STUDIO — @Create Slides / PowerPoint export (MVP)
// ========================================================================
// Self-contained module for the "Create Slides" feature, following the
// same pattern as diagram-library.js / chart-library.js: a focused file
// that owns one feature end-to-end and fails soft everywhere so a bad AI
// response or a missing library never breaks the rest of the app.
//
// Pipeline:
//   1. generateSlideDeckDirectMode() asks the AI for a SLIDE-SHAPED JSON
//      response (title + bullets + optional visual per slide) — a
//      different content model from the continuous A4 HTML the PDF/Word
//      pipeline uses, because a slide deck is not a paginated document.
//   2. sanitizeSlideDeckJSON() caps/cleans whatever the AI returned so a
//      malformed response degrades gracefully instead of crashing.
//   3. Each slide's "visual" field may be a <!--CHART:...--> or
//      <!--DIAGRAM_TEMPLATE:id--> placeholder (resolved via the existing
//      chart-library.js / diagram-library.js) or a hand-drawn <svg>. All
//      three are resolved to real inline SVG by resolveSlideVisualSVG().
//   4. renderSlideDeckPreview() shows the deck in a lightweight
//      PowerPoint-style thumbnail-rail + main-canvas view.
//   5. exportSlideDeckToPptx() rasterizes each slide's SVG to a PNG (via
//      canvas — PowerPoint does not support inline SVG) and uses
//      PptxGenJS (loaded from CDN) to build and download a real .pptx.
//
// NOTE ON SCOPE (MVP): charts are rasterized to PNG rather than mapped to
// native editable PptxGenJS chart objects. That upgrade (chart-library.js
// data -> pptx.addChart()) is a natural follow-up but is left out here to
// keep this first version small and reliable.
// ========================================================================

const SLIDE_DECK_MAX_SLIDES = 20;
const SLIDE_DECK_MAX_BULLETS_PER_SLIDE = 7;
const SLIDE_DECK_MAX_BULLET_CHARS = 220;
const SLIDE_DECK_MAX_TITLE_CHARS = 120;

// ===== STATE =====
// Kept local to this module; APP_STATE.slideDeck (app.js) is the
// cross-module source of truth this mirrors/reads from.
let _slideDeckCurrentIndex = 0;
let _slideBackgroundPickerOpen = false;
// "Same on all slides" (true) vs "Different per slide" (false) scope for
// the next ✨ Custom Background AI command that gets pinned — read at the
// moment startCustomSlideBackgroundCommand() runs, not stored per-deck.
let _customBgScopeAll = false;

// ========================================================================
// SLIDE BACKGROUNDS — 20 FIXED, PRE-DESIGNED PRESETS
// ========================================================================
// Every slide is always GENERATED on a plain white background (the AI is
// never asked to pick one — see buildSlideDeckRules()). These 20 presets
// exist purely as an OPTIONAL, user-driven styling layer applied afterward
// from the "Background" section of the slide editor toolbar. `css` is a
// real CSS background value used for both the live canvas preview and the
// True-PDF export (both are real HTML/CSS, so they render the gradient
// exactly). `pptx` is a single representative hex color used as a
// best-effort solid-fill approximation for PowerPoint export, since
// PptxGenJS slide backgrounds do not support CSS gradients. `dark` flags
// presets dark enough that slide text should render in a light color.
const SLIDE_BACKGROUNDS = [
  { id: 'sunrise', label: 'Sunrise Blush', css: 'linear-gradient(135deg,#ffecd2 0%,#fcb69f 100%)', pptx: 'FCB69F', dark: false },
  { id: 'ocean-depth', label: 'Ocean Depth', css: 'linear-gradient(135deg,#2b5876 0%,#4e4376 100%)', pptx: '2B5876', dark: true },
  { id: 'aurora-mint', label: 'Aurora Mint', css: 'linear-gradient(135deg,#d4fc79 0%,#96e6a1 100%)', pptx: '96E6A1', dark: false },
  { id: 'midnight-navy', label: 'Midnight Navy', css: 'linear-gradient(135deg,#0f2027 0%,#203a43 55%,#2c5364 100%)', pptx: '0F2027', dark: true },
  { id: 'rose-gold', label: 'Rose Gold', css: 'linear-gradient(135deg,#f7cac9 0%,#f4a9a8 100%)', pptx: 'F4A9A8', dark: false },
  { id: 'slate-pro', label: 'Slate Professional', css: 'linear-gradient(135deg,#e2e8f0 0%,#cbd5e1 100%)', pptx: 'CBD5E1', dark: false },
  { id: 'royal-purple', label: 'Royal Purple', css: 'linear-gradient(135deg,#41295a 0%,#2f0743 100%)', pptx: '2F0743', dark: true },
  { id: 'sunset-orange', label: 'Sunset Orange', css: 'linear-gradient(135deg,#ff9a56 0%,#ff6666 100%)', pptx: 'FF7A56', dark: false },
  { id: 'emerald-corp', label: 'Emerald Corporate', css: 'linear-gradient(135deg,#0f9b6c 0%,#0c6b58 100%)', pptx: '0F9B6C', dark: true },
  { id: 'sky-fresh', label: 'Sky Fresh', css: 'linear-gradient(135deg,#89f7fe 0%,#66a6ff 100%)', pptx: '66A6FF', dark: false },
  { id: 'charcoal-editorial', label: 'Charcoal Editorial', css: 'linear-gradient(135deg,#232526 0%,#414345 100%)', pptx: '232526', dark: true },
  { id: 'peach-cream', label: 'Peach Cream', css: 'linear-gradient(135deg,#fddb92 0%,#d1fdff 100%)', pptx: 'FDDB92', dark: false },
  { id: 'berry-punch', label: 'Berry Punch', css: 'linear-gradient(135deg,#ff5f6d 0%,#ffc371 100%)', pptx: 'FF5F6D', dark: false },
  { id: 'deep-teal', label: 'Deep Teal', css: 'linear-gradient(135deg,#134e5e 0%,#71b280 100%)', pptx: '134E5E', dark: true },
  { id: 'lavender-fields', label: 'Lavender Fields', css: 'linear-gradient(135deg,#c471f5 0%,#fa71cd 100%)', pptx: 'C471F5', dark: false },
  { id: 'golden-hour', label: 'Golden Hour', css: 'linear-gradient(135deg,#f6d365 0%,#fda085 100%)', pptx: 'F6D365', dark: false },
  { id: 'graphite-blue', label: 'Graphite Blue', css: 'linear-gradient(135deg,#3a6073 0%,#16222a 100%)', pptx: '16222A', dark: true },
  { id: 'cotton-candy', label: 'Cotton Candy', css: 'linear-gradient(135deg,#fbc2eb 0%,#a6c1ee 100%)', pptx: 'A6C1EE', dark: false },
  { id: 'forest-corp', label: 'Forest Corporate', css: 'linear-gradient(135deg,#0b3d2e 0%,#11998e 100%)', pptx: '0B3D2E', dark: true },
  { id: 'crimson-bold', label: 'Crimson Bold', css: 'linear-gradient(135deg,#0f0c29 0%,#302b63 55%,#24243e 100%)', pptx: '24243E', dark: true }
];

function getSlideBackgroundById(id) {
  if (!id) return null;
  return SLIDE_BACKGROUNDS.find(b => b.id === id) || null;
}

// Plain-text catalog of the 20 fixed preset ids/labels, used only by the
// manual "Background" swatch picker's docs/tooling. The Auto Background
// toggle no longer uses this — it now has the AI design a fresh one-off
// background per deck instead of picking from this fixed list (see
// buildSlideDeckRules()).
function getSlideBackgroundCatalogForPrompt() {
  return SLIDE_BACKGROUNDS.map(b => `${b.id} (${b.label}, ${b.dark ? 'dark' : 'light'})`).join(', ');
}

// Resolves a slide's EFFECTIVE background to the shared {css,pptx,dark}
// shape, whichever of the two sources it came from: a fixed preset id
// (slide.bg) or an AI-designed one-off background pinned via the ✨ Custom
// Background command (slide.bg === 'custom', full definition on
// slide.customBg). Every render/export site should go through this
// instead of calling getSlideBackgroundById() directly, so both sources
// stay interchangeable.
function _resolveSlideBackground(slide) {
  if (!slide) return null;
  if (slide.bg === 'custom' && slide.customBg) return slide.customBg;
  return getSlideBackgroundById(slide.bg);
}

// ========================================================================
// AUTO BACKGROUND TOGGLE — slide editor toolbar
// ========================================================================
// When ON, the next full-deck generation (generateSlideDeckDirectMode)
// asks the AI to DESIGN a brand-new background (not pick from the 20 fixed
// presets) tailored to the deck's own topic/tone, and applies it to every
// slide for a cohesive look — see the extra "background" key
// buildSlideDeckRules() adds to the JSON schema only while this is on.
// When OFF (the default), decks generate on a plain white canvas exactly
// as before. This never affects per-slide AI editing (@Edit Slide N) or
// the ✨ Custom Background command, which are separate, explicitly
// user-driven styling steps.
const SLIDE_AUTO_BG_STORAGE_KEY = 'aipdf_slide_auto_background_enabled';

function getSlideAutoBackgroundEnabled() {
  try { return localStorage.getItem(SLIDE_AUTO_BG_STORAGE_KEY) === '1'; } catch (_) { return false; }
}

function setSlideAutoBackgroundEnabled(enabled) {
  try { localStorage.setItem(SLIDE_AUTO_BG_STORAGE_KEY, enabled ? '1' : '0'); } catch (_) { /* best-effort only */ }
}

function toggleSlideAutoBackground() {
  const next = !getSlideAutoBackgroundEnabled();
  setSlideAutoBackgroundEnabled(next);
  const btn = document.getElementById('slide-auto-bg-toggle-btn');
  if (btn) { btn.classList.toggle('active', next); btn.setAttribute('aria-pressed', next ? 'true' : 'false'); }
  if (typeof displayToastNotification === 'function') {
    displayToastNotification(next
      ? '✅ Auto Background is ON — the next generated deck gets a fresh AI-designed background matching its topic.'
      : 'Auto Background is OFF — new decks generate on a plain white canvas.');
  }
}

// ===== PROMPT: SCHEMA + RULES =====
// `lengthHint` mirrors the PDF pipeline's long_pdf/short_pdf: it's the
// slide-deck counterpart set via the @Detailed Deck / @Compact Deck @
// commands (see buildIntentPayload() -> intentPayload.length in
// command-menu.js). A page-count idea like "Long PDF" means nothing for a
// slide deck, so this only ever adjusts the SLIDE COUNT + depth-per-slide
// guidance, not a page target.
function _slideDeckLengthRule(lengthHint) {
  if (lengthHint === 'long_slides') {
    return `- LENGTH: DETAILED DECK — the user explicitly asked for a detailed deck. Use between ${Math.max(10, SLIDE_DECK_MAX_SLIDES - 12)} and ${SLIDE_DECK_MAX_SLIDES} slides. Break the topic into more granular sub-points, add supporting detail/examples/comparisons, and give related sub-ideas their own slide instead of merging them.\n`;
  }
  if (lengthHint === 'short_slides') {
    return `- LENGTH: COMPACT DECK — the user explicitly asked for a compact deck. Use between 3 and 6 slides. Cover only the essential points, one per slide, and cut anything that isn't necessary — no filler or "nice to have" slides.\n`;
  }
  return `- Between 3 and ${SLIDE_DECK_MAX_SLIDES} slides. One idea per slide — do not cram an entire topic onto one slide.\n`;
}

function buildSlideDeckRules(outputLanguage, lengthHint, autoBgEnabled) {
  const chartCatalog = typeof getChartCatalogForPrompt === 'function' ? getChartCatalogForPrompt() : '';
  const diagramCatalog = typeof getDiagramTemplateCatalogForPrompt === 'function' ? getDiagramTemplateCatalogForPrompt() : '';
  // Auto Background does NOT pick from the 20 fixed presets — it designs a
  // brand-new, one-off background from scratch (same shape/constraints as
  // the ✨ Custom Background command), tailored to THIS deck's topic and
  // tone, so two decks on different subjects should virtually never end up
  // with the same background. See _sanitizeCustomBackgroundJSON below for
  // validation of whatever the AI returns here.
  const bgSchemaKey = autoBgEnabled ? `,"background":{"label":"...","css":"...","pptx":"RRGGBB","dark":true}` : '';
  const bgRule = autoBgEnabled
    ? `- "background" (top-level, sibling of "slides"): DESIGN AN ORIGINAL background from scratch that fits THIS deck's specific topic, mood and tone — do not fall back to a generic default. "label" is a short 2-4 word name; "css" is a single valid CSS background value ONLY (one solid color like "#0f2027", or one linear-gradient(...)/radial-gradient(...) expression using hex or rgb()/rgba() colors — no url(), no images, no multiple layers); "pptx" is a 6-digit hex (no "#") approximating css's overall color, for PowerPoint export; "dark" is true only if slide title/bullet text needs to render LIGHT to stay readable on it. Keep it readable behind text — avoid anything so busy or high-contrast that text would be illegible. Set the whole "background" key to null instead for a plain white deck. This single design is applied to every slide for a cohesive look — never vary it per slide.\n`
    : `- Every slide is generated on a plain white canvas — never mention or imply a colored/patterned slide background; that is a separate, user-controlled styling step outside this JSON.`;
  return (
    `You are the dedicated SLIDE DECK generator for AI PDF Studio's "Create Slides" feature.\n` +
    `Return ONLY a single JSON object — no markdown fences, no commentary outside the JSON.\n` +
    `Language: ${outputLanguage}.\n` +
    `JSON SHAPE (exact keys):\n` +
    `{"action":"generate_slides","deck_title":"...","slides":[{"title":"...","bullets":["...","..."],"visual":null}]${bgSchemaKey}}\n` +
    `SLIDE RULES:\n` +
    _slideDeckLengthRule(lengthHint) +
    `- "title" is a short slide headline (a few words to one line), never a full sentence paragraph.\n` +
    `- "bullets" is an array of short, punchy phrases (NOT full paragraphs), at most ${SLIDE_DECK_MAX_BULLETS_PER_SLIDE} per slide. Omit or use an empty array for a title-only or visual-only slide.\n` +
    `- VISUAL DENSITY: this deck must look modern, stylish and professional — like a designer built it, not a wall of bullet text. Aim to give AT LEAST HALF of the non-title content slides a genuine visual (a chart, a diagram, or a small original illustration/icon). Do not force an irrelevant visual onto a slide, but actively look for a legitimate chart/diagram/icon opportunity on every content slide before deciding it needs none.\n` +
    `- "visual" is OPTIONAL. Set it to exactly one of:\n` +
    `    (a) null — no visual on this slide,\n` +
    `    (b) a chart placeholder string when the slide's point is data, one of:\n      ${chartCatalog}\n` +
    `    (c) a diagram placeholder string when the slide matches one of these well-known subjects, one of:\n      ${diagramCatalog}\n` +
    `    (d) a small hand-drawn illustration/icon as a raw, complete, self-contained "<svg ...>...</svg>" string (viewBox 0 0 700 400, no external assets) — use this generously for concepts, icons, and simple original diagrams not covered by (b) or (c).\n` +
    `- Never put a visual placeholder or raw svg inside "bullets" — it belongs only in the "visual" field.\n` +
    `- The FIRST slide should be a title slide: "title" = deck title/topic, "bullets" empty, "visual" null.\n` +
    `- Do not add a closing "Thank you" slide unless the user explicitly asked for one.\n` +
    bgRule
  );
}

// ===== SANITIZATION =====
function _truncateSlideText(text, maxChars) {
  const s = String(text == null ? '' : text).replace(/<[^>]*>/g, '').trim();
  return s.length > maxChars ? s.slice(0, maxChars - 1).trim() + '…' : s;
}

function sanitizeSlideDeckJSON(raw, autoBgEnabled) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.slides)) return null;
  const deckTitle = _truncateSlideText(raw.deck_title || raw.title || '', SLIDE_DECK_MAX_TITLE_CHARS) || 'Untitled Deck';

  // bg is null by default — every slide is created on a plain white
  // background regardless of what the AI returns, UNLESS Auto Background
  // is on, in which case the AI DESIGNS a fresh one-off background for
  // this deck's topic (validated with the same sanitizer as the ✨ Custom
  // Background command, never trusted blindly) and it's applied to every
  // slide as a 'custom' background for a cohesive look. Either way this
  // stays a separate, user-driven choice from the editor's point of view —
  // the ✨ Custom Background AI command and the manual swatch picker both
  // still work exactly the same afterward.
  const autoCustomBg = autoBgEnabled ? _sanitizeCustomBackgroundJSON(raw.background) : null;

  const slides = raw.slides.slice(0, SLIDE_DECK_MAX_SLIDES).map(s => {
    if (!s || typeof s !== 'object') return null;
    const title = _truncateSlideText(s.title || '', SLIDE_DECK_MAX_TITLE_CHARS);
    const bulletsSrc = Array.isArray(s.bullets) ? s.bullets : [];
    const bullets = bulletsSrc
      .filter(b => typeof b === 'string' && b.trim())
      .slice(0, SLIDE_DECK_MAX_BULLETS_PER_SLIDE)
      .map(b => _truncateSlideText(b, SLIDE_DECK_MAX_BULLET_CHARS));
    const visualRaw = (typeof s.visual === 'string' && s.visual.trim()) ? s.visual.trim() : null;
    return {
      title: title || 'Untitled Slide',
      bullets,
      visual: visualRaw,
      visualSVG: null,
      align: null,
      bg: autoCustomBg ? 'custom' : null,
      customBg: autoCustomBg
    };
  }).filter(Boolean);

  if (!slides.length) return null;
  return { title: deckTitle, slides };
}

// ===== VISUAL RESOLUTION (placeholders -> real inline SVG) =====
function resolveSlideVisualSVG(visualRaw) {
  if (!visualRaw) return null;
  let out = visualRaw;
  try {
    if (out.indexOf('CHART:') !== -1 && typeof injectChartTemplates === 'function') out = injectChartTemplates(out);
    if (out.indexOf('DIAGRAM_TEMPLATE:') !== -1 && typeof injectDiagramTemplates === 'function') out = injectDiagramTemplates(out);
  } catch (e) {
    console.warn('[SlideStudio] visual placeholder resolution failed:', e);
    return null;
  }
  out = String(out || '').trim();
  if (!/^<svg[\s>]/i.test(out)) return null;
  // Reuse the app's existing HTML sanitizer as a safety net (strips
  // script/on* handlers etc.) if available; a raw AI-drawn <svg> should
  // never carry executable content into the page.
  if (typeof sanitizeHTML === 'function') {
    try { out = sanitizeHTML(out); } catch (e) { /* keep unsanitized fallback below only if sanitize itself throws */ }
  }
  return /^<svg[\s>]/i.test(out.trim()) ? out.trim() : null;
}

function resolveAllSlideVisuals(deck) {
  if (!deck || !Array.isArray(deck.slides)) return deck;
  deck.slides.forEach(slide => {
    slide.visualSVG = resolveSlideVisualSVG(slide.visual);
  });
  return deck;
}

// ===== GENERATION =====
async function generateSlideDeckDirectMode(promptText, fileContextString, modelsUsedSet, intentPayload) {
  const outputLanguage = (intentPayload && intentPayload.language) || (typeof detectOutputLanguage === 'function' ? detectOutputLanguage(promptText) : 'English');
  const lengthHint = (intentPayload && (intentPayload.length === 'long_slides' || intentPayload.length === 'short_slides')) ? intentPayload.length : null;
  const activeCfg = (typeof _generationLockedModelConfig !== 'undefined' && _generationLockedModelConfig) || undefined;
  const autoBgEnabled = typeof getSlideAutoBackgroundEnabled === 'function' && getSlideAutoBackgroundEnabled();

  const systemPrompt = buildSlideDeckRules(outputLanguage, lengthHint, autoBgEnabled);
  const userPrompt =
    `USER REQUEST:\n${promptText}\n\n` +
    (fileContextString ? `ATTACHED SOURCE CONTEXT:\n${fileContextString}\n\n` : '') +
    `Generate the complete slide deck now. Return the JSON object only.`;

  if (typeof ProgressUI !== 'undefined' && ProgressUI.show) {
    ProgressUI.show('Generating Slides...', 'AI is planning the deck…');
    if (ProgressUI.startAutoEstimate) ProgressUI.startAutoEstimate(APP_CONFIG.SINGLE_SHOT_ESTIMATED_SECONDS);
    if (ProgressUI.setStage) ProgressUI.setStage('AI slide generation in progress…', 20, 75, { indeterminate: true });
  }

  try {
    const result = await callAIAPI(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      { forceJson: true, modelsUsedSet, modelConfig: activeCfg, maxTokens: undefined }
    );
    if (result && result.modelConfig) _generationLockedModelConfig = result.modelConfig;

    if (typeof ProgressUI !== 'undefined' && ProgressUI.setStage) ProgressUI.setStage('Building slides…', 75, 92);

    let parsed = safeParseAIJson(result.content, null);
    if (!parsed) parsed = attemptRepairAndParse(result.content);

    let deck = sanitizeSlideDeckJSON(parsed, autoBgEnabled);
    if (!deck) {
      const msg = 'The AI did not return a usable slide deck. Please try a more specific request.';
      if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', msg);
      if (typeof displayToastNotification === 'function') displayToastNotification(msg);
      if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide();
      return { ok: false, message: msg };
    }

    resolveAllSlideVisuals(deck);

    APP_STATE.slideDeck = deck;
    _slideDeckCurrentIndex = 0;
    if (typeof persistSlideDeckToActiveTab === 'function') persistSlideDeckToActiveTab(deck);

    renderSlideDeckPreview(deck);
    if (typeof switchPreviewTab === 'function') switchPreviewTab('slides');
    if (typeof isMobileDeviceLayout === 'function' && isMobileDeviceLayout() && typeof setMobileView === 'function') setMobileView('editor');

    if (typeof ProgressUI !== 'undefined') {
      ProgressUI.finish();
      setTimeout(() => { if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide(); }, 400);
    }
    return { ok: true, deck };
  } catch (e) {
    console.error('[Slide Studio] generation failed:', e);
    const errorMsg = (e && e.message) ? String(e.message) : 'Unknown error.';
    if (e && e.noModelConfigured) {
      if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', '⚠️ No AI model configured. Please click the "AI Models" button in the top bar, add a model, and try again.');
    } else {
      if (typeof appendChatMessageToUI === 'function') appendChatMessageToUI('error', `⚠️ Slide generation failed: ${errorMsg}`);
      if (typeof displayToastNotification === 'function') displayToastNotification(`Error: ${errorMsg}`);
    }
    if (typeof ProgressUI !== 'undefined' && ProgressUI.hide) ProgressUI.hide();
    return { ok: false, message: errorMsg };
  }
}

// ===== TAB PERSISTENCE HOOK (called by tab-manager.js patches) =====
function persistSlideDeckToActiveTab(deck) {
  try {
    if (typeof TAB_MANAGER === 'undefined' || !TAB_MANAGER.tabs) return;
    const active = TAB_MANAGER.tabs.find(t => t.id === TAB_MANAGER.activeId);
    if (active) {
      active.slideDeck = deck || null;
      if (typeof TAB_MANAGER._persist === 'function') TAB_MANAGER._persist();
    }
  } catch (e) { console.warn('[SlideStudio] persist failed:', e); }
}

// ========================================================================
// PER-SLIDE AI EDIT — pencil icon in the thumbnail rail
// ========================================================================
// Pins a slide-scoped "@Edit Slide N" chip into the AI panel (see
// command-menu.js's attemptAddAtCommand — this reuses that infra with an
// ad-hoc command object, no changes needed there). Unlike the document
// editor's @Edit chip, this one is deliberately NOT auto-cleared after a
// single send (see the selectedCommands filter in sendChatPromptToAI()) so
// several follow-up prompts can all target the same slide. It only reverts
// to the general, unscoped AI panel when the user removes the chip by hand.
function startSlideAIEditCommand(index) {
  const deck = APP_STATE.slideDeck;
  if (!deck || !Array.isArray(deck.slides) || !deck.slides[index]) return;
  if (!window.APP_STATE) return;
  goToSlide(index);
  window.APP_STATE.selectedCommands = window.APP_STATE.selectedCommands.filter(c => c.id !== 'chat');
  const slideNumber = index + 1;
  const cmd = { id: 'edit_slide', category: 'intent', label: `Edit Slide ${slideNumber}`, icon: 'edit' };
  if (typeof attemptAddAtCommand === 'function') {
    attemptAddAtCommand(cmd, String(slideNumber));
  } else {
    window.APP_STATE.selectedCommands = [{ id: cmd.id, category: cmd.category, label: cmd.label, icon: cmd.icon, param: String(slideNumber), implicit: false }];
    if (typeof renderSelectedCommandChips === 'function') renderSelectedCommandChips();
  }
  const ta = document.getElementById('chat-input-textarea');
  if (ta) { try { ta.focus(); } catch (_) { /* noop */ } }
  if (typeof displayToastNotification === 'function') displayToastNotification(`AI replies now edit only Slide ${slideNumber}. Remove the chip to return to normal chat.`);
}

function buildSingleSlideEditSystemPrompt(outputLanguage) {
  const chartCatalog = typeof getChartCatalogForPrompt === 'function' ? getChartCatalogForPrompt() : '';
  const diagramCatalog = typeof getDiagramTemplateCatalogForPrompt === 'function' ? getDiagramTemplateCatalogForPrompt() : '';
  return (
    `You are editing ONE SLIDE inside an existing slide deck for AI PDF Studio's "Create Slides" feature.\n` +
    `Return ONLY a single JSON object — no markdown fences, no commentary outside the JSON.\n` +
    `Language: ${outputLanguage}.\n` +
    `JSON SHAPE (exact keys): {"title":"...","bullets":["...","..."],"visual":null}\n` +
    `RULES:\n` +
    `- Edit ONLY the one slide described below. Never reference, summarize, or try to change any other slide.\n` +
    `- "title" is a short slide headline (a few words to one line), never a full sentence paragraph.\n` +
    `- "bullets" is an array of short, punchy phrases (NOT full paragraphs), at most ${SLIDE_DECK_MAX_BULLETS_PER_SLIDE}. Use an empty array for a title-only/visual-only slide.\n` +
    `- "visual" is OPTIONAL. Set it to exactly one of:\n` +
    `    (a) null — no visual,\n` +
    `    (b) a chart placeholder string, one of:\n      ${chartCatalog}\n` +
    `    (c) a diagram placeholder string, one of:\n      ${diagramCatalog}\n` +
    `    (d) a small hand-drawn illustration/icon as a raw, complete "<svg ...>...</svg>" string (viewBox 0 0 700 400, no external assets).\n` +
    `- If the user's request does not ask to remove the slide's existing visual or bullets, preserve whatever of them still makes sense rather than deleting content gratuitously.\n` +
    `- This slide is always plain white — never mention or set a colored/patterned background; that is a separate, user-controlled setting outside this JSON.`
  );
}

async function editSingleSlideViaAI(promptText, slideIndex, fileContextString, modelsUsedSet) {
  const deck = APP_STATE.slideDeck;
  if (!deck || !Array.isArray(deck.slides) || !deck.slides[slideIndex]) {
    return { ok: false, message: 'That slide no longer exists.' };
  }
  const slide = deck.slides[slideIndex];
  const outputLanguage = typeof detectOutputLanguage === 'function' ? detectOutputLanguage(promptText) : 'English';
  const activeCfg = (typeof _generationLockedModelConfig !== 'undefined' && _generationLockedModelConfig) || undefined;

  const otherTitles = deck.slides.map((s, i) => i === slideIndex ? null : `${i + 1}. ${s.title || ''}`).filter(Boolean).join('\n');
  const currentSlideJSON = JSON.stringify({ title: slide.title || '', bullets: slide.bullets || [], visual: slide.visual || null });

  const systemPrompt = buildSingleSlideEditSystemPrompt(outputLanguage);
  const userPrompt =
    `DECK TITLE: ${deck.title || ''}\n` +
    `THIS IS SLIDE ${slideIndex + 1} OF ${deck.slides.length}.\n` +
    (otherTitles ? `OTHER SLIDE TITLES (context only — do not edit these):\n${otherTitles}\n\n` : '\n') +
    `CURRENT SLIDE CONTENT:\n${currentSlideJSON}\n\n` +
    (fileContextString ? `ATTACHED SOURCE CONTEXT:\n${fileContextString}\n\n` : '') +
    `USER REQUEST FOR THIS SLIDE ONLY:\n${promptText}\n\n` +
    `Return the updated JSON object for this one slide now.`;

  try {
    const result = await callAIAPI(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      { forceJson: true, modelsUsedSet, modelConfig: activeCfg, maxTokens: undefined }
    );
    if (result && result.modelConfig) _generationLockedModelConfig = result.modelConfig;

    let parsed = safeParseAIJson(result.content, null);
    if (!parsed) parsed = attemptRepairAndParse(result.content);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, message: 'The AI did not return a usable slide update.' };
    }

    const title = _truncateSlideText(parsed.title || slide.title || '', SLIDE_DECK_MAX_TITLE_CHARS) || slide.title || 'Untitled Slide';
    const bulletsSrc = Array.isArray(parsed.bullets) ? parsed.bullets : [];
    const bullets = bulletsSrc
      .filter(b => typeof b === 'string' && b.trim())
      .slice(0, SLIDE_DECK_MAX_BULLETS_PER_SLIDE)
      .map(b => _truncateSlideText(b, SLIDE_DECK_MAX_BULLET_CHARS));
    const visualRaw = (typeof parsed.visual === 'string' && parsed.visual.trim()) ? parsed.visual.trim() : null;

    slide.title = title;
    slide.bullets = bullets;
    slide.visual = visualRaw;
    slide.visualSVG = resolveSlideVisualSVG(visualRaw);
    // slide.align / slide.bg are editor-only settings, never touched here.

    if (typeof persistSlideDeckToActiveTab === 'function') persistSlideDeckToActiveTab(deck);
    _slideDeckCurrentIndex = slideIndex;
    renderSlideDeckPreview(deck);

    return { ok: true, slideNumber: slideIndex + 1, title: slide.title };
  } catch (e) {
    console.error('[Slide Studio] single-slide AI edit failed:', e);
    return { ok: false, message: (e && e.message) ? String(e.message) : 'Unknown error.', noModelConfigured: !!(e && e.noModelConfigured) };
  }
}

// ========================================================================
// ✨ CUSTOM BACKGROUND — AI-designed background from the user's own words
// ========================================================================
// Selecting the "✨ Custom…" swatch (appended after the 20 fixed presets
// in the picker) doesn't set a background directly — it pins a
// "custom_background" @ command chip into the AI panel, exactly like the
// pencil icon pins "@Edit Slide N" (see startSlideAIEditCommand above).
// The user then types a free-form description and sends it; app.js's
// main chat handler recognizes intentPayload.intent === 'custom_background'
// and routes the prompt + intentPayload.bgEditTarget ("all" or a 1-based
// slide number, set below from the "Same on all slides / Different per
// slide" toggle) into applyCustomSlideBackgroundViaAI(). The chip stays
// pinned afterward so several follow-up descriptions can keep refining it.

// Only a bare CSS color or gradient() value may ever reach an inline style
// attribute from this pipeline — reject anything with quotes/angle
// brackets/url()/expression()/javascript: as a hard safety net, then
// require the whole string to be exactly one recognized color or
// gradient() form.
const CUSTOM_BG_CSS_PATTERN = /^(?:#[0-9a-fA-F]{3,8}|rgba?\([0-9.,\s%]+\)|(?:linear|radial)-gradient\([0-9a-zA-Z#.,%\s\-]+\))$/;

function _sanitizeCustomBackgroundJSON(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const label = _truncateSlideText(typeof raw.label === 'string' ? raw.label : '', 40) || 'Custom';
  const css = typeof raw.css === 'string' ? raw.css.trim() : '';
  if (!css || /["'<>;]/.test(css) || /url\s*\(|expression\s*\(|javascript:/i.test(css) || !CUSTOM_BG_CSS_PATTERN.test(css)) {
    return null;
  }
  const pptxRaw = typeof raw.pptx === 'string' ? raw.pptx.replace('#', '').trim() : '';
  const pptx = /^[0-9a-fA-F]{6}$/.test(pptxRaw) ? pptxRaw.toUpperCase() : '4F7DF3';
  const dark = !!raw.dark;
  return { label, css, pptx, dark };
}

function buildCustomBackgroundSystemPrompt() {
  return (
    `You are the BACKGROUND DESIGNER for AI PDF Studio's "Create Slides" feature.\n` +
    `The user describes, in their own words, a background they want for one or more presentation slides.\n` +
    `Return ONLY a single JSON object — no markdown fences, no commentary outside the JSON.\n` +
    `JSON SHAPE (exact keys): {"label":"...","css":"...","pptx":"RRGGBB","dark":true}\n` +
    `RULES:\n` +
    `- "label" is a short 2-4 word name for this background (e.g. "Midnight Aurora").\n` +
    `- "css" is a single valid CSS background value ONLY — either one solid color (e.g. "#0f2027") or one linear-gradient(...)/radial-gradient(...) expression using hex or rgb()/rgba() colors. No url(), no images, no multiple layers, nothing else.\n` +
    `- "pptx" is a single 6-digit hex color (no "#") approximating the overall/average color of "css" — used as a solid-fill fallback for PowerPoint export, which cannot render CSS gradients.\n` +
    `- "dark" is true if slide title/bullet text needs to render in a LIGHT color to stay readable on this background, false if dark text stays readable.\n` +
    `- Interpret the user's description faithfully (colors, mood, style) but keep it readable behind text — avoid anything so busy or high-contrast that text would be illegible.\n` +
    `- Never include text, shapes, images, or patterns — a plain CSS color or gradient only.`
  );
}

async function applyCustomSlideBackgroundViaAI(promptText, bgTarget, fileContextString, modelsUsedSet) {
  const deck = APP_STATE.slideDeck;
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) {
    return { ok: false, message: 'No slide deck is available to style.' };
  }
  const targetIndexes = bgTarget === 'all'
    ? deck.slides.map((_, i) => i)
    : [parseInt(bgTarget, 10) - 1].filter(i => Number.isInteger(i) && deck.slides[i]);
  if (!targetIndexes.length) {
    return { ok: false, message: 'That slide is no longer available.' };
  }

  const activeCfg = (typeof _generationLockedModelConfig !== 'undefined' && _generationLockedModelConfig) || undefined;
  const systemPrompt = buildCustomBackgroundSystemPrompt();
  const userPrompt =
    `DECK TITLE: ${deck.title || ''}\n` +
    (fileContextString ? `ATTACHED SOURCE CONTEXT:\n${fileContextString}\n\n` : '') +
    `DESCRIPTION OF THE BACKGROUND WANTED:\n${promptText}\n\n` +
    `Return the JSON object for this background now.`;

  try {
    const result = await callAIAPI(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      { forceJson: true, modelsUsedSet, modelConfig: activeCfg, maxTokens: undefined }
    );
    if (result && result.modelConfig) _generationLockedModelConfig = result.modelConfig;

    let parsed = safeParseAIJson(result.content, null);
    if (!parsed) parsed = attemptRepairAndParse(result.content);
    const customBg = _sanitizeCustomBackgroundJSON(parsed);
    if (!customBg) {
      return { ok: false, message: 'The AI did not return a usable background. Try describing it differently.' };
    }

    targetIndexes.forEach(i => {
      deck.slides[i].bg = 'custom';
      deck.slides[i].customBg = customBg;
    });
    if (typeof persistSlideDeckToActiveTab === 'function') persistSlideDeckToActiveTab(deck);
    if (targetIndexes.indexOf(_slideDeckCurrentIndex) === -1) _slideDeckCurrentIndex = targetIndexes[0];
    renderSlideDeckPreview(deck);

    return { ok: true, label: customBg.label };
  } catch (e) {
    console.error('[Slide Studio] custom background generation failed:', e);
    return { ok: false, message: (e && e.message) ? String(e.message) : 'Unknown error.', noModelConfigured: !!(e && e.noModelConfigured) };
  }
}

// Toggles the "Same on all slides / Different per slide" scope shown next
// to the ✨ Custom… swatch, then re-renders the picker panel in place.
function setCustomBgScope(isAll) {
  _customBgScopeAll = !!isAll;
  const panel = document.getElementById('slide-bg-picker-panel');
  if (panel) panel.innerHTML = _renderBackgroundPickerSwatches(APP_STATE.slideDeck);
}

function startCustomSlideBackgroundCommand() {
  const deck = APP_STATE.slideDeck;
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) {
    if (typeof displayToastNotification === 'function') displayToastNotification('Generate a slide deck first.');
    return;
  }
  if (!window.APP_STATE) return;

  const target = _customBgScopeAll ? 'all' : String(_slideDeckCurrentIndex + 1);
  window.APP_STATE.selectedCommands = window.APP_STATE.selectedCommands.filter(c => c.id !== 'chat' && c.id !== 'edit_slide');
  const cmd = {
    id: 'custom_background',
    category: 'intent',
    label: target === 'all' ? 'Custom Background (All Slides)' : `Custom Background (Slide ${target})`,
    icon: 'background'
  };
  if (typeof attemptAddAtCommand === 'function') {
    attemptAddAtCommand(cmd, target);
  } else {
    window.APP_STATE.selectedCommands = [{ id: cmd.id, category: cmd.category, label: cmd.label, icon: cmd.icon, param: target, implicit: false }];
    if (typeof renderSelectedCommandChips === 'function') renderSelectedCommandChips();
  }

  _slideBackgroundPickerOpen = false;
  const panel = document.getElementById('slide-bg-picker-panel');
  if (panel) panel.classList.remove('open');
  const btn = document.getElementById('slide-bg-toggle-btn');
  if (btn) btn.setAttribute('aria-expanded', 'false');

  const ta = document.getElementById('chat-input-textarea');
  if (ta) { try { ta.focus(); } catch (_) { /* noop */ } }
  const scopeText = target === 'all' ? 'every slide' : `Slide ${target}`;
  if (typeof displayToastNotification === 'function') {
    displayToastNotification(`Describe the background you want, then send — AI will design it for ${scopeText}. Remove the chip to go back to normal chat.`);
  }
}

// ========================================================================
// MANUAL IMAGE INSERT — toolbar "+ Image" button
// ========================================================================
// Lets the user drop a real photo/screenshot (or a hand-made .svg file)
// straight onto the current slide, independent of anything the AI
// generates. Both file families end up going through the exact same
// `slide.visual` / `slide.visualSVG` fields the AI-generated visuals use
// (see resolveSlideVisualSVG above), so the rest of the pipeline — canvas
// preview, True PDF export, PPTX export (rasterizeSvgToPngDataUrl) — needs
// no special-casing for a manually inserted image.
//
// - An .svg file is already exactly what visualSVG expects: read as TEXT,
//   sanitized, and stored as-is.
// - Any other image (png/jpg/webp/gif/...) is not natively an <svg>, so it
//   is embedded as a data-URI inside a tiny generated wrapper —
//   `<svg><image href="data:..."/></svg>` — which keeps every downstream
//   consumer (which only ever knows how to render/rasterize an <svg>)
//   working unchanged. The source bitmap is downscaled through a canvas
//   first so a multi-megabyte phone photo doesn't bloat the tab's saved
//   state (everything here persists through localStorage).
const SLIDE_IMAGE_MAX_SOURCE_BYTES = 20 * 1024 * 1024; // 20MB raw upload cap
const SLIDE_IMAGE_MAX_DIMENSION = 1280; // long-edge cap after downscale
const SLIDE_IMAGE_JPEG_QUALITY = 0.85;

function triggerSlideImageUpload() {
  if (!_currentSlide()) {
    if (typeof displayToastNotification === 'function') displayToastNotification('Open or create a slide deck first.');
    return;
  }
  const input = document.getElementById('slide-image-file-input');
  if (!input) return;
  input.value = '';
  input.click();
}

function _isSvgFile(file) {
  return !!file && (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || ''));
}

function _readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsText(file);
  });
}

// Downscales a raster image to at most SLIDE_IMAGE_MAX_DIMENSION on its
// long edge and returns { dataUrl, width, height }. PNG/GIF/WEBP sources
// keep PNG output (preserves transparency); everything else becomes JPEG.
function _downscaleImageFileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) { reject(new Error('Could not read image dimensions.')); return; }
        const longEdge = Math.max(w, h);
        if (longEdge > SLIDE_IMAGE_MAX_DIMENSION) {
          const scale = SLIDE_IMAGE_MAX_DIMENSION / longEdge;
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const keepPng = /^image\/(png|gif|webp)$/i.test(file.type || '');
        const dataUrl = keepPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', SLIDE_IMAGE_JPEG_QUALITY);
        resolve({ dataUrl, width: w, height: h });
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Could not load the selected file as an image.')); };
    img.src = objectUrl;
  });
}

async function handleSlideImageFileSelected(event) {
  const file = event && event.target && event.target.files && event.target.files[0];
  if (event && event.target) event.target.value = '';
  if (!file) return;
  const slide = _currentSlide();
  if (!slide) {
    if (typeof displayToastNotification === 'function') displayToastNotification('Open or create a slide deck first.');
    return;
  }
  if (file.size > SLIDE_IMAGE_MAX_SOURCE_BYTES) {
    if (typeof displayToastNotification === 'function') displayToastNotification('That image is too large (max 20MB).');
    return;
  }
  if (!_isSvgFile(file) && !/^image\//i.test(file.type || '')) {
    if (typeof displayToastNotification === 'function') displayToastNotification('Please choose an image file (PNG, JPG, WEBP, GIF, or SVG).');
    return;
  }

  try {
    let svgString;
    if (_isSvgFile(file)) {
      let raw = (await _readFileAsText(file)).trim();
      if (typeof sanitizeHTML === 'function') {
        try { raw = sanitizeHTML(raw); } catch (_) { /* keep unsanitized fallback below only if sanitize itself throws */ }
      }
      if (!/^<svg[\s>]/i.test(raw.trim())) {
        if (typeof displayToastNotification === 'function') displayToastNotification('That file is not a valid SVG image.');
        return;
      }
      svgString = raw.trim();
    } else {
      const { dataUrl, width, height } = await _downscaleImageFileToDataURL(file);
      svgString = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><image href="${dataUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/></svg>`;
    }

    slide.visual = svgString;
    slide.visualSVG = typeof resolveSlideVisualSVG === 'function' ? resolveSlideVisualSVG(svgString) : svgString;
    if (!slide.visualSVG) {
      if (typeof displayToastNotification === 'function') displayToastNotification('That image could not be added to the slide.');
      return;
    }
    if (typeof persistSlideDeckToActiveTab === 'function') persistSlideDeckToActiveTab(APP_STATE.slideDeck);
    renderSlideDeckPreview(APP_STATE.slideDeck);
    if (typeof displayToastNotification === 'function') displayToastNotification('Image added to the slide.');
  } catch (e) {
    console.error('[Slide Studio] image insert failed:', e);
    if (typeof displayToastNotification === 'function') displayToastNotification(`Could not add that image: ${(e && e.message) ? e.message : 'unknown error'}`);
  }
}

function clearCurrentSlideVisual() {
  const slide = _currentSlide();
  if (!slide || !slide.visualSVG) return;
  slide.visual = null;
  slide.visualSVG = null;
  if (typeof persistSlideDeckToActiveTab === 'function') persistSlideDeckToActiveTab(APP_STATE.slideDeck);
  renderSlideDeckPreview(APP_STATE.slideDeck);
}

// ===== PREVIEW RENDERING =====
function _escSlideHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderSlideDeckPreview(deck) {
  const container = document.getElementById('slide-view-container');
  if (!container) return;
  deck = deck || APP_STATE.slideDeck;
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) {
    container.innerHTML = `<div class="slide-empty-state">
      <div class="slide-empty-icon">🖼️</div>
      <p>No slide deck yet. Use <b>@Create Slides</b> in the chat to generate one.</p>
    </div>`;
    return;
  }
  if (_slideDeckCurrentIndex >= deck.slides.length) _slideDeckCurrentIndex = 0;

  const thumbs = deck.slides.map((s, i) => `
    <div class="slide-thumb-row">
      <button type="button" class="slide-thumb${i === _slideDeckCurrentIndex ? ' active' : ''}" onclick="goToSlide(${i})" title="${_escSlideHtml(s.title)}">
        <span class="slide-thumb-index">${i + 1}</span>
        <span class="slide-thumb-title">${_escSlideHtml(s.title) || '&nbsp;'}</span>
      </button>
      <button type="button" class="slide-thumb-pencil" title="Edit only Slide ${i + 1} with AI" aria-label="Edit only Slide ${i + 1} with AI" onmousedown="event.preventDefault()" onclick="event.stopPropagation(); startSlideAIEditCommand(${i})">${typeof getUIIcon === 'function' ? getUIIcon('pencilSlide') : '✏️'}</button>
    </div>`).join('');

  container.innerHTML = `
    <div class="slide-edit-toolbar" role="toolbar" aria-label="Slide editor">
      <div class="slide-edit-group slide-nav-group">
        <button type="button" class="slide-nav-btn" onclick="navigateSlide(-1)" aria-label="Previous slide">⬅</button>
        <span class="slide-counter">${_slideDeckCurrentIndex + 1} / ${deck.slides.length}</span>
        <button type="button" class="slide-nav-btn" onclick="navigateSlide(1)" aria-label="Next slide">➡</button>
      </div>
      <div class="slide-edit-divider" aria-hidden="true"></div>
      <div class="slide-edit-group">
        <button type="button" class="slide-edit-btn" onclick="addSlideAfterCurrent()" title="Add a new slide after this one">+ Slide</button>
        <button type="button" class="slide-edit-btn" onclick="deleteCurrentSlide()" title="Delete this slide">🗑 Slide</button>
      </div>
      <div class="slide-edit-group">
        <button type="button" class="slide-edit-btn" onclick="addBulletToCurrentSlide()" title="Add a bullet point">+ Point</button>
        <button type="button" class="slide-edit-btn" onclick="triggerSlideImageUpload()" title="Add a photo, PNG/JPG image, or SVG image to this slide">${typeof getUIIcon === 'function' ? getUIIcon('canvas') : '🖼'} + Image</button>
        <input type="file" id="slide-image-file-input" accept="image/*,.svg,image/svg+xml" style="display:none" onchange="handleSlideImageFileSelected(event)">
      </div>
      <div class="slide-edit-group" role="group" aria-label="Text alignment">
        <button type="button" class="slide-edit-btn" onclick="setCurrentSlideAlign('left')" title="Align left">⫷</button>
        <button type="button" class="slide-edit-btn" onclick="setCurrentSlideAlign('center')" title="Align center">≡</button>
        <button type="button" class="slide-edit-btn" onclick="setCurrentSlideAlign('right')" title="Align right">⫸</button>
      </div>
      <div class="slide-edit-group slide-edit-group-bg">
        <button type="button" class="slide-edit-btn${getSlideAutoBackgroundEnabled() ? ' active' : ''}" id="slide-auto-bg-toggle-btn" onclick="toggleSlideAutoBackground()" title="When ON, the AI designs a fresh background matching the deck's topic the next time you generate a deck" aria-pressed="${getSlideAutoBackgroundEnabled() ? 'true' : 'false'}">${typeof getUIIcon === 'function' ? getUIIcon('background') : '🎨'} Auto Background</button>
        <button type="button" class="slide-edit-btn" id="slide-bg-toggle-btn" onclick="toggleSlideBackgroundPicker()" title="Choose a slide background" aria-haspopup="true" aria-expanded="${_slideBackgroundPickerOpen ? 'true' : 'false'}">${typeof getUIIcon === 'function' ? getUIIcon('background') : '🎨'} Background</button>
      </div>
    </div>
    <div class="slide-bg-picker-panel${_slideBackgroundPickerOpen ? ' open' : ''}" id="slide-bg-picker-panel">${_renderBackgroundPickerSwatches(deck)}</div>
    <div class="slide-studio-body">
      <div class="slide-thumbnail-rail" id="slide-thumbnail-rail">${thumbs}</div>
      <div class="slide-main-view" id="slide-main-view"></div>
    </div>`;

  _renderCurrentSlideCanvas(deck);
  _attachEditorSlideWheelNav();
}

// Mouse-wheel/trackpad scroll over the editor's slide canvas area changes
// slides, same gesture as Presentation Mode. #slide-main-view itself is
// recreated every time renderSlideDeckPreview() rebuilds the toolbar/body
// (add/delete slide, background change, etc.), which wipes any listener
// attached to it — so this is called once after every such rebuild rather
// than only once at startup. Slide-to-slide navigation alone (goToSlide/
// navigateSlide) only replaces #slide-main-view's inner HTML, not the node
// itself, so the listener survives those without needing to reattach.
let _editorWheelLocked = false;
function _attachEditorSlideWheelNav() {
  const mainView = document.getElementById('slide-main-view');
  if (!mainView) return;
  mainView.addEventListener('wheel', _onEditorSlideWheel, { passive: true });
}
function _onEditorSlideWheel(e) {
  if (_editorWheelLocked) return;
  const delta = e.deltaY || e.detail || 0;
  if (Math.abs(delta) < 4) return;
  _editorWheelLocked = true;
  navigateSlide(delta > 0 ? 1 : -1);
  setTimeout(() => { _editorWheelLocked = false; }, 450);
}

// ===== BACKGROUND PICKER (20 fixed presets + "No background" + ✨ Custom) =====
function _renderBackgroundPickerSwatches(deck) {
  const current = _currentSlide();
  const currentBg = current ? current.bg : null;
  const noneSwatch = `
    <button type="button" class="slide-bg-swatch slide-bg-swatch-none${!currentBg ? ' active' : ''}" title="No background (plain white)" onclick="setCurrentSlideBackground(null)">
      <span class="slide-bg-swatch-label">None</span>
    </button>`;
  const swatches = SLIDE_BACKGROUNDS.map(b => `
    <button type="button" class="slide-bg-swatch${currentBg === b.id ? ' active' : ''}" style="background:${b.css};" title="${_escSlideHtml(b.label)}" onclick="setCurrentSlideBackground('${b.id}')">
      <span class="slide-bg-swatch-label${b.dark ? ' light-text' : ''}">${_escSlideHtml(b.label)}</span>
    </button>`).join('');
  const isCustomActive = currentBg === 'custom' && current && current.customBg;
  const customSwatchStyle = isCustomActive ? ` style="background:${current.customBg.css};"` : '';
  const customSwatch = `
    <button type="button" class="slide-bg-swatch slide-bg-swatch-custom${isCustomActive ? ' active' : ''}"${customSwatchStyle} title="Describe a background in your own words — AI designs it" onclick="startCustomSlideBackgroundCommand()">
      <span class="slide-bg-swatch-label${isCustomActive && current.customBg.dark ? ' light-text' : ''}">✨ ${isCustomActive ? _escSlideHtml(current.customBg.label) : 'Custom…'}</span>
    </button>`;
  return `
    <div class="slide-bg-picker-head">
      <span>Choose a background for this slide</span>
      <button type="button" class="slide-bg-apply-all" onclick="applyCurrentBackgroundToAllSlides()" title="Apply this background to every slide in the deck">Apply to all slides</button>
    </div>
    <div class="slide-bg-swatch-grid">${noneSwatch}${swatches}${customSwatch}</div>
    <div class="slide-bg-custom-scope" role="group" aria-label="Scope for the next Custom Background description">
      <span class="slide-bg-custom-scope-label">✨ Custom applies to:</span>
      <button type="button" class="slide-bg-scope-btn${_customBgScopeAll ? '' : ' active'}" onclick="setCustomBgScope(false)">Just this slide</button>
      <button type="button" class="slide-bg-scope-btn${_customBgScopeAll ? ' active' : ''}" onclick="setCustomBgScope(true)">Same on all slides</button>
    </div>`;
}

function toggleSlideBackgroundPicker() {
  _slideBackgroundPickerOpen = !_slideBackgroundPickerOpen;
  const panel = document.getElementById('slide-bg-picker-panel');
  const btn = document.getElementById('slide-bg-toggle-btn');
  if (panel) panel.classList.toggle('open', _slideBackgroundPickerOpen);
  if (btn) btn.setAttribute('aria-expanded', _slideBackgroundPickerOpen ? 'true' : 'false');
  if (_slideBackgroundPickerOpen && panel) panel.innerHTML = _renderBackgroundPickerSwatches(APP_STATE.slideDeck);
}

function setCurrentSlideBackground(bgId) {
  const slide = _currentSlide();
  if (!slide) return;
  slide.bg = bgId || null;
  if (typeof persistSlideDeckToActiveTab === 'function') persistSlideDeckToActiveTab(APP_STATE.slideDeck);
  renderSlideDeckPreview(APP_STATE.slideDeck);
  // renderSlideDeckPreview rebuilds the panel closed by default state var,
  // but the user is actively picking — keep it open and refresh its
  // active-swatch highlight so successive clicks feel instant.
  _slideBackgroundPickerOpen = true;
  const panel = document.getElementById('slide-bg-picker-panel');
  if (panel) { panel.classList.add('open'); panel.innerHTML = _renderBackgroundPickerSwatches(APP_STATE.slideDeck); }
  const btn = document.getElementById('slide-bg-toggle-btn');
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

function applyCurrentBackgroundToAllSlides() {
  const deck = APP_STATE.slideDeck;
  const current = _currentSlide();
  if (!deck || !Array.isArray(deck.slides) || !current) return;
  const bg = current.bg || null;
  deck.slides.forEach(s => { s.bg = bg; });
  if (typeof persistSlideDeckToActiveTab === 'function') persistSlideDeckToActiveTab(deck);
  if (typeof displayToastNotification === 'function') displayToastNotification(bg ? 'Background applied to every slide.' : 'Background cleared from every slide.');
  _slideBackgroundPickerOpen = true;
  renderSlideDeckPreview(deck);
}

// A slide is "title-only" (no bullets, no visual) whenever that's true of
// its content — NOT only when it happens to be the very first slide. A mid-
// deck section-header slide (just a heading, nothing else) is exactly as
// title-only as slide 1, and should be centered the same way; restricting
// this to index 0 was the bug behind text staying left-aligned when it was
// supposed to be centered.
function _isTitleOnlySlide(slide) {
  return !!slide && (!slide.bullets || !slide.bullets.length) && !slide.visualSVG;
}

function _renderCurrentSlideCanvas(deck) {
  deck = deck || APP_STATE.slideDeck;
  const mainView = document.getElementById('slide-main-view');
  if (!mainView || !deck || !deck.slides[_slideDeckCurrentIndex]) return;
  mainView.innerHTML = _buildSlideCanvasHTML(deck.slides[_slideDeckCurrentIndex], true);
}

// Builds one slide's canvas markup, shared by the editable Slide Studio
// view (editable=true: contenteditable title/bullets, delete buttons) and
// the read-only fullscreen Presentation Mode (editable=false: plain text,
// no contenteditable, no buttons — see openSlidePresentationMode below).
// Keeping this in one place means background/alignment/typography always
// look identical between "editing" and "presenting".
function _buildSlideCanvasHTML(slide, editable) {
  const isTitleOnly = _isTitleOnlySlide(slide);
  // slide.align is an explicit user override set via the alignment buttons
  // in the dedicated slide editor toolbar; absent that, title-only slides
  // default to centered (like a real title/section slide) and everything
  // else defaults to left, matching normal slide-deck conventions.
  const align = slide.align || (isTitleOnly ? 'center' : 'left');
  const containerAlignItems = align === 'center' ? 'center' : (align === 'right' ? 'flex-end' : 'flex-start');

  const bulletsHTML = (slide.bullets && slide.bullets.length)
    ? `<ul class="slide-canvas-bullets">${slide.bullets.map((b, i) => editable ? `
      <li class="slide-bullet-row">
        <span class="slide-bullet-text" contenteditable="true" spellcheck="false" oninput="onSlideBulletInput(${i}, this)" onblur="onSlideBulletBlur(${i}, this)">${_escSlideHtml(b)}</span>
        <button type="button" class="slide-bullet-del" title="Delete this point" onmousedown="event.preventDefault()" onclick="deleteBulletFromCurrentSlide(${i})">×</button>
      </li>` : `
      <li class="slide-bullet-row slide-bullet-row-readonly">
        <span class="slide-bullet-text">${_escSlideHtml(b)}</span>
      </li>`).join('')}</ul>`
    : '';
  const visualHTML = slide.visualSVG
    ? (editable
      ? `<div class="slide-canvas-visual">
      ${slide.visualSVG}
      <button type="button" class="slide-visual-remove-btn" title="Remove this image/visual" aria-label="Remove this image/visual" onmousedown="event.preventDefault()" onclick="event.stopPropagation(); clearCurrentSlideVisual()">×</button>
    </div>`
      : `<div class="slide-canvas-visual slide-canvas-visual-readonly">${slide.visualSVG}</div>`)
    : '';

  const bgPreset = _resolveSlideBackground(slide);
  const canvasStyle = [
    `text-align:${align}`,
    isTitleOnly ? `align-items:${containerAlignItems}` : '',
    bgPreset ? `background:${bgPreset.css}` : ''
  ].filter(Boolean).join(';');
  const canvasClasses = [
    'slide-canvas-16x9',
    isTitleOnly ? 'slide-canvas-title-slide' : '',
    bgPreset ? 'slide-canvas-has-bg' : '',
    bgPreset && bgPreset.dark ? 'slide-canvas-dark-text' : '',
    editable ? '' : 'slide-canvas-readonly'
  ].filter(Boolean).join(' ');

  const titleHTML = editable
    ? `<div class="slide-canvas-title" contenteditable="true" spellcheck="false" style="text-align:${align};" oninput="onSlideTitleInput(this)" onblur="onSlideTitleBlur(this)">${_escSlideHtml(slide.title)}</div>`
    : `<div class="slide-canvas-title" style="text-align:${align};">${_escSlideHtml(slide.title)}</div>`;

  return `
    <div class="${canvasClasses}" style="${canvasStyle};">
      <div class="slide-canvas-accent-bar" aria-hidden="true"></div>
      ${titleHTML}
      ${visualHTML}
      ${bulletsHTML}
    </div>`;
}

// ===== DEDICATED SLIDE EDITOR — text edits, structure edits, alignment =====
function _currentSlide() {
  const deck = APP_STATE.slideDeck;
  if (!deck || !Array.isArray(deck.slides) || !deck.slides[_slideDeckCurrentIndex]) return null;
  return deck.slides[_slideDeckCurrentIndex];
}

function addSlideAfterCurrent() {
  const deck = APP_STATE.slideDeck;
  if (!deck || !Array.isArray(deck.slides)) return;
  if (deck.slides.length >= SLIDE_DECK_MAX_SLIDES) {
    if (typeof displayToastNotification === 'function') displayToastNotification(`A deck can have at most ${SLIDE_DECK_MAX_SLIDES} slides.`);
    return;
  }
  deck.slides.splice(_slideDeckCurrentIndex + 1, 0, { title: 'New Slide', bullets: [], visual: null, visualSVG: null, align: null, bg: null });
  _slideDeckCurrentIndex += 1;
  if (typeof persistSlideDeckToActiveTab === 'function') persistSlideDeckToActiveTab(deck);
  renderSlideDeckPreview(deck);
}

function deleteCurrentSlide() {
  const deck = APP_STATE.slideDeck;
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) return;
  if (deck.slides.length <= 1) {
    if (typeof displayToastNotification === 'function') displayToastNotification('A deck needs at least one slide.');
    return;
  }
  deck.slides.splice(_slideDeckCurrentIndex, 1);
  if (_slideDeckCurrentIndex >= deck.slides.length) _slideDeckCurrentIndex = deck.slides.length - 1;
  if (typeof persistSlideDeckToActiveTab === 'function') persistSlideDeckToActiveTab(deck);
  renderSlideDeckPreview(deck);
}

function addBulletToCurrentSlide() {
  const slide = _currentSlide();
  if (!slide) return;
  if (!Array.isArray(slide.bullets)) slide.bullets = [];
  if (slide.bullets.length >= SLIDE_DECK_MAX_BULLETS_PER_SLIDE) {
    if (typeof displayToastNotification === 'function') displayToastNotification(`A slide can have at most ${SLIDE_DECK_MAX_BULLETS_PER_SLIDE} points.`);
    return;
  }
  slide.bullets.push('New point');
  if (typeof persistSlideDeckToActiveTab === 'function') persistSlideDeckToActiveTab(APP_STATE.slideDeck);
  renderSlideDeckPreview(APP_STATE.slideDeck);
}

function deleteBulletFromCurrentSlide(idx) {
  const slide = _currentSlide();
  if (!slide || !Array.isArray(slide.bullets)) return;
  slide.bullets.splice(idx, 1);
  if (typeof persistSlideDeckToActiveTab === 'function') persistSlideDeckToActiveTab(APP_STATE.slideDeck);
  renderSlideDeckPreview(APP_STATE.slideDeck);
}

function setCurrentSlideAlign(align) {
  const slide = _currentSlide();
  if (!slide) return;
  slide.align = (align === 'left' || align === 'center' || align === 'right') ? align : null;
  if (typeof persistSlideDeckToActiveTab === 'function') persistSlideDeckToActiveTab(APP_STATE.slideDeck);
  renderSlideDeckPreview(APP_STATE.slideDeck);
}

// Text edits update the in-memory model on every keystroke (so nothing is
// lost) but only re-render the thumbnail label, not the whole canvas — a
// full re-render would blow away the caret position mid-typing. The fuller
// persist-to-tab-storage write happens on blur, not on every keystroke.
function onSlideTitleInput(el) {
  const slide = _currentSlide();
  if (!slide) return;
  slide.title = (el.innerText || '').trim();
  const rail = document.getElementById('slide-thumbnail-rail');
  const titleEl = rail ? rail.querySelectorAll('.slide-thumb-title')[_slideDeckCurrentIndex] : null;
  if (titleEl) titleEl.textContent = slide.title || '\u00A0';
}
function onSlideTitleBlur(el) {
  onSlideTitleInput(el);
  if (typeof persistSlideDeckToActiveTab === 'function') persistSlideDeckToActiveTab(APP_STATE.slideDeck);
}
function onSlideBulletInput(idx, el) {
  const slide = _currentSlide();
  if (!slide || !Array.isArray(slide.bullets)) return;
  slide.bullets[idx] = (el.innerText || '').trim();
}
function onSlideBulletBlur(idx, el) {
  onSlideBulletInput(idx, el);
  if (typeof persistSlideDeckToActiveTab === 'function') persistSlideDeckToActiveTab(APP_STATE.slideDeck);
}

function goToSlide(index) {
  const deck = APP_STATE.slideDeck;
  if (!deck || !deck.slides[index]) return;
  _slideDeckCurrentIndex = index;
  const rail = document.getElementById('slide-thumbnail-rail');
  if (rail) {
    rail.querySelectorAll('.slide-thumb').forEach((el, i) => el.classList.toggle('active', i === index));
  }
  const counter = document.querySelector('.slide-counter');
  if (counter) counter.textContent = `${index + 1} / ${deck.slides.length}`;
  _renderCurrentSlideCanvas(deck);
}

function navigateSlide(direction) {
  const deck = APP_STATE.slideDeck;
  if (!deck || !deck.slides.length) return;
  let next = _slideDeckCurrentIndex + direction;
  if (next < 0) next = 0;
  if (next >= deck.slides.length) next = deck.slides.length - 1;
  goToSlide(next);
}

function viewSlideDeck() {
  if (!APP_STATE.slideDeck) {
    if (typeof displayToastNotification === 'function') displayToastNotification('No slide deck yet — use @Create Slides first.');
    return;
  }
  renderSlideDeckPreview(APP_STATE.slideDeck);
  if (typeof switchPreviewTab === 'function') switchPreviewTab('slides');
  openSlidePresentationMode();
}

// ========================================================================
// FULLSCREEN PRESENTATION MODE — read-only slideshow
// ========================================================================
// Triggered by the "Slides" header button (viewSlideDeck() above). This is
// a completely separate, locked-down view from the editable Slide Studio
// panel: nothing here is contenteditable, there are no delete/edit
// buttons, and text is not selectable — it exists purely to present the
// deck, never to modify it. Navigation: on-screen ‹ › arrows, clicking the
// left/right half of the screen, mouse-wheel scroll, and the keyboard
// (←/→/PageUp/PageDown/Space), plus Esc or the ✕ button to exit. A real
// browser Fullscreen API request is made so it takes over the whole
// screen; if that's denied/unsupported the fixed-position overlay still
// covers the entire viewport, so the feature degrades gracefully either
// way.
let _presentModeIndex = 0;
let _presentWheelLocked = false;

function openSlidePresentationMode() {
  const deck = APP_STATE.slideDeck;
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) {
    if (typeof displayToastNotification === 'function') displayToastNotification('No slide deck yet — use @Create Slides first.');
    return;
  }
  _presentModeIndex = Number.isInteger(_slideDeckCurrentIndex) ? _slideDeckCurrentIndex : 0;

  let overlay = document.getElementById('slide-present-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'slide-present-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="slide-present-stage" id="slide-present-stage">
      <button type="button" class="slide-present-close" id="slide-present-close" title="Exit presentation (Esc)" aria-label="Exit presentation">✕</button>
      <button type="button" class="slide-present-arrow slide-present-arrow-left" id="slide-present-arrow-prev" title="Previous slide" aria-label="Previous slide">‹</button>
      <div class="slide-present-canvas-wrap" id="slide-present-canvas-wrap"></div>
      <button type="button" class="slide-present-arrow slide-present-arrow-right" id="slide-present-arrow-next" title="Next slide" aria-label="Next slide">›</button>
      <div class="slide-present-counter" id="slide-present-counter"></div>
    </div>`;
  overlay.style.display = 'flex';

  _renderPresentSlide();

  const closeBtn = document.getElementById('slide-present-close');
  const prevArrow = document.getElementById('slide-present-arrow-prev');
  const nextArrow = document.getElementById('slide-present-arrow-next');
  const stage = document.getElementById('slide-present-stage');
  if (closeBtn) closeBtn.onclick = e => { e.stopPropagation(); closeSlidePresentationMode(); };
  if (prevArrow) prevArrow.onclick = e => { e.stopPropagation(); _presentNavigate(-1); };
  if (nextArrow) nextArrow.onclick = e => { e.stopPropagation(); _presentNavigate(1); };
  if (stage) {
    stage.onclick = _onPresentStageClick;
    stage.addEventListener('wheel', _onPresentWheel, { passive: true });
  }
  document.addEventListener('keydown', _onPresentKeydown);
  document.addEventListener('fullscreenchange', _onPresentFullscreenChange);

  if (stage && stage.requestFullscreen) {
    stage.requestFullscreen().catch(() => { /* denied/unsupported — the fixed overlay still fills the viewport */ });
  }
}

function _renderPresentSlide() {
  const deck = APP_STATE.slideDeck;
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) return;
  if (_presentModeIndex < 0) _presentModeIndex = 0;
  if (_presentModeIndex >= deck.slides.length) _presentModeIndex = deck.slides.length - 1;

  const wrap = document.getElementById('slide-present-canvas-wrap');
  if (wrap) wrap.innerHTML = _buildSlideCanvasHTML(deck.slides[_presentModeIndex], false);

  const counter = document.getElementById('slide-present-counter');
  if (counter) counter.textContent = `${_presentModeIndex + 1} / ${deck.slides.length}`;
  const prevArrow = document.getElementById('slide-present-arrow-prev');
  const nextArrow = document.getElementById('slide-present-arrow-next');
  if (prevArrow) prevArrow.disabled = _presentModeIndex === 0;
  if (nextArrow) nextArrow.disabled = _presentModeIndex === deck.slides.length - 1;

  // Keep the editable Slide Studio panel pointed at the same slide, so
  // closing presentation mode lands exactly where it left off.
  _slideDeckCurrentIndex = _presentModeIndex;
}

function _presentNavigate(direction) {
  const deck = APP_STATE.slideDeck;
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) return;
  _presentModeIndex += direction;
  _renderPresentSlide();
}

// Clicking the left half of the screen goes to the previous slide, the
// right half to the next — except clicks on the ✕/‹/› controls themselves,
// which already have their own handlers (and their own stopPropagation).
function _onPresentStageClick(e) {
  if (e.target.closest('.slide-present-close') || e.target.closest('.slide-present-arrow')) return;
  const stage = document.getElementById('slide-present-stage');
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  const relX = e.clientX - rect.left;
  _presentNavigate(relX < rect.width / 2 ? -1 : 1);
}

// One slide change per scroll gesture: a single wheel/trackpad swipe fires
// many 'wheel' events in quick succession, so a short lock after each
// navigation prevents skipping several slides from one gesture.
function _onPresentWheel(e) {
  if (_presentWheelLocked) return;
  const delta = e.deltaY || e.detail || 0;
  if (Math.abs(delta) < 4) return;
  _presentWheelLocked = true;
  _presentNavigate(delta > 0 ? 1 : -1);
  setTimeout(() => { _presentWheelLocked = false; }, 450);
}

function _onPresentKeydown(e) {
  if (e.key === 'Escape') { closeSlidePresentationMode(); return; }
  if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); _presentNavigate(1); return; }
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); _presentNavigate(-1); }
}

// If the user exits fullscreen through the browser's own control (Esc,
// swipe-down on mobile, etc.) rather than our ✕ button, tear the overlay
// down the same way so no stale full-viewport layer is left behind.
function _onPresentFullscreenChange() {
  if (!document.fullscreenElement) closeSlidePresentationMode();
}

function closeSlidePresentationMode() {
  const overlay = document.getElementById('slide-present-overlay');
  if (overlay) { overlay.style.display = 'none'; overlay.innerHTML = ''; }
  document.removeEventListener('keydown', _onPresentKeydown);
  document.removeEventListener('fullscreenchange', _onPresentFullscreenChange);
  if (document.fullscreenElement) {
    try { document.exitFullscreen(); } catch (_) { /* already exiting / unsupported */ }
  }
  if (typeof renderSlideDeckPreview === 'function') renderSlideDeckPreview(APP_STATE.slideDeck);
}

// ========================================================================
// SLIDE DECK -> TRUE PDF (native browser print, original 16:9 slide size)
// ========================================================================
// This deliberately mirrors the document pipeline's "True PDF" approach
// (native browser print, see pdf-export.js:exportToHighQualityPDF) rather
// than the "Image PDF" approach (html2canvas + jsPDF raster). A rasterized
// slide would produce an oversized, blurry-on-zoom PDF; native print keeps
// text selectable/vector and lets the browser's Save-as-PDF engine emit a
// real PDF. The one thing that must NOT happen is falling back to the A4
// page size the document pipeline uses everywhere else — a slide deck's
// natural page size is its own 16:9 layout (matches the PPTX export's
// AIPDF_16x9 layout: 10in x 5.63in), not 210mm x 297mm.
const SLIDE_PDF_PAGE_WIDTH_IN = 10;
const SLIDE_PDF_PAGE_HEIGHT_IN = 5.63;

function buildSlideDeckPDFDocument(deck) {
  const W = SLIDE_PDF_PAGE_WIDTH_IN, H = SLIDE_PDF_PAGE_HEIGHT_IN;
  const slidesHTML = deck.slides.map(s => {
    const isTitleOnly = _isTitleOnlySlide(s);
    const align = s.align || (isTitleOnly ? 'center' : 'left');
    const bulletsHTML = (s.bullets && s.bullets.length)
      ? `<ul class="slide-pdf-bullets">${s.bullets.map(b => `<li>${_escSlideHtml(b)}</li>`).join('')}</ul>`
      : '';
    const visualHTML = s.visualSVG ? `<div class="slide-pdf-visual">${s.visualSVG}</div>` : '';
    const bgPreset = _resolveSlideBackground(s);
    const pageStyle = `text-align:${align};${bgPreset ? `background:${bgPreset.css};` : ''}`;
    const darkCls = bgPreset && bgPreset.dark ? ' slide-pdf-dark-text' : '';
    return `<section class="slide-pdf-page${isTitleOnly ? ' slide-pdf-title-page' : ''}${darkCls}" style="${pageStyle}">
      <div class="slide-pdf-accent-bar" aria-hidden="true"></div>
      <div class="slide-pdf-title" style="text-align:${align};">${_escSlideHtml(s.title)}</div>
      ${visualHTML}
      ${bulletsHTML}
    </section>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${_escSlideHtml(deck.title || 'Slides')}</title>
  <style>
    /* Exact slide size, not A4 — this @page rule is what makes "Save as
       PDF" from the print dialog emit pages at the deck's own dimensions
       instead of the browser's default paper size. */
    @page { size: ${W}in ${H}in; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    html, body { margin: 0; padding: 0; background: #f3f4f6; }
    body { font-family: Arial, Helvetica, sans-serif; }
    .slide-pdf-page {
      width: ${W}in; height: ${H}in;
      margin: 0 auto 14px;
      padding: 0.5in 0.65in;
      background: #ffffff;
      color: #1f2937;
      display: flex;
      flex-direction: column;
      gap: 0.18in;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      position: relative;
    }
    .slide-pdf-page:last-child { page-break-after: auto; break-after: auto; margin-bottom: 0; }
    .slide-pdf-title-page { align-items: center; justify-content: center; }
    .slide-pdf-accent-bar { width: 0.55in; height: 0.045in; border-radius: 3px; background: linear-gradient(90deg,#4f7df3,#7aa2ff); margin-bottom: 0.02in; }
    .slide-pdf-title-page .slide-pdf-accent-bar { display: none; }
    .slide-pdf-title { font-size: 26pt; font-weight: 700; color: #111827; line-height: 1.25; letter-spacing: -0.01em; }
    .slide-pdf-title-page .slide-pdf-title { font-size: 34pt; text-align: center; }
    .slide-pdf-bullets { margin: 0; padding-left: 0.32in; font-size: 14pt; color: #374151; line-height: 1.45; }
    .slide-pdf-bullets li { margin: 0.08in 0; }
    .slide-pdf-visual { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; }
    .slide-pdf-visual svg { max-width: 100%; max-height: 100%; }
    .slide-pdf-dark-text, .slide-pdf-dark-text .slide-pdf-title { color: #f8fafc; }
    .slide-pdf-dark-text .slide-pdf-bullets { color: #e2e8f0; }
    .slide-pdf-dark-text .slide-pdf-accent-bar { background: linear-gradient(90deg,#ffffff,#cbd5e1); }
    @media print {
      html, body { background: #ffffff !important; }
      .slide-pdf-page { margin: 0 !important; box-shadow: none !important; }
    }
    @media screen {
      body { padding: 16px 0; display: flex; flex-direction: column; align-items: center; }
      .slide-pdf-page { box-shadow: 0 10px 24px -14px rgba(15,23,42,0.35); }
    }
  </style></head>
  <body>${slidesHTML}
  <script>
    window.addEventListener('load', function () {
      window.parent && window.parent.postMessage('slide-pdf-iframe-ready', '*');
    });
  <\/script>
  </body></html>`;
}

async function exportSlideDeckToPdf(btn) {
  const deck = APP_STATE.slideDeck;
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) {
    if (typeof displayToastNotification === 'function') displayToastNotification('No slide deck to export yet — use @Create Slides first.');
    return;
  }
  if (typeof window.print !== 'function') {
    if (typeof displayToastNotification === 'function') displayToastNotification('⚠️ True PDF requires the browser Print / Save as PDF engine.');
    return;
  }

  if (typeof _setExportButtonBusy === 'function') _setExportButtonBusy(btn, true, 'PDF');
  else if (btn) btn.disabled = true;

  // A dedicated, throwaway iframe — deliberately NOT the document
  // pipeline's #pdf-iframe/#pdf-view-container, since those are wired to
  // A4 document preview state and would drag that sizing/logic in here.
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    window.removeEventListener('message', onMessage);
    window.removeEventListener('afterprint', cleanup);
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    if (typeof _setExportButtonBusy === 'function') _setExportButtonBusy(btn, false);
    else if (btn) btn.disabled = false;
  };

  const runPrint = () => {
    if (finished) return;
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      console.error('[Slide Studio] slide PDF print failed:', e);
      if (typeof displayToastNotification === 'function') displayToastNotification('True PDF export failed: ' + (e.message || e));
      cleanup();
      return;
    }
    // The print dialog blocks this thread on most desktop browsers, so by
    // the time control returns here the user has already printed or
    // cancelled — safe to tear down shortly after either way.
    setTimeout(cleanup, 500);
  };

  const onMessage = (e) => {
    if (e.source === iframe.contentWindow && e.data === 'slide-pdf-iframe-ready') runPrint();
  };
  window.addEventListener('message', onMessage);
  window.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(() => { if (!finished) runPrint(); }, 1200);
  setTimeout(cleanup, 8000);

  try {
    iframe.srcdoc = buildSlideDeckPDFDocument(deck);
  } catch (e) {
    console.error('[Slide Studio] slide PDF build failed:', e);
    if (typeof displayToastNotification === 'function') displayToastNotification('True PDF export failed: ' + (e.message || e));
    cleanup();
  }
}

// ===== SVG -> PNG RASTERIZATION (PowerPoint cannot embed raw SVG) =====
function rasterizeSvgToPngDataUrl(svgString, targetWidthPx, targetHeightPx) {
  return new Promise((resolve) => {
    try {
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(targetWidthPx || img.width || 700));
          canvas.height = Math.max(1, Math.round(targetHeightPx || img.height || 400));
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/png'));
        } catch (e) {
          console.warn('[SlideStudio] rasterize draw failed:', e);
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    } catch (e) {
      console.warn('[SlideStudio] rasterize failed:', e);
      resolve(null);
    }
  });
}

// ===== PPTX EXPORT =====
async function exportSlideDeckToPptx() {
  const deck = APP_STATE.slideDeck;
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) {
    if (typeof displayToastNotification === 'function') displayToastNotification('No slide deck to export yet — use @Create Slides first.');
    return;
  }
  if (typeof window.PptxGenJS === 'undefined') {
    if (typeof displayToastNotification === 'function') displayToastNotification('PowerPoint export library failed to load. Check your connection and try again.');
    return;
  }

  if (typeof displayToastNotification === 'function') displayToastNotification('Building PowerPoint file…');

  try {
    const pptx = new window.PptxGenJS();
    pptx.defineLayout({ name: 'AIPDF_16x9', width: 10, height: 5.63 });
    pptx.layout = 'AIPDF_16x9';

    const ACCENT = '4F7DF3';
    const DARK = '1F2937';

    for (let i = 0; i < deck.slides.length; i++) {
      const s = deck.slides[i];
      const slide = pptx.addSlide();
      const isTitleOnly = (!s.bullets || !s.bullets.length) && !s.visualSVG;
      const textAlign = s.align || (isTitleOnly ? 'center' : 'left');

      // Background: PptxGenJS slide backgrounds only support a solid fill,
      // not a CSS gradient — the `pptx` field on each SLIDE_BACKGROUNDS
      // preset is a representative solid-color approximation of it.
      const bgPreset = (typeof _resolveSlideBackground === 'function') ? _resolveSlideBackground(s) : null;
      if (bgPreset) slide.background = { color: bgPreset.pptx };
      const textColor = bgPreset && bgPreset.dark ? 'FFFFFF' : DARK;
      const bulletColor = bgPreset && bgPreset.dark ? 'F1F5F9' : DARK;
      const accentColor = bgPreset && bgPreset.dark ? 'FFFFFF' : ACCENT;

      if (isTitleOnly) {
        slide.addText(s.title || deck.title || '', {
          x: 0.6, y: 2.2, w: 8.8, h: 1.4, align: textAlign, fontSize: 36, bold: true, color: textColor, fontFace: 'Arial'
        });
        if (textAlign === 'center') slide.addShape('rect', { x: 3.9, y: 3.55, w: 2.2, h: 0.06, fill: { color: accentColor } });
        continue;
      }

      slide.addText(s.title || '', { x: 0.5, y: 0.35, w: 9.0, h: 0.8, fontSize: 26, bold: true, color: textColor, fontFace: 'Arial', align: textAlign });
      slide.addShape('rect', { x: 0.5, y: 1.08, w: 1.3, h: 0.05, fill: { color: accentColor } });

      let contentTop = 1.35;
      if (s.visualSVG) {
        const png = await rasterizeSvgToPngDataUrl(s.visualSVG, 900, 500);
        if (png) {
          const hasBullets = s.bullets && s.bullets.length;
          if (hasBullets) {
            slide.addImage({ data: png, x: 5.15, y: 1.35, w: 4.35, h: 3.9 * (500 / 900) });
          } else {
            slide.addImage({ data: png, x: 0.9, y: 1.35, w: 8.2, h: 8.2 * (500 / 900) });
          }
        }
      }

      if (s.bullets && s.bullets.length) {
        const bulletWidth = s.visualSVG ? 4.35 : 9.0;
        slide.addText(
          s.bullets.map(b => ({ text: b, options: { bullet: true, breakLine: true } })),
          { x: 0.5, y: contentTop, w: bulletWidth, h: 3.9, fontSize: 16, color: bulletColor, fontFace: 'Arial', valign: 'top' }
        );
      }
    }

    const safeName = (deck.title || 'slides').replace(/[^\w\-\u0980-\u09FF ]+/g, '').trim().slice(0, 60) || 'slides';
    await pptx.writeFile({ fileName: `${safeName}.pptx` });
    if (typeof displayToastNotification === 'function') displayToastNotification('✅ PowerPoint file downloaded.');
  } catch (e) {
    console.error('[Slide Studio] pptx export failed:', e);
    if (typeof displayToastNotification === 'function') displayToastNotification(`PowerPoint export failed: ${e.message || e}`);
  }
}

// ============================================================
// WINDOW EXPOSURE — Slide Studio
// ============================================================
window.buildSlideDeckRules = buildSlideDeckRules;
window.sanitizeSlideDeckJSON = sanitizeSlideDeckJSON;
window.resolveSlideVisualSVG = resolveSlideVisualSVG;
window.generateSlideDeckDirectMode = generateSlideDeckDirectMode;
window.renderSlideDeckPreview = renderSlideDeckPreview;
window.goToSlide = goToSlide;
window.navigateSlide = navigateSlide;
window.viewSlideDeck = viewSlideDeck;
window.openSlidePresentationMode = openSlidePresentationMode;
window.closeSlidePresentationMode = closeSlidePresentationMode;
window.rasterizeSvgToPngDataUrl = rasterizeSvgToPngDataUrl;
window.exportSlideDeckToPptx = exportSlideDeckToPptx;
window.exportSlideDeckToPdf = exportSlideDeckToPdf;
window.buildSlideDeckPDFDocument = buildSlideDeckPDFDocument;
window.persistSlideDeckToActiveTab = persistSlideDeckToActiveTab;
window.addSlideAfterCurrent = addSlideAfterCurrent;
window.deleteCurrentSlide = deleteCurrentSlide;
window.addBulletToCurrentSlide = addBulletToCurrentSlide;
window.deleteBulletFromCurrentSlide = deleteBulletFromCurrentSlide;
window.setCurrentSlideAlign = setCurrentSlideAlign;
window.onSlideTitleInput = onSlideTitleInput;
window.onSlideTitleBlur = onSlideTitleBlur;
window.onSlideBulletInput = onSlideBulletInput;
window.onSlideBulletBlur = onSlideBulletBlur;
window.SLIDE_BACKGROUNDS = SLIDE_BACKGROUNDS;
window.getSlideBackgroundById = getSlideBackgroundById;
window.toggleSlideBackgroundPicker = toggleSlideBackgroundPicker;
window.setCurrentSlideBackground = setCurrentSlideBackground;
window.applyCurrentBackgroundToAllSlides = applyCurrentBackgroundToAllSlides;
window.getSlideAutoBackgroundEnabled = getSlideAutoBackgroundEnabled;
window.setSlideAutoBackgroundEnabled = setSlideAutoBackgroundEnabled;
window.toggleSlideAutoBackground = toggleSlideAutoBackground;
window.setCustomBgScope = setCustomBgScope;
window.startCustomSlideBackgroundCommand = startCustomSlideBackgroundCommand;
window.applyCustomSlideBackgroundViaAI = applyCustomSlideBackgroundViaAI;
window.startSlideAIEditCommand = startSlideAIEditCommand;
window.editSingleSlideViaAI = editSingleSlideViaAI;
window.triggerSlideImageUpload = triggerSlideImageUpload;
window.handleSlideImageFileSelected = handleSlideImageFileSelected;
window.clearCurrentSlideVisual = clearCurrentSlideVisual;