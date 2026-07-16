import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import type { AppSettings, BenchmarkImport, Evaluation, ModelOption, Provider, Resume, Weights } from '../types';
import { computeOverallScore, scoreColor, ordSuffix, pctileColor, rankPercentile, formatDaysAgo } from '../types';
import { compareScore, deleteJob, getBenchmarkImports, getJobs, getModels, getRefreshEstimates, getResumes, getScoreEstimates, getSettings, recalculateScores, refreshJobMetadata, updateTracking } from '../api/client';
import { EvaluationDetail, DiffPct } from '../components/EvaluationDetail';
import { evalToBenchmarkPoints, importsToBenchmarkPoints, computeSalaryBenchmarkFromPoints, type SalaryBenchmark } from '../utils/benchmark';
import { ChevronDown, ChevronUp, Download, Loader2, RefreshCcw, RefreshCw, Search, Trash2, X } from 'lucide-react';

function exportToExcel(rows: Evaluation[], weights: Weights) {
  const data = rows.map(e => ({
    Date:              new Date(e.created_at).toLocaleDateString(),
    Company:           e.company ?? '',
    Sector:            e.company_industry ?? '',
    Title:             e.title ?? '',
    Category:          e.category_name ?? '',
    Level:             e.job_level ?? '',
    'Reports To':      e.reports_to ?? '',
    Remote:            e.remote ?? '',
    Posted:            formatDaysAgo(e.posted_date),
    'Yrs Required':    e.years_experience ?? '',
    'Meets Reqs':      e.meets_requirements ?? '',
    'Meets Prefs':     e.meets_preferences ?? '',
    Overall:           computeOverallScore(e, weights),
    Duties:            e.score_duties ?? '',
    Requirements:      e.score_requirements ?? '',
    Preferences:       e.score_preferences ?? '',
    Experience:        e.score_years_experience ?? '',
    Skills:            e.score_skills ?? '',
    Industry:          e.score_industry ?? '',
    'Salary Min':      e.salary_min ?? '',
    'Salary Max':      e.salary_max ?? '',
    'Cover Letter':    e.cover_letter_sent ? 'Yes' : 'No',
    Applied:           e.applied ? 'Yes' : 'No',
    '1st Interview':   e.interview_1 ? 'Yes' : 'No',
    '2nd Interview':   e.interview_2 ? 'Yes' : 'No',
    '3rd Interview':   e.interview_3 ? 'Yes' : 'No',
    'Offer Made':      e.offer_made ? 'Yes' : 'No',
    Resume:            e.resume_name ?? '',
    Provider:          e.llm_provider ?? '',
    Model:             e.llm_model ?? '',
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Archive');
  XLSX.writeFile(wb, `job-archive-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function MeetsBadge({ value }: { value: string }) {
  const color =
    value === 'Yes' ? 'bg-green-100 text-green-700' :
    value === 'No'  ? 'bg-red-100 text-red-700' :
    value === 'N/A' ? 'bg-gray-100 text-gray-500' :
                      'bg-yellow-100 text-yellow-700';
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${color}`}>{value}</span>;
}

function fmtCost(cost: number | undefined): string {
  if (cost == null) return '…';
  if (cost < 0.0001) return '< $0.0001';
  return `$${cost.toFixed(4)}`;
}

type SortKey = 'overall' | 'duties' | 'requirements' | 'years_experience' | 'skills' | 'industry' | 'salary' | 'date' | 'reports_to' | 'level' | 'pctile' | 'norm' | 'vsLevel' | 'vsTrend';

// Pick one evaluation from a group sharing the same (job_id, resume_id).
// Prefers the specified provider:model; falls back to the most recent.
function pickEval(group: Evaluation[], scoreModel: string): Evaluation {
  if (scoreModel) {
    const sep      = scoreModel.indexOf(':');
    const provider = scoreModel.slice(0, sep);
    const model    = scoreModel.slice(sep + 1);
    const match    = group.find(e => e.llm_provider === provider && e.llm_model === model);
    if (match) return match;
  }
  return group.reduce((a, b) => (new Date(a.created_at) >= new Date(b.created_at) ? a : b));
}

function salaryMid(e: Evaluation) {
  if (e.salary_min != null && e.salary_max != null) return (e.salary_min + e.salary_max) / 2;
  if (e.salary_min != null) return e.salary_min;
  if (e.salary_max != null) return e.salary_max;
  return -1;
}

function sortEvals(
  evals: Evaluation[], key: SortKey, asc: boolean, weights: Weights,
  pctileMap?: Map<number, number>, normMap?: Map<number, number>,
  benchmarkMap?: Map<number, SalaryBenchmark | null>,
) {
  return [...evals].sort((a, b) => {
    if (key === 'reports_to' || key === 'level') {
      const av = (key === 'reports_to' ? a.reports_to : a.job_level) ?? '';
      const bv = (key === 'reports_to' ? b.reports_to : b.job_level) ?? '';
      // Empty values always sort to the end regardless of direction
      if (!av && bv) return 1;
      if (av && !bv) return -1;
      const cmp = av.localeCompare(bv);
      return asc ? cmp : -cmp;
    }
    if (key === 'vsLevel' || key === 'vsTrend') {
      const av = key === 'vsLevel' ? benchmarkMap?.get(a.id)?.level?.diffPct : benchmarkMap?.get(a.id)?.trend?.diffPct;
      const bv = key === 'vsLevel' ? benchmarkMap?.get(b.id)?.level?.diffPct : benchmarkMap?.get(b.id)?.trend?.diffPct;
      // Missing values always sort to the end regardless of direction
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return asc ? av - bv : bv - av;
    }
    let av = 0, bv = 0;
    if (key === 'overall')               { av = computeOverallScore(a, weights); bv = computeOverallScore(b, weights); }
    else if (key === 'duties')           { av = a.score_duties ?? 0;             bv = b.score_duties ?? 0; }
    else if (key === 'requirements')     { av = a.score_requirements ?? 0;       bv = b.score_requirements ?? 0; }
    else if (key === 'years_experience') { av = a.score_years_experience ?? 0;   bv = b.score_years_experience ?? 0; }
    else if (key === 'skills')           { av = a.score_skills ?? 0;             bv = b.score_skills ?? 0; }
    else if (key === 'industry')         { av = a.score_industry ?? 0;           bv = b.score_industry ?? 0; }
    else if (key === 'salary')           { av = salaryMid(a);                    bv = salaryMid(b); }
    else if (key === 'pctile')           { av = pctileMap?.get(a.id) ?? -1;      bv = pctileMap?.get(b.id) ?? -1; }
    else if (key === 'norm')             { av = normMap?.get(a.id) ?? -1;        bv = normMap?.get(b.id) ?? -1; }
    else { av = new Date(a.created_at).getTime(); bv = new Date(b.created_at).getTime(); }
    return asc ? av - bv : bv - av;
  });
}

// Column widths for sticky positioning
const CHKBOX_W = 36;  // px — checkbox column
const DATE_W   = 85;  // px
const CO_W     = 140; // px

export function ArchivePage() {
  const [evals, setEvals]       = useState<Evaluation[]>([]);
  const [imports, setImports]   = useState<BenchmarkImport[]>([]);
  const [resumes, setResumes]   = useState<Resume[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [sortKey, setSortKey]   = useState<SortKey>('date');
  const [sortAsc, setSortAsc]   = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterField, setFilterField]       = useState('');
  const [filterResume, setFilterResume]     = useState<number | ''>('');
  const [minScore, setMinScore]             = useState('');
  const [scoreModel, setScoreModel]         = useState(''); // '' = most recent
  const [selected, setSelected]             = useState<Evaluation | null>(null);
  const [searchQuery, setSearchQuery]       = useState('');
  const [detailHeightPct, setDetailHeightPct] = useState(45);
  const [resizingDetail, setResizingDetail] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);

  // Bulk re-evaluate state
  const [selJobIds, setSelJobIds]           = useState<Set<number>>(new Set());
  const [reEvalResumeId, setReEvalResumeId] = useState<number | ''>('');
  const [reEvalProvider, setReEvalProvider] = useState<Provider>('openai');
  const [reEvalModel, setReEvalModel]       = useState('');
  const [reEvaluating, setReEvaluating]     = useState(false);
  const [reEvalProgress, setReEvalProgress] = useState<{ done: number; total: number } | null>(null);
  const [reEvalError, setReEvalError]       = useState('');

  const [allModels, setAllModels]               = useState<Record<Provider, ModelOption[]>>({ anthropic: [], openai: [], deepseek: [], qwen: [] });
  const [refreshProvider, setRefreshProvider]   = useState<Provider>('openai');
  const [refreshModel, setRefreshModel]         = useState('gpt-5.6-luna');
  const [estimates, setEstimates]               = useState<Record<number, number>>({});
  const [totalCost, setTotalCost]               = useState<number | null>(null);
  const [refreshing, setRefreshing]             = useState<Set<number>>(new Set());
  const [refreshingAll, setRefreshingAll]       = useState(false);
  const [scoreEstimates, setScoreEstimates]     = useState<Record<number, number>>({});
  const [totalScoreCost, setTotalScoreCost]     = useState<number | null>(null);
  const [recalculating, setRecalculating]       = useState<Set<number>>(new Set());
  const [recalculatingAll, setRecalculatingAll] = useState(false);
  const [refreshError, setRefreshError]         = useState('');
  const estimateDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([getJobs(), getResumes(), getSettings(), getModels(), getBenchmarkImports()]).then(([j, r, s, m, bi]) => {
      setEvals(j); setResumes(r); setSettings(s); setAllModels(m); setImports(bi);
      if (r.length > 0) setReEvalResumeId(r[0].id);
      const rec = m.openai?.find(x => x.recommended)?.id ?? m.openai?.[0]?.id ?? '';
      setReEvalModel(rec);
    });
  }, []);

  useEffect(() => {
    if (reEvalProvider && allModels[reEvalProvider]?.length) {
      setReEvalModel(allModels[reEvalProvider].find(m => m.recommended)?.id ?? allModels[reEvalProvider][0].id);
    }
  }, [reEvalProvider, allModels]);

  useEffect(() => {
    if (evals.length === 0) return;
    if (estimateDebounce.current) clearTimeout(estimateDebounce.current);
    estimateDebounce.current = setTimeout(async () => {
      try {
        const params = { provider: refreshProvider, model: refreshModel };
        const [meta, score] = await Promise.all([getRefreshEstimates(params), getScoreEstimates(params)]);
        const mm: Record<number, number> = {}; meta.jobs.forEach(j => { mm[j.id] = j.estimatedCost; });
        setEstimates(mm); setTotalCost(meta.totalCost);
        const sm: Record<number, number> = {}; score.jobs.forEach(j => { sm[j.id] = j.estimatedCost; });
        setScoreEstimates(sm); setTotalScoreCost(score.totalCost);
      } catch { /* ignore */ }
    }, 300);
  }, [refreshProvider, refreshModel, evals.length]);

  // Drag-to-resize the evaluation detail panel against the table above it.
  useEffect(() => {
    if (!resizingDetail) return;
    function onMove(ev: MouseEvent) {
      if (!splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      const pct = 100 - ((ev.clientY - rect.top) / rect.height) * 100;
      setDetailHeightPct(Math.min(80, Math.max(15, pct)));
    }
    function onUp() { setResizingDetail(false); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingDetail]);

  // Salary benchmark (vs. category+level median, vs. category trendline) per job —
  // built once per evals/imports change, not per row, since every row checks against
  // the same pool of points.
  const benchmarkMap = useMemo(() => {
    const allPoints = [...evalToBenchmarkPoints(evals), ...importsToBenchmarkPoints(imports)];
    const m = new Map<number, SalaryBenchmark | null>();
    for (const e of evals) m.set(e.id, computeSalaryBenchmarkFromPoints(e, allPoints));
    return m;
  }, [evals, imports]);

  function handleProviderChange(p: Provider) {
    setRefreshProvider(p);
    setRefreshModel(allModels[p]?.find(m => m.recommended)?.id ?? allModels[p]?.[0]?.id ?? '');
  }

  async function handleRefreshOne(e: Evaluation, ev: React.MouseEvent) {
    ev.stopPropagation();
    setRefreshError('');
    setRefreshing(prev => new Set(prev).add(e.id));
    try {
      const u = await refreshJobMetadata(e.id, { provider: refreshProvider, model: refreshModel });
      setEvals(prev => prev.map(x => x.id === e.id ? u : x));
      if (selected?.id === e.id) setSelected(u);
    } catch (err) { setRefreshError((err as Error).message); }
    finally { setRefreshing(prev => { const s = new Set(prev); s.delete(e.id); return s; }); }
  }

  async function handleRecalcOne(e: Evaluation, ev: React.MouseEvent) {
    ev.stopPropagation();
    setRefreshError('');
    setRecalculating(prev => new Set(prev).add(e.id));
    try {
      const u = await recalculateScores(e.id, { provider: refreshProvider, model: refreshModel });
      setEvals(prev => prev.map(x => x.id === e.id ? u : x));
      if (selected?.id === e.id) setSelected(u);
    } catch (err) { setRefreshError((err as Error).message); }
    finally { setRecalculating(prev => { const s = new Set(prev); s.delete(e.id); return s; }); }
  }

  async function handleRefreshAll() {
    setRefreshError(''); setRefreshingAll(true);
    for (const e of evals) {
      setRefreshing(prev => new Set(prev).add(e.id));
      try {
        const u = await refreshJobMetadata(e.id, { provider: refreshProvider, model: refreshModel });
        setEvals(prev => prev.map(x => x.id === e.id ? u : x));
        if (selected?.id === e.id) setSelected(u);
      } catch (err) { setRefreshError((err as Error).message); }
      finally { setRefreshing(prev => { const s = new Set(prev); s.delete(e.id); return s; }); }
    }
    setRefreshingAll(false);
  }

  async function handleRecalcAll() {
    setRefreshError(''); setRecalculatingAll(true);
    for (const e of evals) {
      setRecalculating(prev => new Set(prev).add(e.id));
      try {
        const u = await recalculateScores(e.id, { provider: refreshProvider, model: refreshModel });
        setEvals(prev => prev.map(x => x.id === e.id ? u : x));
        if (selected?.id === e.id) setSelected(u);
      } catch (err) { setRefreshError((err as Error).message); }
      finally { setRecalculating(prev => { const s = new Set(prev); s.delete(e.id); return s; }); }
    }
    setRecalculatingAll(false);
  }

  async function handleReEvalSelected(visibleJobIds: number[]) {
    if (!reEvalResumeId || !reEvalModel || reEvaluating) return;
    const jobIds = visibleJobIds.filter(id => selJobIds.has(id));
    if (jobIds.length === 0) return;
    setReEvaluating(true);
    setReEvalError('');
    setReEvalProgress({ done: 0, total: jobIds.length });
    let done = 0;
    for (const job_id of jobIds) {
      try {
        const result = await compareScore({ job_id, resume_id: Number(reEvalResumeId), provider: reEvalProvider, model: reEvalModel });
        setEvals(prev => [...prev, result]);
      } catch (err) {
        setReEvalError((err as Error).message);
      }
      done++;
      setReEvalProgress({ done, total: jobIds.length });
    }
    setReEvaluating(false);
    setReEvalProgress(null);
  }

  type TrackField = 'applied' | 'interview_1' | 'interview_2' | 'interview_3' | 'offer_made' | 'cover_letter_sent';

  async function handleTracking(ev: React.ChangeEvent<HTMLInputElement>, e: Evaluation, field: TrackField) {
    ev.stopPropagation();
    const value = ev.target.checked ? 1 : 0;
    const origVal = e[field];
    // Propagate tracking to all evals for the same job in memory
    setEvals(prev => prev.map(x => x.job_id === e.job_id ? { ...x, [field]: value } : x));
    if (selected !== null && selected.job_id === e.job_id) setSelected({ ...selected, [field]: value });
    try {
      await updateTracking(e.id, {
        applied:           field === 'applied'           ? value : e.applied,
        interview_1:       field === 'interview_1'        ? value : e.interview_1,
        interview_2:       field === 'interview_2'        ? value : e.interview_2,
        interview_3:       field === 'interview_3'        ? value : e.interview_3,
        offer_made:        field === 'offer_made'         ? value : e.offer_made,
        cover_letter_sent: field === 'cover_letter_sent'  ? value : e.cover_letter_sent,
      });
    } catch {
      // rollback
      setEvals(prev => prev.map(x => x.job_id === e.job_id ? { ...x, [field]: origVal } : x));
      if (selected !== null && selected.job_id === e.job_id) setSelected({ ...selected, [field]: origVal });
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return null;
    return sortAsc ? <ChevronUp size={11} /> : <ChevronDown size={11} />;
  }

  async function handleDelete(e: Evaluation) {
    if (!confirm(`Delete all evaluations for "${e.title || 'this role'}"?`)) return;
    await deleteJob(e.id);
    setEvals(prev => prev.filter(x => x.job_id !== e.job_id));
    if (selected !== null && selected.job_id === e.job_id) setSelected(null);
    setSelJobIds(prev => { const s = new Set(prev); s.delete(e.job_id); return s; });
  }

  if (!settings) return null;

  const categories = [...new Set(evals.map(e => e.category_name))].sort();

  // Distinct (provider:model) combos present in the archive, for the score-source picker
  const availableScoreModels = [...new Set(evals.map(e => `${e.llm_provider}:${e.llm_model}`))].sort();

  // All resumes for filter + re-evaluate dropdowns
  const resumeOptions = resumes
    .map(r => ({ id: r.id, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Step 1 — group evaluations by job_id (multiple models can share one job_id via re-evaluate)
  const byJobId = new Map<number, Evaluation[]>();
  for (const e of evals) {
    if (!byJobId.has(e.job_id)) byJobId.set(e.job_id, []);
    byJobId.get(e.job_id)!.push(e);
  }

  // Parse selected score model once so we can filter + pick consistently
  const smSep      = scoreModel ? scoreModel.indexOf(':') : -1;
  const smProvider = smSep >= 0 ? scoreModel.slice(0, smSep) : '';
  const smModel    = smSep >= 0 ? scoreModel.slice(smSep + 1) : '';

  // Step 2 — pick the best evaluation per job_id group, then deduplicate across
  // job_id records that represent the same physical job (the same JD pasted into
  // the Evaluate tab more than once).  Dedup key uses company+title when both are
  // present; falls back to a JD-text prefix so blank-metadata evals still merge.
  // When two keys collide, keep the more recently created evaluation.
  const seen = new Map<string, Evaluation>();
  for (const group of byJobId.values()) {
    const g = filterResume ? group.filter(e => e.resume_id === filterResume) : group;
    if (g.length === 0) continue;

    let rep: Evaluation | undefined;
    if (scoreModel) {
      rep = g.find(e => e.llm_provider === smProvider && e.llm_model === smModel);
    } else {
      rep = g.reduce((a, b) => (new Date(a.created_at) >= new Date(b.created_at) ? a : b));
    }
    if (!rep) continue;

    const key = (rep.company && rep.title)
      ? `ct:${rep.company.toLowerCase().trim()}\x00${rep.title.toLowerCase().trim()}`
      : `jd:${(rep.jd_text || '').slice(0, 400).trim()}` || `id:${rep.job_id}`;

    const existing = seen.get(key);
    if (!existing || new Date(rep.created_at) > new Date(existing.created_at)) {
      seen.set(key, rep);
    }
  }

  const deduped = [...seen.values()];

  const filtered = deduped.filter(e => {
    if (filterCategory && e.category_name !== filterCategory) return false;
    if (minScore && computeOverallScore(e, settings.weights) < Number(minScore)) return false;
    if (filterField) {
      const lower = filterField.toLowerCase();
      const match = Object.entries(e.field_values).some(([k, v]) => k.toLowerCase().includes(lower) && v.jd !== 'N/A');
      if (!match) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const haystack = [e.company, e.title, e.company_industry, e.category_name, e.job_level, e.reports_to, e.remote]
        .filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // Percentile rank within the filtered set (updates whenever filters change)
  const percentileMap = new Map<number, number>();
  if (filtered.length > 1) {
    const scorePairs = filtered.map(e => ({ id: e.id, score: computeOverallScore(e, settings.weights) }));
    const pool = scorePairs.map(s => s.score);
    for (const { id, score } of scorePairs) {
      percentileMap.set(id, rankPercentile(score, pool));
    }
  }

  // Model-normalized percentile: rank each evaluation against all other evaluations
  // that used the same provider+model, across the full archive (not just filtered).
  // Stable reference pool so the percentile doesn't shift as filters change.
  const modelPercentileMap = new Map<number, number>();
  {
    const modelGroups = new Map<string, { id: number; score: number }[]>();
    for (const e of evals) {
      const mk = `${e.llm_provider}:${e.llm_model}`;
      if (!modelGroups.has(mk)) modelGroups.set(mk, []);
      modelGroups.get(mk)!.push({ id: e.id, score: computeOverallScore(e, settings.weights) });
    }
    for (const pairs of modelGroups.values()) {
      const pool = pairs.map(p => p.score);
      for (const { id, score } of pairs) {
        modelPercentileMap.set(id, rankPercentile(score, pool));
      }
    }
  }

  const sorted = sortEvals(filtered, sortKey, sortAsc, settings.weights, percentileMap, modelPercentileMap, benchmarkMap);
  const visibleJobIds = sorted.map(e => e.job_id);
  const visibleSelected = visibleJobIds.filter(id => selJobIds.has(id));
  const allChecked  = visibleJobIds.length > 0 && visibleSelected.length === visibleJobIds.length;
  const someChecked = visibleSelected.length > 0 && !allChecked;

  // Shared class fragments
  const thTop = 'sticky top-0 z-20 bg-gray-50 px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap border-b border-gray-200';
  const thTopSort = `${thTop} cursor-pointer hover:text-gray-800 select-none`;
  const thChkCls  = `sticky top-0 z-30 bg-gray-50 left-0 px-2 py-2 border-b border-gray-200`;
  const thDateCls = `sticky top-0 z-30 bg-gray-50 px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap border-b border-gray-200 cursor-pointer hover:text-gray-800 select-none`;
  const thCoCls   = `sticky top-0 z-30 bg-gray-50 border-b border-r border-gray-200 px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap`;

  const inputCls = 'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const busy = refreshingAll || recalculatingAll;

  const reEvalBtnLabel = reEvaluating
    ? `Running… ${reEvalProgress?.done ?? 0} / ${reEvalProgress?.total ?? 0}`
    : selJobIds.size === 0
      ? 'Select jobs below'
      : `Evaluate ${visibleSelected.length} job${visibleSelected.length !== 1 ? 's' : ''}`;

  return (
    <div className="flex overflow-hidden p-4 gap-4" style={{ height: 'calc(100vh - 56px)' }}>

      {/* ── Table section ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-center gap-3 shrink-0">
          <h1 className="text-xl font-bold text-gray-900">Archive</h1>
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search company, title, sector…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <span className="text-sm text-gray-400 whitespace-nowrap">{sorted.length} result{sorted.length !== 1 ? 's' : ''}</span>
          {sorted.length > 0 && (
            <button
              onClick={() => exportToExcel(sorted, settings.weights)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
              title="Export current view to Excel"
            >
              <Download size={13} />
              Export
            </button>
          )}
        </div>

        {sorted.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-1 text-gray-400 text-sm border border-gray-200 rounded-lg">
            <span>No evaluations yet.</span>
            {filterResume && (
              <span className="text-xs text-gray-400">
                No jobs evaluated with this resume yet — use <strong>Re-evaluate</strong> in the sidebar.
              </span>
            )}
          </div>
        ) : (
          <div ref={splitRef} className="flex-1 min-h-0 flex flex-col">
          <div
            className="overflow-auto rounded-lg border border-gray-200 min-h-0"
            style={{ flex: selected ? `0 1 ${100 - detailHeightPct}%` : '1 1 auto' }}
          >
            <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>
              <thead>
                <tr>
                  {/* Sticky: checkbox */}
                  <th className={thChkCls} style={{ left: 0, width: CHKBOX_W, minWidth: CHKBOX_W }}>
                    <input
                      ref={el => {
                        (selectAllRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
                        if (el) el.indeterminate = someChecked;
                      }}
                      type="checkbox"
                      checked={allChecked}
                      onChange={e => {
                        if (e.target.checked) setSelJobIds(new Set(visibleJobIds));
                        else setSelJobIds(new Set());
                      }}
                      className="w-3.5 h-3.5 rounded cursor-pointer accent-blue-600"
                    />
                  </th>
                  {/* Sticky: Date */}
                  <th
                    className={thDateCls}
                    style={{ left: CHKBOX_W, minWidth: DATE_W }}
                    onClick={() => toggleSort('date')}
                  >
                    <span className="flex items-center gap-1">Date <SortIcon k="date" /></span>
                  </th>
                  {/* Sticky: Company */}
                  <th className={thCoCls} style={{ left: CHKBOX_W + DATE_W, minWidth: CO_W }}>Company</th>

                  {/* All remaining: sticky top only */}
                  <th className={thTop}>Sector</th>
                  <th className={thTop}>Title</th>
                  <th className={thTop}>Category</th>
                  <th className={thTopSort} onClick={() => toggleSort('level')}>
                    <span className="flex items-center gap-1">Level <SortIcon k="level" /></span>
                  </th>
                  <th className={thTopSort} onClick={() => toggleSort('reports_to')}>
                    <span className="flex items-center gap-1">Reports To <SortIcon k="reports_to" /></span>
                  </th>
                  <th className={thTop}>Remote</th>
                  <th className={thTop}>Posted</th>
                  <th className={thTop}>Yrs Req</th>
                  <th className={thTop}>Meets Reqs</th>
                  <th className={thTop}>Meets Prefs</th>
                  <th className={thTopSort} onClick={() => toggleSort('overall')}>
                    <span className="flex items-center gap-1">Overall <SortIcon k="overall" /></span>
                  </th>
                  <th className={thTopSort} onClick={() => toggleSort('pctile')}>
                    <span className="flex items-center gap-1">Pctile <SortIcon k="pctile" /></span>
                  </th>
                  <th className={thTopSort} onClick={() => toggleSort('norm')} title="Percentile relative to other jobs scored by the same model">
                    <span className="flex items-center gap-1">Norm. <SortIcon k="norm" /></span>
                  </th>
                  <th className={thTopSort} onClick={() => toggleSort('duties')}>
                    <span className="flex items-center gap-1">Duties <SortIcon k="duties" /></span>
                  </th>
                  <th className={thTopSort} onClick={() => toggleSort('requirements')}>
                    <span className="flex items-center gap-1">Req <SortIcon k="requirements" /></span>
                  </th>
                  <th className={thTop}>Prefs</th>
                  <th className={thTopSort} onClick={() => toggleSort('years_experience')}>
                    <span className="flex items-center gap-1">Exp <SortIcon k="years_experience" /></span>
                  </th>
                  <th className={thTopSort} onClick={() => toggleSort('skills')}>
                    <span className="flex items-center gap-1">Skills <SortIcon k="skills" /></span>
                  </th>
                  <th className={thTopSort} onClick={() => toggleSort('industry')}>
                    <span className="flex items-center gap-1">Ind <SortIcon k="industry" /></span>
                  </th>
                  <th className={thTopSort} onClick={() => toggleSort('salary')}>
                    <span className="flex items-center gap-1">Salary <SortIcon k="salary" /></span>
                  </th>
                  <th className={thTopSort} onClick={() => toggleSort('vsLevel')} title="Salary midpoint vs. median for this category + level (Benchmarking tab)">
                    <span className="flex items-center gap-1">vs Lvl <SortIcon k="vsLevel" /></span>
                  </th>
                  <th className={thTopSort} onClick={() => toggleSort('vsTrend')} title="Salary midpoint vs. this category's regression trendline at this job's years of experience (Benchmarking tab)">
                    <span className="flex items-center gap-1">vs Trend <SortIcon k="vsTrend" /></span>
                  </th>
                  <th className={`${thTop} border-l-2 border-gray-300`}>Cover Letter</th>
                  <th className={thTop}>Applied</th>
                  <th className={thTop}>1st</th>
                  <th className={thTop}>2nd</th>
                  <th className={thTop}>3rd</th>
                  <th className={thTop}>Offer</th>
                  <th className={thTop}>Model</th>
                  <th className={thTop} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(e => {
                  const overall       = computeOverallScore(e, settings.weights);
                  const isSelected    = selected?.id === e.id;
                  const isChecked     = selJobIds.has(e.job_id);
                  const isRefreshing  = refreshing.has(e.id);
                  const isRecalc      = recalculating.has(e.id);
                  const rowBg         = isSelected ? 'bg-blue-50' : isChecked ? 'bg-indigo-50/40' : 'bg-white';
                  const stickyBg      = `${rowBg} group-hover:bg-blue-50`;

                  return (
                      <tr
                        key={e.id}
                        className={`group cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : isChecked ? 'bg-indigo-50/40 hover:bg-blue-50' : 'hover:bg-blue-50'}`}
                        onClick={() => setSelected(isSelected ? null : e)}
                      >
                        {/* Checkbox */}
                        <td
                          className={`sticky left-0 z-10 transition-colors px-2 py-1.5 ${stickyBg}`}
                          style={{ width: CHKBOX_W, minWidth: CHKBOX_W }}
                          onClick={ev => ev.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => setSelJobIds(prev => {
                              const s = new Set(prev);
                              s.has(e.job_id) ? s.delete(e.job_id) : s.add(e.job_id);
                              return s;
                            })}
                            className="w-3.5 h-3.5 rounded cursor-pointer accent-blue-600"
                          />
                        </td>
                        {/* Sticky Date */}
                        <td
                          className={`sticky z-10 transition-colors px-2 py-1.5 whitespace-nowrap text-gray-500 ${stickyBg}`}
                          style={{ left: CHKBOX_W, minWidth: DATE_W }}
                        >
                          {new Date(e.created_at).toLocaleDateString()}
                        </td>
                        {/* Sticky Company */}
                        <td
                          className={`sticky z-10 transition-colors border-r border-gray-200 px-2 py-1.5 text-gray-700 font-medium overflow-hidden text-ellipsis whitespace-nowrap ${stickyBg}`}
                          style={{ left: CHKBOX_W + DATE_W, minWidth: CO_W, maxWidth: CO_W }}
                          title={e.company || ''}
                        >
                          {e.company || '—'}
                        </td>

                        {/* Scrollable columns */}
                        <td className="px-2 py-1.5 text-gray-500 max-w-[110px] truncate" title={e.company_industry || ''}>{e.company_industry || '—'}</td>
                        <td className="px-2 py-1.5 font-medium text-gray-900 max-w-[160px] truncate" title={e.title || ''}>{e.title || '—'}</td>
                        <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{e.category_name}</td>
                        <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{e.job_level || '—'}</td>
                        <td className="px-2 py-1.5 text-gray-500 max-w-[120px] truncate" title={e.reports_to || ''}>{e.reports_to || '—'}</td>
                        <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{e.remote || '—'}</td>
                        <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap" title={e.posted_date || ''}>{formatDaysAgo(e.posted_date)}</td>
                        <td className="px-2 py-1.5 text-gray-500 text-center">{e.years_experience ?? '—'}</td>
                        <td className="px-2 py-1.5">{e.meets_requirements ? <MeetsBadge value={e.meets_requirements} /> : '—'}</td>
                        <td className="px-2 py-1.5">{e.meets_preferences ? <MeetsBadge value={e.meets_preferences} /> : '—'}</td>
                        <td className={`px-2 py-1.5 font-bold text-center ${scoreColor(overall)}`}>{overall.toFixed(1)}</td>
                        <td className="px-2 py-1.5 text-center">
                          {(() => {
                            const pct = percentileMap.get(e.id);
                            if (pct == null) return <span className="text-gray-300">—</span>;
                            const r = Math.round(pct);
                            return <span className={`font-medium ${pctileColor(pct)}`}>{r}{ordSuffix(r)}</span>;
                          })()}
                        </td>
                        <td className="px-2 py-1.5 text-center" title={`Percentile vs other ${e.llm_model || 'same-model'} evaluations`}>
                          {(() => {
                            const pct = modelPercentileMap.get(e.id);
                            if (pct == null) return <span className="text-gray-300">—</span>;
                            const r = Math.round(pct);
                            return <span className={`font-medium ${pctileColor(pct)}`}>{r}{ordSuffix(r)}</span>;
                          })()}
                        </td>
                        <td className={`px-2 py-1.5 text-center ${scoreColor(e.score_duties ?? 0)}`}>{e.score_duties ?? '—'}</td>
                        <td className={`px-2 py-1.5 text-center ${scoreColor(e.score_requirements ?? 0)}`}>{e.score_requirements ?? '—'}</td>
                        <td className={`px-2 py-1.5 text-center ${scoreColor(e.score_preferences ?? 0)}`}>{e.score_preferences ?? '—'}</td>
                        <td className={`px-2 py-1.5 text-center ${scoreColor(e.score_years_experience ?? 0)}`}>{e.score_years_experience ?? '—'}</td>
                        <td className={`px-2 py-1.5 text-center ${scoreColor(e.score_skills ?? 0)}`}>{e.score_skills ?? '—'}</td>
                        <td className={`px-2 py-1.5 text-center ${scoreColor(e.score_industry ?? 0)}`}>{e.score_industry ?? '—'}</td>
                        <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">
                          {e.salary_min != null || e.salary_max != null
                            ? `$${((e.salary_min ?? 0) / 1000).toFixed(0)}k–$${((e.salary_max ?? 0) / 1000).toFixed(0)}k`
                            : '—'}
                        </td>
                        {(() => {
                          const b = benchmarkMap.get(e.id);
                          return (
                            <>
                              <td
                                className="px-2 py-1.5 text-center whitespace-nowrap"
                                title={b?.level ? `${e.category_name} · ${b.level.level} median: $${(b.level.median / 1000).toFixed(0)}k (n=${b.level.count})` : ''}
                              >
                                {b?.level ? <DiffPct diffPct={b.level.diffPct} /> : <span className="text-gray-300">—</span>}
                              </td>
                              <td
                                className="px-2 py-1.5 text-center whitespace-nowrap"
                                title={b?.trend ? `${e.category_name} trendline @ ${b.trend.years} yrs: $${(b.trend.predicted / 1000).toFixed(0)}k (n=${b.trend.count}, R²=${b.trend.r2.toFixed(2)})` : ''}
                              >
                                {b?.trend ? <DiffPct diffPct={b.trend.diffPct} /> : <span className="text-gray-300">—</span>}
                              </td>
                            </>
                          );
                        })()}
                        {(
                          [
                            ['cover_letter_sent', e.cover_letter_sent, 'border-l-2 border-gray-300'],
                            ['applied',     e.applied,     ''],
                            ['interview_1', e.interview_1, ''],
                            ['interview_2', e.interview_2, ''],
                            ['interview_3', e.interview_3, ''],
                            ['offer_made',  e.offer_made,  ''],
                          ] as [TrackField, number, string][]
                        ).map(([field, val, extra]) => (
                          <td
                            key={field}
                            className={`px-2 py-1.5 text-center ${extra}`}
                            onClick={ev => ev.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={!!val}
                              onChange={ev => handleTracking(ev, e, field)}
                              className={`w-3.5 h-3.5 rounded cursor-pointer ${field === 'offer_made' ? 'accent-green-600' : 'accent-blue-600'}`}
                            />
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap" title={`${e.llm_provider} / ${e.llm_model}`}>
                          {e.llm_model || '—'}
                        </td>
                        <td className="px-2 py-1.5" onClick={ev => ev.stopPropagation()}>
                          <div className="flex flex-col gap-1 items-start">
                            <button
                              onClick={ev => handleRefreshOne(e, ev)}
                              disabled={isRefreshing || busy}
                              className="flex items-center gap-0.5 text-gray-400 hover:text-blue-500 disabled:opacity-30 transition-colors whitespace-nowrap"
                              title="Refresh metadata"
                            >
                              {isRefreshing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                              <span>{fmtCost(estimates[e.id])}</span>
                            </button>
                            <button
                              onClick={ev => handleRecalcOne(e, ev)}
                              disabled={isRecalc || busy}
                              className="flex items-center gap-0.5 text-gray-400 hover:text-violet-500 disabled:opacity-30 transition-colors whitespace-nowrap"
                              title="Recalculate scores"
                            >
                              {isRecalc ? <Loader2 size={11} className="animate-spin" /> : <RefreshCcw size={11} />}
                              <span>{fmtCost(scoreEstimates[e.id])}</span>
                            </button>
                            <button
                              onClick={ev => { ev.stopPropagation(); handleDelete(e); }}
                              className="text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selected && (
            <>
              <div
                onMouseDown={() => setResizingDetail(true)}
                className="shrink-0 h-2.5 flex items-center justify-center cursor-row-resize group"
                title="Drag to resize"
              >
                <div className="w-12 h-1 rounded-full bg-gray-300 group-hover:bg-blue-400 transition-colors" />
              </div>
              <div
                className="shrink-0 overflow-y-auto rounded-lg border border-blue-200 bg-white min-h-0"
                style={{ flex: `0 1 ${detailHeightPct}%` }}
              >
                <div className="px-6 py-6 relative">
                  <button
                    onClick={() => setSelected(null)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"
                    title="Close"
                  >
                    <X size={16} />
                  </button>
                  <EvaluationDetail
                    evaluation={selected}
                    weights={settings.weights}
                    percentile={percentileMap.get(selected.id)}
                    normPercentile={modelPercentileMap.get(selected.id)}
                    salaryBenchmark={benchmarkMap.get(selected.id)}
                  />
                </div>
              </div>
            </>
          )}
          </div>
        )}
      </div>

      {/* ── Right sidebar ── */}
      <div className="w-60 shrink-0 overflow-y-auto flex flex-col gap-3">

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Filters</p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Score source</label>
            <select className={inputCls} value={scoreModel} onChange={e => setScoreModel(e.target.value)}>
              <option value="">Latest (any model)</option>
              {availableScoreModels.map(key => {
                const sep      = key.indexOf(':');
                const provider = key.slice(0, sep);
                const model    = key.slice(sep + 1);
                const provLabel = provider === 'anthropic' ? 'Anthropic' : provider === 'openai' ? 'OpenAI' : provider === 'deepseek' ? 'DeepSeek' : 'Qwen';
                return <option key={key} value={key}>{provLabel}: {model}</option>;
              })}
            </select>
          </div>
          {resumeOptions.length > 1 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Resume</label>
              <select className={inputCls} value={filterResume} onChange={e => setFilterResume(e.target.value ? Number(e.target.value) : '')}>
                <option value="">All resumes</option>
                {resumeOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Category</label>
            <select className={inputCls} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Min overall score</label>
            <input
              type="number" min="0" max="10" step="0.5" placeholder="0"
              className={inputCls}
              value={minScore}
              onChange={e => setMinScore(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Field keyword</label>
            <input
              type="text" placeholder="e.g. GTM, forecasting"
              className={inputCls}
              value={filterField}
              onChange={e => setFilterField(e.target.value)}
            />
          </div>
          {(filterCategory || minScore || filterField || scoreModel || filterResume || searchQuery) && (
            <button
              onClick={() => { setFilterCategory(''); setMinScore(''); setFilterField(''); setScoreModel(''); setFilterResume(''); setSearchQuery(''); }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700"
            >
              <X size={12} /> Clear filters
            </button>
          )}
        </div>

        {/* Re-evaluate */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Re-evaluate</p>
          <p className="text-xs text-gray-400">
            Check jobs in the table, then run them all against a resume.
          </p>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Resume</label>
            <select
              className={inputCls}
              value={reEvalResumeId}
              onChange={e => setReEvalResumeId(e.target.value ? Number(e.target.value) : '')}
              disabled={reEvaluating}
            >
              <option value="">Select resume…</option>
              {resumeOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          {/* Provider */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {(['anthropic', 'openai', 'deepseek', 'qwen'] as Provider[]).map(p => (
              <button
                key={p}
                onClick={() => setReEvalProvider(p)}
                disabled={reEvaluating}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${reEvalProvider === p ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {p === 'anthropic' ? 'Anthropic' : p === 'qwen' ? 'Qwen' : p === 'deepseek' ? 'DeepSeek' : 'OpenAI'}
              </button>
            ))}
          </div>

          {/* Model */}
          <select
            value={reEvalModel}
            onChange={e => setReEvalModel(e.target.value)}
            disabled={reEvaluating}
            className={inputCls}
          >
            {(allModels[reEvalProvider] ?? []).map(m => (
              <option key={m.id} value={m.id}>{m.label}{m.recommended ? ' ★' : ''}</option>
            ))}
          </select>

          <button
            onClick={() => handleReEvalSelected(visibleJobIds)}
            disabled={reEvaluating || visibleSelected.length === 0 || !reEvalResumeId || !reEvalModel}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {reEvaluating && <Loader2 size={12} className="animate-spin" />}
            {reEvalBtnLabel}
          </button>

          {reEvalError && (
            <div className="flex items-start gap-1 text-xs text-red-500">
              <span className="flex-1">{reEvalError}</span>
              <button onClick={() => setReEvalError('')}><X size={11} /></button>
            </div>
          )}
        </div>

        {/* LLM operations */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">LLM Operations</p>

          {/* Provider */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {(['anthropic', 'openai', 'deepseek', 'qwen'] as Provider[]).map(p => (
              <button
                key={p}
                onClick={() => handleProviderChange(p)}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${refreshProvider === p ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {p === 'anthropic' ? 'Anthropic' : p === 'qwen' ? 'Qwen' : p === 'deepseek' ? 'DeepSeek' : 'OpenAI'}
              </button>
            ))}
          </div>

          {/* Model */}
          <select
            value={refreshModel}
            onChange={e => setRefreshModel(e.target.value)}
            className={inputCls}
          >
            {(allModels[refreshProvider] ?? []).map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>

          {/* Refresh Metadata All */}
          <button
            onClick={handleRefreshAll}
            disabled={refreshingAll || recalculatingAll || evals.length === 0}
            className="w-full flex flex-col items-center gap-0.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <span className="flex items-center gap-1">
              {refreshingAll ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {refreshingAll ? 'Refreshing…' : `Refresh Metadata (${evals.length})`}
            </span>
            <span className="text-blue-200 font-normal">Est. {fmtCost(totalCost ?? undefined)}</span>
          </button>

          {/* Recalculate Scores All */}
          <button
            onClick={handleRecalcAll}
            disabled={recalculatingAll || refreshingAll || evals.length === 0}
            className="w-full flex flex-col items-center gap-0.5 px-3 py-2 bg-violet-600 text-white rounded-lg text-xs font-medium hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <span className="flex items-center gap-1">
              {recalculatingAll ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
              {recalculatingAll ? 'Recalculating…' : `Recalculate Scores (${evals.length})`}
            </span>
            <span className="text-violet-200 font-normal">Est. {fmtCost(totalScoreCost ?? undefined)}</span>
          </button>

          {refreshError && (
            <div className="flex items-start gap-1 text-xs text-red-500">
              <span className="flex-1">{refreshError}</span>
              <button onClick={() => setRefreshError('')}><X size={11} /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
