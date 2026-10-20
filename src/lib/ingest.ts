import { and, eq, lt, sql } from "drizzle-orm";
import type { DB } from "./db";
import { schema } from "./db";
import type { Company } from "./db/schema";
import { recomputeAllMatches } from "./matcher";
import { extractSkills } from "./skills";
import { fetchBoard } from "./sources";

export type RefreshResult = { company: string; jobs: number; error?: string };

export async function refreshCompany(db: DB, company: Company): Promise<RefreshResult> {
  const runStart = new Date();
  try {
    const fetched = await fetchBoard(company.board, company.slug);
    // A single upsert batch may not touch the same row twice, so drop duplicate postings.
    const unique = [...new Map(fetched.map((j) => [j.externalId, j])).values()];
    const rows = unique.map((j) => ({
      companyId: company.id,
      ...j,
      skills: extractSkills(`${j.title}\n${j.description}`),
      lastSeenAt: runStart,
      isActive: true,
    }));

    for (let i = 0; i < rows.length; i += 200) {
      await db
        .insert(schema.jobs)
        .values(rows.slice(i, i + 200))
        .onConflictDoUpdate({
          target: [schema.jobs.companyId, schema.jobs.externalId],
          set: {
            title: sql`excluded.title`,
            location: sql`excluded.location`,
            isRemote: sql`excluded.is_remote`,
            department: sql`excluded.department`,
            employmentType: sql`excluded.employment_type`,
            url: sql`excluded.url`,
            applyUrl: sql`excluded.apply_url`,
            description: sql`excluded.description`,
            skills: sql`excluded.skills`,
            postedAt: sql`excluded.posted_at`,
            lastSeenAt: sql`excluded.last_seen_at`,
            isActive: sql`true`,
          },
        });
    }

    // Anything this company no longer lists has been closed.
    await db
      .update(schema.jobs)
      .set({ isActive: false })
      .where(and(eq(schema.jobs.companyId, company.id), lt(schema.jobs.lastSeenAt, runStart)));

    await db
      .update(schema.companies)
      .set({ jobCount: rows.length, lastFetchedAt: runStart, lastError: null })
      .where(eq(schema.companies.id, company.id));
    return { company: company.name, jobs: rows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.companies)
      .set({ lastFetchedAt: runStart, lastError: message.slice(0, 500) })
      .where(eq(schema.companies.id, company.id));
    return { company: company.name, jobs: 0, error: message };
  }
}

/** Fetches every tracked company (6 at a time) and then re-scores all users. */
export async function refreshAllCompanies(db: DB): Promise<RefreshResult[]> {
  const all = await db.select().from(schema.companies);
  const results: RefreshResult[] = [];
  let next = 0;
  // Fetches run concurrently; DB writes from each worker are small batches.
  const worker = async () => {
    while (next < all.length) {
      const company = all[next++];
      results.push(await refreshCompany(db, company));
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, all.length) }, worker));
  await recomputeAllMatches(db);
  return results;
}
