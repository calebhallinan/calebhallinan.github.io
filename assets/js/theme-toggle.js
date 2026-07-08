/* Dark/light theme toggle.
 * - Dark is the default (set pre-paint in _includes/head-theme.html).
 * - The user's explicit choice persists in localStorage.
 * - The control is a semantic <button>, so it is keyboard-accessible for free.
 * - Toggling only swaps CSS custom-property sets via [data-theme]; no layout shift.
 */
(function () {
  "use strict";

  var root = document.documentElement;

  // Inline SVGs (no icon-font dependency, so this works on every page).
  var ICON_SUN =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
  var ICON_MOON =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  var btn = null;

  function currentTheme() {
    return root.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function updateButton(theme) {
    if (!btn) return;
    // Show the icon of the theme you'd switch TO.
    btn.innerHTML = theme === "dark" ? ICON_SUN : ICON_MOON;
    var label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
    btn.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-bs-theme", theme);
    try { localStorage.setItem("theme", theme); } catch (e) { /* ignore */ }
    updateButton(theme);
    // Let the background canvas re-read its palette.
    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: theme } }));
  }

  function injectToggle() {
    var navbar = document.querySelector(".navbar");
    if (!navbar) return;
    var list =
      navbar.querySelector(".navbar-nav.ms-auto") ||
      navbar.querySelector(".navbar-nav") ||
      navbar.querySelector(".navbar-container") ||
      navbar;

    var item = document.createElement("li");
    item.className = "nav-item theme-toggle-item";

    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.addEventListener("click", function () {
      applyTheme(currentTheme() === "dark" ? "light" : "dark");
    });

    item.appendChild(btn);
    list.appendChild(item);
    updateButton(currentTheme());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectToggle);
  } else {
    injectToggle();
  }
})();
