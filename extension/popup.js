const $ = (id) => document.getElementById(id);
let config = { server: "", token: "" };
let tab = null;

function setResult(text, ok = true) {
  $("result").textContent = text;
  $("result").className = `result ${ok ? "ok" : "err"}`;
}

async function api(path, init = {}) {
  const res = await fetch(`${config.server.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

async function connect() {
  $("fill").disabled = true;
  $("applied").disabled = true;
  if (!config.server || !config.token) {
    $("status").textContent = "Add your server URL and API token in Settings.";
    $("settings").hidden = false;
    return null;
  }
  try {
    const data = await api(`/api/extension/profile?url=${encodeURIComponent(tab?.url || "")}`);
    $("status").textContent = `Connected as ${data.profile.email}`;
    if (data.job) {
      $("job").hidden = false;
      $("job").textContent = `Tracked job: ${data.job.title} at ${data.job.company}${data.coverLetter ? " (AI cover letter ready)" : ""}`;
    }
    $("fill").disabled = false;
    $("applied").disabled = false;
    return data;
  } catch (e) {
    $("status").textContent = `Could not connect: ${e.message}`;
    return null;
  }
}

async function fill() {
  $("fill").disabled = true;
  setResult("Filling…");
  try {
    const data = await connect();
    if (!data) return;
    let resume = null;
    if (data.hasResume) resume = await api("/api/extension/resume").catch(() => null);
    const payload = { profile: data.profile, answers: data.answers, coverLetter: data.coverLetter, resume };

    const target = { tabId: tab.id, allFrames: true };
    let results;
    try {
      await chrome.scripting.executeScript({ target, files: ["fill.js"] });
      results = await chrome.scripting.executeScript({ target, func: (d) => globalThis.jobpilotFill(d), args: [payload] });
    } catch {
      // Some cross-origin frames refuse injection; fall back to the top frame only.
      const top = { tabId: tab.id };
      await chrome.scripting.executeScript({ target: top, files: ["fill.js"] });
      results = await chrome.scripting.executeScript({ target: top, func: (d) => globalThis.jobpilotFill(d), args: [payload] });
    }

    const filled = results.flatMap((r) => (r.result ? r.result.filled : []));
    const attached = results.some((r) => r.result && r.result.resumeAttached);
    if (filled.length === 0 && !attached) {
      setResult("No empty fields recognised on this page.", false);
    } else {
      setResult(`Filled ${filled.length} field${filled.length === 1 ? "" : "s"}${attached ? " and attached your resume" : ""}. Review, then submit.`);
    }
  } catch (e) {
    setResult(e.message, false);
  } finally {
    $("fill").disabled = false;
  }
}

async function markApplied() {
  $("applied").disabled = true;
  try {
    const out = await api("/api/extension/applied", {
      method: "POST",
      body: JSON.stringify({ url: tab.url, title: tab.title }),
    });
    setResult(`Tracked: ${out.tracked}`);
  } catch (e) {
    setResult(e.message, false);
  } finally {
    $("applied").disabled = false;
  }
}

$("toggle-settings").addEventListener("click", () => {
  $("settings").hidden = !$("settings").hidden;
});

$("save").addEventListener("click", async () => {
  config = { server: $("server").value.trim(), token: $("token").value.trim() };
  await chrome.storage.local.set(config);
  $("settings").hidden = true;
  await connect();
});

$("fill").addEventListener("click", fill);
$("applied").addEventListener("click", markApplied);

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const stored = await chrome.storage.local.get(["server", "token"]);
  config = { server: stored.server || "", token: stored.token || "" };
  $("server").value = config.server;
  $("token").value = config.token;
  await connect();
})();
