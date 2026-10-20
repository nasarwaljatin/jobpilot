import "server-only";
import { and, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { getDb, schema } from "./db";

export type MatchFilters = { q?: string; minScore?: number; remote?: boolean; entryOnly?: boolean; limit?: number; offset?: number };

const ENTRY_SQL = sql`${schema.jobs.title} ~* '(intern|new grad|graduate|entry|junior|associate|apprentice|trainee|campus|early career|university|student|fresher)'`;

export async function getMatches(userId: string, f: MatchFilters = {}) {
  const db = await getDb();
  const conditions = [eq(schema.matches.userId, userId), eq(schema.jobs.isActive, true)];
  if (f.minScore) conditions.push(gte(schema.matches.score, f.minScore));
  if (f.remote) conditions.push(eq(schema.jobs.isRemote, true));
  if (f.entryOnly) conditions.push(ENTRY_SQL);
  if (f.q) {
    const like = `%${f.q}%`;
    conditions.push(or(ilike(schema.jobs.title, like), ilike(schema.companies.name, like), ilike(schema.jobs.location, like))!);
  }
  const where = and(...conditions);

  const rows = await db
    .select({
      jobId: schema.jobs.id,
      title: schema.jobs.title,
      location: schema.jobs.location,
      isRemote: schema.jobs.isRemote,
      url: schema.jobs.url,
      postedAt: schema.jobs.postedAt,
      company: schema.companies.name,
      score: schema.matches.score,
      matchedSkills: schema.matches.matchedSkills,
      reasons: schema.matches.reasons,
      status: schema.applications.status,
    })
    .from(schema.matches)
    .innerJoin(schema.jobs, eq(schema.matches.jobId, schema.jobs.id))
    .innerJoin(schema.companies, eq(schema.jobs.companyId, schema.companies.id))
    .leftJoin(
      schema.applications,
      and(eq(schema.applications.jobId, schema.jobs.id), eq(schema.applications.userId, userId)),
    )
    .where(where)
    .orderBy(desc(schema.matches.score), desc(schema.jobs.postedAt))
    .limit(f.limit ?? 50)
    .offset(f.offset ?? 0);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.matches)
    .innerJoin(schema.jobs, eq(schema.matches.jobId, schema.jobs.id))
    .innerJoin(schema.companies, eq(schema.jobs.companyId, schema.companies.id))
    .where(where);

  return { rows, total };
}

export type MatchRow = Awaited<ReturnType<typeof getMatches>>["rows"][number];
