import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { AnalyzePanel } from "@/components/AnalyzePanel";
import { MarkAppliedButton, SaveJobButton } from "@/components/JobButtons";
import { ScoreBadge, timeAgo } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { scoreJob, userSkillSet } from "@/lib/matcher";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const jobId = parseInt((await params).id, 10);
  if (!Number.isFinite(jobId)) notFound();

  const db = await getDb();
  const [row] = await db
    .select({ job: schema.jobs, company: schema.companies.name })
    .from(schema.jobs)
    .innerJoin(schema.companies, eq(schema.jobs.companyId, schema.companies.id))
    .where(eq(schema.jobs.id, jobId));
  if (!row) notFound();
  const { job, company } = row;

  const [[profile], [application]] = await Promise.all([
    db.select().from(schema.profiles).where(eq(schema.profiles.userId, user.id)),
    db
      .select()
      .from(schema.applications)
      .where(and(eq(schema.applications.userId, user.id), eq(schema.applications.jobId, jobId))),
  ]);
  // Score live so the page is accurate even for jobs below the stored-match threshold.
  const match = profile ? scoreJob(profile, userSkillSet(profile), job) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <article className="min-w-0">
        <Link href="/jobs" className="text-sm text-muted hover:text-foreground">← All jobs</Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{job.title}</h1>
        <p className="mt-1 text-muted">
          {company}
          {job.location && ` · ${job.location}`}
          {job.department && ` · ${job.department}`}
          {job.postedAt && ` · posted ${timeAgo(job.postedAt)}`}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a href={job.applyUrl || job.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            Open application ↗
          </a>
          {application ? (
            <span className="badge capitalize">{application.status}</span>
          ) : (
            <SaveJobButton jobId={job.id} />
          )}
          {application?.status !== "applied" && <MarkAppliedButton jobId={job.id} />}
          {!job.isActive && <span className="badge badge-bad">No longer listed</span>}
        </div>

        {match && (
          <section className="card mt-6 p-4">
            <div className="flex items-center gap-2">
              <ScoreBadge score={match.score} />
              <span className="text-sm text-muted">{match.reasons.join(" · ")}</span>
            </div>
            {match.matchedSkills.length > 0 && (
              <p className="mt-3 flex flex-wrap gap-1 text-sm">
                <span className="mr-1 text-muted">You have:</span>
                {match.matchedSkills.map((s) => <span key={s} className="badge badge-good">{s}</span>)}
              </p>
            )}
            {match.missingSkills.length > 0 && (
              <p className="mt-2 flex flex-wrap gap-1 text-sm">
                <span className="mr-1 text-muted">Missing:</span>
                {match.missingSkills.map((s) => <span key={s} className="badge badge-warn">{s}</span>)}
              </p>
            )}
          </section>
        )}

        <section className="card prose-job mt-6 p-5">{job.description || "No description provided."}</section>
      </article>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <AnalyzePanel jobId={job.id} enabled={aiEnabled()} initial={application?.analysis ?? null} />
      </aside>
    </div>
  );
}
