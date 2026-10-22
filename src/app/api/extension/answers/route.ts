import { eq } from "drizzle-orm";
import { AiError, aiEnabled, draftAnswers, type FormQuestion } from "@/lib/ai";
import { userFromApiToken } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { findJobByUrl, json, preflight } from "@/lib/extension";
import { AI_DAILY_LIMIT, consumeAiQuota, refundAiQuota } from "@/lib/usage";

export const maxDuration = 120;
export const OPTIONS = preflight;

const MAX_QUESTIONS = 12;

/**
 * Drafts answers to the free-text questions the extension found on an application form.
 * Uses the tracked job's description when the page is a known job, else the page's own text.
 */
export async function POST(request: Request) {
  const user = await userFromApiToken(request);
  if (!user) return json({ error: "Invalid API token" }, 401);
  if (!aiEnabled()) {
    return json({ error: "AI isn't set up on the server. Add OPENAI_API_KEY, NVIDIA_API_KEY or ANTHROPIC_API_KEY." }, 400);
  }

  const body = (await request.json().catch(() => ({}))) as {
    url?: string;
    pageTitle?: string;
    pageText?: string;
    questions?: { key?: unknown; question?: unknown; maxLength?: unknown }[];
  };
  const questions: FormQuestion[] = (Array.isArray(body.questions) ? body.questions : [])
    .slice(0, MAX_QUESTIONS)
    .map((q) => ({
      key: String(q.key ?? "").slice(0, 40),
      question: String(q.question ?? "").replace(/\s+/g, " ").trim().slice(0, 600),
      maxLength: Number.isInteger(q.maxLength) && (q.maxLength as number) > 0 ? (q.maxLength as number) : null,
    }))
    .filter((q) => q.key && q.question);
  if (questions.length === 0) return json({ error: "No questions to answer" }, 400);

  const db = await getDb();
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, user.id));
  if (!profile) return json({ error: "Profile not set up" }, 404);

  const pageUrl = String(body.url ?? "");
  const tracked = pageUrl ? await findJobByUrl(db, pageUrl) : null;
  let job = {
    title: String(body.pageTitle ?? "").slice(0, 200) || "this role",
    company: pageUrl ? hostLabel(pageUrl) : "the company",
    description: String(body.pageText ?? "").slice(0, 8000),
  };
  if (tracked) {
    const [full] = await db.select({ description: schema.jobs.description }).from(schema.jobs).where(eq(schema.jobs.id, tracked.id));
    job = { title: tracked.title, company: tracked.company, description: full?.description || job.description };
  }

  if (!(await consumeAiQuota(db, user.id))) {
    return json({ error: `Daily AI limit reached (${AI_DAILY_LIMIT}). Try again tomorrow.` }, 429);
  }
  try {
    const answers = await draftAnswers(profile, job, questions);
    return json({ answers });
  } catch (err) {
    await refundAiQuota(db, user.id);
    if (err instanceof AiError) return json({ error: err.message }, 400);
    console.error("draft answers failed", err);
    return json({ error: "Could not draft answers. Please try again." }, 500);
  }
}

function hostLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^(www|jobs|careers|boards|apply)\./, "");
    const name = host.split(".")[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return "the company";
  }
}
