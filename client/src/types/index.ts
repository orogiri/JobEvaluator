export interface Category {
  id: number;
  name: string;
}

export interface Resume {
  id: number;
  name: string;
  category_id: number;
  category_name: string;
  text: string;
  created_at: string;
}

export interface Field {
  id: number;
  category_id: number;
  name: string;
  description: string;
}

export interface ScoreDetail {
  score: number;
  rationale: string;
  jd_evidence: string;
  resume_evidence: string;
  missing: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ScoreDetails {
  duties?: ScoreDetail;
  requirements?: ScoreDetail;
  years_experience?: ScoreDetail;
  skills?: ScoreDetail;
  preferences?: ScoreDetail;
  industry?: ScoreDetail;
}

export interface FieldValue {
  jd: string;
  resume: string;
}

// One geography-based pay band from a JD that lists multiple location/zone salary
// ranges (e.g. "Zone 1: $220k-$330k, Zone 2: $200k-$300k").
export interface SalaryZone {
  zone: string;
  min: number;
  max: number;
}

export interface ResumeSuggestion {
  type: 'rewrite' | 'add' | 'delete' | 'reorganize';
  section: string;
  current?: string;
  suggested?: string;
  rationale: string;
  score_dimension?: string;
}

export interface Evaluation {
  id: number;
  job_id: number;
  resume_id: number;
  resume_name: string;
  category_id: number;
  category_name: string;
  company: string;
  title: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_zones: SalaryZone[] | null;
  years_experience: number | null;
  score_duties: number | null;
  score_requirements: number | null;
  score_years_experience: number | null;
  score_skills: number | null;
  score_industry: number | null;
  applied: number;
  interview_1: number;
  interview_2: number;
  interview_3: number;
  offer_made: number;
  cover_letter_sent: number;
  company_industry: string | null;
  reports_to: string | null;
  score_preferences: number | null;
  remote: string | null;
  job_level: string | null;
  posted_date: string | null;
  meets_requirements: string | null;
  meets_requirements_notes: string | null;
  meets_preferences: string | null;
  meets_preferences_notes: string | null;
  score_details: ScoreDetails;
  field_values: Record<string, FieldValue>;
  llm_provider: string;
  llm_model: string;
  jd_text: string;
  created_at: string;
  resume_suggestions?: ResumeSuggestion[] | null;
}

export interface Weights {
  duties: number;
  requirements: number;
  years_experience: number;
  skills: number;
  preferences: number;
  industry: number;
}

export interface AppSettings {
  weights: Weights;
  openai_key: string;
  anthropic_key: string;
  qwen_key: string;
  deepseek_key: string;
  serper_key: string;
  company_research_instructions: string;
  last_provider?: string;
  last_model?: string;
}

export interface CoverLetterTemplate {
  id: number;
  name: string;
  body: string;
  instructions: string;
  created_at: string;
}

export interface CoverLetter {
  id: number;
  job_id: number;
  resume_id: number;
  template_id: number | null;
  provider: string;
  llm_model: string;
  content: string;
  job_company: string;
  job_title: string;
  resume_name: string;
  template_name: string | null;
  created_at: string;
}

export interface Contact {
  name: string;
  title: string;
  url: string;
  note: string;
}

export interface ContactSearch {
  id: number;
  evaluation_id: number;
  job_id: number;
  resume_id: number;
  company: string;
  title: string;
  resume_name: string;
  mode: 'specific' | 'peers';
  query_title: string;
  summary: string;
  contacts: Contact[];
  llm_model: string;
  provider: string;
  created_at: string;
}

export interface CompanyResearchFinding {
  event: string;
  paragraph: string;
  url: string;
  source_title: string;
  date: string;
}

export interface CompanyResearch {
  id: number;
  evaluation_id: number;
  job_id: number;
  resume_id: number;
  company: string;
  title: string;
  resume_name: string;
  summary: string;
  findings: CompanyResearchFinding[];
  llm_model: string;
  provider: string;
  created_at: string;
}

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

export interface ModelOption {
  id: string;
  label: string;
  recommended?: boolean;
  thinking?: boolean;
  pricing: { input: number; output: number };
}

export type Provider = 'anthropic' | 'openai' | 'deepseek' | 'qwen';

// Historical salary benchmark data points imported from an external spreadsheet.
// Kept separate from the Archive's `evaluations` — not tied to categories/resumes.
export interface BenchmarkImport {
  id: number;
  company: string;
  date: string | null;
  title: string;
  rank: number | null;
  rto: string | null;
  function: string | null;
  report_to: string | null;
  state: string | null;
  is_public: number;
  years_experience: number | null;
  salary_low: number | null;
  salary_mid: number | null;
  salary_high: number | null;
  pct_benchmark: number | null;
  // Explicit seniority level, when the source data provided one directly rather
  // than leaving it to be inferred from the title (see normalizeLevel below).
  level: string | null;
  created_at: string;
}

// Canonical job_level scale (see server/llm/prompts.js), most junior to most senior.
export const LEVEL_ORDER = [
  'Analyst', 'Senior Analyst', 'Lead', 'Manager', 'Senior Manager',
  'Director', 'Senior Director', 'Assistant VP', 'VP', 'Senior VP', 'EVP',
];

// Maps a free-text title (e.g. from imported benchmark rows) onto the canonical
// level scale above, so "Senior Manager"-ish titles bucket with "Senior Manager"
// rather than a coarser numeric rank.
export function normalizeLevel(title: string | null | undefined): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  const has = (re: RegExp) => re.test(t);
  const senior = has(/\b(senior|sr)\b/);
  if (has(/\bevp\b/) || has(/executive vice president/)) return 'EVP';
  if (has(/\bsvp\b/) || (senior && has(/\bvp\b|vice president/))) return 'Senior VP';
  if (has(/\bavp\b/) || has(/assistant vp|assistant vice president/)) return 'Assistant VP';
  if (has(/\bvp\b/) || has(/vice president/)) return 'VP';
  if (senior && has(/\bdirector\b/)) return 'Senior Director';
  if (has(/\bdirector\b/)) return 'Director';
  if (senior && has(/\b(manager|mgr)\b/)) return 'Senior Manager';
  if (has(/\b(manager|mgr)\b/)) return 'Manager';
  if (has(/\blead\b/)) return 'Lead';
  if (senior && has(/\b(analyst|associate)\b/)) return 'Senior Analyst';
  if (has(/\b(analyst|associate)\b/)) return 'Analyst';
  return null;
}

// Collapses evaluations down to one representative per physical job, so a job
// evaluated multiple times (via re-evaluate/AI Compare against a different
// resume or model, or the same JD pasted into Evaluate more than once) counts
// once in aggregates/benchmarks instead of once per evaluation. Within each
// job_id, picks scoreModel's evaluation if given (format "provider:model"),
// else the most recent; job_ids representing the same physical job (matched
// by company+title, or a JD-text prefix when metadata is blank) are then
// merged the same way, keeping the more recent one.
export function dedupeJobs(evals: Evaluation[], scoreModel?: string): Evaluation[] {
  const byJobId = new Map<number, Evaluation[]>();
  for (const e of evals) {
    if (!byJobId.has(e.job_id)) byJobId.set(e.job_id, []);
    byJobId.get(e.job_id)!.push(e);
  }

  const sep      = scoreModel ? scoreModel.indexOf(':') : -1;
  const provider = sep >= 0 ? scoreModel!.slice(0, sep) : '';
  const model    = sep >= 0 ? scoreModel!.slice(sep + 1) : '';

  const seen = new Map<string, Evaluation>();
  for (const group of byJobId.values()) {
    const rep = scoreModel
      ? (group.find(e => e.llm_provider === provider && e.llm_model === model)
         ?? group.reduce((a, b) => (new Date(a.created_at) >= new Date(b.created_at) ? a : b)))
      : group.reduce((a, b) => (new Date(a.created_at) >= new Date(b.created_at) ? a : b));

    const key = (rep.company && rep.title)
      ? `ct:${rep.company.toLowerCase().trim()}\x00${rep.title.toLowerCase().trim()}`
      : `jd:${(rep.jd_text || '').slice(0, 400).trim()}` || `id:${rep.job_id}`;

    const existing = seen.get(key);
    if (!existing || new Date(rep.created_at) > new Date(existing.created_at)) {
      seen.set(key, rep);
    }
  }
  return [...seen.values()];
}

export function computeOverallScore(eval_: Evaluation, weights: Weights): number {
  const { score_duties, score_requirements, score_years_experience, score_skills, score_industry } = eval_;
  if (score_duties == null || score_requirements == null ||
      score_years_experience == null || score_skills == null || score_industry == null) return 0;

  const prefWeight = weights.preferences ?? 0;
  const hasPref = eval_.score_preferences != null;
  const totalWeight = hasPref ? 100 : 100 - prefWeight;

  return (
    score_duties           * weights.duties +
    score_requirements     * weights.requirements +
    score_years_experience * weights.years_experience +
    score_skills           * weights.skills +
    (hasPref ? eval_.score_preferences! * prefWeight : 0) +
    score_industry         * weights.industry
  ) / totalWeight;
}

export function scoreColor(score: number): string {
  if (score >= 8) return 'text-green-600';
  if (score >= 6) return 'text-yellow-600';
  if (score >= 4) return 'text-orange-500';
  return 'text-red-500';
}

export function scoreBg(score: number): string {
  if (score >= 8) return 'bg-green-50 border-green-200';
  if (score >= 6) return 'bg-yellow-50 border-yellow-200';
  if (score >= 4) return 'bg-orange-50 border-orange-200';
  return 'bg-red-50 border-red-200';
}

// Days elapsed between a "YYYY-MM-DD" posted_date and today (recomputed live, not
// frozen at evaluation time, so the value keeps advancing as the archive ages).
export function daysAgo(postedDate: string | null): number | null {
  if (!postedDate) return null;
  const posted = new Date(postedDate + 'T00:00:00');
  if (isNaN(posted.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - posted.getTime()) / 86400000);
}

export function formatDaysAgo(postedDate: string | null): string {
  const days = daysAgo(postedDate);
  if (days == null) return '—';
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export function ordSuffix(n: number): string {
  const r = n % 100;
  if (r >= 11 && r <= 13) return 'th';
  switch (n % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th'; }
}

export function pctileColor(pct: number): string {
  if (pct >= 75) return 'text-green-600';
  if (pct >= 50) return 'text-yellow-600';
  if (pct >= 25) return 'text-orange-500';
  return 'text-red-500';
}

// Percentile rank of `score` within `pool` (which should include `score` itself).
// Ties share the midpoint percentile.
export function rankPercentile(score: number, pool: number[]): number {
  const below = pool.filter(s => s < score).length;
  const equal = pool.filter(s => s === score).length;
  return (below + 0.5 * equal) / pool.length * 100;
}
