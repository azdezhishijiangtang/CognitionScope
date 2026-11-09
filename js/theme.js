/* ==========================================================================
   CognitionScope · 日光 / 月光主题引导
   --------------------------------------------------------------------------
   为什么单独成一个文件、并放在 <head> 里同步加载：
   CSP 为 script-src 'self'，不允许内联脚本；而主题必须在首屏绘制前落定，
   否则从深色切到浅色会闪一下。文件极小（<2KB），阻塞开销可忽略。

   规则（与「无 JS 时跟随系统」共同构成三级回退）：
   1. localStorage 有显式选择 → 用它
   2. 没有选择 → 跟随 prefers-color-scheme
   3. 两者都不可用 → 月光（深色）兜底
   只写独立键，不触碰主状态 L1/L2，也不进入导出包。
   ========================================================================== */
(function (root) {
  "use strict";

  var KEY = "cognitionscope-theme";
  var doc = document;
  var html = doc.documentElement;
  var LABEL = { light: "日光", dark: "月光" };

  function readStored() {
    try {
      var v = root.localStorage.getItem(KEY);
      return v === "light" || v === "dark" ? v : null;
    } catch (e) {
      return null; /* 隐私模式 / 存储被禁用时按未选择处理 */
    }
  }

  function systemTheme() {
    try {
      return root.matchMedia && root.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
    } catch (e) {
      return "dark";
    }
  }

  function current() {
    return html.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function paintButton(theme) {
    var btn = doc.getElementById("btnTheme");
    if (!btn) return; /* 顶栏尚未解析时忽略，DOM 就绪后补一次 */
    var isLight = theme === "light";
    btn.setAttribute("aria-checked", isLight ? "true" : "false");
    btn.setAttribute("aria-label", isLight ? "切换到月光模式" : "切换到日光模式");
    var label = btn.querySelector(".tt-label");
    if (label) label.textContent = LABEL[theme];
  }

  function paintMeta(theme) {
    var meta = doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#F7F5F1" : "#07070A");
  }

  function apply(theme, persist) {
    var t = theme === "light" ? "light" : "dark";
    html.setAttribute("data-theme", t);
    html.style.colorScheme = t;
    paintMeta(t);
    paintButton(t);
    if (persist) {
      try {
        root.localStorage.setItem(KEY, t);
      } catch (e) {
        /* 存储失败时仅本次会话生效 */
      }
    }
    try {
      root.dispatchEvent(new CustomEvent("cs:theme", { detail: { theme: t } }));
    } catch (e) {
      /* 老浏览器忽略 */
    }
    return t;
  }

  function toggle() {
    var next = current() === "light" ? "dark" : "light";
    apply(next, true);
    return next;
  }

  /* ---- 首屏立即落定（此时 body 还不存在，按钮状态在 DOM 就绪后补） ---- */
  var initial = readStored() || systemTheme();
  html.setAttribute("data-theme", initial);
  html.style.colorScheme = initial;

  /* 用户没有手动选择时，跟随系统变化实时切换 */
  try {
    var mq = root.matchMedia("(prefers-color-scheme: light)");
    var onSystemChange = function (e) {
      if (!readStored()) apply(e.matches ? "light" : "dark", false);
    };
    if (mq.addEventListener) mq.addEventListener("change", onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange);
  } catch (e) {
    /* 不支持 matchMedia 时忽略 */
  }

  /* ---- 顶栏出现后绑定按钮 ---- */
  function bind() {
    var btn = doc.getElementById("btnTheme");
    if (!btn) return;
    paintButton(current());
    btn.addEventListener("click", function () {
      var next = toggle();
      if (root.APP && typeof root.APP.toast === "function") {
        root.APP.toast(next === "light" ? "已切换到日光模式" : "已切换到月光模式");
      }
    });
    // 双击标签区域不选中文本
    btn.addEventListener("mousedown", function (e) { e.preventDefault(); });
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  root.THEME = {
    KEY: KEY,
    get: current,
    set: function (t) { return apply(t, true); },
    toggle: toggle,
    followSystem: function () {
      try {
        root.localStorage.removeItem(KEY);
      } catch (e) {
        /* 忽略 */
      }
      return apply(systemTheme(), false);
    },
    isLight: function () { return current() === "light"; }
  };
})(window);
