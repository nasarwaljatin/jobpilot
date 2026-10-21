import "server-only";
import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import seedCompanies from "../../../db/seed-companies.json";

export type DB = PostgresJsDatabase<typeof schema>;

// With DATABASE_URL set (production: Neon / Supabase / any Postgres) we use postgres-js.
// Without it, local dev runs on an embedded PGlite database in ./.data — zero setup.
async function createDb(): Promise<DB> {
  // Vercel's Neon integration sets both names; a manually added variable is usually DATABASE_URL.
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) {
    // prepare:false keeps us compatible with transaction-mode poolers (Supabase, Neon).
    const client = postgres(url, { max: 3, prepare: false });
    return drizzlePostgres(client, { schema });
  }
  if (process.env.VERCEL) {
    // Serverless filesystems are read-only and ephemeral, so the embedded database can't work there.
    throw new Error("DATABASE_URL is not set. Add a Postgres database (e.g. Neon) in your Vercel project settings.");
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const dir = path.join(process.cwd(), ".data", "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  await client.exec(fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8"));
  for (const c of seedCompanies) {
    await client.query(
      "INSERT INTO companies (name, board, slug) VALUES ($1, $2, $3) ON CONFLICT (board, slug) DO NOTHING",
      [c.name, c.board, c.slug],
    );
  }
  // The PGlite and postgres-js drivers share Drizzle's Postgres query API.
  return drizzlePglite(client, { schema }) as unknown as DB;
}

const globalForDb = globalThis as unknown as { __jobpilotDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  globalForDb.__jobpilotDb ??= createDb().catch((err) => {
    // Don't cache a failed connection; the next request retries.
    globalForDb.__jobpilotDb = undefined;
    throw err;
  });
  return globalForDb.__jobpilotDb;
}

export { schema };
