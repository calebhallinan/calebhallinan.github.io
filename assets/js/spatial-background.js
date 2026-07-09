/* Spatial-transcriptomics background.
 *
 * Draws softly-outlined cell-like shapes (rounded or mildly oval, not perfect
 * circles/ellipses) scattered evenly across the viewport (jittered-grid
 * placement — see build() — so cells spread out rather than clumping the way
 * pure random placement would at this density). Each cell has a smooth,
 * gently irregular membrane, a faint cytoplasmic gradient, a nucleus-like
 * region, and a handful of small colored dots evoking per-cell mRNA/transcript
 * counts. Cells drift gently and ease away from the cursor, then spring back home.
 *
 * Shape: cells are mostly-round or mildly-oval with a smooth, restrained
 * amount of membrane irregularity — see makeBlobPoints() and the archetype
 * selection in build(). Deliberately excludes strongly elongated/squamous
 * forms and amoeboid/concave outlines: those read as distracting rather than
 * "biologically plausible but restrained."
 *
 * Text-aware dimming (no boxes): rather than a CSS background panel behind
 * headings/paragraphs, this script tracks the on-screen position of text
 * elements (see refreshTextDimming()) and fades cells smoothly down to a low
 * alpha when their home position falls near one, brightening again in the
 * gaps between text blocks. There is no hard edge — dimming is interpolated
 * over a feather zone around each text element's bounding box, so nothing
 * reads as a rectangular overlay.
 *
 * Design goals: subtle, professional, and legible behind text, while staying
 * visible everywhere (including near text) rather than disappearing under a
 * panel. This script keeps its own base opacities low so bare paragraph text
 * never fights the background even before dimming is applied.
 *
 * Density / performance tradeoff:
 *  - Cell/dot counts are tiered by viewport width (mobile < tablet < desktop),
 *    since a 60fps animation loop redrawing thousands of dot/gradient/stroke
 *    ops per frame is far more affordable on a laptop GPU than a phone.
 *  - The single most expensive per-cell operation is building a CanvasGradient,
 *    so each cell's gradient is created once (in build()/refreshGradients())
 *    and reused every frame instead of being reallocated 60x/sec — this is
 *    what makes the higher desktop density feasible at all. Canvas gradients
 *    are evaluated in whatever transform is active at fill() time, so a
 *    gradient built in a cell's local origin (0,0) still paints correctly
 *    after per-frame ctx.translate()/ctx.rotate() to the cell's position.
 *  - Text-region dimming is computed per cell from its stable home position,
 *    not recalculated every animation frame: refreshTextDimming() runs only
 *    on scroll/resize (throttled via requestAnimationFrame), so the 60fps
 *    loop just multiplies a cached number into globalAlpha — negligible cost.
 *
 * Accessibility / performance:
 *  - The <canvas> is aria-hidden and pointer-events:none (see CSS), so it never
 *    blocks clicks/selection and is ignored by screen readers.
 *  - Honors prefers-reduced-motion: renders a single static frame, no animation loop.
 *  - Caps devicePixelRatio and cell count; pauses when the tab is hidden.
 *  - Re-reads its color palette (and rebuilds cached gradients) on theme change.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("spatial-bg");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var dpr = Math.min(window.devicePixelRatio || 1, 2); // cap for performance

  var W = 0, H = 0;
  var cells = [];
  var pointer = { x: -9999, y: -9999, active: false };
  var rafId = null;
  var running = false;
  var palette = {};

  var TWO_PI = Math.PI * 2;

  // Cells at/inside a text element's box fade to this alpha; farther than
  // TEXT_FEATHER px away they're back to full strength, smoothly in between.
  var TEXT_MIN_ALPHA = 0.1;
  var TEXT_FEATHER = 80;

  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smoothstep(t) { return t * t * (3 - 2 * t); }

  // Pull colors from the active theme so both light and dark look right.
  function readPalette() {
    var isLight = document.documentElement.getAttribute("data-theme") === "light";
    var cs = getComputedStyle(document.documentElement);
    var accent = (cs.getPropertyValue("--accent") || "#f2994a").trim();

    palette.membrane = isLight ? "rgba(30,35,40,0.10)" : "rgba(255,255,255,0.075)";
    palette.cytoplasmCenter = isLight ? "rgba(30,35,40,0.035)" : "rgba(255,255,255,0.030)";
    palette.cytoplasmEdge = isLight ? "rgba(30,35,40,0.006)" : "rgba(255,255,255,0.004)";
    palette.nucleus = isLight ? "rgba(30,35,40,0.05)" : "rgba(255,255,255,0.045)";
    // Muted transcript-dot colors; accent leads, secondaries stay quiet.
    palette.dots = isLight
      ? [accent, "#3f6f8f", "#6d7f72", "#9c7a3d", "#7a6d8f"]
      : [accent, "#7fb3d5", "#8fb3a0", "#c9a26b", "#9aa7c0"];
    palette.dotAlpha = isLight ? 0.4 : 0.42;
  }

  // Build a smooth, gently irregular cell outline: N control points around an
  // ellipse, nudged by a restrained per-vertex jitter plus one soft harmonic
  // so cells look like natural tissue cells (a bit lumpy, never perfectly
  // circular) without becoming lobed, elongated, or amoeboid. Deterministic
  // per cell (no per-frame re-randomization, so the shape doesn't flicker).
  function makeBlobPoints(vertexCount) {
    var pts = [];
    var hFreq = Math.round(rand(2, 3));
    var hAmp = rand(0.03, 0.09);
    var hPhase = rand(0, TWO_PI);

    for (var i = 0; i < vertexCount; i++) {
      var angle = (i / vertexCount) * TWO_PI;
      var harmonic = 1 + hAmp * Math.sin(hFreq * angle + hPhase);
      var wobble = harmonic * rand(0.9, 1.08);
      pts.push({
        angle: angle,
        wobble: wobble,
        // slight per-vertex phase so the very subtle breathing animation isn't synced
        phase: rand(0, TWO_PI)
      });
    }
    return pts;
  }

  // (Re)create each cell's cached cytoplasm gradient from the current palette.
  // Must be called after readPalette() and whenever cells are (re)built.
  function refreshGradients() {
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      var grad = ctx.createRadialGradient(0, 0, 0, 0, 0, c.maxR);
      grad.addColorStop(0, palette.cytoplasmCenter);
      grad.addColorStop(1, palette.cytoplasmEdge);
      c.gradient = grad;
    }
  }

  // --- text-aware dimming -----------------------------------------------
  // Scan the main content column for text-bearing elements and cache their
  // viewport-space bounding boxes. Cheap enough to run on scroll/resize
  // (throttled), rather than needing to run inside the 60fps draw loop.
  var textRects = [];
  function refreshTextRects() {
    textRects = [];
    var els = document.querySelectorAll(
      "main.content h1, main.content h2, main.content h3, main.content p, main.content li"
    );
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.bottom < -TEXT_FEATHER || r.top > H + TEXT_FEATHER) continue; // off-screen
      textRects.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
  }

  // Distance from a point to the nearest edge of a rect (0 if inside).
  function distToRect(px, py, r) {
    var dx = Math.max(r.left - px, 0, px - r.right);
    var dy = Math.max(r.top - py, 0, py - r.bottom);
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Recompute each cell's cached text-proximity alpha multiplier from its
  // stable home position. Small idle drift/cursor repulsion (a few px) is
  // intentionally ignored here — recomputing per-frame would cost far more
  // than the visual difference is worth at that scale.
  function refreshTextDimming() {
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      var dim = 1;
      for (var j = 0; j < textRects.length; j++) {
        var d = distToRect(c.homeX, c.homeY, textRects[j]);
        var local;
        if (d <= 0) local = TEXT_MIN_ALPHA;
        else if (d >= TEXT_FEATHER) local = 1;
        else local = TEXT_MIN_ALPHA + (1 - TEXT_MIN_ALPHA) * smoothstep(d / TEXT_FEATHER);
        if (local < dim) dim = local;
      }
      c.textDim = dim;
    }
  }

  // Build cells sized/positioned to the current viewport.
  function build() {
    W = window.innerWidth;
    H = window.innerHeight;

    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Cell count scales with viewport area, tiered by device class: desktop
    // renders the densest field, tablet a middle ground, and mobile the
    // lightest (smaller screens + typically weaker GPUs). See the file header
    // for why per-cell gradient caching is what makes this density affordable.
    var tier = W < 700 ? "mobile" : W < 1100 ? "tablet" : "desktop";
    var maxCells = tier === "mobile" ? 100 : tier === "tablet" ? 300 : 780;
    var dotRange = tier === "mobile" ? [14, 26] : [18, 34];

    var count = Math.round((W * H) / 3000);
    count = Math.max(16, Math.min(count, maxCells));

    // Home positions are drawn one-per-tile from a shuffled jittered grid
    // (blue-noise-ish) rather than pure uniform random, so cells spread out
    // evenly across the viewport instead of clumping by chance — uniform
    // random sampling at this density otherwise visibly clusters in places
    // and leaves other areas empty.
    var gridCols = Math.max(1, Math.round(Math.sqrt((count * W) / H)));
    var gridRows = Math.max(1, Math.ceil(count / gridCols));
    var tileW = W / gridCols;
    var tileH = H / gridRows;
    var tiles = [];
    for (var gy = 0; gy < gridRows; gy++) {
      for (var gx = 0; gx < gridCols; gx++) tiles.push([gx, gy]);
    }
    for (var si = tiles.length - 1; si > 0; si--) {
      var sj = Math.floor(Math.random() * (si + 1));
      var tmp = tiles[si]; tiles[si] = tiles[sj]; tiles[sj] = tmp;
    }

    // Mostly round cells (typical of tissue), with a smaller share of mildly
    // flattened ovals for gentle variety. No elongated/squamous or amoeboid
    // forms — kept restrained and biologically plausible rather than showy.
    cells = [];
    for (var i = 0; i < count; i++) {
      var isOval = Math.random() < 0.32;

      var rx = rand(20, 48);
      var aspect = isOval ? rand(0.62, 0.85) : rand(0.88, 1.0);
      var ry = rx * aspect;

      var vertexCount = Math.round(rand(9, 13));

      // Jittered position within this cell's assigned grid tile (roughly
      // centered, with jitter covering most of the tile so placement still
      // looks organic rather than snapped to a visible grid).
      var tile = tiles[i % tiles.length];
      var hx = (tile[0] + 0.5) * tileW + rand(-0.34, 0.34) * tileW;
      var hy = (tile[1] + 0.5) * tileH + rand(-0.34, 0.34) * tileH;

      // Every cell gets a nucleus.
      var nucleus = {
        dx: rand(-0.25, 0.25) * rx,
        dy: rand(-0.25, 0.25) * ry,
        rx: rx * rand(0.32, 0.46),
        ry: ry * rand(0.32, 0.46)
      };

      // Internal transcript dots, placed inside the blob's footprint.
      var dots = [];
      var nDots = Math.round(rand(dotRange[0], dotRange[1]));
      for (var j = 0; j < nDots; j++) {
        var ang = Math.random() * TWO_PI;
        var r = Math.sqrt(Math.random()); // uniform area distribution
        dots.push({
          dx: Math.cos(ang) * r * rx * 0.7,
          dy: Math.sin(ang) * r * ry * 0.7,
          colorIndex: Math.floor(Math.random() * 5),
          radius: rand(1.0, 2.0)
        });
      }

      cells.push({
        homeX: hx, homeY: hy, x: hx, y: hy, vx: 0, vy: 0,
        rx: rx, ry: ry,
        maxR: Math.max(rx, ry) * 1.15,
        rotation: rand(0, Math.PI),
        phase: rand(0, TWO_PI),
        speed: rand(0.5, 1.1),
        blob: makeBlobPoints(vertexCount),
        nucleus: nucleus,
        dots: dots,
        gradient: null, // filled in by refreshGradients()
        textDim: 1 // filled in by refreshTextDimming()
      });
    }

    refreshGradients();
    refreshTextRects();
    refreshTextDimming();
  }

  // Trace the irregular membrane as a smooth closed curve through the
  // (subtly, slowly breathing) perturbed vertices.
  function traceBlob(c, t) {
    var pts = c.blob;
    var n = pts.length;
    var verts = new Array(n);

    for (var i = 0; i < n; i++) {
      var p = pts[i];
      // Very slow, tiny breathing so the membrane isn't perfectly static.
      var breathe = 1 + Math.sin(t * 0.00025 * c.speed + p.phase) * 0.025;
      var rr = p.wobble * breathe;
      verts[i] = {
        x: Math.cos(p.angle) * c.rx * rr,
        y: Math.sin(p.angle) * c.ry * rr
      };
    }

    ctx.beginPath();
    var start = {
      x: (verts[n - 1].x + verts[0].x) / 2,
      y: (verts[n - 1].y + verts[0].y) / 2
    };
    ctx.moveTo(start.x, start.y);
    for (var k = 0; k < n; k++) {
      var cur = verts[k];
      var next = verts[(k + 1) % n];
      var mid = { x: (cur.x + next.x) / 2, y: (cur.y + next.y) / 2 };
      ctx.quadraticCurveTo(cur.x, cur.y, mid.x, mid.y);
    }
    ctx.closePath();
  }

  function drawCell(c, t) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rotation);
    // Overall per-cell opacity: full strength away from text, fading smoothly
    // toward TEXT_MIN_ALPHA near/behind text (see refreshTextDimming()).
    ctx.globalAlpha = c.textDim;

    traceBlob(c, t);

    // Faint cytoplasmic gradient for a little depth without a heavy fill.
    // Reused from cache (see refreshGradients()) rather than rebuilt per frame.
    ctx.fillStyle = c.gradient;
    ctx.fill();

    ctx.lineWidth = 1;
    ctx.strokeStyle = palette.membrane;
    ctx.stroke();

    if (c.nucleus) {
      ctx.beginPath();
      ctx.ellipse(c.nucleus.dx, c.nucleus.dy, c.nucleus.rx, c.nucleus.ry, 0, 0, TWO_PI);
      ctx.fillStyle = palette.nucleus;
      ctx.fill();
    }

    ctx.globalAlpha = palette.dotAlpha * c.textDim;
    for (var j = 0; j < c.dots.length; j++) {
      var d = c.dots[j];
      ctx.beginPath();
      ctx.arc(d.dx, d.dy, d.radius, 0, TWO_PI);
      ctx.fillStyle = palette.dots[d.colorIndex];
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function step(t) {
    ctx.clearRect(0, 0, W, H);

    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];

      // Gentle idle drift around the home position.
      var targetX = c.homeX + Math.cos(c.phase + t * 0.00018 * c.speed) * 9;
      var targetY = c.homeY + Math.sin(c.phase + t * 0.00021 * c.speed) * 9;

      // Organic cursor repulsion: push away, stronger when closer.
      if (pointer.active) {
        var ddx = c.x - pointer.x;
        var ddy = c.y - pointer.y;
        var dist = Math.hypot(ddx, ddy);
        var radius = 150;
        if (dist < radius && dist > 0.001) {
          var force = (1 - dist / radius) * 30;
          targetX += (ddx / dist) * force;
          targetY += (ddy / dist) * force;
        }
      }

      // Critically-damped-ish spring back toward the target.
      c.vx += (targetX - c.x) * 0.02;
      c.vy += (targetY - c.y) * 0.02;
      c.vx *= 0.86;
      c.vy *= 0.86;
      c.x += c.vx;
      c.y += c.vy;

      drawCell(c, t);
    }
  }

  function loop(t) {
    if (!running) return;
    step(t);
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (running || reduceMotion) return;
    running = true;
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function renderStatic() { step(0); }

  // --- events ---------------------------------------------------------------
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      build();
      if (reduceMotion) renderStatic();
    }, 150);
  });

  // Text moves relative to the fixed canvas on scroll, so text-dimming needs
  // refreshing too — throttled to one recompute per animation frame so fast
  // scrolling can't spam expensive rect scans.
  var scrollQueued = false;
  window.addEventListener("scroll", function () {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(function () {
      scrollQueued = false;
      refreshTextRects();
      refreshTextDimming();
      if (reduceMotion) renderStatic();
    });
  }, { passive: true });

  window.addEventListener("mousemove", function (e) {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
  }, { passive: true });

  window.addEventListener("mouseout", function (e) {
    if (!e.relatedTarget) pointer.active = false;
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else start();
  });

  window.addEventListener("themechange", function () {
    readPalette();
    refreshGradients();
    if (reduceMotion) renderStatic();
  });

  // --- init -----------------------------------------------------------------
  readPalette();
  build();
  if (reduceMotion) renderStatic();
  else start();
})();
