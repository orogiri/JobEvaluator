import type {
  AppSettings,
  BenchmarkImport,
  Category,
  CompanyResearch,
  ContactSearch,
  CostEstimate,
  CoverLetter,
  CoverLetterTemplate,
  Evaluation,
  ModelOption,
  Provider,
  Resume,
} from '../types';

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.details ? `${data.error}: ${data.details}` : (data.error || `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return data as T;
}

// Categories
export const getCategories = () => req<Category[]>('/api/categories');
export const createCategory = (name: string) =>
  req<Category>('/api/categories', { method: 'POST', body: JSON.stringify({ name }) });
export const deleteCategory = (id: number) =>
  req<{ ok: boolean }>(`/api/categories/${id}`, { method: 'DELETE' });

// Resumes
export const getResumes = () => req<Resume[]>('/api/resumes');
export const createResume = (data: { name: string; category_id: number; text: string }) =>
  req<{ id: number }>('/api/resumes', { method: 'POST', body: JSON.stringify(data) });
export const updateResume = (
  id: number,
  data: { name: string; category_id: number; text: string }
) => req<{ ok: boolean }>(`/api/resumes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteResume = (id: number) =>
  req<{ ok: boolean }>(`/api/resumes/${id}`, { method: 'DELETE' });

// Settings
export const getSettings = () => req<AppSettings>('/api/settings');
export const updateSettings = (data: Partial<AppSettings>) =>
  req<{ ok: boolean }>('/api/settings', { method: 'PUT', body: JSON.stringify(data) });

// Benchmark imports (historical salary data, separate from the Archive)
export const getBenchmarkImports = () => req<BenchmarkImport[]>('/api/benchmark-imports');
export const deleteBenchmarkImport = (id: number) =>
  req<{ ok: boolean }>(`/api/benchmark-imports/${id}`, { method: 'DELETE' });

// Jobs / Evaluations
export const getJobs = () => req<Evaluation[]>('/api/jobs');
export const getJob = (id: number) => req<Evaluation>(`/api/jobs/${id}`);
export const deleteJob = (id: number) =>
  req<{ ok: boolean }>(`/api/jobs/${id}`, { method: 'DELETE' });
export const updateTracking = (
  id: number,
  data: { applied: number; interview_1: number; interview_2: number; interview_3: number; offer_made: number; cover_letter_sent: number }
) => req<{ ok: boolean }>(`/api/jobs/${id}/tracking`, { method: 'PATCH', body: JSON.stringify(data) });
export const getRefreshEstimates = (data: { provider: Provider; model: string }) =>
  req<{ jobs: { id: number; estimatedCost: number }[]; totalCost: number }>(
    '/api/jobs/refresh-estimate',
    { method: 'POST', body: JSON.stringify(data) }
  );
export const refreshJobMetadata = (id: number, data: { provider: Provider; model: string }) =>
  req<Evaluation>(`/api/jobs/${id}/refresh-metadata`, { method: 'POST', body: JSON.stringify(data) });
export const getScoreEstimates = (data: { provider: Provider; model: string }) =>
  req<{ jobs: { id: number; estimatedCost: number }[]; totalCost: number }>(
    '/api/jobs/score-estimate',
    { method: 'POST', body: JSON.stringify(data) }
  );
export const recalculateScores = (id: number, data: { provider: Provider; model: string }) =>
  req<Evaluation>(`/api/jobs/${id}/recalculate-scores`, { method: 'POST', body: JSON.stringify(data) });

// Evaluate
export const getModels = () => req<Record<Provider, ModelOption[]>>('/api/evaluate/models');
export const estimateCost = (data: {
  jd_text: string;
  resume_id: number;
  provider: Provider;
  model: string;
  include_suggestions?: boolean;
  include_field_db?: boolean;
}) => req<CostEstimate>('/api/evaluate/estimate', { method: 'POST', body: JSON.stringify(data) });

export const runEvaluation = (data: {
  jd_text: string;
  resume_id: number;
  provider: Provider;
  model: string;
  include_suggestions?: boolean;
  include_field_db?: boolean;
}) => req<{ evaluation_id: number }>('/api/evaluate', { method: 'POST', body: JSON.stringify(data) });

// Compare
export const compareScore = (data: {
  job_id: number;
  resume_id: number;
  provider: Provider;
  model: string;
}) => req<Evaluation>('/api/compare/score', { method: 'POST', body: JSON.stringify(data) });

// Cover letter templates
export const getCoverLetterTemplates = () => req<CoverLetterTemplate[]>('/api/cover-letters/templates');
export const createCoverLetterTemplate = (data: { name: string; body: string; instructions?: string }) =>
  req<CoverLetterTemplate>('/api/cover-letters/templates', { method: 'POST', body: JSON.stringify(data) });
export const updateCoverLetterTemplate = (id: number, data: { name: string; body: string; instructions?: string }) =>
  req<{ ok: boolean }>(`/api/cover-letters/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteCoverLetterTemplate = (id: number) =>
  req<{ ok: boolean }>(`/api/cover-letters/templates/${id}`, { method: 'DELETE' });

// Cover letters
export const getCoverLetters = () => req<CoverLetter[]>('/api/cover-letters');
export const estimateCoverLetterCost = (data: {
  job_id: number;
  resume_id: number;
  template_id: number;
  provider: Provider;
  model: string;
  thinking?: boolean;
}) => req<CostEstimate>('/api/cover-letters/estimate', { method: 'POST', body: JSON.stringify(data) });
export const generateCoverLetter = (data: {
  job_id: number;
  resume_id: number;
  template_id: number;
  provider: Provider;
  model: string;
  thinking?: boolean;
}) => req<CoverLetter>('/api/cover-letters/generate', { method: 'POST', body: JSON.stringify(data) });
export const deleteCoverLetter = (id: number) =>
  req<{ ok: boolean }>(`/api/cover-letters/${id}`, { method: 'DELETE' });

// Contact search — finds the hiring manager (or, absent that, likely org peers one
// level up). Any provider; see server/routes/contactSearch.js — only Anthropic has its
// own search tool, others only reason over Serper results (Settings > Serper key).
export const getContactSearches = () => req<ContactSearch[]>('/api/contact-search');
export const runContactSearch = (data: { job_id: number; resume_id: number; provider: Provider; model: string }) =>
  req<ContactSearch>('/api/contact-search/run', { method: 'POST', body: JSON.stringify(data) });
export const deleteContactSearch = (id: number) =>
  req<{ ok: boolean }>(`/api/contact-search/${id}`, { method: 'DELETE' });

// Company research — finds recent, verifiable company news and drafts ready-to-paste
// cover-letter paragraphs referencing it. Any provider; see server/routes/companyResearch.js.
export const getCompanyResearch = () => req<CompanyResearch[]>('/api/company-research');
export const runCompanyResearch = (data: { job_id: number; resume_id: number; provider: Provider; model: string }) =>
  req<CompanyResearch>('/api/company-research/run', { method: 'POST', body: JSON.stringify(data) });
export const deleteCompanyResearch = (id: number) =>
  req<{ ok: boolean }>(`/api/company-research/${id}`, { method: 'DELETE' });
