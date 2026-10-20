import "server-only";
import { eq, inArray, or } from "drizzle-orm";
import type { DB } from "./db";
import { schema } from "./db";

// The extension authenticates with a bearer token (never cookies), so any origin may call these routes.
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS_HEADERS });
export const preflight = () => new Response(null, { status: 204, headers: CORS_HEADERS });

/** Finds the tracked job for an application page URL (handles /apply suffixes and ?gh_jid embeds). */
export async function findJobByUrl(db: DB, pageUrl: string) {
  let u: URL;
  try {
    u = new URL(pageUrl);
  } catch {
    return null;
  }
  const ghJid = u.searchParams.get("gh_jid");
  const base = `${u.origin}${u.pathname}`.replace(/\/(apply|application)\/?$/, "").replace(/\/$/, "");
  const candidates = [base, `${base}/apply`, `${base}/application`];

  const [job] = await db
    .select({ id: schema.jobs.id, title: schema.jobs.title, url: schema.jobs.url, company: schema.companies.name })
    .from(schema.jobs)
    .innerJoin(schema.companies, eq(schema.jobs.companyId, schema.companies.id))
    .where(
      ghJid
        ? eq(schema.jobs.externalId, ghJid)
        : or(inArray(schema.jobs.url, candidates), inArray(schema.jobs.applyUrl, candidates)),
    )
    .limit(1);
  return job ?? null;
}
