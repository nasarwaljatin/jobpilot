import { and, eq } from "drizzle-orm";
import { userFromApiToken } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { findJobByUrl, json, preflight } from "@/lib/extension";

export const OPTIONS = preflight;

export async function GET(request: Request) {
  const user = await userFromApiToken(request);
  if (!user) return json({ error: "Invalid API token" }, 401);

  const db = await getDb();
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, user.id));
  if (!profile) return json({ error: "Profile not set up" }, 404);

  const pageUrl = new URL(request.url).searchParams.get("url") ?? "";
  const job = pageUrl ? await findJobByUrl(db, pageUrl) : null;
  let coverLetter = "";
  if (job) {
    const [app] = await db
      .select({ analysis: schema.applications.analysis })
      .from(schema.applications)
      .where(and(eq(schema.applications.userId, user.id), eq(schema.applications.jobId, job.id)));
    coverLetter = app?.analysis?.cover_letter ?? "";
  }

  const [firstName, ...rest] = profile.fullName.trim().split(/\s+/);
  return json({
    profile: {
      fullName: profile.fullName,
      firstName: firstName ?? "",
      lastName: rest.join(" "),
      email: user.email,
      phone: profile.phone,
      location: profile.location,
      linkedinUrl: profile.linkedinUrl,
      githubUrl: profile.githubUrl,
      portfolioUrl: profile.portfolioUrl,
      university: profile.university,
      degree: profile.degree,
      graduationYear: profile.graduationYear ? String(profile.graduationYear) : "",
    },
    answers: profile.answers,
    hasResume: Boolean(profile.resumePdfBase64),
    coverLetter,
    job,
  });
}
