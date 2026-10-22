-- JobPilot schema. Idempotent: safe to run on every deploy (`npm run db:migrate`).

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name          text NOT NULL DEFAULT '',
  api_token     text UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id             uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name           text NOT NULL DEFAULT '',
  phone               text NOT NULL DEFAULT '',
  location            text NOT NULL DEFAULT '',
  linkedin_url        text NOT NULL DEFAULT '',
  github_url          text NOT NULL DEFAULT '',
  portfolio_url       text NOT NULL DEFAULT '',
  university          text NOT NULL DEFAULT '',
  degree              text NOT NULL DEFAULT '',
  graduation_year     integer,
  headline            text NOT NULL DEFAULT '',
  resume_text         text NOT NULL DEFAULT '',
  resume_pdf_base64   text,
  resume_filename     text,
  skills              jsonb NOT NULL DEFAULT '[]',
  target_roles        jsonb NOT NULL DEFAULT '[]',
  preferred_locations jsonb NOT NULL DEFAULT '[]',
  remote_ok           boolean NOT NULL DEFAULT true,
  include_senior      boolean NOT NULL DEFAULT false,
  answers             jsonb NOT NULL DEFAULT '{}',
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
  id              serial PRIMARY KEY,
  name            text NOT NULL,
  board           text NOT NULL,
  slug            text NOT NULL,
  job_count       integer NOT NULL DEFAULT 0,
  last_fetched_at timestamptz,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board, slug)
);
-- Recreated on every run so databases created before a board was added pick up the new list.
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_board_check;
ALTER TABLE companies ADD CONSTRAINT companies_board_check
  CHECK (board IN ('greenhouse', 'lever', 'ashby', 'smartrecruiters'));

CREATE TABLE IF NOT EXISTS jobs (
  id              serial PRIMARY KEY,
  company_id      integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  external_id     text NOT NULL,
  title           text NOT NULL,
  location        text NOT NULL DEFAULT '',
  is_remote       boolean NOT NULL DEFAULT false,
  department      text NOT NULL DEFAULT '',
  employment_type text NOT NULL DEFAULT '',
  url             text NOT NULL,
  apply_url       text NOT NULL DEFAULT '',
  description     text NOT NULL DEFAULT '',
  skills          jsonb NOT NULL DEFAULT '[]',
  posted_at       timestamptz,
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  is_active       boolean NOT NULL DEFAULT true,
  UNIQUE (company_id, external_id)
);
CREATE INDEX IF NOT EXISTS jobs_active_idx ON jobs (is_active);

CREATE TABLE IF NOT EXISTS matches (
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id         integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  score          integer NOT NULL,
  matched_skills jsonb NOT NULL DEFAULT '[]',
  missing_skills jsonb NOT NULL DEFAULT '[]',
  reasons        jsonb NOT NULL DEFAULT '[]',
  computed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id)
);
CREATE INDEX IF NOT EXISTS matches_user_score_idx ON matches (user_id, score DESC);

CREATE TABLE IF NOT EXISTS applications (
  id         serial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id     integer REFERENCES jobs(id) ON DELETE SET NULL,
  company    text NOT NULL,
  title      text NOT NULL,
  url        text NOT NULL DEFAULT '',
  status     text NOT NULL DEFAULT 'saved',
  notes      text NOT NULL DEFAULT '',
  analysis   jsonb,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);

CREATE TABLE IF NOT EXISTS ai_usage (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day     date NOT NULL,
  count   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
