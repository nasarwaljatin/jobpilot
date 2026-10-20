import { and, eq, sql } from "drizzle-orm";
import { AiError, analyzeFit } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

export const maxDuration = 300;

const DAILY_LIMIT = parseInt(process.env.AI_DAILY_LIMIT ?? "20", 10);

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

  // Per-user daily cap so a shared deployment can't run up the API bill.
  const today = new Date().toISOString().slice(0, 10);
  const [usage] = await db
    .insert(schema.aiUsage)
    .values({ userId: user.id, day: today, count: 1 })
    .onConflictDoUpdate({
      target: [schema.aiUsage.userId, schema.aiUsage.day],
      set: { count: sql`${schema.aiUsage.count} + 1` },
    })
    .returning({ count: schema.aiUsage.count });
  if (usage.count > DAILY_LIMIT) {
    return Response.json({ error: `Daily AI limit reached (${DAILY_LIMIT}). Try again tomorrow.` }, { status: 429 });
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
    // Failed calls shouldn't count against the user's quota.
    await db
      .update(schema.aiUsage)
      .set({ count: sql`greatest(${schema.aiUsage.count} - 1, 0)` })
      .where(and(eq(schema.aiUsage.userId, user.id), eq(schema.aiUsage.day, today)));
    if (err instanceof AiError) return Response.json({ error: err.message }, { status: 400 });
    console.error("analyze failed", err);
    return Response.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }
}
