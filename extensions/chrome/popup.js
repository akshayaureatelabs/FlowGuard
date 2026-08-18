const statusEl = document.getElementById("status");
const outEl = document.getElementById("out");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");

function refresh() {
  chrome.storage.local.get(["recording", "steps"], (data) => {
    const recording = !!data.recording;
    statusEl.textContent = recording ? "Recording…" : "Idle";
    startBtn.disabled = recording;
    stopBtn.disabled = !recording;
    outEl.textContent = JSON.stringify(data.steps || [], null, 2);
  });
}

startBtn.onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.storage.local.set({ recording: true, steps: [] });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "FG_START" });
  }
  refresh();
};

stopBtn.onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.storage.local.set({ recording: false });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "FG_STOP" });
  }
  refresh();
};

document.getElementById("copy").onclick = async () => {
  const data = await chrome.storage.local.get(["steps"]);
  await navigator.clipboard.writeText(JSON.stringify(data.steps || [], null, 2));
  statusEl.textContent = "Copied to clipboard";
};

document.getElementById("clear").onclick = async () => {
  await chrome.storage.local.set({ steps: [], recording: false });
  refresh();
};

chrome.storage.onChanged.addListener(refresh);
refresh();
