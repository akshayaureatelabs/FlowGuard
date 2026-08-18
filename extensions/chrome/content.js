(function () {
  let recording = false;

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

  function onClick(e) {
    if (!recording) return;
    const t = e.target;
    if (!t || !t.closest) return;
    pushStep({
      type: "click",
      config: { selector: { primary: cssPath(t), type: "css" } },
    });
  }

  function onChange(e) {
    if (!recording) return;
    const t = e.target;
    if (!t || !t.matches) return;
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

  function start() {
    if (recording) return;
    recording = true;
    document.addEventListener("click", onClick, true);
    document.addEventListener("change", onChange, true);
    pushStep({
      type: "navigate",
      config: { url: location.href },
    });
  }

  function stop() {
    recording = false;
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("change", onChange, true);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "FG_START") start();
    if (msg?.type === "FG_STOP") stop();
  });

  chrome.storage.local.get(["recording"], (data) => {
    if (data.recording) start();
  });
})();
