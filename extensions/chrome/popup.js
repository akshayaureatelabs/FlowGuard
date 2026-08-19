const statusEl = document.getElementById("status");
const msgEl = document.getElementById("msg");
const outEl = document.getElementById("out");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const pushBtn = document.getElementById("push");
const apiUrlEl = document.getElementById("apiUrl");
const apiKeyEl = document.getElementById("apiKey");
const testIdEl = document.getElementById("testId");

function showMsg(text, ok) {
  msgEl.textContent = text;
  msgEl.className = "msg " + (ok ? "ok" : "err");
}

function refresh() {
  chrome.storage.local.get(["recording", "steps", "apiUrl", "apiKey", "testId"], (data) => {
    const recording = !!data.recording;
    statusEl.textContent = recording ? "Recording…" : "Idle";
    startBtn.disabled = recording;
    stopBtn.disabled = !recording;
    outEl.textContent = JSON.stringify(data.steps || [], null, 2);
    apiUrlEl.value = data.apiUrl || "http://localhost:3001";
    apiKeyEl.value = data.apiKey || "";
    testIdEl.value = data.testId || "";
    pushBtn.disabled = !(data.steps && data.steps.length);
  });
}

function persist() {
  chrome.storage.local.set({
    apiUrl: apiUrlEl.value.trim() || "http://localhost:3001",
    apiKey: apiKeyEl.value.trim(),
    testId: testIdEl.value.trim(),
  });
}

startBtn.onclick = async () => {
  persist();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.storage.local.set({ recording: true, steps: [] });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "FG_START" });
  }
  showMsg("", true);
  refresh();
};

stopBtn.onclick = async () => {
  persist();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.storage.local.set({ recording: false });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "FG_STOP" });
  }
  showMsg("", true);
  refresh();
};

pushBtn.onclick = async () => {
  persist();
  const { steps } = await chrome.storage.local.get(["steps"]);
  const apiUrl = apiUrlEl.value.trim().replace(/\/$/, "") || "http://localhost:3001";
  const testId = testIdEl.value.trim();
  const apiKey = apiKeyEl.value.trim();
  if (!testId) {
    showMsg("Enter a test ID to push steps into.", false);
    return;
  }
  if (!steps || !steps.length) {
    showMsg("No steps recorded yet.", false);
    return;
  }
  pushBtn.disabled = true;
  showMsg("Pushing…", true);
  try {
    const res = await fetch(`${apiUrl}/api/tests/${encodeURIComponent(testId)}/steps`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
      body: JSON.stringify({ steps }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || res.statusText);
    }
    await chrome.storage.local.set({ steps: [] });
    showMsg(`Pushed ${steps.length} step(s) to the test.`, true);
    refresh();
  } catch (e) {
    showMsg(`Push failed: ${e.message}`, false);
  } finally {
    pushBtn.disabled = false;
  }
};

document.getElementById("copy").onclick = async () => {
  const data = await chrome.storage.local.get(["steps"]);
  await navigator.clipboard.writeText(JSON.stringify(data.steps || [], null, 2));
  statusEl.textContent = "Copied to clipboard";
};

document.getElementById("clear").onclick = async () => {
  persist();
  await chrome.storage.local.set({ steps: [], recording: false });
  showMsg("", true);
  refresh();
};

chrome.storage.onChanged.addListener(refresh);
refresh();