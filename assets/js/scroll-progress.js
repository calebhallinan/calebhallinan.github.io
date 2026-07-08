/* Thin scroll-progress bar fixed to the top of the viewport.
 * Width reflects how far the user has scrolled through the page.
 * Uses rAF-throttled scroll/resize handling to stay cheap, and skips the
 * smooth CSS transition for prefers-reduced-motion users (jumps instantly
 * instead of animating).
 */
(function () {
  "use strict";

  var bar = document.getElementById("scroll-progress");
  if (!bar) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) bar.style.transition = "none";

  var ticking = false;

  function update() {
    ticking = false;
    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - doc.clientHeight;
    var pct = scrollable > 0 ? (doc.scrollTop / scrollable) * 100 : 0;
    bar.style.width = pct + "%";
  }

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  update();
})();
