/* Research-card topic motifs.
 *
 * Each .research-card carries a data-motif attribute naming a generated visual
 * drawn from that card's actual subject, rendered as a strip across the top of
 * the card. Nothing here is an image asset: every motif is drawn in code, so
 * there is nothing to re-export when the research changes.
 *
 * Monochrome constraint: the site uses a single orange accent, so these six
 * motifs cannot be told apart by hue the way a categorical palette would allow.
 * They differentiate by GEOMETRY and DENSITY instead — a point cloud reads
 * differently from a grid, which reads differently from paired horizontal bars,
 * from separated clusters, from ghost-trailed outlines, from a node graph. That
 * is the governing design constraint on everything below; if a motif is ever
 * changed, it has to stay distinguishable in a grayscale screenshot.
 *
 * Performance: six simultaneous animation loops would be wasteful for what is
 * decoration, so each motif instead draws ONCE with a one-shot draw-in animation
 * triggered by an IntersectionObserver when its card first scrolls into view,
 * and is static thereafter. Redraws happen only on theme change and (debounced)
 * resize.
 *
 * Accessibility: canvases are aria-hidden and pointer-events:none — the card's
 * heading and prose carry all the meaning; these are purely decorative.
 * prefers-reduced-motion draws the final state immediately with no animation.
 */
(function () {
  "use strict";

  var CS = window.CellShapes;
  if (!CS) return;

  var cards = document.querySelectorAll("[data-motif]");
  if (!cards.length) return;

  var TWO_PI = CS.TWO_PI;
  var rand = CS.rand;
  var clamp01 = CS.clamp01;
  var smoothstep = CS.smoothstep;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  var DRAW_MS = 900;
  var palette = {};

  function readPalette() {
    var isLight = document.documentElement.getAttribute("data-theme") === "light";
    var cs = getComputedStyle(document.documentElement);
    palette.accent = (cs.getPropertyValue("--accent") || "#f2994a").trim();
    palette.faint = isLight ? "rgba(30,35,40,0.30)" : "rgba(255,255,255,0.24)";
    palette.veryFaint = isLight ? "rgba(30,35,40,0.13)" : "rgba(255,255,255,0.11)";
  }

  // Reveal helper: given overall progress p and an item's index in a sequence
  // of n, return that item's own 0..1 progress. Items stagger across the first
  // ~70% of the animation so the last one still has time to fade in.
  function itemProgress(p, i, n) {
    var startAt = (i / Math.max(1, n)) * 0.7;
    return clamp01((p - startAt) / 0.3);
  }

  /* -- motif builders: precompute geometry once so redraws don't reshuffle -- */

  var builders = {
    // Transcript point cloud with soft cell boundaries — the canonical
    // imaging-based spatial transcriptomics view.
    spatial: function (w, h) {
      var blobs = [];
      var homes = CS.jitteredGrid(Math.max(3, Math.round(w / 78)), w, h, 0.3);
      for (var i = 0; i < homes.length; i++) {
        var rx = rand(h * 0.3, h * 0.42);
        blobs.push({
          x: homes[i].x, y: homes[i].y,
          rx: rx, ry: rx * rand(0.78, 1.0),
          rot: rand(0, Math.PI),
          pts: CS.makeBlobPoints(Math.round(rand(9, 12)))
        });
      }
      var dots = [];
      var nDots = Math.round(w / 4.2);
      for (var j = 0; j < nDots; j++) {
        var b = blobs[Math.floor(Math.random() * blobs.length)];
        var ang = Math.random() * TWO_PI;
        var r = Math.sqrt(Math.random());
        dots.push({
          x: b.x + Math.cos(ang) * r * b.rx * 0.8,
          y: b.y + Math.sin(ang) * r * b.ry * 0.8,
          radius: rand(0.8, 1.7),
          alpha: rand(0.45, 0.95)
        });
      }
      return { blobs: blobs, dots: dots };
    },

    // Irregular tissue texture on the left resolving into a regular expression
    // grid on the right — H&E in, predicted expression out.
    histology: function (w, h) {
      var cols = Math.max(6, Math.round(w / 16));
      var rows = 4;
      var cw = w / cols;
      var ch = h / rows;
      var tiles = [];
      for (var c = 0; c < cols; c++) {
        var t = cols > 1 ? c / (cols - 1) : 1;
        for (var r = 0; r < rows; r++) {
          var v = Math.random();
          tiles.push({
            col: c, row: r, t: t,
            x: c * cw, y: r * ch, w: cw, h: ch,
            jx: rand(-2.4, 2.4), jy: rand(-2.4, 2.4),
            // left side: continuous organic values; right side: quantized,
            // like a binned heatmap
            valSmooth: v,
            valStepped: Math.round(v * 3) / 3,
            sizeJitter: rand(0.72, 1.05)
          });
        }
      }
      return { tiles: tiles, cw: cw, ch: ch };
    },

    // Probe/target pairs: most probes sit over their intended target, a couple
    // are visibly displaced — off-target binding.
    probes: function (w, h) {
      var rows = 5;
      var gap = h / (rows + 1);
      var items = [];
      for (var i = 0; i < rows; i++) {
        var len = rand(w * 0.34, w * 0.6);
        var x = rand(6, Math.max(8, w - len - 6));
        var offTarget = i === 1 || i === 3;
        items.push({
          y: gap * (i + 1),
          x: x,
          len: len,
          offTarget: offTarget,
          shift: offTarget ? rand(w * 0.1, w * 0.17) * (Math.random() < 0.5 ? -1 : 1) : 0
        });
      }
      return { items: items };
    },

    // Three clusters at different tightnesses — separable by density alone,
    // since colour is not available to distinguish them.
    subtypes: function (w, h) {
      var specs = [
        { cx: w * 0.2, sigma: h * 0.13, n: 30, alpha: 0.9, radius: 1.5 },
        { cx: w * 0.52, sigma: h * 0.22, n: 28, alpha: 0.6, radius: 1.4 },
        { cx: w * 0.83, sigma: h * 0.34, n: 26, alpha: 0.38, radius: 1.3 }
      ];
      var pts = [];
      for (var s = 0; s < specs.length; s++) {
        var sp = specs[s];
        for (var i = 0; i < sp.n; i++) {
          // sum of uniforms ~ approximately gaussian; good enough for a motif
          var gx = (Math.random() + Math.random() + Math.random() - 1.5) * 2;
          var gy = (Math.random() + Math.random() + Math.random() - 1.5) * 2;
          pts.push({
            x: sp.cx + gx * sp.sigma,
            y: h / 2 + gy * sp.sigma,
            radius: sp.radius,
            alpha: sp.alpha
          });
        }
      }
      return { pts: pts };
    },

    // Cell outlines dragging ghost trails behind them — tracked motion over
    // successive frames.
    livecell: function (w, h) {
      var tracks = [];
      var n = Math.max(2, Math.round(w / 150));
      for (var i = 0; i < n; i++) {
        var baseY = h * rand(0.34, 0.66);
        var startX = (w / n) * i + rand(14, 26);
        var stepX = rand(13, 19);
        var ghosts = 4;
        var r = rand(h * 0.2, h * 0.27);
        tracks.push({
          pts: CS.makeBlobPoints(Math.round(rand(9, 12))),
          rx: r, ry: r * rand(0.82, 1.0),
          rot: rand(0, Math.PI),
          ghosts: ghosts,
          startX: startX,
          stepX: stepX,
          baseY: baseY,
          drift: rand(-4, 4)
        });
      }
      return { tracks: tracks };
    },

    // Nodes wired to their nearest neighbours — a dependency/package graph.
    software: function (w, h) {
      var count = Math.max(5, Math.round(w / 52));
      var homes = CS.jitteredGrid(count, w - 16, h - 16, 0.32);
      var nodes = [];
      for (var i = 0; i < homes.length; i++) {
        nodes.push({ x: homes[i].x + 8, y: homes[i].y + 8, radius: rand(2.2, 3.8) });
      }
      // Connect each node to its two nearest neighbours, de-duplicated.
      var seen = {};
      var edges = [];
      for (var a = 0; a < nodes.length; a++) {
        var dists = [];
        for (var b = 0; b < nodes.length; b++) {
          if (a === b) continue;
          var dx = nodes[a].x - nodes[b].x;
          var dy = nodes[a].y - nodes[b].y;
          dists.push({ i: b, d: dx * dx + dy * dy });
        }
        dists.sort(function (m, n) { return m.d - n.d; });
        for (var k = 0; k < Math.min(2, dists.length); k++) {
          var j = dists[k].i;
          var key = Math.min(a, j) + "-" + Math.max(a, j);
          if (seen[key]) continue;
          seen[key] = true;
          edges.push([a, j]);
        }
      }
      return { nodes: nodes, edges: edges };
    }
  };

  /* -- motif renderers ---------------------------------------------------- */

  var renderers = {
    spatial: function (ctx, g, w, h, p) {
      for (var i = 0; i < g.blobs.length; i++) {
        var b = g.blobs[i];
        var bp = itemProgress(p, i, g.blobs.length);
        if (bp <= 0) continue;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        CS.traceBlob(ctx, b.pts, b.rx, b.ry, 0, 1);
        ctx.globalAlpha = smoothstep(bp);
        ctx.strokeStyle = palette.veryFaint;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = palette.accent;
      for (var j = 0; j < g.dots.length; j++) {
        var d = g.dots[j];
        var dp = itemProgress(p, j, g.dots.length);
        if (dp <= 0) continue;
        ctx.globalAlpha = d.alpha * smoothstep(dp);
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.radius, 0, TWO_PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },

    histology: function (ctx, g, w, h, p) {
      for (var i = 0; i < g.tiles.length; i++) {
        var t = g.tiles[i];
        var tp = itemProgress(p, t.col, Math.max(1, w / g.cw));
        if (tp <= 0) continue;

        // Blend organic (left) -> gridded (right).
        var jx = t.jx * (1 - t.t);
        var jy = t.jy * (1 - t.t);
        var val = t.valSmooth * (1 - t.t) + t.valStepped * t.t;
        var size = g.cw * (t.sizeJitter * (1 - t.t) + 1.0 * t.t);
        var sizeY = g.ch * (t.sizeJitter * (1 - t.t) + 1.0 * t.t);
        var radius = (Math.min(size, sizeY) / 2) * (1 - t.t) + 1.5 * t.t;

        var x = t.x + jx + (g.cw - size) / 2;
        var y = t.y + jy + (g.ch - sizeY) / 2;

        ctx.globalAlpha = (0.1 + val * 0.62) * smoothstep(tp);
        ctx.fillStyle = palette.accent;
        roundRect(ctx, x + 0.6, y + 0.6, size - 1.2, sizeY - 1.2, radius);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },

    probes: function (ctx, g, w, h, p) {
      for (var i = 0; i < g.items.length; i++) {
        var it = g.items[i];
        var ip = itemProgress(p, i, g.items.length);
        if (ip <= 0) continue;
        var e = smoothstep(ip);
        ctx.globalAlpha = e;

        // target strand
        ctx.strokeStyle = palette.faint;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        line(ctx, it.x, it.y + 3.5, it.x + it.len * e, it.y + 3.5);

        // probe, riding above it — displaced when off-target
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = e * (it.offTarget ? 1 : 0.75);
        var px = it.x + it.shift * e;
        line(ctx, px, it.y - 2.5, px + it.len * 0.55 * e, it.y - 2.5);

        // mismatch marker
        if (it.offTarget) {
          ctx.globalAlpha = e * 0.85;
          ctx.strokeStyle = palette.accent;
          ctx.lineWidth = 1;
          var mx = px + it.len * 0.55 * e + 5;
          line(ctx, mx - 2.5, it.y - 5, mx + 2.5, it.y);
          line(ctx, mx + 2.5, it.y - 5, mx - 2.5, it.y);
        }
      }
      ctx.globalAlpha = 1;
    },

    subtypes: function (ctx, g, w, h, p) {
      ctx.fillStyle = palette.accent;
      for (var i = 0; i < g.pts.length; i++) {
        var pt = g.pts[i];
        var pp = itemProgress(p, i, g.pts.length);
        if (pp <= 0) continue;
        ctx.globalAlpha = pt.alpha * smoothstep(pp);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius, 0, TWO_PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },

    livecell: function (ctx, g, w, h, p) {
      for (var i = 0; i < g.tracks.length; i++) {
        var tr = g.tracks[i];
        for (var k = 0; k <= tr.ghosts; k++) {
          // oldest ghost first, current cell last
          var idx = i * (tr.ghosts + 1) + k;
          var gp = itemProgress(p, idx, g.tracks.length * (tr.ghosts + 1));
          if (gp <= 0) continue;
          var isCurrent = k === tr.ghosts;

          ctx.save();
          ctx.translate(tr.startX + tr.stepX * k, tr.baseY + tr.drift * k);
          ctx.rotate(tr.rot + k * 0.12);
          CS.traceBlob(ctx, tr.pts, tr.rx, tr.ry, 0, 1);
          ctx.globalAlpha = smoothstep(gp) * (isCurrent ? 1 : 0.16 + 0.13 * k);
          ctx.strokeStyle = isCurrent ? palette.accent : palette.faint;
          ctx.lineWidth = isCurrent ? 1.4 : 1;
          ctx.stroke();

          if (isCurrent) {
            ctx.globalAlpha = smoothstep(gp) * 0.7;
            ctx.beginPath();
            ctx.arc(0, 0, tr.rx * 0.34, 0, TWO_PI);
            ctx.fillStyle = palette.accent;
            ctx.fill();
          }
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    },

    software: function (ctx, g, w, h, p) {
      // edges first, so nodes sit on top
      ctx.strokeStyle = palette.faint;
      ctx.lineWidth = 1;
      for (var e = 0; e < g.edges.length; e++) {
        var ep = itemProgress(p, e, g.edges.length);
        if (ep <= 0) continue;
        var a = g.nodes[g.edges[e][0]];
        var b = g.nodes[g.edges[e][1]];
        var t = smoothstep(ep);
        ctx.globalAlpha = t * 0.8;
        line(ctx, a.x, a.y, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      }
      ctx.fillStyle = palette.accent;
      for (var i = 0; i < g.nodes.length; i++) {
        var np = itemProgress(p, i, g.nodes.length);
        if (np <= 0) continue;
        var n = g.nodes[i];
        var s = smoothstep(np);
        ctx.globalAlpha = s;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * s, 0, TWO_PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  };

  function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // ctx.roundRect is not available in older Safari, so trace it manually.
  function roundRect(ctx, x, y, w, h, r) {
    if (w <= 0 || h <= 0) return;
    var rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* -- per-card wiring ---------------------------------------------------- */

  var instances = [];

  function makeInstance(card) {
    var kind = card.getAttribute("data-motif");
    if (!builders[kind] || !renderers[kind]) return null;

    var canvas = document.createElement("canvas");
    canvas.className = "motif-canvas";
    canvas.setAttribute("aria-hidden", "true");
    var ctx = canvas.getContext("2d");
    if (!ctx) return null;
    card.insertBefore(canvas, card.firstChild);

    var inst = {
      kind: kind, canvas: canvas, ctx: ctx,
      w: 0, h: 0, geom: null, played: false, rafId: null
    };

    inst.build = function () {
      var rect = canvas.getBoundingClientRect();
      // CSS owns the layout size (see .motif-canvas); only the backing store is
      // set here, scaled for device pixel ratio.
      if (rect.width < 2 || rect.height < 2) return false;
      inst.w = rect.width;
      inst.h = rect.height;
      canvas.width = Math.floor(inst.w * dpr);
      canvas.height = Math.floor(inst.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      inst.geom = builders[kind](inst.w, inst.h);
      return true;
    };

    inst.render = function (p) {
      if (!inst.geom) return;
      ctx.clearRect(0, 0, inst.w, inst.h);
      renderers[kind](ctx, inst.geom, inst.w, inst.h, p);
    };

    inst.play = function () {
      if (inst.played) return;
      inst.played = true;
      if (!inst.geom && !inst.build()) return;
      if (reduceMotion) { inst.render(1); return; }

      var t0 = performance.now();
      (function frame(now) {
        var p = clamp01((now - t0) / DRAW_MS);
        inst.render(p);
        if (p < 1) inst.rafId = requestAnimationFrame(frame);
        else inst.rafId = null;
      })(t0);
    };

    return inst;
  }

  readPalette();
  for (var i = 0; i < cards.length; i++) {
    var inst = makeInstance(cards[i]);
    if (inst) instances.push(inst);
  }
  if (!instances.length) return;

  // Draw in when the card first reaches the viewport; static from then on.
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        var inst = entries[i].target.__motif;
        if (inst) inst.play();
        io.unobserve(entries[i].target);
      }
    }, { rootMargin: "0px 0px -40px 0px", threshold: 0.15 });

    for (var k = 0; k < instances.length; k++) {
      instances[k].canvas.__motif = instances[k];
      io.observe(instances[k].canvas);
    }
  } else {
    for (var m = 0; m < instances.length; m++) instances[m].play();
  }

  function redrawAll() {
    for (var i = 0; i < instances.length; i++) {
      var inst = instances[i];
      if (!inst.played) continue;
      if (inst.rafId) { cancelAnimationFrame(inst.rafId); inst.rafId = null; }
      inst.render(1);
    }
  }

  window.addEventListener("themechange", function () {
    readPalette();
    redrawAll();
  });

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      for (var i = 0; i < instances.length; i++) {
        if (instances[i].played) instances[i].build();
      }
      redrawAll();
    }, 150);
  });
})();
