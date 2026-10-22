// Injected into the application page (every frame). Defines:
//   jobpilotFill(data)        fills recognised empty fields, attaches the resume, and tags
//                             unanswered free-text questions for AI drafting
//   jobpilotFillAnswers(map)  fills tagged questions with drafted answers
//   jobpilotPageText()        visible page text, used as job context for unknown pages
// Nothing here ever clicks Submit. Wrapped in an IIFE so re-injecting the file is safe.
(() => {
  const textOf = (el) => (el ? (el.innerText || el.textContent || "").trim() : "");

  /** The human-readable question for a field: its label, else nearby text, else placeholder. */
  function questionText(el) {
    const candidates = [];
    if (el.id) candidates.push(textOf(document.querySelector(`label[for="${CSS.escape(el.id)}"]`)));
    candidates.push(textOf(el.closest("label")));
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) candidates.push(labelledBy.split(/\s+/).map((id) => textOf(document.getElementById(id))).join(" "));
    candidates.push(el.getAttribute("aria-label") || "");
    // Many ATS forms put the question in a sibling element inside the same field container.
    const container = el.closest("fieldset, li, div");
    if (container) candidates.push(textOf(container).slice(0, 400));
    candidates.push(el.placeholder || "");
    const found = candidates.map((c) => c.replace(/\s+/g, " ").trim()).find((c) => c.length > 0) || "";
    return found.replace(/\s*(\*|\(required\)|\(optional\))\s*$/i, "").trim();
  }

  /** Everything known about a field, for matching profile rules. */
  function describe(el) {
    const parts = [];
    if (el.id) parts.push(textOf(document.querySelector(`label[for="${CSS.escape(el.id)}"]`)));
    parts.push(textOf(el.closest("label")));
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) labelledBy.split(/\s+/).forEach((id) => parts.push(textOf(document.getElementById(id))));
    parts.push(el.getAttribute("aria-label") || "", el.placeholder || "", el.name || "", el.id || "", el.getAttribute("autocomplete") || "");
    if (parts.join("").trim().length < 3) {
      const container = el.closest("div, fieldset, li");
      if (container) parts.push(textOf(container).slice(0, 200));
    }
    return parts.filter(Boolean).join(" | ").replace(/\s+/g, " ");
  }

  function setValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    // Use the native setter so React/Vue-controlled inputs register the change.
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  // Indigo = filled from your profile; amber = drafted by AI, review before submitting.
  function mark(el, color = "79, 70, 229") {
    el.style.outline = `2px solid rgb(${color})`;
    el.style.outlineOffset = "1px";
    el.style.backgroundColor = `rgba(${color}, 0.08)`;
  }

  const usable = (el) => !el.disabled && !el.readOnly && !el.value.trim() && el.offsetParent !== null;

  // Short text inputs count as questions only when phrased like one.
  const QUESTION_LIKE = /\?\s*$|^(why|what|how|describe|tell us|tell me|explain|share|give an example|walk us through)\b/i;

  globalThis.jobpilotFill = function jobpilotFill(data) {
    const p = data.profile;
    const a = data.answers || {};

    // Order matters: the first rule whose pattern matches a field's description wins.
    const RULES = [
      [/first[\s_-]*name|given[\s_-]*name|\bfname\b|preferred first/i, p.firstName],
      [/last[\s_-]*name|surname|family[\s_-]*name|\blname\b/i, p.lastName],
      [/^(your\s+)?(full\s+|legal\s+)?name\b|full[\s_-]*name|candidate name/i, p.fullName],
      [/e-?mail/i, p.email],
      [/phone|mobile|contact number|telephone/i, p.phone],
      [/linkedin/i, p.linkedinUrl],
      [/github/i, p.githubUrl],
      [/portfolio|personal (web)?site|website|blog|other (url|link)/i, p.portfolioUrl],
      [/cover[\s_-]*letter/i, data.coverLetter],
      [/authori[sz]ed|sponsorship|visa|work permit|legally (able|eligible)/i, a.work_authorization],
      [/notice period|start date|availability|available to start|when can you (start|join)/i, a.notice_period],
      [/salary|compensation|\bctc\b|pay expectation/i, a.expected_salary],
      [/relocat/i, a.relocation],
      [/hear about|how did you (find|learn)|referral source|where did you/i, a.how_heard],
      [/why (do you want to )?(join|work|are you interested)|what excites you|why us|why .* company/i, a.why_company],
      [/school|university|college|institution/i, p.university],
      [/degree|major|discipline|field of study/i, p.degree],
      [/graduat|class of|year of (passing|completion)/i, p.graduationYear],
      [/(current )?location|city|where are you (located|based)|address/i, p.location],
    ];

    const filled = [];
    const fields = document.querySelectorAll(
      'input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input[type="search"], textarea',
    );
    for (const el of fields) {
      if (!usable(el)) continue;
      const desc = describe(el);
      if (!desc) continue;
      for (const [re, value] of RULES) {
        if (!re.test(desc)) continue;
        // Long free-text answers only belong in textareas; short values only in inputs.
        const long = typeof value === "string" && value.length > 160;
        if (value && (!long || el instanceof HTMLTextAreaElement)) {
          setValue(el, value);
          mark(el);
          filled.push(desc.split(" | ")[0].slice(0, 40));
        }
        break;
      }
    }

    let resumeAttached = false;
    if (data.resume) {
      const fileInputs = [...document.querySelectorAll('input[type="file"]')];
      const target =
        fileInputs.find((el) => /resume|\bcv\b|curriculum/i.test(describe(el))) ||
        fileInputs.find((el) => !/cover/i.test(describe(el)));
      if (target && target.files.length === 0) {
        const bytes = Uint8Array.from(atob(data.resume.base64), (c) => c.charCodeAt(0));
        const file = new File([bytes], data.resume.filename, { type: "application/pdf" });
        const dt = new DataTransfer();
        dt.items.add(file);
        target.files = dt.files;
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
        resumeAttached = true;
      }
    }

    // Whatever free-text questions are still empty can be drafted by AI on request.
    const questions = [];
    const prefix = Math.random().toString(36).slice(2, 7); // keeps keys unique across frames
    for (const el of document.querySelectorAll('textarea, input:not([type]), input[type="text"]')) {
      if (!usable(el)) continue;
      const q = questionText(el);
      const isQuestion = el instanceof HTMLTextAreaElement ? q.length >= 6 : q.length >= 12 && QUESTION_LIKE.test(q);
      if (!isQuestion) continue;
      const key = `${prefix}-${questions.length}`;
      el.setAttribute("data-jobpilot-q", key);
      questions.push({ key, question: q.slice(0, 600), maxLength: el.maxLength > 0 ? el.maxLength : null });
    }

    return { filled, resumeAttached, questions, title: document.title };
  };

  globalThis.jobpilotFillAnswers = function jobpilotFillAnswers(answers) {
    let count = 0;
    for (const [key, answer] of Object.entries(answers)) {
      const el = document.querySelector(`[data-jobpilot-q="${CSS.escape(key)}"]`);
      // Never overwrite something typed while the AI was drafting.
      if (!el || el.value.trim() || !answer) continue;
      setValue(el, answer);
      mark(el, "217, 119, 6");
      count++;
    }
    return count;
  };

  globalThis.jobpilotPageText = function jobpilotPageText() {
    const root = document.querySelector("main, [role=main], #content, .content") || document.body;
    return textOf(root).replace(/\n{3,}/g, "\n\n").slice(0, 8000);
  };
})();
