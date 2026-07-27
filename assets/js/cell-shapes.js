/* Shared cell geometry.
 *
 * This blob math was originally private to spatial-background.js. It is
 * extracted here so the research-card motifs (card-motifs.js) can draw the same
 * species of cell without duplicating it — every generated visual on the site
 * should speak one visual language. Behavior is unchanged from the original.
 *
 * Loaded via a plain deferred <script> before its consumers (see
 * _includes/scripts.html). Deferred scripts execute in document order, so a
 * global namespace is sufficient and no module system is needed.
 */
(function () {
  "use strict";

  var TWO_PI = Math.PI * 2;

  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smoothstep(t) { return t * t * (3 - 2 * t); }

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

  // Trace an irregular membrane as a smooth closed curve through the (subtly,
  // slowly breathing) perturbed vertices. Traces into the current transform, so
  // callers translate/rotate to the cell's position first. Leaves the path open
  // for the caller to fill and/or stroke.
  //
  // Generalized from the original closure-based version: rx/ry/speed are passed
  // in rather than read off a cell object, so callers with different cell
  // representations can share it. Pass t = 0 for a static, non-breathing trace.
  function traceBlob(ctx, pts, rx, ry, t, speed) {
    var n = pts.length;
    var verts = new Array(n);
    var sp = speed === undefined ? 1 : speed;
    var time = t || 0;

    for (var i = 0; i < n; i++) {
      var p = pts[i];
      // Very slow, tiny breathing so the membrane isn't perfectly static.
      var breathe = 1 + Math.sin(time * 0.00025 * sp + p.phase) * 0.025;
      var rr = p.wobble * breathe;
      verts[i] = {
        x: Math.cos(p.angle) * rx * rr,
        y: Math.sin(p.angle) * ry * rr
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

  // Home positions drawn one-per-tile from a shuffled jittered grid
  // (blue-noise-ish) rather than pure uniform random, so cells spread evenly
  // instead of clumping — uniform random sampling at these densities visibly
  // clusters in places and leaves other areas empty. Returns `count` {x, y}
  // points covering a w x h box.
  function jitteredGrid(count, w, h, jitter) {
    var j = jitter === undefined ? 0.34 : jitter;
    var cols = Math.max(1, Math.round(Math.sqrt((count * w) / h)));
    var rows = Math.max(1, Math.ceil(count / cols));
    var tileW = w / cols;
    var tileH = h / rows;

    var tiles = [];
    for (var gy = 0; gy < rows; gy++) {
      for (var gx = 0; gx < cols; gx++) tiles.push([gx, gy]);
    }
    for (var si = tiles.length - 1; si > 0; si--) {
      var sj = Math.floor(Math.random() * (si + 1));
      var tmp = tiles[si]; tiles[si] = tiles[sj]; tiles[sj] = tmp;
    }

    var pts = [];
    for (var i = 0; i < count; i++) {
      var tile = tiles[i % tiles.length];
      pts.push({
        x: (tile[0] + 0.5) * tileW + rand(-j, j) * tileW,
        y: (tile[1] + 0.5) * tileH + rand(-j, j) * tileH
      });
    }
    return pts;
  }

  window.CellShapes = {
    TWO_PI: TWO_PI,
    rand: rand,
    clamp01: clamp01,
    smoothstep: smoothstep,
    makeBlobPoints: makeBlobPoints,
    traceBlob: traceBlob,
    jitteredGrid: jitteredGrid
  };
})();
