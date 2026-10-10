// Native theme: dark (default), night (true black) or light. Runs synchronously in <head> to avoid a flash.
// "night" is dark plus html[data-night="1"]. The prototype's own code can rewrite data-theme, so re-assert it.
(function () {
  var KEY = "ff.theme", ORDER = ["dark", "night", "light"], root = document.documentElement;
  function read() { try { var v = localStorage.getItem(KEY); return ORDER.indexOf(v) >= 0 ? v : "light"; } catch (e) { return "light"; } }
  var current = read();
  function apply() {
    var base = current === "light" ? "light" : "dark";
    if (root.dataset.theme !== base) root.dataset.theme = base;
    if (current === "night") { if (root.dataset.night !== "1") root.dataset.night = "1"; }
    else if (root.dataset.night) delete root.dataset.night;
  }
  apply();
  new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ["data-theme", "data-night"] });
  window.FFTheme = {
    order: ORDER,
    get: function () { return current; },
    set: function (value) {
      if (ORDER.indexOf(value) < 0) return current;
      current = value;
      try { localStorage.setItem(KEY, value); } catch (e) {}
      apply();
      document.dispatchEvent(new CustomEvent("fftheme", { detail: value }));
      return current;
    },
    next: function () { return window.FFTheme.set(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]); },
  };
})();
