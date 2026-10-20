import Link from "next/link";
import { JobList } from "@/components/JobList";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMatches } from "@/lib/queries";

const PAGE_SIZE = 40;

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const filters = {
    q: sp.q?.trim() || undefined,
    minScore: parseInt(sp.min ?? "0", 10) || 0,
    remote: sp.remote === "1",
    entryOnly: sp.entry === "1",
  };
  const { rows, total } = await getMatches(user.id, { ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (p: number) => {
    const params = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => Boolean(e[1])));
    params.set("page", String(p));
    return `/jobs?${params}`;
  };

  return (
    <>
      <PageHeader title="Matched jobs" subtitle={`${total.toLocaleString()} roles ranked by fit with your profile`} />

      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4" action="/jobs">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="q">Search</label>
          <input id="q" name="q" className="input" placeholder="Title, company or city" defaultValue={filters.q} />
        </div>
        <div>
          <label className="label" htmlFor="min">Minimum match</label>
          <select id="min" name="min" className="input" defaultValue={String(filters.minScore)}>
            <option value="0">Any</option>
            <option value="50">50%+</option>
            <option value="60">60%+</option>
            <option value="70">70%+</option>
            <option value="80">80%+</option>
          </select>
        </div>
        <label className="flex h-[38px] items-center gap-2 text-sm">
          <input type="checkbox" name="entry" value="1" defaultChecked={filters.entryOnly} /> Internships / entry-level
        </label>
        <label className="flex h-[38px] items-center gap-2 text-sm">
          <input type="checkbox" name="remote" value="1" defaultChecked={filters.remote} /> Remote only
        </label>
        <button className="btn btn-primary">Apply filters</button>
      </form>

      {rows.length > 0 ? (
        <JobList rows={rows} />
      ) : (
        <EmptyState title="No jobs match these filters">
          Loosen the filters, or update your <Link href="/profile" className="text-accent">profile</Link>.
        </EmptyState>
      )}

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-3 text-sm">
          {page > 1 && <Link className="btn btn-sm" href={pageHref(page - 1)}>← Previous</Link>}
          <span className="text-muted">Page {page} of {pages}</span>
          {page < pages && <Link className="btn btn-sm" href={pageHref(page + 1)}>Next →</Link>}
        </nav>
      )}
    </>
  );
}
