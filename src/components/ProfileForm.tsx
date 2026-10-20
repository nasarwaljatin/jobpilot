"use client";

import { useActionState, useState } from "react";
import { saveProfile } from "@/app/actions";
import { FormMessage, SubmitButton } from "./forms";

type ProfileData = {
  fullName: string;
  phone: string;
  location: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  university: string;
  degree: string;
  graduationYear: number | null;
  headline: string;
  resumeText: string;
  resumeFilename: string | null;
  skills: string[];
  targetRoles: string[];
  preferredLocations: string[];
  remoteOk: boolean;
  includeSenior: boolean;
  answers: Record<string, string>;
};

// Common screening questions the extension can paste into application forms.
const ANSWERS: [key: string, label: string, placeholder: string][] = [
  ["work_authorization", "Work authorization", "e.g. Indian citizen; will need visa sponsorship for the US"],
  ["notice_period", "Notice period / availability", "e.g. Available from June 2027 (graduating May 2027)"],
  ["expected_salary", "Expected compensation", "e.g. Open / as per company standards"],
  ["relocation", "Willing to relocate?", "e.g. Yes, anywhere in India"],
  ["how_heard", "How did you hear about us?", "e.g. Company careers page"],
  ["why_company", "Default 'Why do you want to work here?'", "A short, reusable answer you can tweak per company"],
];

function Field({ label, name, defaultValue, type = "text", placeholder, hint }: { label: string; name: string; defaultValue: string | number; type?: string; placeholder?: string; hint?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} className="input" defaultValue={defaultValue} placeholder={placeholder} />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function ProfileForm({ profile }: { profile: ProfileData }) {
  const [state, action] = useActionState(saveProfile, undefined);
  const [textEdited, setTextEdited] = useState(false);

  return (
    <form action={action} className="space-y-6">
      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Basics</h2>
        <Field label="Full name" name="fullName" defaultValue={profile.fullName} />
        <Field label="Phone" name="phone" type="tel" defaultValue={profile.phone} placeholder="+91 98765 43210" />
        <Field label="Current city" name="location" defaultValue={profile.location} placeholder="Bengaluru, India" />
        <Field label="One-line headline" name="headline" defaultValue={profile.headline} placeholder="Final-year CSE student, full-stack + ML" />
        <Field label="LinkedIn URL" name="linkedinUrl" type="url" defaultValue={profile.linkedinUrl} />
        <Field label="GitHub URL" name="githubUrl" type="url" defaultValue={profile.githubUrl} />
        <Field label="Portfolio / website" name="portfolioUrl" type="url" defaultValue={profile.portfolioUrl} />
        <div />
        <Field label="University" name="university" defaultValue={profile.university} />
        <Field label="Degree & major" name="degree" defaultValue={profile.degree} placeholder="B.Tech, Computer Science" />
        <Field label="Graduation year" name="graduationYear" type="number" defaultValue={profile.graduationYear ?? ""} placeholder="2027" />
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">Resume</h2>
        <div>
          <label className="label" htmlFor="resume">Upload PDF</label>
          <input id="resume" name="resume" type="file" accept="application/pdf" className="text-sm" />
          <p className="hint">
            {profile.resumeFilename ? `Current file: ${profile.resumeFilename}. ` : ""}
            The extension attaches this file to application forms; its text is used for matching and AI tailoring.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="resumeText">Resume text</label>
          <textarea
            id="resumeText"
            name="resumeText"
            rows={10}
            className="input font-mono text-xs"
            defaultValue={profile.resumeText}
            placeholder="Filled automatically from your PDF, or paste it here."
            onChange={() => setTextEdited(true)}
          />
          <input type="hidden" name="resumeTextEdited" value={textEdited ? "1" : "0"} />
        </div>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">What you&apos;re looking for</h2>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="targetRoles">Target roles</label>
          <input id="targetRoles" name="targetRoles" className="input" defaultValue={profile.targetRoles.join(", ")} placeholder="Software Engineer Intern, New Grad Software Engineer, ML Engineer" />
          <p className="hint">Comma-separated. Job titles are compared against these.</p>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="skills">Skills</label>
          <input id="skills" name="skills" className="input" defaultValue={profile.skills.join(", ")} placeholder="Python, React, Node.js, SQL, Docker, AWS" />
          <p className="hint">Comma-separated. Skills found in your resume are added automatically.</p>
        </div>
        <div>
          <label className="label" htmlFor="preferredLocations">Preferred locations</label>
          <input id="preferredLocations" name="preferredLocations" className="input" defaultValue={profile.preferredLocations.join(", ")} placeholder="Bengaluru, Hyderabad, India" />
        </div>
        <div className="flex flex-col justify-end gap-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="remoteOk" defaultChecked={profile.remoteOk} /> Open to remote roles</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="includeSenior" defaultChecked={profile.includeSenior} /> Include senior roles in matches</label>
        </div>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="font-semibold">Saved answers</h2>
          <p className="hint">The extension fills these into matching questions on application forms.</p>
        </div>
        {ANSWERS.map(([key, label, placeholder]) => (
          <Field key={key} label={label} name={`answer_${key}`} defaultValue={profile.answers[key] ?? ""} placeholder={placeholder} />
        ))}
      </section>

      <div className="flex items-center gap-4">
        <SubmitButton pendingText="Saving & re-matching…">Save profile</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
