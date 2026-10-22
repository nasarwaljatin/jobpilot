// Deterministic job scoring (0-100). Runs for every user x active job after each
// refresh, so it is pure string work — the LLM is only used on demand for one job.
import { eq } from "drizzle-orm";
import type { DB } from "./db";
import { schema } from "./db";
import type { Profile } from "./db/schema";
import { INDIA_RE, isIndiaPreference } from "./locations";
import { extractSkills, normalizeSkills } from "./skills";

export type MatchInput = Pick<
  Profile,
  "skills" | "resumeText" | "targetRoles" | "preferredLocations" | "remoteOk" | "includeSenior"
>;
type JobLite = { id: number; title: string; location: string; isRemote: boolean; employmentType: string; skills: string[] };

export type MatchResult = {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  reasons: string[];
};

// Includes mid-level grades ("SDE II", "Software Engineer 3"), which expect 2+ years of experience.
const SENIOR = /\b(senior|sr\.?|staff|principal|lead|manager|director|head|vp|vice president|architect|distinguished|fellow|iii|iv|(sde|engineer|developer|analyst)[- ]?(ii|2|3|4))\b/i;
const ENTRY = /\b(intern|internship|interns|new grad|new graduate|graduate|entry[- ]level|junior|jr\.?|associate|apprentice|trainee|campus|early career|university|student|freshers?|co-?op|sde[- ]?(1|i)|engineer[- ]i|0[- ]?(to|-)[- ]?[12] (years|yrs))\b/i;
// Board-supplied level labels (SmartRecruiters, Lever "commitment"). "Associate" there means
// 1–3 years, so only explicit student labels count as entry-level.
const LABEL_ENTRY = /\b(intern|internship|entry[- ]level|graduate|fresher|trainee|apprentice)\b/i;
const LABEL_SENIOR = /\b(mid-senior level|director)\b/i;
// A remote role is open to anyone only if its location names no place, or a global/APAC scope.
// "Remote — Singapore" or "São Paulo" (flagged remote by the board) is remote within that country.
const REMOTE_WORDS = /\b(remote|hybrid|work from home|wfh|flexible|distributed|virtual|or|and|in|only)\b|[-–·,/()|:;]/gi;
const OPEN_SCOPE = /\b(anywhere|global|worldwide|international|apac|asia)\b/i;
function remoteOpenTo(location: string, prefs: string[]): boolean {
  if (OPEN_SCOPE.test(location)) return true;
  const named = location.replace(REMOTE_WORDS, " ").trim();
  if (!named) return true;
  const jl = normPlace(location);
  return prefs.some((p) => (isIndiaPreference(p) ? INDIA_RE.test(location) : jl.includes(normPlace(p))));
}

const TOKEN_SYNONYMS: Record<string, string[]> = {
  engineering: ["engineer"],
  developer: ["engineer"],
  dev: ["engineer"],
  sde: ["software", "engineer"],
  swe: ["software", "engineer"],
  ml: ["machine", "learning"],
  ai: ["ai"],
  internship: ["intern"],
  interns: ["intern"],
  frontend: ["frontend"],
  "front-end": ["frontend"],
  backend: ["backend"],
  "back-end": ["backend"],
  fullstack: ["fullstack"],
  "full-stack": ["fullstack"],
  analytics: ["analyst"],
  scientist: ["science"],
};
const STOPWORDS = new Set(["of", "and", "the", "a", "an", "for", "to", "in", "at", "with", "i", "ii", "role", "-", "&", "/"]);

function titleTokens(s: string): Set<string> {
  const out = new Set<string>();
  const normalized = s.toLowerCase().replace(/full stack/g, "fullstack").replace(/front end/g, "frontend").replace(/back end/g, "backend");
  for (const raw of normalized.split(/[^a-z0-9+#.-]+/)) {
    const t = raw.replace(/^[.-]+|[.-]+$/g, "");
    if (!t || STOPWORDS.has(t)) continue;
    for (const x of TOKEN_SYNONYMS[t] ?? [t]) out.add(x);
  }
  return out;
}

const PLACE_SYNONYMS: [RegExp, string][] = [
  [/bengaluru/g, "bangalore"],
  [/gurugram/g, "gurgaon"],
  [/bombay/g, "mumbai"],
  [/new delhi|ncr/g, "delhi"],
  [/\b(us|usa|united states)\b/g, "united states"],
];
function normPlace(s: string): string {
  let out = s.toLowerCase();
  for (const [re, to] of PLACE_SYNONYMS) out = out.replace(re, to);
  return out;
}

export function userSkillSet(profile: Pick<MatchInput, "skills" | "resumeText">): string[] {
  return normalizeSkills([...profile.skills, ...extractSkills(profile.resumeText)]);
}

export function scoreJob(profile: MatchInput, userSkills: string[], job: JobLite): MatchResult {
  const reasons: string[] = [];
  const have = new Set(userSkills.map((s) => s.toLowerCase()));

  // Skills (45%)
  const matchedSkills = job.skills.filter((s) => have.has(s.toLowerCase()));
  const missingSkills = job.skills.filter((s) => !have.has(s.toLowerCase()));
  let skill = 0.3;
  if (job.skills.length > 0 && have.size > 0) {
    // Long JDs list many "nice to haves"; cap the denominator so they don't sink the score.
    skill = Math.min(1, matchedSkills.length / Math.min(job.skills.length, 8));
    reasons.push(`Matches ${matchedSkills.length} of ${job.skills.length} listed skills`);
  }

  // Title vs target roles (25%)
  let title = 0.5;
  if (profile.targetRoles.length > 0) {
    const jt = titleTokens(job.title);
    let best = 0;
    let bestRole = "";
    for (const role of profile.targetRoles) {
      const rt = [...titleTokens(role)];
      if (rt.length === 0) continue;
      const frac = rt.filter((t) => jt.has(t)).length / rt.length;
      if (frac > best) [best, bestRole] = [frac, role];
    }
    title = best;
    if (best >= 0.5) reasons.push(`Title fits "${bestRole}"`);
  }

  // Seniority (15%) — tuned for students and new grads unless includeSenior is on.
  // Employment type carries labels like "Internship" or "Entry Level" on some boards.
  let level = 0.5;
  // Some boards use underscores as separators ("2026_MS_Senior Developer"), which defeat \b.
  const cleanTitle = job.title.replace(/_/g, " ");
  const entry = ENTRY.test(cleanTitle) || LABEL_ENTRY.test(job.employmentType);
  const senior = SENIOR.test(cleanTitle) || (!entry && LABEL_SENIOR.test(job.employmentType));
  if (senior) {
    level = profile.includeSenior ? 0.5 : 0;
  } else if (entry) {
    level = 1;
    reasons.push("Entry-level / internship role");
  }

  // Location (15%, plus a penalty below when the job is somewhere the user can't work)
  let loc = 0.6;
  let outsidePrefs = false;
  const prefs = profile.preferredLocations.map((p) => p.trim()).filter(Boolean);
  const jl = normPlace(job.location);
  const prefHit = prefs.find((p) => (isIndiaPreference(p) ? INDIA_RE.test(job.location) : jl.includes(normPlace(p))));
  if (prefHit) {
    loc = 1;
    reasons.push(`In ${prefHit}`);
  } else if (job.isRemote && profile.remoteOk) {
    // "Remote — US only" isn't remote for someone in Bengaluru.
    const restricted = prefs.length > 0 && !remoteOpenTo(job.location, prefs);
    loc = restricted ? 0.25 : 1;
    outsidePrefs = restricted;
    if (!restricted) reasons.push("Remote");
  } else if (prefs.length > 0) {
    loc = 0.15;
    outsidePrefs = true;
  }

  let score = Math.round(100 * (0.45 * skill + 0.25 * title + 0.15 * level + 0.15 * loc));
  if (senior && !profile.includeSenior) score = Math.round(score * 0.5);
  // Location is usually a hard constraint (visas, relocation), so a role elsewhere ranks below local ones.
  if (outsidePrefs) score = Math.round(score * 0.75);
  return { score, matchedSkills, missingSkills, reasons };
}

const MIN_SCORE = 30;
// High enough that filters like "India only" still have plenty to show.
const MAX_MATCHES_PER_USER = 1500;

export async function recomputeMatchesForUser(db: DB, userId: string): Promise<number> {
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId));
  await db.delete(schema.matches).where(eq(schema.matches.userId, userId));
  if (!profile) return 0;

  const activeJobs = await db
    .select({
      id: schema.jobs.id,
      title: schema.jobs.title,
      location: schema.jobs.location,
      isRemote: schema.jobs.isRemote,
      employmentType: schema.jobs.employmentType,
      skills: schema.jobs.skills,
    })
    .from(schema.jobs)
    .where(eq(schema.jobs.isActive, true));

  const skills = userSkillSet(profile);
  const scored = activeJobs
    .map((job) => ({ job, r: scoreJob(profile, skills, job) }))
    .filter((x) => x.r.score >= MIN_SCORE)
    .sort((a, b) => b.r.score - a.r.score)
    .slice(0, MAX_MATCHES_PER_USER);

  for (let i = 0; i < scored.length; i += 300) {
    await db.insert(schema.matches).values(
      scored.slice(i, i + 300).map(({ job, r }) => ({
        userId,
        jobId: job.id,
        score: r.score,
        matchedSkills: r.matchedSkills,
        missingSkills: r.missingSkills,
        reasons: r.reasons,
      })),
    );
  }
  return scored.length;
}

export async function recomputeAllMatches(db: DB): Promise<void> {
  const rows = await db.select({ userId: schema.profiles.userId }).from(schema.profiles);
  for (const { userId } of rows) await recomputeMatchesForUser(db, userId);
}
