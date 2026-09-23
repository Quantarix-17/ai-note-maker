// ========================================================================
// DIAGRAM TEMPLATE LIBRARY
// ========================================================================
// A freehand AI-drawn SVG can misjudge coordinates: a vessel that ends a
// few units short of the chamber it enters, an arrowhead pointing the
// wrong way, a valve floating beside a junction instead of sitting on it.
// For a small set of very commonly requested, well-known subjects, this
// file supplies a FIXED, hand-authored, pre-verified SVG asset instead of
// asking the AI to redraw the anatomy from scratch every time.
//
// Construction discipline used in every template here:
//   1. Every physically-joined part (a vessel entering a chamber, a branch
//      leaving a trunk) is drawn with deliberate coordinate OVERLAP, and
//      thick vessel/branch strokes use round line-caps so two segments
//      that share a junction point always render as one continuous tube
//      instead of two abutting shapes with a visible seam.
//   2. Chambers/organs are drawn as shapes INSET inside a single solid
//      outer body/silhouette path, so there is never a "does this piece
//      touch that piece" question for the main structure — the outer
//      shape is one continuous path and everything else sits on top of
//      or inside it.
//   3. Every label's leader line targets an exact coordinate that was
//      chosen to match the real feature drawn at that spot — not guessed.
//   4. Flow arrows are authored so the path's own start→end direction is
//      the true direction of blood flow, so the marker orientation is
//      correct by construction rather than by chance.
//
// See buildSharedRules() in app.js for how the AI is told to defer to
// this library instead of hand-drawing these specific subjects.
// ========================================================================

const DIAGRAM_TEMPLATES = {
  human_heart: {
    id: 'human_heart',
    label: 'Human heart (internal cross-section, labeled)',
    keywords: [
      'heart', 'human heart', 'cardiac', 'heart anatomy', 'heart diagram',
      'heart cross section', 'heart cross-section', 'chambers of the heart',
      'হার্ট', 'হৃদপিণ্ড', 'হৃৎপিণ্ড', 'হৃদযন্ত্র', 'হৃৎযন্ত্র'
    ],
    render: renderHumanHeartDiagram
  }
  // Add more well-known subjects here over time (plant cell, animal cell,
  // water cycle, human eye, brain, DNA double helix, ...) following the
  // same { id, label, keywords, render() } shape. Each render() function
  // must return one self-contained <svg ...>...</svg> string with no
  // external assets, matching the technical rules in app.js section 3.
};

// ===== PROMPT-FACING CATALOG STRING =====
function getDiagramTemplateCatalogForPrompt() {
  try {
    return Object.values(DIAGRAM_TEMPLATES)
      .map(t => `${t.id} — matches requests like: ${t.keywords.slice(0, 5).join(', ')}`)
      .join('\n      ');
  } catch (e) {
    return '';
  }
}

// ===== PLACEHOLDER SUBSTITUTION =====
// Replaces every <!--DIAGRAM_TEMPLATE:id--> comment left by the AI with
// the real, verified SVG markup for that id. Left untouched (safe no-op)
// if the id is unknown, so a malformed/hallucinated id never breaks the
// document — worst case the placeholder comment is simply invisible HTML.
function injectDiagramTemplates(html) {
  if (!html || typeof html !== 'string' || html.indexOf('DIAGRAM_TEMPLATE:') === -1) return html;
  return html.replace(/<!--\s*DIAGRAM_TEMPLATE:([a-zA-Z0-9_]+)\s*-->/g, function(match, id) {
    const tpl = DIAGRAM_TEMPLATES[id];
    if (!tpl || typeof tpl.render !== 'function') return match;
    try {
      return tpl.render();
    } catch (e) {
      console.warn('[DiagramLibrary] render failed for', id, e);
      return match;
    }
  });
}

// ========================================================================
// TEMPLATE: HUMAN HEART — internal cross-sectional anatomy, labeled
// viewBox: 0 0 760 720. Heart artwork occupies roughly x 165-600, y 65-655.
// Left label column = right-heart / venous structures (blue).
// Right label column = left-heart / arterial structures (red).
// ========================================================================
function renderHumanHeartDiagram() {
  const leftLabels = [
    { text: 'Superior Vena Cava', tx: 275, ty: 75 },
    { text: 'Right Atrium', tx: 270, ty: 205 },
    { text: 'Tricuspid Valve', tx: 280, ty: 310 },
    { text: 'Right Ventricle', tx: 260, ty: 460 },
    { text: 'Inferior Vena Cava', tx: 222, ty: 605 }
  ];
  const rightLabels = [
    { text: 'Aortic Arch', tx: 300, ty: 70 },
    { text: 'Pulmonary Artery', tx: 366, ty: 208 },
    { text: 'Pulmonary Veins', tx: 505, ty: 210 },
    { text: 'Left Atrium', tx: 470, ty: 230 },
    { text: 'Mitral (Bicuspid) Valve', tx: 460, ty: 310 },
    { text: 'Left Ventricle', tx: 460, ty: 470 },
    { text: 'Interventricular Septum', tx: 388, ty: 560 }
  ];

  const leftBoxX = 15, leftBoxW = 150;
  const rightBoxX = 605, rightBoxW = 150;
  const boxH = 30;
  const leftYs = [40, 165, 290, 415, 555];
  const rightYs = [30, 115, 200, 285, 370, 460, 560];

  function leftBox(i) {
    const l = leftLabels[i], y = leftYs[i];
    const cx = leftBoxX + leftBoxW / 2, cy = y + boxH / 2;
    return `<g>
      <rect x="${leftBoxX}" y="${y}" width="${leftBoxW}" height="${boxH}" rx="7" fill="#ffffff" stroke="#2f5fa0" stroke-width="1.6"/>
      <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="600" fill="#204a80">${l.text}</text>
      <line x1="${leftBoxX + leftBoxW}" y1="${cy}" x2="${l.tx}" y2="${l.ty}" stroke="#5c6b85" stroke-width="1.3"/>
      <circle cx="${l.tx}" cy="${l.ty}" r="4" fill="#2f5fa0"/>
    </g>`;
  }
  function rightBox(i) {
    const l = rightLabels[i], y = rightYs[i];
    const cx = rightBoxX + rightBoxW / 2, cy = y + boxH / 2;
    const isSeptum = l.text.indexOf('Septum') !== -1;
    const col = isSeptum ? '#4b5563' : '#b3222c';
    return `<g>
      <rect x="${rightBoxX}" y="${y}" width="${rightBoxW}" height="${boxH}" rx="7" fill="#ffffff" stroke="${col}" stroke-width="1.6"/>
      <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="600" fill="${col}">${l.text}</text>
      <line x1="${rightBoxX}" y1="${cy}" x2="${l.tx}" y2="${l.ty}" stroke="#5c6b85" stroke-width="1.3"/>
      <circle cx="${l.tx}" cy="${l.ty}" r="4" fill="${col}"/>
    </g>`;
  }

  return `<svg viewBox="0 0 760 720" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">
  <defs>
    <marker id="heartArrowBlue" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="13" markerHeight="13" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#2f5fa0"/>
    </marker>
    <marker id="heartArrowRed" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="13" markerHeight="13" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#b3222c"/>
    </marker>
    <linearGradient id="heartMyo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8a2430"/>
      <stop offset="100%" stop-color="#6d1a24"/>
    </linearGradient>
  </defs>

  <!-- ===== OUTER MYOCARDIUM — one continuous closed path; chambers are
       drawn as inset shapes INSIDE it, so there is no seam/connectivity
       question for the main body of the organ. ===== -->
  <path d="M 260,80 C 210,70 185,110 195,155 C 200,180 215,200 235,215
           C 200,235 175,270 170,320 C 165,400 190,470 225,525
           C 265,585 320,630 375,648 C 385,652 395,652 400,650
           C 460,628 515,580 550,520 C 585,465 600,400 590,325
           C 585,272 555,235 520,215 C 542,200 558,178 560,152
           C 566,108 540,68 492,78 C 452,86 428,120 420,160
           C 410,135 395,120 380,120 C 365,120 350,135 340,160
           C 332,120 308,86 260,80 Z"
        fill="url(#heartMyo)" stroke="#4a0f18" stroke-width="3"/>

  <!-- ===== CHAMBERS (inset inside the myocardium above; no gap issue by
       construction — they are enclosed shapes, not separately glued-on
       pieces). Right side = blue family, left side = red family. ===== -->
  <path d="M 210,190 C 205,150 240,130 280,135 C 320,140 345,165 350,205
           C 353,235 335,260 300,268 C 260,276 220,255 210,220
           C 206,210 208,198 210,190 Z" fill="#cfe3f7" stroke="#5b87b8" stroke-width="2"/>
  <path d="M 200,320 C 190,400 205,470 235,530 C 260,575 300,610 345,630
           C 365,638 385,635 393,620 C 375,560 368,480 372,400
           C 374,350 372,310 360,285 C 320,270 250,280 210,300
           C 205,305 202,312 200,320 Z" fill="#7fa8d9" stroke="#3f6fb0" stroke-width="2"/>
  <path d="M 410,205 C 407,165 435,138 478,133 C 518,130 550,150 555,190
           C 558,222 540,250 505,262 C 468,274 430,252 415,222
           C 411,214 409,210 410,205 Z" fill="#f7d9d9" stroke="#c98080" stroke-width="2"/>
  <path d="M 390,300 C 430,280 500,275 550,295 C 575,308 588,330 585,365
           C 580,430 565,490 540,545 C 505,610 455,640 405,650
           C 398,652 393,648 393,638 C 388,560 388,480 388,400
           C 388,360 388,325 390,300 Z" fill="#d97f7f" stroke="#a5453f" stroke-width="2"/>

  <!-- Interventricular septum reinforcement line (purely visual divider
       on top of the two ventricle fills, at their shared boundary). -->
  <path d="M 382,150 C 378,260 376,360 382,460 C 386,530 392,590 398,645"
        fill="none" stroke="#5c1420" stroke-width="4" stroke-linecap="round" opacity="0.55"/>

  <!-- ===== ATRIOVENTRICULAR VALVES — drawn ON the chamber junction they
       belong to, so placement is correct by construction. ===== -->
  <ellipse cx="280" cy="288" rx="46" ry="9" fill="none" stroke="#d19a2a" stroke-width="3"/>
  <path d="M 250,288 L 280,326 L 310,288" fill="none" stroke="#d19a2a" stroke-width="2.5" stroke-linecap="round"/>
  <ellipse cx="470" cy="288" rx="46" ry="9" fill="none" stroke="#d19a2a" stroke-width="3"/>
  <path d="M 440,288 L 470,324 L 500,288" fill="none" stroke="#d19a2a" stroke-width="2.5" stroke-linecap="round"/>

  <!-- ===== GREAT VESSELS — every proximal end is drawn OVERLAPPING well
       inside the chamber it connects to (round-capped thick strokes), so
       nothing reads as a floating/detached stub. ===== -->
  <!-- Superior vena cava -> right atrium (flow: down, into RA) -->
  <path d="M 270,20 C 265,70 265,120 278,168" fill="none" stroke="#3f6fb0" stroke-width="32" stroke-linecap="round" marker-end="url(#heartArrowBlue)"/>
  <!-- Inferior vena cava -> right atrium (flow: up, into RA) -->
  <path d="M 215,655 C 195,560 190,460 200,380 C 208,325 218,282 233,258" fill="none" stroke="#3f6fb0" stroke-width="28" stroke-linecap="round" marker-end="url(#heartArrowBlue)"/>
  <!-- Aorta: left ventricle -> ascending -> arch -> branches + descending (flow: out). Drawn BEHIND the pulmonary artery, matching real anatomy where the pulmonary trunk crosses in front of the aortic arch. -->
  <path d="M 395,310 C 392,270 390,232 392,196" fill="none" stroke="#b3222c" stroke-width="26" stroke-linecap="round"/>
  <path d="M 392,196 C 386,146 358,100 300,80 C 278,73 252,72 228,80" fill="none" stroke="#b3222c" stroke-width="24" stroke-linecap="round"/>
  <path d="M 278,74 C 277,56 277,42 277,30" fill="none" stroke="#b3222c" stroke-width="12" stroke-linecap="round" marker-end="url(#heartArrowRed)"/>
  <path d="M 250,75 C 246,58 244,44 242,32" fill="none" stroke="#b3222c" stroke-width="12" stroke-linecap="round" marker-end="url(#heartArrowRed)"/>
  <path d="M 230,82 C 222,68 214,54 208,42" fill="none" stroke="#b3222c" stroke-width="12" stroke-linecap="round" marker-end="url(#heartArrowRed)"/>
  <path d="M 228,80 C 205,92 188,116 182,150" fill="none" stroke="#b3222c" stroke-width="17" stroke-linecap="round" marker-end="url(#heartArrowRed)"/>
  <!-- Pulmonary artery: right ventricle -> forks to both lungs (flow: out). Drawn ON TOP of / crossing the aorta, so both vessels stay clearly visible. -->
  <path d="M 335,320 C 340,280 348,244 362,214" fill="none" stroke="#3f6fb0" stroke-width="26" stroke-linecap="round"/>
  <path d="M 366,208 C 352,190 330,168 305,150" fill="none" stroke="#3f6fb0" stroke-width="19" stroke-linecap="round" marker-end="url(#heartArrowBlue)"/>
  <path d="M 366,208 C 388,188 415,166 432,140" fill="none" stroke="#3f6fb0" stroke-width="19" stroke-linecap="round" marker-end="url(#heartArrowBlue)"/>
  <!-- Pulmonary veins: lungs -> left atrium (flow: into LA) -->
  <path d="M 562,172 C 542,176 520,182 503,197" fill="none" stroke="#d98a8a" stroke-width="16" stroke-linecap="round" marker-end="url(#heartArrowRed)"/>
  <path d="M 562,226 C 542,229 520,233 503,248" fill="none" stroke="#d98a8a" stroke-width="16" stroke-linecap="round" marker-end="url(#heartArrowRed)"/>

  <!-- ===== LABELS ===== -->
  ${leftLabels.map((_, i) => leftBox(i)).join('\n  ')}
  ${rightLabels.map((_, i) => rightBox(i)).join('\n  ')}
</svg>`;
}

// ============================================================
// WINDOW EXPOSURE — Diagram Library
// ============================================================
window.DIAGRAM_TEMPLATES = DIAGRAM_TEMPLATES;
window.injectDiagramTemplates = injectDiagramTemplates;
window.getDiagramTemplateCatalogForPrompt = getDiagramTemplateCatalogForPrompt;
