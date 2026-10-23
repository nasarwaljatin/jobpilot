import "server-only";
import { z } from "zod";
import type { FitAnalysis, Profile } from "./db/schema";
import { AiError, generateJson } from "./llm";

export { AiError, aiEnabled } from "./llm";

const FitAnalysisSchema = z.object({
  fit_score: z.number().int().describe("Honest 0-100 estimate of how competitive this candidate is"),
  verdict: z.string().describe("One or two sentences: apply / stretch / skip, and why"),
  strengths: z.array(z.string()).describe("Requirements the candidate clearly meets, citing resume evidence"),
  gaps: z.array(z.string()).describe("Missing or weak requirements, each with a concrete way to close or address it"),
  tailored_bullets: z.array(z.string()).describe("4-6 rewritten resume bullets for this role, using only facts from the resume"),
  keywords_to_add: z.array(z.string()).describe("ATS keywords from the job description the resume should include, if truthful"),
  cover_letter: z.string().describe("Cover letter under 250 words, specific to this company and role"),
  cold_email: z.string().describe("Under 120 words: a note to a recruiter or engineer at the company asking for a referral or a chat"),
});

const SYSTEM = `You are a careful career coach helping a university student or new graduate apply for a specific job.
Ground everything in the resume provided. Never invent experience, employers, metrics, or skills the candidate does not show; when a bullet would benefit from a number the resume lacks, write a bracketed placeholder like [X%] for the candidate to fill in.
Be direct about fit: a student applying to a senior role should hear that plainly.
Write in plain, confident English without clichés ("I am writing to express my interest", "passionate", "synergy").`;

type JobContext = { title: string; company: string; location?: string; description: string };

function candidateBlock(profile: Profile): string {
  const lines = [
    `Name: ${profile.fullName}`,
    profile.headline && `Headline: ${profile.headline}`,
    profile.location && `Based in: ${profile.location}`,
    profile.university && `Education: ${profile.degree} at ${profile.university}${profile.graduationYear ? `, graduating ${profile.graduationYear}` : ""}`,
    profile.skills.length > 0 && `Self-reported skills: ${profile.skills.join(", ")}`,
  ].filter(Boolean);
  return `<candidate>\n${lines.join("\n")}\n</candidate>\n\n<resume>\n${profile.resumeText}\n</resume>`;
}

const jobBlock = (job: JobContext) =>
  `<job company="${job.company}" title="${job.title}"${job.location ? ` location="${job.location}"` : ""}>\n${job.description}\n</job>`;

export async function analyzeFit(profile: Profile, job: JobContext): Promise<FitAnalysis> {
  if (!profile.resumeText.trim()) throw new AiError("Add your resume on the Profile page first.");
  const out = await generateJson(FitAnalysisSchema, {
    system: SYSTEM,
    prompt: `${candidateBlock(profile)}\n\n${jobBlock(job)}\n\nAnalyze this candidate's fit for the job and draft the application materials.`,
    maxTokens: 16000,
    effort: "medium",
    // The /api/analyze route allows 300s; leave room for the database work around the call.
    deadlineMs: 240_000,
  });
  return { ...out, fit_score: Math.max(0, Math.min(100, out.fit_score)) };
}

export type FormQuestion = { key: string; question: string; maxLength: number | null };

const AnswersSchema = z.object({
  answers: z.array(
    z.object({
      key: z.string().describe("The key of the question being answered, copied exactly"),
      answer: z.string().describe("The answer text, plain text with no markdown"),
    }),
  ),
});

const ANSWER_SYSTEM = `You draft answers to job application form questions for a university student or new graduate, written in their own voice (first person).
Ground every answer in the resume, profile and saved answers provided. Never invent employers, projects, metrics, dates or skills. When an answer needs a specific fact you don't have (a number, a date, a person's name), write a short bracketed placeholder such as [number of users] so the candidate can fill it in.
Use the job description to make answers specific to this company and role.
Keep each answer within its character limit when one is given; otherwise aim for 60-150 words. Plain text only: no markdown, no headings, no bullet symbols, no greeting or sign-off.
Write naturally and concretely, without clichés ("passionate", "I am excited to", "synergy", "fast-paced environment").
Answer every question, using its exact key.`;

/** Drafts answers to free-text application questions. Returns answers keyed by question key. */
export async function draftAnswers(
  profile: Profile,
  job: JobContext,
  questions: FormQuestion[],
): Promise<Record<string, string>> {
  if (!profile.resumeText.trim()) throw new AiError("Add your resume on the Profile page first.");
  const saved = Object.entries(profile.answers)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
    .join("\n");
  const list = questions
    .map((q) => `<question key="${q.key}"${q.maxLength ? ` max_characters="${q.maxLength}"` : ""}>${q.question}</question>`)
    .join("\n");

  const out = await generateJson(AnswersSchema, {
    system: ANSWER_SYSTEM,
    prompt: `${candidateBlock(profile)}\n\n${saved ? `<saved_answers>\n${saved}\n</saved_answers>\n\n` : ""}${jobBlock(job)}\n\n<questions>\n${list}\n</questions>`,
    maxTokens: 8000,
    effort: "low",
    // The extension waits on this; /api/extension/answers allows 150s.
    deadlineMs: 110_000,
  });

  const byKey: Record<string, string> = {};
  for (const q of questions) {
    const a = out.answers.find((x) => x.key === q.key)?.answer.trim();
    if (a) byKey[q.key] = q.maxLength ? fitToLength(a, q.maxLength) : a;
  }
  return byKey;
}

/** Trims to a field's character limit, ending on a full sentence when possible. */
function fitToLength(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return lastStop > max * 0.5 ? cut.slice(0, lastStop + 1) : cut.trimEnd();
}
