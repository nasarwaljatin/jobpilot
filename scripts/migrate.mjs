// Applies db/schema.sql and seeds the default company list.
// Usage: DATABASE_URL=postgres://... npm run db:migrate
// `--if-configured` (used by `npm run build`) skips quietly when DATABASE_URL is unset,
// so local builds work and every Vercel deploy migrates its database automatically.
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.argv.includes("--if-configured")) {
    console.log("DATABASE_URL not set; skipping migration.");
    process.exit(0);
  }
  console.error("DATABASE_URL is not set. (Local dev without it uses embedded PGlite and needs no migration.)");
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

try {
  await sql.unsafe(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
  const companies = JSON.parse(fs.readFileSync(path.join(root, "db", "seed-companies.json"), "utf8"));
  for (const c of companies) {
    await sql`INSERT INTO companies (name, board, slug) VALUES (${c.name}, ${c.board}, ${c.slug})
              ON CONFLICT (board, slug) DO NOTHING`;
  }
  console.log(`Schema applied; ${companies.length} default companies ensured.`);
} finally {
  await sql.end();
}
