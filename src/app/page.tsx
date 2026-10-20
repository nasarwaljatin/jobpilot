import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

const STEPS = [
  ["Discover", "Pulls fresh roles every day from the public job boards of 45+ companies (Greenhouse, Lever, Ashby). Add any company in one paste."],
  ["Match", "Scores every role against your resume, target roles, location and seniority, so the internships and new-grad roles come first."],
  ["Tailor", "One click: an honest fit analysis, rewritten resume bullets, a cover letter and a referral email, all written from your real resume."],
  ["Autofill", "The Chrome extension fills application forms and attaches your resume. You review and press Submit yourself."],
  ["Track", "A pipeline for every application, from saved and applied through assessment, interview and offer."],
];

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
      <nav className="mb-16 flex items-center justify-between">
        <span className="text-lg font-semibold tracking-tight">JobPilot</span>
        <div className="flex gap-2">
          {user ? (
            <Link href="/dashboard" className="btn btn-primary">Open dashboard</Link>
          ) : (
            <>
              <Link href="/login" className="btn">Log in</Link>
              <Link href="/signup" className="btn btn-primary">Sign up free</Link>
            </>
          )}
        </div>
      </nav>

      <section className="max-w-2xl">
        <p className="badge mb-4">For students and new grads</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Apply to the right roles, faster, without spamming recruiters.
        </h1>
        <p className="mt-5 text-lg text-muted">
          JobPilot automates the busywork of a job search: finding roles, checking fit, tailoring your resume and
          filling in forms. You still review every application before you press Submit.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={user ? "/dashboard" : "/signup"} className="btn btn-primary">Get started</Link>
          <a href="#how" className="btn">How it works</a>
        </div>
      </section>

      <section id="how" className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map(([title, body], i) => (
          <div key={title} className="card p-5">
            <p className="text-xs font-medium text-muted">Step {i + 1}</p>
            <h2 className="mt-1 font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-muted">{body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-20 text-sm text-muted">
        Uses only public job-board APIs. No bots log in to LinkedIn or other job sites as you.
      </footer>
    </main>
  );
}
