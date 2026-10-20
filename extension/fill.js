// Injected into the application page (every frame). Defines jobpilotFill(data), which fills
// recognised empty fields and attaches the resume. It never clicks Submit.
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

  const textOf = (el) => (el ? (el.innerText || el.textContent || "").trim() : "");

  function describe(el) {
    const parts = [];
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) parts.push(textOf(lbl));
    }
    const wrap = el.closest("label");
    if (wrap) parts.push(textOf(wrap));
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) labelledBy.split(/\s+/).forEach((id) => parts.push(textOf(document.getElementById(id))));
    parts.push(el.getAttribute("aria-label") || "", el.placeholder || "", el.name || "", el.id || "", el.getAttribute("autocomplete") || "");
    // Many ATS forms put the question in a sibling element inside the same field container.
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

  function mark(el) {
    el.style.outline = "2px solid #4f46e5";
    el.style.outlineOffset = "1px";
    el.style.backgroundColor = "rgba(79, 70, 229, 0.08)";
  }

  const filled = [];
  const fields = document.querySelectorAll(
    'input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input[type="search"], textarea',
  );
  for (const el of fields) {
    if (el.disabled || el.readOnly || el.value.trim() || el.offsetParent === null) continue;
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

  return { filled, resumeAttached, title: document.title };
};
