import { eq } from "drizzle-orm";
import { userFromApiToken } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { json, preflight } from "@/lib/extension";

export const OPTIONS = preflight;

export async function GET(request: Request) {
  const user = await userFromApiToken(request);
  if (!user) return json({ error: "Invalid API token" }, 401);
  const db = await getDb();
  const [row] = await db
    .select({ base64: schema.profiles.resumePdfBase64, filename: schema.profiles.resumeFilename })
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, user.id));
  if (!row?.base64) return json({ error: "No resume uploaded" }, 404);
  return json({ filename: row.filename ?? "resume.pdf", base64: row.base64 });
}
