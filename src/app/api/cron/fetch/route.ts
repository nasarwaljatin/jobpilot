import { getDb } from "@/lib/db";
import { refreshAllCompanies } from "@/lib/ingest";

export const maxDuration = 300;

// Called daily by Vercel Cron (see vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await refreshAllCompanies(await getDb());
  return Response.json({
    companies: results.length,
    jobs: results.reduce((n, r) => n + r.jobs, 0),
    errors: results.filter((r) => r.error),
  });
}
