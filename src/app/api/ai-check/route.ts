import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { diagnoseModels } from "@/lib/llm";
import { AI_DAILY_LIMIT, consumeAiQuota } from "@/lib/usage";

export const maxDuration = 60;

/**
 * Logged-in diagnostic: pings every candidate AI model with a one-word prompt and reports
 * availability and speed. Open /api/ai-check in the browser while signed in.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first, then open this page again." }, { status: 401 });
  const db = await getDb();
  if (!(await consumeAiQuota(db, user.id))) {
    return Response.json({ error: `Daily AI limit reached (${AI_DAILY_LIMIT}).` }, { status: 429 });
  }
  const result = await diagnoseModels();
  if (!result) return Response.json({ error: "No AI key is set on the server." }, { status: 400 });
  return Response.json(result);
}
