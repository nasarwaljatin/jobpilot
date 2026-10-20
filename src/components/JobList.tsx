import Link from "next/link";
import type { MatchRow } from "@/lib/queries";
import { ScoreBadge, timeAgo } from "./ui";
import { SaveJobButton } from "./JobButtons";

export function JobList({ rows }: { rows: MatchRow[] }) {
  return (
    <ul className="card divide-y divide-border">
      {rows.map((r) => (
        <li key={r.jobId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/jobs/${r.jobId}`} className="font-medium hover:text-accent">
                {r.title}
              </Link>
              {r.isRemote && <span className="badge badge-muted">Remote</span>}
              {r.status && <span className="badge capitalize">{r.status}</span>}
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {r.company}
              {r.location && ` · ${r.location}`}
              {r.postedAt && ` · ${timeAgo(r.postedAt)}`}
            </p>
            {r.matchedSkills.length > 0 && (
              <p className="mt-2 flex flex-wrap gap-1">
                {r.matchedSkills.slice(0, 6).map((s) => (
                  <span key={s} className="badge badge-muted">{s}</span>
                ))}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ScoreBadge score={r.score} />
            {!r.status && <SaveJobButton jobId={r.jobId} />}
            <Link href={`/jobs/${r.jobId}`} className="btn btn-sm">Details</Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
