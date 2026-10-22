const $ = (id) => document.getElementById(id);
let config = { server: "", token: "" };
let tab = null;
let aiAvailable = false;
// Free-text questions left empty by the last Autofill, with the frame each lives in.
let pendingQuestions = [];

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
    aiAvailable = Boolean(data.ai);
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
  $("draft").hidden = true;
  pendingQuestions = [];
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
    pendingQuestions = results.flatMap((r) => (r.result?.questions ?? []).map((q) => ({ ...q, frameId: r.frameId })));
    const n = pendingQuestions.length;
    const longNote = n === 0 ? "" : ` ${n} long question${n === 1 ? "" : "s"} still empty.`;

    if (filled.length === 0 && !attached && n === 0) {
      setResult("No empty fields recognised on this page.", false);
    } else {
      setResult(`Filled ${filled.length} field${filled.length === 1 ? "" : "s"}${attached ? " and attached your resume" : ""}.${longNote} Review, then submit.`);
    }
    if (n > 0 && aiAvailable) {
      $("draft").hidden = false;
      $("draft").disabled = false;
      $("draft").textContent = `Draft ${n} answer${n === 1 ? "" : "s"} with AI`;
    } else if (n > 0) {
      setResult(`${$("result").textContent} To draft them with AI, add an AI key on your JobPilot server.`);
    }
  } catch (e) {
    setResult(e.message, false);
  } finally {
    $("fill").disabled = false;
  }
}

async function draftAnswers() {
  if (pendingQuestions.length === 0) return;
  $("draft").disabled = true;
  setResult("Drafting answers from your resume… (10–40 seconds)");
  try {
    // Page text gives the AI the job description when this isn't a job JobPilot tracks.
    const [top] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (globalThis.jobpilotPageText ? globalThis.jobpilotPageText() : ""),
    });
    const out = await api("/api/extension/answers", {
      method: "POST",
      body: JSON.stringify({
        url: tab.url,
        pageTitle: tab.title,
        pageText: top?.result ?? "",
        questions: pendingQuestions.map(({ key, question, maxLength }) => ({ key, question, maxLength })),
      }),
    });

    let count = 0;
    const frames = [...new Set(pendingQuestions.map((q) => q.frameId))];
    for (const frameId of frames) {
      const keys = pendingQuestions.filter((q) => q.frameId === frameId).map((q) => q.key);
      const subset = Object.fromEntries(keys.filter((k) => out.answers[k]).map((k) => [k, out.answers[k]]));
      if (Object.keys(subset).length === 0) continue;
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [frameId] },
        func: (a) => globalThis.jobpilotFillAnswers(a),
        args: [subset],
      });
      count += res?.result ?? 0;
    }
    pendingQuestions = [];
    $("draft").hidden = true;
    setResult(`Drafted ${count} answer${count === 1 ? "" : "s"} (highlighted in amber). Read and edit each one before you submit.`);
  } catch (e) {
    setResult(e.message, false);
    $("draft").disabled = false;
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
$("draft").addEventListener("click", draftAnswers);
$("applied").addEventListener("click", markApplied);

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const stored = await chrome.storage.local.get(["server", "token"]);
  config = { server: stored.server || "", token: stored.token || "" };
  $("server").value = config.server;
  $("token").value = config.token;
  await connect();
})();
