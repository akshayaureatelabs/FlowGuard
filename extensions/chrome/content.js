(function () {
  let recording = false;
  let lastHoverEl = null;
  let lastHoverAt = 0;
  let lastActivityAt = Date.now();

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    while (el && el.nodeType === 1 && parts.length < 5) {
      let part = el.tagName.toLowerCase();
      if (el.classList?.length) {
        part += "." + [...el.classList].slice(0, 2).map((c) => CSS.escape(c)).join(".");
      }
      const parent = el.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((c) => c.tagName === el.tagName);
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(el) + 1})`;
        }
      }
      parts.unshift(part);
      el = parent;
    }
    return parts.join(" > ");
  }

  function pushStep(step) {
    chrome.storage.local.get(["steps", "recording"], (data) => {
      if (!data.recording) return;
      const steps = data.steps || [];
      steps.push({
        id: crypto.randomUUID(),
        ...step,
      });
      chrome.storage.local.set({ steps });
    });
  }

  function maybeWait() {
    const gap = Date.now() - lastActivityAt;
    if (gap >= 1500) {
      pushStep({
        type: "wait",
        config: { ms: Math.min(Math.round(gap / 100) * 100, 10000) },
      });
    }
    lastActivityAt = Date.now();
  }

  function onClick(e) {
    if (!recording) return;
    const t = e.target;
    if (!t || !t.closest) return;
    maybeWait();
    pushStep({
      type: "click",
      config: { selector: { primary: cssPath(t), type: "css" } },
    });
  }

  function onChange(e) {
    if (!recording) return;
    const t = e.target;
    if (!t || !t.matches) return;
    maybeWait();
    if (t.matches("input, textarea")) {
      pushStep({
        type: "type",
        config: {
          selector: { primary: cssPath(t), type: "css" },
          value: t.value || "",
          clearFirst: true,
        },
      });
    } else if (t.matches("select")) {
      pushStep({
        type: "select",
        config: {
          selector: { primary: cssPath(t), type: "css" },
          value: t.value || "",
        },
      });
    }
  }

  function onMouseOver(e) {
    if (!recording) return;
    const t = e.target;
    if (!t || t === lastHoverEl) return;
    const now = Date.now();
    if (now - lastHoverAt < 800) return;
    lastHoverEl = t;
    lastHoverAt = now;
  }

  function onKeyDown(e) {
    if (!recording) return;
    // Ctrl+Shift+A → assert element visible on last hovered
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "a" && lastHoverEl) {
      e.preventDefault();
      maybeWait();
      pushStep({
        type: "assert",
        config: {
          assertion: "elementVisible",
          selector: { primary: cssPath(lastHoverEl), type: "css" },
          expected: true,
        },
      });
    }
    // Ctrl+Shift+H → hover last hovered element
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "h" && lastHoverEl) {
      e.preventDefault();
      maybeWait();
      pushStep({
        type: "hover",
        config: { selector: { primary: cssPath(lastHoverEl), type: "css" } },
      });
    }
    // Ctrl+Shift+S → screenshot
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      maybeWait();
      pushStep({
        type: "screenshot",
        config: { fullPage: false },
      });
    }
  }

  function start() {
    if (recording) return;
    recording = true;
    lastActivityAt = Date.now();
    document.addEventListener("click", onClick, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("mouseover", onMouseOver, true);
    document.addEventListener("keydown", onKeyDown, true);
    pushStep({
      type: "navigate",
      config: { url: location.href },
    });
  }

  function stop() {
    recording = false;
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("change", onChange, true);
    document.removeEventListener("mouseover", onMouseOver, true);
    document.removeEventListener("keydown", onKeyDown, true);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "FG_START") start();
    if (msg?.type === "FG_STOP") stop();
  });

  chrome.storage.local.get(["recording"], (data) => {
    if (data.recording) start();
  });
})();
