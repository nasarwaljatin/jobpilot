"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FitAnalysis } from "@/lib/constants";

function CopyBlock({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button
          type="button"
          className="text-xs text-accent"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="rounded-lg bg-background p-3 text-sm whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function Bullets({ title, items, tone }: { title: string; items: string[]; tone?: string }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className={`text-sm font-semibold ${tone ?? ""}`}>{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
        {items.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
    </div>
  );
}

export function AnalyzePanel({ jobId, enabled, initial }: { jobId: number; enabled: boolean; initial: FitAnalysis | null }) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setAnalysis(data.analysis);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">AI application kit</h2>
        {analysis && <span className="badge tabular-nums">AI fit {analysis.fit_score}/100</span>}
      </div>
      {!enabled ? (
        <p className="mt-2 text-sm text-muted">
          Add an AI key on the server (OPENAI_API_KEY, NVIDIA_API_KEY or ANTHROPIC_API_KEY) to enable AI tailoring.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">
            An honest fit check, resume bullets tailored to this role, a cover letter and a referral email, all written from your resume.
          </p>
          <button type="button" className="btn btn-primary mt-3 w-full" disabled={loading} onClick={run}>
            {loading ? "Analyzing… (about 30 seconds)" : analysis ? "Regenerate" : "Analyze fit & draft application"}
          </button>
          {error && <p className="mt-2 text-sm text-bad">{error}</p>}
        </>
      )}

      {analysis && (
        <div className="mt-4 border-t border-border pt-2">
          <p className="mt-2 text-sm">{analysis.verdict}</p>
          <Bullets title="Strengths" items={analysis.strengths} tone="text-good" />
          <Bullets title="Gaps & how to address them" items={analysis.gaps} tone="text-warn" />
          <CopyBlock title="Tailored resume bullets" text={analysis.tailored_bullets.map((b) => `• ${b}`).join("\n")} />
          {analysis.keywords_to_add.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold">ATS keywords to include (if true)</h3>
              <p className="mt-1 flex flex-wrap gap-1">
                {analysis.keywords_to_add.map((k) => <span key={k} className="badge badge-muted">{k}</span>)}
              </p>
            </div>
          )}
          <CopyBlock title="Cover letter" text={analysis.cover_letter} />
          <CopyBlock title="Referral / recruiter email" text={analysis.cold_email} />
        </div>
      )}
    </section>
  );
}
