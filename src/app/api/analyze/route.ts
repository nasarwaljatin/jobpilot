import { eq } from "drizzle-orm";
import { AiError, analyzeFit } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { AI_DAILY_LIMIT, consumeAiQuota, refundAiQuota } from "@/lib/usage";

export const maxDuration = 300;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { jobId?: number };
  const jobId = Number(body.jobId);
  if (!Number.isInteger(jobId)) return Response.json({ error: "jobId is required" }, { status: 400 });

  const db = await getDb();
  const [row] = await db
    .select({ job: schema.jobs, company: schema.companies.name })
    .from(schema.jobs)
    .innerJoin(schema.companies, eq(schema.jobs.companyId, schema.companies.id))
    .where(eq(schema.jobs.id, jobId));
  if (!row) return Response.json({ error: "Job not found" }, { status: 404 });

  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, user.id));
  if (!profile) return Response.json({ error: "Complete your profile first" }, { status: 400 });

  if (!(await consumeAiQuota(db, user.id))) {
    return Response.json({ error: `Daily AI limit reached (${AI_DAILY_LIMIT}). Try again tomorrow.` }, { status: 429 });
  }

  try {
    const analysis = await analyzeFit(profile, {
      title: row.job.title,
      company: row.company,
      location: row.job.location,
      description: row.job.description,
    });
    await db
      .insert(schema.applications)
      .values({ userId: user.id, jobId, company: row.company, title: row.job.title, url: row.job.url, analysis })
      .onConflictDoUpdate({
        target: [schema.applications.userId, schema.applications.jobId],
        set: { analysis, updatedAt: new Date() },
      });
    return Response.json({ analysis });
  } catch (err) {
    await refundAiQuota(db, user.id);
    if (err instanceof AiError) return Response.json({ error: err.message }, { status: 400 });
    console.error("analyze failed", err);
    return Response.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }
}
