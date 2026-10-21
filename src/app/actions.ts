"use server";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, min } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { extractText } from "unpdf";
import { endSession, requireUser, startSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { sessionConfigError } from "@/lib/session";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/db/schema";
import { refreshAllCompanies, refreshCompany } from "@/lib/ingest";
import { recomputeMatchesForUser } from "@/lib/matcher";
import { normalizeSkills } from "@/lib/skills";
import { fetchBoard, parseBoardInput } from "@/lib/sources";

export type ActionState = { error?: string; ok?: string } | undefined;

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const list = (fd: FormData, key: string) =>
  str(fd, key)
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

// ---------- Auth ----------

export async function signup(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  const name = str(fd, "name");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  const configError = sessionConfigError();
  if (configError) return { error: configError };

  let userId: string;
  try {
    const db = await getDb();
    const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
    if (existing) return { error: "An account with this email already exists." };

    const [user] = await db
      .insert(schema.users)
      .values({ email, name, passwordHash: await bcrypt.hash(password, 10) })
      .returning({ id: schema.users.id });
    await db.insert(schema.profiles).values({ userId: user.id, fullName: name });
    userId = user.id;
  } catch (err) {
    console.error("signup failed", err);
    return { error: "Server error: could not reach the database. Check /api/health." };
  }
  await startSession(userId);
  redirect("/profile?welcome=1");
}

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  const configError = sessionConfigError();
  if (configError) return { error: configError };

  let userId: string;
  try {
    const db = await getDb();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return { error: "Incorrect email or password." };
    }
    userId = user.id;
  } catch (err) {
    console.error("login failed", err);
    return { error: "Server error: could not reach the database. Check /api/health." };
  }
  // Kept outside the try: redirect() works by throwing.
  await startSession(userId);
  redirect("/dashboard");
}

export async function logout() {
  await endSession();
  redirect("/");
}

// ---------- Profile ----------

const MAX_RESUME_BYTES = 4 * 1024 * 1024;

export async function saveProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const db = await getDb();

  const gradYear = parseInt(str(fd, "graduationYear"), 10);
  const answers: Record<string, string> = {};
  for (const [key, value] of fd.entries()) {
    if (key.startsWith("answer_") && typeof value === "string" && value.trim()) {
      answers[key.slice("answer_".length)] = value.trim();
    }
  }

  const update: Partial<typeof schema.profiles.$inferInsert> = {
    fullName: str(fd, "fullName"),
    phone: str(fd, "phone"),
    location: str(fd, "location"),
    linkedinUrl: str(fd, "linkedinUrl"),
    githubUrl: str(fd, "githubUrl"),
    portfolioUrl: str(fd, "portfolioUrl"),
    university: str(fd, "university"),
    degree: str(fd, "degree"),
    graduationYear: Number.isFinite(gradYear) ? gradYear : null,
    headline: str(fd, "headline"),
    resumeText: str(fd, "resumeText"),
    skills: normalizeSkills(list(fd, "skills")),
    targetRoles: list(fd, "targetRoles"),
    preferredLocations: list(fd, "preferredLocations"),
    remoteOk: fd.get("remoteOk") === "on",
    includeSenior: fd.get("includeSenior") === "on",
    answers,
    updatedAt: new Date(),
  };

  const file = fd.get("resume");
  if (file instanceof File && file.size > 0) {
    if (file.type !== "application/pdf") return { error: "Resume must be a PDF." };
    if (file.size > MAX_RESUME_BYTES) return { error: "Resume PDF must be under 4 MB." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    update.resumePdfBase64 = Buffer.from(bytes).toString("base64");
    update.resumeFilename = file.name;
    try {
      const { text } = await extractText(bytes, { mergePages: true });
      // Uploading a new PDF replaces the resume text unless the user also edited it by hand.
      if (text.trim() && fd.get("resumeTextEdited") !== "1") update.resumeText = text.trim();
    } catch {
      return { error: "Could not read text from that PDF. Paste your resume text instead." };
    }
  }

  await db
    .insert(schema.profiles)
    .values({ userId: user.id, ...update })
    .onConflictDoUpdate({ target: schema.profiles.userId, set: update });
  await db.update(schema.users).set({ name: update.fullName ?? "" }).where(eq(schema.users.id, user.id));

  const count = await recomputeMatchesForUser(db, user.id);
  revalidatePath("/", "layout");
  return { ok: `Profile saved. ${count} matching jobs found.` };
}

// ---------- Companies ----------

export async function addCompany(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const input = str(fd, "careersUrl");
  let parsed = parseBoardInput(input);
  if (!parsed) {
    const board = str(fd, "board");
    const slug = str(fd, "slug") || input;
    if ((board === "greenhouse" || board === "lever" || board === "ashby") && /^[\w.-]+$/.test(slug)) {
      parsed = { board, slug };
    }
  }
  if (!parsed) {
    return { error: "Paste a Greenhouse, Lever or Ashby careers URL, or choose a board and enter its slug." };
  }

  let count: number;
  try {
    count = (await fetchBoard(parsed.board, parsed.slug)).length;
  } catch (err) {
    return { error: `Could not load ${parsed.board}/${parsed.slug}: ${(err as Error).message}` };
  }

  const db = await getDb();
  const name = str(fd, "name") || parsed.slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const [company] = await db
    .insert(schema.companies)
    .values({ name, board: parsed.board, slug: parsed.slug })
    .onConflictDoNothing()
    .returning();
  if (!company) return { error: "That company is already being tracked." };

  await refreshCompany(db, company);
  await recomputeMatchesForUser(db, user.id);
  revalidatePath("/", "layout");
  return { ok: `Added ${name} (${count} open roles).` };
}

const REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

export async function refreshNow(): Promise<ActionState> {
  await requireUser();
  const db = await getDb();
  // Oldest fetch time: null while any company has never been fetched, so first runs are never blocked.
  const [{ oldest }] = await db.select({ oldest: min(schema.companies.lastFetchedAt) }).from(schema.companies);
  if (oldest && Date.now() - new Date(oldest).getTime() < REFRESH_COOLDOWN_MS) {
    return { error: "Jobs were refreshed in the last 15 minutes. Try again later." };
  }
  const results = await refreshAllCompanies(db);
  const total = results.reduce((n, r) => n + r.jobs, 0);
  const failed = results.filter((r) => r.error).length;
  revalidatePath("/", "layout");
  return { ok: `Fetched ${total} jobs from ${results.length - failed} companies${failed ? ` (${failed} failed)` : ""}.` };
}

// ---------- Applications ----------

export async function saveJob(jobId: number, status: ApplicationStatus = "saved") {
  const user = await requireUser();
  const db = await getDb();
  const [job] = await db
    .select({ id: schema.jobs.id, title: schema.jobs.title, url: schema.jobs.url, company: schema.companies.name })
    .from(schema.jobs)
    .innerJoin(schema.companies, eq(schema.jobs.companyId, schema.companies.id))
    .where(eq(schema.jobs.id, jobId));
  if (!job) return;
  const now = new Date();
  await db
    .insert(schema.applications)
    .values({
      userId: user.id,
      jobId: job.id,
      company: job.company,
      title: job.title,
      url: job.url,
      status,
      appliedAt: status === "applied" ? now : null,
    })
    .onConflictDoUpdate({
      target: [schema.applications.userId, schema.applications.jobId],
      set: { status, updatedAt: now, ...(status === "applied" ? { appliedAt: now } : {}) },
    });
  revalidatePath("/", "layout");
}

export async function setApplicationStatus(id: number, status: ApplicationStatus) {
  if (!APPLICATION_STATUSES.includes(status)) return;
  const user = await requireUser();
  const db = await getDb();
  const now = new Date();
  await db
    .update(schema.applications)
    .set({ status, updatedAt: now, ...(status === "applied" ? { appliedAt: now } : {}) })
    .where(and(eq(schema.applications.id, id), eq(schema.applications.userId, user.id)));
  revalidatePath("/applications");
}

export async function updateNotes(id: number, notes: string) {
  const user = await requireUser();
  const db = await getDb();
  await db
    .update(schema.applications)
    .set({ notes: notes.slice(0, 5000), updatedAt: new Date() })
    .where(and(eq(schema.applications.id, id), eq(schema.applications.userId, user.id)));
}

export async function deleteApplication(id: number) {
  const user = await requireUser();
  const db = await getDb();
  await db
    .delete(schema.applications)
    .where(and(eq(schema.applications.id, id), eq(schema.applications.userId, user.id)));
  revalidatePath("/applications");
}

export async function addManualApplication(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const company = str(fd, "company");
  const title = str(fd, "title");
  if (!company || !title) return { error: "Company and role are required." };
  const status = (str(fd, "status") || "applied") as ApplicationStatus;
  const db = await getDb();
  await db.insert(schema.applications).values({
    userId: user.id,
    company,
    title,
    url: str(fd, "url"),
    status: APPLICATION_STATUSES.includes(status) ? status : "applied",
    appliedAt: status === "applied" ? new Date() : null,
  });
  revalidatePath("/applications");
  return { ok: `Added ${title} at ${company}.` };
}

// ---------- Extension token ----------

export async function regenerateApiToken() {
  const user = await requireUser();
  const db = await getDb();
  const token = `jp_${crypto.randomBytes(24).toString("base64url")}`;
  await db.update(schema.users).set({ apiToken: token }).where(eq(schema.users.id, user.id));
  revalidatePath("/settings");
}
