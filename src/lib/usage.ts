import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { DB } from "./db";
import { schema } from "./db";

// Per-user daily cap on AI calls, so a shared deployment can't run up the API bill.
export const AI_DAILY_LIMIT = parseInt(process.env.AI_DAILY_LIMIT ?? "20", 10);

const today = () => new Date().toISOString().slice(0, 10);

/** Counts one AI call; returns false (and counts nothing extra that matters) once the cap is hit. */
export async function consumeAiQuota(db: DB, userId: string): Promise<boolean> {
  const [usage] = await db
    .insert(schema.aiUsage)
    .values({ userId, day: today(), count: 1 })
    .onConflictDoUpdate({
      target: [schema.aiUsage.userId, schema.aiUsage.day],
      set: { count: sql`${schema.aiUsage.count} + 1` },
    })
    .returning({ count: schema.aiUsage.count });
  return usage.count <= AI_DAILY_LIMIT;
}

/** Gives back a call that failed, so errors don't eat into the user's quota. */
export async function refundAiQuota(db: DB, userId: string) {
  await db
    .update(schema.aiUsage)
    .set({ count: sql`greatest(${schema.aiUsage.count} - 1, 0)` })
    .where(and(eq(schema.aiUsage.userId, userId), eq(schema.aiUsage.day, today())));
}
