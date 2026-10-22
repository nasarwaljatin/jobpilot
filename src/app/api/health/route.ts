import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

// Public setup check: reports which settings are present (never their values) and whether the DB answers.
export async function GET() {
  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL),
    AUTH_SECRET: Boolean(process.env.AUTH_SECRET),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
  };

  let database: Record<string, unknown>;
  try {
    const db = await getDb();
    const [[c], [j], [u]] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(schema.companies),
      db.select({ n: sql<number>`count(*)::int` }).from(schema.jobs).where(eq(schema.jobs.isActive, true)),
      db.select({ n: sql<number>`count(*)::int` }).from(schema.users),
    ]);
    database = { ok: true, companies: c.n, activeJobs: j.n, users: u.n };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    // Postgres error codes (e.g. 42P01 = missing table) are safe to show; messages may include hostnames.
    database = { ok: false, error: e.code ?? "connection_failed" };
  }

  // Local dev runs without DATABASE_URL/AUTH_SECRET by design (embedded DB, dev-only secret).
  const ok = database.ok === true && (env.AUTH_SECRET || process.env.NODE_ENV !== "production");
  return Response.json({ ok, env, database }, { status: ok ? 200 : 503 });
}
