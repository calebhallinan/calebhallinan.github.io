/* Lightweight client-side filtering for the News and Publications archive
 * pages. No dependencies. Progressive enhancement: the underlying HTML lists
 * every item already visible, so with JavaScript disabled everything simply
 * stays visible and only the (inert) filter buttons appear inactive.
 *
 * News filtering: buttons with [data-filter-tag] toggle .news-item elements
 * on/off based on their data-tags attribute (space-separated tag list).
 *
 * Publications filtering: buttons with [data-filter-type] toggle .pub
 * elements based on data-type ("journal" | "preprint"); an optional
 * [data-year-filter] <select> narrows further by data-year; an optional
 * [data-sort-toggle] button reverses DOM order between newest/oldest first
 * (entries are authored newest-first, so "oldest" is just the reverse).
 */
(function () {
  "use strict";

  function setPressed(buttons, active) {
    buttons.forEach(function (b) {
      b.setAttribute("aria-pressed", b === active ? "true" : "false");
    });
  }

  // ---- News tag filter -------------------------------------------------
  var newsFilterBar = document.querySelector("[data-news-filter]");
  if (newsFilterBar) {
    var newsButtons = Array.prototype.slice.call(
      newsFilterBar.querySelectorAll("[data-filter-tag]")
    );
    var newsItems = Array.prototype.slice.call(
      document.querySelectorAll(".news-item[data-tags]")
    );

    newsButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tag = btn.getAttribute("data-filter-tag");
        setPressed(newsButtons, btn);
        newsItems.forEach(function (item) {
          var tags = (item.getAttribute("data-tags") || "").split(/\s+/);
          var show = tag === "all" || tags.indexOf(tag) !== -1;
          item.classList.toggle("is-hidden", !show);
        });
      });
    });
  }

  // ---- Publications type + year filter + sort ---------------------------
  var pubFilterBar = document.querySelector("[data-pub-filter]");
  if (pubFilterBar) {
    var pubButtons = Array.prototype.slice.call(
      pubFilterBar.querySelectorAll("[data-filter-type]")
    );
    var pubItems = Array.prototype.slice.call(
      document.querySelectorAll(".pub[data-type]")
    );
    var yearSelect = document.querySelector("[data-year-filter]");
    var sortToggle = document.querySelector("[data-sort-toggle]");
    var pubList = document.querySelector(".pub-list");

    var activeType = "all";
    var activeYear = "all";

    function applyPubFilters() {
      pubItems.forEach(function (item) {
        var typeOk = activeType === "all" || item.getAttribute("data-type") === activeType;
        var yearOk = activeYear === "all" || item.getAttribute("data-year") === activeYear;
        item.classList.toggle("is-hidden", !(typeOk && yearOk));
      });
    }

    pubButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        activeType = btn.getAttribute("data-filter-type");
        setPressed(pubButtons, btn);
        applyPubFilters();
      });
    });

    if (yearSelect) {
      yearSelect.addEventListener("change", function () {
        activeYear = yearSelect.value;
        applyPubFilters();
      });
    }

    if (sortToggle && pubList) {
      var newestFirst = true;
      sortToggle.addEventListener("click", function () {
        newestFirst = !newestFirst;
        sortToggle.textContent = newestFirst ? "Newest first" : "Oldest first";
        sortToggle.setAttribute("aria-pressed", newestFirst ? "false" : "true");
        var items = Array.prototype.slice.call(pubList.children);
        items.reverse().forEach(function (item) { pubList.appendChild(item); });
      });
    }
  }
})();
