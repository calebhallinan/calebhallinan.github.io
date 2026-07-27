/* Staggered scroll reveal for card-style content.
 *
 * Cards fade and rise slightly as they enter the viewport, staggered within
 * each group so a grid resolves row by row rather than all at once.
 *
 * Fail-safe by construction: the hidden state is scoped to html.js-reveal,
 * and that class is only added by this script. If JavaScript is disabled or
 * this file fails to load, nothing is ever hidden — content renders normally.
 * The class is likewise never added under prefers-reduced-motion, so that mode
 * skips the effect entirely rather than relying on the CSS transition being
 * suppressed.
 *
 * Interaction with filtering: filter-lists.js toggles .is-hidden (display:none)
 * on news and publication items. display:none beats opacity regardless of
 * specificity, so hiding always works — but an item that was still below the
 * fold (never revealed) would come back from a filter change at opacity 0.
 * Filter controls therefore force-reveal everything remaining; see below.
 */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window)) return;

  var SELECTOR = ".research-card, .pub, .software-item, .talk-item, .teaching-item, .news-item";
  var items = Array.prototype.slice.call(document.querySelectorAll(SELECTOR));
  if (!items.length) return;

  var STAGGER_MS = 60;
  var MAX_STAGGER_MS = 260; // don't let long lists crawl in

  document.documentElement.classList.add("js-reveal");
  items.forEach(function (el) { el.classList.add("reveal"); });

  function show(el, delayMs) {
    if (el.classList.contains("is-visible")) return;
    if (delayMs) el.style.transitionDelay = delayMs + "ms";
    el.classList.add("is-visible");
  }

  // Reveal in small waves: items entering together stagger relative to each
  // other, so a two-column grid resolves diagonally instead of in lockstep.
  var io = new IntersectionObserver(function (entries) {
    var batch = entries.filter(function (e) { return e.isIntersecting; });
    batch.forEach(function (entry, i) {
      show(entry.target, Math.min(i * STAGGER_MS, MAX_STAGGER_MS));
      io.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -40px 0px", threshold: 0.08 });

  items.forEach(function (el) { io.observe(el); });

  // Any filter interaction can surface an item that never intersected, so drop
  // the effect wholesale at that point rather than risk invisible content.
  function revealAll() {
    items.forEach(function (el) {
      el.style.transitionDelay = "0ms";
      show(el, 0);
      io.unobserve(el);
    });
  }

  var controls = document.querySelectorAll(".filter-btn, .filter-select, [data-sort-toggle]");
  Array.prototype.forEach.call(controls, function (c) {
    c.addEventListener("click", revealAll);
    c.addEventListener("change", revealAll);
  });
})();
