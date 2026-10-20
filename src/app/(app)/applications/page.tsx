import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { addManualApplication } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { DeleteApplicationButton, NotesEditor, StatusSelect } from "@/components/JobButtons";
import { EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { APPLICATION_STATUSES } from "@/lib/constants";
import { getDb, schema } from "@/lib/db";

export default async function ApplicationsPage() {
  const user = await requireUser();
  const db = await getDb();
  const apps = await db
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.userId, user.id))
    .orderBy(desc(schema.applications.updatedAt));

  const counts = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, apps.filter((a) => a.status === s).length]));

  return (
    <>
      <PageHeader title="Applications" subtitle="Your pipeline, from saved to offer." />

      <section className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {APPLICATION_STATUSES.map((s) => (
          <div key={s} className="card p-3 text-center">
            <p className="text-xs capitalize text-muted">{s}</p>
            <p className="text-xl font-semibold tabular-nums">{counts[s]}</p>
          </div>
        ))}
      </section>

      <details className="card mb-6 p-4">
        <summary className="cursor-pointer text-sm font-medium">+ Track an application from somewhere else (LinkedIn, Naukri, referral…)</summary>
        <ActionForm action={addManualApplication} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="m-company">Company</label>
            <input id="m-company" name="company" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="m-title">Role</label>
            <input id="m-title" name="title" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="m-url">Link (optional)</label>
            <input id="m-url" name="url" type="url" className="input" />
          </div>
          <select name="status" className="input" defaultValue="applied" aria-label="Status">
            {APPLICATION_STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
          </select>
          <SubmitButton>Add</SubmitButton>
        </ActionForm>
      </details>

      {apps.length === 0 ? (
        <EmptyState title="Nothing tracked yet">
          Save jobs from your <Link href="/jobs" className="text-accent">matches</Link>, or mark them applied from the Chrome extension.
        </EmptyState>
      ) : (
        <ul className="card divide-y divide-border">
          {apps.map((a) => (
            <li key={a.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start">
              <div className="min-w-0">
                {a.jobId ? (
                  <Link href={`/jobs/${a.jobId}`} className="font-medium hover:text-accent">{a.title}</Link>
                ) : a.url ? (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-accent">{a.title} ↗</a>
                ) : (
                  <span className="font-medium">{a.title}</span>
                )}
                <p className="text-sm text-muted">
                  {a.company}
                  {a.appliedAt ? ` · applied ${timeAgo(a.appliedAt)}` : ` · updated ${timeAgo(a.updatedAt)}`}
                  {a.analysis && ` · AI fit ${a.analysis.fit_score}`}
                </p>
              </div>
              <NotesEditor id={a.id} notes={a.notes} />
              <div className="flex items-center gap-2">
                <StatusSelect id={a.id} status={a.status} />
                <DeleteApplicationButton id={a.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
