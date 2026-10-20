import { asc } from "drizzle-orm";
import { addCompany } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PageHeader, timeAgo } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

const BOARD_URL = {
  greenhouse: (s: string) => `https://boards.greenhouse.io/${s}`,
  lever: (s: string) => `https://jobs.lever.co/${s}`,
  ashby: (s: string) => `https://jobs.ashbyhq.com/${s}`,
};

export default async function CompaniesPage() {
  await requireUser();
  const db = await getDb();
  const companies = await db.select().from(schema.companies).orderBy(asc(schema.companies.name));

  return (
    <>
      <PageHeader
        title="Companies"
        subtitle={`${companies.length} companies tracked. Jobs refresh daily, and every user benefits from every company added.`}
      />

      <section className="card mb-6 p-5">
        <h2 className="font-semibold">Add a company</h2>
        <p className="hint mb-4">
          Open the company&apos;s careers page and click any job. If the link goes to boards.greenhouse.io, jobs.lever.co or
          jobs.ashbyhq.com, paste it here.
        </p>
        <ActionForm action={addCompany} className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="careersUrl">Careers URL or slug</label>
            <input id="careersUrl" name="careersUrl" className="input" placeholder="https://jobs.lever.co/acme" required />
          </div>
          <div>
            <label className="label" htmlFor="name">Display name (optional)</label>
            <input id="name" name="name" className="input" placeholder="Acme" />
          </div>
          <div className="flex gap-2">
            <select name="board" className="input" aria-label="Board (when entering a bare slug)" defaultValue="">
              <option value="">Auto-detect</option>
              <option value="greenhouse">Greenhouse</option>
              <option value="lever">Lever</option>
              <option value="ashby">Ashby</option>
            </select>
            <SubmitButton pendingText="Checking…">Add</SubmitButton>
          </div>
        </ActionForm>
      </section>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-border">
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Board</th>
              <th className="px-4 py-3 text-right font-medium">Open roles</th>
              <th className="px-4 py-3 font-medium">Last fetched</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {companies.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2.5">
                  <a href={BOARD_URL[c.board](c.slug)} target="_blank" rel="noopener noreferrer" className="hover:text-accent">{c.name}</a>
                </td>
                <td className="px-4 py-2.5 capitalize text-muted">{c.board}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{c.jobCount}</td>
                <td className="px-4 py-2.5">
                  {c.lastError ? (
                    <span className="badge badge-bad" title={c.lastError}>Error</span>
                  ) : (
                    <span className="text-muted">{c.lastFetchedAt ? timeAgo(c.lastFetchedAt) : "Never"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
