// Fetchers for public job-board APIs. These are the official, unauthenticated
// listing endpoints companies publish for their own career pages.
import type { Board } from "../db/schema";

export type NormalizedJob = {
  externalId: string;
  title: string;
  location: string;
  isRemote: boolean;
  department: string;
  employmentType: string;
  url: string;
  applyUrl: string;
  description: string;
  postedAt: Date | null;
};

const MAX_DESCRIPTION = 20_000;

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", rsquo: "'", lsquo: "'",
  rdquo: '"', ldquo: '"', ndash: "-", mdash: "-", hellip: "...", bull: "•",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+\d*);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<\/(p|div|h[1-6]|li|ul|ol)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n\n")
    .trim()
    .slice(0, MAX_DESCRIPTION);
}

const isRemoteText = (s: string) => /\bremote\b|anywhere|work from home|wfh/i.test(s);

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "JobPilot/1.0 (personal job tracker)" },
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });
  if (res.status === 404) throw new Error("Board not found (check the slug)");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

type GreenhouseJob = {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  content?: string;
  updated_at?: string;
  first_published?: string;
  departments?: { name: string }[];
};

async function fetchGreenhouse(slug: string): Promise<NormalizedJob[]> {
  const data = await getJson<{ jobs: GreenhouseJob[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
  );
  return data.jobs.map((j) => {
    const location = j.location?.name ?? "";
    // Greenhouse returns HTML that is itself entity-escaped, so decode once before stripping tags.
    const description = htmlToText(decodeEntities(j.content ?? ""));
    return {
      externalId: String(j.id),
      title: j.title.trim(),
      location,
      isRemote: isRemoteText(location),
      department: j.departments?.[0]?.name ?? "",
      employmentType: "",
      url: j.absolute_url,
      applyUrl: j.absolute_url,
      description,
      postedAt: j.first_published ? new Date(j.first_published) : j.updated_at ? new Date(j.updated_at) : null,
    };
  });
}

type LeverJob = {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  workplaceType?: string;
  descriptionPlain?: string;
  description?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
  categories?: { location?: string; team?: string; department?: string; commitment?: string };
};

async function fetchLever(slug: string): Promise<NormalizedJob[]> {
  const data = await getJson<LeverJob[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`);
  return data.map((j) => {
    const location = j.categories?.location ?? "";
    const parts = [
      j.descriptionPlain || htmlToText(j.description ?? ""),
      ...(j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`),
      j.additionalPlain ?? "",
    ];
    return {
      externalId: j.id,
      title: j.text.trim(),
      location,
      isRemote: j.workplaceType === "remote" || isRemoteText(location),
      department: j.categories?.team ?? j.categories?.department ?? "",
      employmentType: j.categories?.commitment ?? "",
      url: j.hostedUrl,
      applyUrl: j.applyUrl ?? j.hostedUrl,
      description: parts.filter(Boolean).join("\n\n").slice(0, MAX_DESCRIPTION),
      postedAt: j.createdAt ? new Date(j.createdAt) : null,
    };
  });
}

type AshbyJob = {
  id: string;
  title: string;
  location?: string;
  isRemote?: boolean;
  isListed?: boolean;
  department?: string;
  team?: string;
  employmentType?: string;
  jobUrl: string;
  applyUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  publishedAt?: string;
};

async function fetchAshby(slug: string): Promise<NormalizedJob[]> {
  const data = await getJson<{ jobs: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
  );
  return data.jobs
    .filter((j) => j.isListed !== false)
    .map((j) => ({
      externalId: j.id,
      title: j.title.trim(),
      location: j.location ?? "",
      isRemote: Boolean(j.isRemote) || isRemoteText(j.location ?? ""),
      department: j.team ?? j.department ?? "",
      employmentType: j.employmentType ?? "",
      url: j.jobUrl,
      applyUrl: j.applyUrl ?? j.jobUrl,
      description: (j.descriptionPlain || htmlToText(j.descriptionHtml ?? "")).slice(0, MAX_DESCRIPTION),
      postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
    }));
}

export function fetchBoard(board: Board, slug: string): Promise<NormalizedJob[]> {
  switch (board) {
    case "greenhouse":
      return fetchGreenhouse(slug);
    case "lever":
      return fetchLever(slug);
    case "ashby":
      return fetchAshby(slug);
  }
}

/** Accepts a slug or a careers URL (e.g. https://jobs.lever.co/acme) and returns board + slug. */
export function parseBoardInput(input: string): { board: Board; slug: string } | null {
  const s = input.trim();
  const patterns: [RegExp, Board][] = [
    [/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([\w-]+)/i, "greenhouse"],
    [/boards-api\.greenhouse\.io\/v1\/boards\/([\w-]+)/i, "greenhouse"],
    [/jobs\.(?:eu\.)?lever\.co\/([\w-]+)/i, "lever"],
    [/jobs\.ashbyhq\.com\/([\w.-]+)/i, "ashby"],
  ];
  for (const [re, board] of patterns) {
    const m = s.match(re);
    if (m) return { board, slug: m[1] };
  }
  return null;
}
