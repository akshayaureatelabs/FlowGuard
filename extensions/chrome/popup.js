const statusEl = document.getElementById("status");
const msgEl = document.getElementById("msg");
const outEl = document.getElementById("out");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const pushBtn = document.getElementById("push");
const apiUrlEl = document.getElementById("apiUrl");
const apiKeyEl = document.getElementById("apiKey");
const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const signInBtn = document.getElementById("signIn");
const signOutBtn = document.getElementById("signOut");
const signedInEl = document.getElementById("signedIn");
const signedInTextEl = document.getElementById("signedInText");
const syncSectionEl = document.getElementById("syncSection");
const projectSel = document.getElementById("projectSel");
const testSel = document.getElementById("testSel");

function showMsg(text, ok) {
  msgEl.textContent = text;
  msgEl.className = "msg " + (ok ? "ok" : "err");
}

function authHeaders(session) {
  if (!session) return {};
  if (session.mode === "token") return { Authorization: `Bearer ${session.token}` };
  return { "x-api-key": session.apiKey };
}

function sessionUserLabel(session) {
  if (!session) return "";
  return session.user?.email || (session.mode === "key" ? "API key session" : "signed in");
}

async function apiFetch(apiUrl, path, session, options = {}) {
  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(session),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function renderSession(session) {
  const label = sessionUserLabel(session);
  if (label) {
    signedInEl.style.display = "flex";
    signedInTextEl.textContent = label;
    syncSectionEl.style.display = "block";
  } else {
    signedInEl.style.display = "none";
    syncSectionEl.style.display = "none";
  }
  pushBtn.disabled = true;
  projectSel.innerHTML = '<option value="">— select project —</option>';
  testSel.innerHTML = '<option value="">— select test —</option>';
}

async function loadProjects() {
  const session = await chrome.storage.local.get(["session"]);
  const apiUrl = apiUrlEl.value.trim().replace(/\/$/, "") || "http://localhost:3001";
  if (!session?.session) return;
  try {
    const projects = await apiFetch(apiUrl, "/api/projects", session.session);
    projectSel.innerHTML = '<option value="">— select project —</option>';
    for (const p of projects) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      projectSel.appendChild(opt);
    }
    const saved = await chrome.storage.local.get(["projectId", "testId"]);
    if (saved.projectId) projectSel.value = saved.projectId;
    if (saved.testId) testSel.value = saved.testId;
    if (projectSel.value) await loadTests();
  } catch (e) {
    showMsg(`Sync failed: ${e.message}`, false);
  }
}

async function loadTests() {
  const session = await chrome.storage.local.get(["session"]);
  const apiUrl = apiUrlEl.value.trim().replace(/\/$/, "") || "http://localhost:3001";
  const projectId = projectSel.value;
  testSel.innerHTML = '<option value="">— select test —</option>';
  pushBtn.disabled = true;
  if (!projectId || !session?.session) return;
  try {
    const tests = await apiFetch(
      apiUrl,
      `/api/projects/${encodeURIComponent(projectId)}/tests`,
      session.session
    );
    for (const t of tests) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      testSel.appendChild(opt);
    }
    const saved = await chrome.storage.local.get(["testId"]);
    if (saved.testId && tests.some((t) => t.id === saved.testId)) {
      testSel.value = saved.testId;
    }
    if (testSel.value) {
      pushBtn.disabled = true;
      await chrome.storage.local.set({ projectId, testId: testSel.value });
    }
  } catch (e) {
    showMsg(`Failed to load tests: ${e.message}`, false);
  }
}

async function refresh() {
  const data = await chrome.storage.local.get([
    "recording",
    "steps",
    "apiUrl",
    "apiKey",
    "session",
  ]);
  const recording = !!data.recording;
  statusEl.textContent = recording ? "Recording…" : "Idle";
  startBtn.disabled = recording;
  stopBtn.disabled = !recording;
  outEl.textContent = JSON.stringify(data.steps || [], null, 2);
  apiUrlEl.value = data.apiUrl || "http://localhost:3001";
  apiKeyEl.value = data.apiKey || "";
  renderSession(data.session || null);

  const saved = await chrome.storage.local.get(["projectId", "testId"]);
  if (saved.projectId && !projectSel.value) {
    projectSel.value = saved.projectId;
    await loadTests();
  }
  const { steps } = await chrome.storage.local.get(["steps"]);
  pushBtn.disabled = !(steps && steps.length) || !(saved.testId || testSel.value);
}

function persist() {
  chrome.storage.local.set({
    apiUrl: apiUrlEl.value.trim() || "http://localhost:3001",
    apiKey: apiKeyEl.value.trim(),
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

signInBtn.onclick = async () => {
  persist();
  const apiUrl = apiUrlEl.value.trim().replace(/\/$/, "") || "http://localhost:3001";
  const email = emailEl.value.trim();
  const password = passwordEl.value;
  const apiKey = apiKeyEl.value.trim();
  showMsg("Signing in…", true);
  try {
    let session;
    if (apiKey) {
      session = { mode: "key", apiKey };
    } else if (email && password) {
      const result = await fetch(`${apiUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!result.ok) {
        const body = await result.json().catch(() => ({}));
        throw new Error(body.error || "Login failed");
      }
      const data = await result.json();
      session = { mode: "token", token: data.token, user: data.user };
    } else {
      showMsg("Enter email+password or an API key.", false);
      return;
    }
    // Verify the session against the API before storing.
    await apiFetch(apiUrl, "/api/auth/me", session);
    await chrome.storage.local.set({ session, apiUrl });
    showMsg("Signed in — session verified.", true);
    await refresh();
    await loadProjects();
  } catch (e) {
    showMsg(`Sign-in failed: ${e.message}`, false);
  }
};

signOutBtn.onclick = async () => {
  await chrome.storage.local.remove(["session", "projectId", "testId"]);
  showMsg("Signed out.", true);
  refresh();
};

projectSel.onchange = async () => {
  await chrome.storage.local.set({ projectId: projectSel.value, testId: "" });
  await loadTests();
};

testSel.onchange = async () => {
  await chrome.storage.local.set({ projectId: projectSel.value, testId: testSel.value });
  const { steps } = await chrome.storage.local.get(["steps"]);
  pushBtn.disabled = !(steps && steps.length);
};

pushBtn.onclick = async () => {
  persist();
  const { steps, session } = await chrome.storage.local.get(["steps", "session"]);
  const apiUrl = apiUrlEl.value.trim().replace(/\/$/, "") || "http://localhost:3001";
  const testId = testSel.value;
  if (!testId) {
    showMsg("Select a project and test to push into.", false);
    return;
  }
  if (!steps || !steps.length) {
    showMsg("No steps recorded yet.", false);
    return;
  }
  if (!session) {
    showMsg("Sign in first so the push is authenticated.", false);
    return;
  }
  pushBtn.disabled = true;
  showMsg("Pushing…", true);
  try {
    const normalized = (steps || []).map((s) => ({
      ...s,
      id: s.id || crypto.randomUUID?.(),
      optional: !!s.optional,
      timeoutMs: s.timeoutMs || 10000,
    }));
    await apiFetch(
      apiUrl,
      `/api/tests/${encodeURIComponent(testId)}/steps`,
      session,
      { method: "POST", body: JSON.stringify({ steps: normalized }) }
    );
    await chrome.storage.local.set({ steps: [] });
    showMsg(`Pushed ${normalized.length} step(s) to the cloud test.`, true);
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
