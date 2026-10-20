// Shared by server and client code; keep free of server-only imports.
export const APPLICATION_STATUSES = [
  "saved",
  "applied",
  "assessment",
  "interview",
  "offer",
  "rejected",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type FitAnalysis = {
  fit_score: number;
  verdict: string;
  strengths: string[];
  gaps: string[];
  tailored_bullets: string[];
  keywords_to_add: string[];
  cover_letter: string;
  cold_email: string;
};
