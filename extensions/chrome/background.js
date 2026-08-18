chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ recording: false, steps: [] });
});
