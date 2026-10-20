import Link from "next/link";
import { and, eq, gte, max, sql } from "drizzle-orm";
import { refreshNow } from "@/app/actions";
import { ActionButton } from "@/components/forms";
import { JobList } from "@/components/JobList";
import { EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getMatches } from "@/lib/queries";

export default async function DashboardPage() {
  const user = await requireUser();
  const db = await getDb();

  const [[profile], [jobStats], [strong], statusRows, top] = await Promise.all([
    db.select().from(schema.profiles).where(eq(schema.profiles.userId, user.id)),
    db
      .select({ active: sql<number>`count(*) filter (where ${schema.jobs.isActive})::int`, lastFetch: max(schema.jobs.lastSeenAt) })
      .from(schema.jobs),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.matches)
      .where(and(eq(schema.matches.userId, user.id), gte(schema.matches.score, 70))),
    db
      .select({ status: schema.applications.status, n: sql<number>`count(*)::int` })
      .from(schema.applications)
      .where(eq(schema.applications.userId, user.id))
      .groupBy(schema.applications.status),
    getMatches(user.id, { limit: 8 }),
  ]);

  const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, r.n]));
  const applied = ["applied", "assessment", "interview", "offer", "rejected"].reduce((n, s) => n + (byStatus[s] ?? 0), 0);
  const profileGaps = [
    !profile?.resumeText && "upload your resume",
    !profile?.targetRoles.length && "add target roles",
    !profile?.skills.length && "list your skills",
  ].filter(Boolean) as string[];

  const stats = [
    ["Open roles tracked", jobStats.active],
    ["Your matches", top.total],
    ["Strong matches (70%+)", strong.n],
    ["Applied", applied],
    ["Interviews", (byStatus.interview ?? 0) + (byStatus.offer ?? 0)],
  ] as const;

  return (
    <>
      <PageHeader
        title={`Hi${user.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        subtitle={jobStats.lastFetch ? `Jobs last refreshed ${timeAgo(jobStats.lastFetch)}` : "No jobs fetched yet. Press Refresh jobs to pull the first batch."}
        actions={<ActionButton action={refreshNow} className="btn btn-primary" pendingText="Fetching jobs… (up to a minute)">Refresh jobs</ActionButton>}
      />

      {profileGaps.length > 0 && (
        <div className="card mb-6 border-warn bg-warn-soft p-4 text-sm">
          To get better matches, <Link href="/profile" className="font-medium text-accent">{profileGaps.join(", ")}</Link>.
        </div>
      )}

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label} className="card p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
          </div>
        ))}
      </section>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Top matches</h2>
        <Link href="/jobs" className="text-sm text-accent">See all →</Link>
      </div>
      {top.rows.length > 0 ? (
        <JobList rows={top.rows} />
      ) : (
        <EmptyState title="No matches yet">
          Complete your <Link href="/profile" className="text-accent">profile</Link>, then refresh jobs.
        </EmptyState>
      )}
    </>
  );
}
