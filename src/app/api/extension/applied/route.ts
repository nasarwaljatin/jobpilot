import { userFromApiToken } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { findJobByUrl, json, preflight } from "@/lib/extension";

export const OPTIONS = preflight;

export async function POST(request: Request) {
  const user = await userFromApiToken(request);
  if (!user) return json({ error: "Invalid API token" }, 401);

  const body = (await request.json().catch(() => ({}))) as { url?: string; title?: string };
  const url = String(body.url ?? "");
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return json({ error: "A valid page url is required" }, 400);
  }

  const db = await getDb();
  const job = await findJobByUrl(db, url);
  const now = new Date();

  if (job) {
    await db
      .insert(schema.applications)
      .values({ userId: user.id, jobId: job.id, company: job.company, title: job.title, url: job.url, status: "applied", appliedAt: now })
      .onConflictDoUpdate({
        target: [schema.applications.userId, schema.applications.jobId],
        set: { status: "applied", appliedAt: now, updatedAt: now },
      });
    return json({ ok: true, tracked: `${job.title} at ${job.company}` });
  }

  // Not a job we index (e.g. a company's own site): track it as a manual entry.
  const company = host.replace(/^(www|jobs|careers|boards)\./, "").split(".")[0];
  const title = String(body.title ?? "").slice(0, 200) || "Application";
  await db.insert(schema.applications).values({
    userId: user.id,
    company: company.charAt(0).toUpperCase() + company.slice(1),
    title,
    url,
    status: "applied",
    appliedAt: now,
  });
  return json({ ok: true, tracked: `${title} (${host})` });
}
