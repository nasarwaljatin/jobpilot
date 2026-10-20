// Drizzle table definitions. Mirrors db/schema.sql — keep the two in sync.
import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { ApplicationStatus, FitAnalysis } from "../constants";

export { APPLICATION_STATUSES, type ApplicationStatus, type FitAnalysis } from "../constants";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull().default(""),
  apiToken: text("api_token").unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export type Answers = Record<string, string>;

export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  location: text("location").notNull().default(""),
  linkedinUrl: text("linkedin_url").notNull().default(""),
  githubUrl: text("github_url").notNull().default(""),
  portfolioUrl: text("portfolio_url").notNull().default(""),
  university: text("university").notNull().default(""),
  degree: text("degree").notNull().default(""),
  graduationYear: integer("graduation_year"),
  headline: text("headline").notNull().default(""),
  resumeText: text("resume_text").notNull().default(""),
  resumePdfBase64: text("resume_pdf_base64"),
  resumeFilename: text("resume_filename"),
  skills: jsonb("skills").$type<string[]>().notNull().default([]),
  targetRoles: jsonb("target_roles").$type<string[]>().notNull().default([]),
  preferredLocations: jsonb("preferred_locations").$type<string[]>().notNull().default([]),
  remoteOk: boolean("remote_ok").notNull().default(true),
  includeSenior: boolean("include_senior").notNull().default(false),
  answers: jsonb("answers").$type<Answers>().notNull().default({}),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export type Board = "greenhouse" | "lever" | "ashby";

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  board: text("board").$type<Board>().notNull(),
  slug: text("slug").notNull(),
  jobCount: integer("job_count").notNull().default(0),
  lastFetchedAt: ts("last_fetched_at"),
  lastError: text("last_error"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),
  title: text("title").notNull(),
  location: text("location").notNull().default(""),
  isRemote: boolean("is_remote").notNull().default(false),
  department: text("department").notNull().default(""),
  employmentType: text("employment_type").notNull().default(""),
  url: text("url").notNull(),
  applyUrl: text("apply_url").notNull().default(""),
  description: text("description").notNull().default(""),
  skills: jsonb("skills").$type<string[]>().notNull().default([]),
  postedAt: ts("posted_at"),
  firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  isActive: boolean("is_active").notNull().default(true),
});

export const matches = pgTable(
  "matches",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    matchedSkills: jsonb("matched_skills").$type<string[]>().notNull().default([]),
    missingSkills: jsonb("missing_skills").$type<string[]>().notNull().default([]),
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    computedAt: ts("computed_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.jobId] })],
);

export const applications = pgTable("applications", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  jobId: integer("job_id").references(() => jobs.id, { onDelete: "set null" }),
  company: text("company").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull().default(""),
  status: text("status").$type<ApplicationStatus>().notNull().default("saved"),
  notes: text("notes").notNull().default(""),
  analysis: jsonb("analysis").$type<FitAnalysis>(),
  appliedAt: ts("applied_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const aiUsage = pgTable(
  "ai_usage",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export type Profile = typeof profiles.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type Application = typeof applications.$inferSelect;
