import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { FitAnalysis, Profile } from "./db/schema";

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

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

export class AiError extends Error {}

export async function analyzeFit(
  profile: Profile,
  job: { title: string; company: string; location: string; description: string },
): Promise<FitAnalysis> {
  if (!aiEnabled()) throw new AiError("AI is not configured: set ANTHROPIC_API_KEY.");
  if (!profile.resumeText.trim()) throw new AiError("Add your resume on the Profile page first.");

  const client = new Anthropic();
  const candidate = [
    `Name: ${profile.fullName}`,
    profile.headline && `Headline: ${profile.headline}`,
    profile.university && `Education: ${profile.degree} at ${profile.university}${profile.graduationYear ? `, graduating ${profile.graduationYear}` : ""}`,
    profile.skills.length > 0 && `Self-reported skills: ${profile.skills.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      // Server-side fallback re-runs the request on Anthropic's recommended model if a safety classifier declines it.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(FitAnalysisSchema) },
      messages: [
        {
          role: "user",
          content: `<candidate>\n${candidate}\n</candidate>\n\n<resume>\n${profile.resumeText}\n</resume>\n\n<job company="${job.company}" title="${job.title}" location="${job.location}">\n${job.description}\n</job>\n\nAnalyze this candidate's fit for the job and draft the application materials.`,
        },
      ],
    });

    if (response.stop_reason === "refusal") throw new AiError("The model declined this request. Try editing the job text.");
    if (response.stop_reason === "max_tokens") throw new AiError("The response was cut off. Please try again.");
    if (!response.parsed_output) throw new AiError("Could not parse the AI response. Please try again.");
    const out = response.parsed_output;
    return { ...out, fit_score: Math.max(0, Math.min(100, out.fit_score)) };
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new AiError("ANTHROPIC_API_KEY is invalid.");
    if (err instanceof Anthropic.RateLimitError) throw new AiError("Rate limited by the AI provider. Try again in a minute.");
    if (err instanceof Anthropic.APIError) throw new AiError(`AI request failed (${err.status ?? "network"}).`);
    throw err;
  }
}
