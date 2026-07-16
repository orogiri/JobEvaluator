import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, Evaluation, ModelOption, Provider, Resume, ScoreDetails, Weights } from '../types';
import { computeOverallScore, scoreColor } from '../types';
import { compareScore, getJobs, getModels, getResumes, getSettings } from '../api/client';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

const PROVIDERS: { key: Provider; label: string }[] = [
  { key: 'anthropic', label: 'Anthropic' },
  { key: 'openai',    label: 'OpenAI' },
  { key: 'deepseek',  label: 'DeepSeek' },
  { key: 'qwen',      label: 'Qwen' },
];

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#7c3aed',
  openai:    '#0d9488',
  deepseek:  '#2563eb',
  qwen:      '#d97706',
};

type ScoreDim = { key: keyof ScoreDetails; label: string; weightKey: keyof Weights };
const SCORE_DIMS: ScoreDim[] = [
  { key: 'duties',           label: 'Duties Match',       weightKey: 'duties' },
  { key: 'requirements',     label: 'Requirements Match',  weightKey: 'requirements' },
  { key: 'years_experience', label: 'Experience Match',    weightKey: 'years_experience' },
  { key: 'skills',           label: 'Skills / Keywords',   weightKey: 'skills' },
  { key: 'preferences',      label: 'Preferences Match',   weightKey: 'preferences' },
  { key: 'industry',         label: 'Industry Fit',        weightKey: 'industry' },
];

type UniqueJob  = { job_id: number; company: string; title: string; created_at: string };
type CellStatus = { eval: Evaluation | null; loading: boolean; error: string };

function cellKey(jobId: number, provider: Provider) {
  return `${jobId}:${provider}`;
}

function getUniqueJobs(evals: Evaluation[]): UniqueJob[] {
  const map = new Map<number, UniqueJob>();
  for (const e of evals) {
    if (!map.has(e.job_id)) {
      map.set(e.job_id, { job_id: e.job_id, company: e.company, title: e.title, created_at: e.created_at });
    }
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function deltaClass(delta: number): string {
  if (delta > 1.5) return 'text-red-500';
  if (delta > 0.5) return 'text-amber-500';
  return 'text-gray-400';
}

// ─── Overall Score Comparison Chart ──────────────────────────────────────────

interface ChartProps {
  jobs:            UniqueJob[];
  cellState:       Map<string, CellStatus>;
  activeProviders: { key: Provider; label: string }[];
  weights:         Weights;
}

function ScoreComparisonChart({ jobs, cellState, activeProviders, weights }: ChartProps) {
  const [mode,      setMode]      = useState<'scores' | 'delta'>('scores');
  const [benchmark, setBenchmark] = useState<Provider | ''>('');

  // Keep benchmark valid when providers change
  const validBenchmark = activeProviders.some(p => p.key === benchmark)
    ? (benchmark as Provider) : null;

  function switchMode(m: 'scores' | 'delta') {
    setMode(m);
    if (m === 'delta' && !validBenchmark) {
      const first = activeProviders.find(p =>
        jobs.some(j => cellState.get(cellKey(j.job_id, p.key))?.eval != null)
      );
      if (first) setBenchmark(first.key);
    }
  }

  // In delta mode only include jobs where the benchmark has a score
  const jobsWithData = jobs.filter(j => {
    if (mode === 'delta' && validBenchmark) {
      return cellState.get(cellKey(j.job_id, validBenchmark))?.eval != null;
    }
    return activeProviders.some(p => cellState.get(cellKey(j.job_id, p.key))?.eval != null);
  });

  if (jobsWithData.length === 0 || activeProviders.length === 0) return null;

  // Chart dimensions
  const PLOT_H = 160;
  const HALF_H = PLOT_H / 2;
  const ML = 44, MR = 20, MT = 20, MB = 72;
  const nP    = activeProviders.length;
  const GW    = Math.max(80, Math.min(160, 900 / jobsWithData.length));
  const GAP   = 2;
  const BAR_W = Math.max(10, (GW - 20 - GAP * (nP - 1)) / nP);
  const totalW = GW * jobsWithData.length + ML + MR;
  const totalH = PLOT_H + MT + MB;

  // Delta mode: compute per-job per-provider deltas and auto-scale Y
  let yMax = 1;
  const deltasByJob: (number | null)[][] = [];
  if (mode === 'delta' && validBenchmark) {
    for (const job of jobsWithData) {
      const benchEval  = cellState.get(cellKey(job.job_id, validBenchmark))?.eval;
      const benchScore = benchEval ? computeOverallScore(benchEval, weights) : null;
      const row = activeProviders.map(({ key: p }) => {
        if (benchScore == null || p === validBenchmark) return null;
        const c = cellState.get(cellKey(job.job_id, p));
        return c?.eval ? computeOverallScore(c.eval, weights) - benchScore : null;
      });
      deltasByJob.push(row);
      for (const d of row) if (d != null) yMax = Math.max(yMax, Math.abs(d));
    }
    yMax = Math.ceil(yMax * 2) / 2; // round to nearest 0.5
  }

  const yOf_scores = (v: number) => PLOT_H - (v / 10) * PLOT_H;
  const yOf_delta  = (v: number) => HALF_H - (v / yMax) * HALF_H;

  const yTicks = mode === 'scores'
    ? [0, 2, 4, 6, 8, 10]
    : [yMax, yMax / 2, 0, -yMax / 2, -yMax];

  const fmtTick = (t: number) => {
    const s = Number.isInteger(Math.abs(t)) ? String(Math.abs(t)) : Math.abs(t).toFixed(1);
    if (mode === 'scores') return s;
    return t > 0 ? `+${s}` : t < 0 ? `−${s}` : '0';
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Score Comparison</p>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
            {(['scores', 'delta'] as const).map(m => (
              <button key={m} onClick={() => switchMode(m)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  mode === m ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {m === 'scores' ? 'Total Scores' : 'vs. Benchmark'}
              </button>
            ))}
          </div>

          {/* Benchmark selector */}
          {mode === 'delta' && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Benchmark:</span>
              <select
                value={validBenchmark ?? ''}
                onChange={e => setBenchmark(e.target.value as Provider)}
                className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {activeProviders.map(({ key, label }) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 flex-wrap">
            {activeProviders.map(({ key, label }) => {
              const isBase = mode === 'delta' && key === validBenchmark;
              return (
                <div key={key} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0 inline-block"
                    style={{
                      background: isBase ? 'transparent' : (PROVIDER_COLORS[key] ?? '#6b7280'),
                      border: isBase ? `2px solid ${PROVIDER_COLORS[key] ?? '#6b7280'}` : undefined,
                    }}
                  />
                  {label}{isBase ? ' (baseline)' : ''}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg width={Math.max(totalW, 320)} height={totalH} style={{ display: 'block' }}>
          <g transform={`translate(${ML},${MT})`}>
            {/* Y-axis gridlines and labels */}
            {yTicks.map(t => {
              const y    = mode === 'scores' ? yOf_scores(t) : yOf_delta(t);
              const zero = mode === 'delta' && t === 0;
              return (
                <g key={t}>
                  <line
                    x1={0} y1={y}
                    x2={Math.max(totalW, 320) - ML - MR} y2={y}
                    stroke={zero ? '#9ca3af' : '#f3f4f6'}
                    strokeWidth={zero ? 1.5 : 1}
                  />
                  <text x={-8} y={y + 3.5} textAnchor="end" fontSize={9}
                    fill={zero ? '#4b5563' : '#9ca3af'}
                    fontWeight={zero ? '700' : 'normal'}
                  >
                    {fmtTick(t)}
                  </text>
                </g>
              );
            })}

            {/* Bars per job group */}
            {jobsWithData.map((job, ji) => {
              const barsW     = nP * BAR_W + (nP - 1) * GAP;
              const barStartX = ji * GW + (GW - barsW) / 2;
              const labelCx   = ji * GW + GW / 2;

              // Spread badge (scores mode only)
              const jobScores = mode === 'scores'
                ? activeProviders
                    .map(({ key: p }) => cellState.get(cellKey(job.job_id, p))?.eval)
                    .filter((e): e is Evaluation => e != null)
                    .map(e => computeOverallScore(e, weights))
                : [];
              const spread = jobScores.length >= 2
                ? Math.max(...jobScores) - Math.min(...jobScores) : null;

              return (
                <g key={job.job_id}>
                  {activeProviders.map(({ key: provider }, pi) => {
                    const col = PROVIDER_COLORS[provider] ?? '#6b7280';
                    const x   = barStartX + pi * (BAR_W + GAP);

                    if (mode === 'scores') {
                      const cell = cellState.get(cellKey(job.job_id, provider));
                      if (!cell?.eval) return null;
                      const score = computeOverallScore(cell.eval, weights);
                      const h = Math.max(2, (score / 10) * PLOT_H);
                      const y = PLOT_H - h;
                      return (
                        <g key={provider}>
                          <rect x={x} y={y} width={BAR_W} height={h} fill={col} rx={2} opacity={0.85} />
                          {BAR_W >= 18 && (
                            <text x={x + BAR_W / 2} y={y - 4} textAnchor="middle"
                              fontSize={8} fill={col} fontWeight="600">
                              {score.toFixed(1)}
                            </text>
                          )}
                        </g>
                      );
                    }

                    // Delta mode ──────────────────────────────────────────────
                    if (provider === validBenchmark) {
                      // Benchmark: thin filled bar at the 0 line
                      return (
                        <g key={provider}>
                          <rect x={x} y={HALF_H - 2} width={BAR_W} height={4}
                            fill={col} rx={1} opacity={0.45} />
                          {BAR_W >= 18 && (
                            <text x={x + BAR_W / 2} y={HALF_H - 7}
                              textAnchor="middle" fontSize={7.5} fill={col} opacity={0.6}>
                              0
                            </text>
                          )}
                        </g>
                      );
                    }

                    const delta = deltasByJob[ji]?.[pi] ?? null;
                    if (delta == null) return null;
                    const h = Math.max(2, (Math.abs(delta) / yMax) * HALF_H);
                    const y = delta >= 0 ? HALF_H - h : HALF_H;
                    return (
                      <g key={provider}>
                        <rect x={x} y={y} width={BAR_W} height={h} fill={col} rx={2} opacity={0.85} />
                        {BAR_W >= 18 && (
                          <text
                            x={x + BAR_W / 2}
                            y={delta >= 0 ? y - 4 : y + h + 9}
                            textAnchor="middle" fontSize={8} fill={col} fontWeight="600"
                          >
                            {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Spread badge (scores mode) */}
                  {mode === 'scores' && spread != null && spread >= 0.5 && (
                    <text x={labelCx} y={PLOT_H + 8} textAnchor="middle" fontSize={8}
                      fill={spread > 1.5 ? '#ef4444' : '#f59e0b'} fontWeight="600">
                      Δ{spread.toFixed(1)}
                    </text>
                  )}

                  {/* Rotated job label */}
                  <g transform={`translate(${labelCx}, ${PLOT_H + (mode === 'scores' && spread != null && spread >= 0.5 ? 20 : 12)})`}>
                    <text transform="rotate(-38)" textAnchor="end"
                      dominantBaseline="middle" fontSize={9} fill="#6b7280">
                      {(job.company || job.title || '?').slice(0, 16)}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AiComparePage() {
  const [allEvals,    setAllEvals]    = useState<Evaluation[]>([]);
  const [resumes,     setResumes]     = useState<Resume[]>([]);
  const [allModels,   setAllModels]   = useState<Record<Provider, ModelOption[]>>({ anthropic: [], openai: [], deepseek: [], qwen: [] });
  const [settings,    setSettings]    = useState<AppSettings | null>(null);
  const [resumeId,         setResumeId]         = useState<number | ''>('');
  const [selModels,        setSelModels]        = useState<Record<Provider, string>>({ anthropic: '', openai: '', deepseek: '', qwen: '' });
  const [enabledProviders, setEnabledProviders] = useState<Set<Provider>>(new Set(['anthropic', 'openai', 'deepseek', 'qwen'] as Provider[]));
  const [selJobs,          setSelJobs]          = useState<Set<number>>(new Set());
  const [cellState,   setCellState]   = useState<Map<string, CellStatus>>(new Map());
  const [running,     setRunning]     = useState(false);
  const [progress,    setProgress]    = useState<{ done: number; total: number } | null>(null);
  const [expandedJob, setExpandedJob] = useState<number | null>(null);

  const uniqueJobs      = useMemo(() => getUniqueJobs(allEvals), [allEvals]);
  const activeProviders = useMemo(() => PROVIDERS.filter(p => enabledProviders.has(p.key)), [enabledProviders]);

  useEffect(() => {
    Promise.all([getJobs(), getResumes(), getSettings(), getModels()]).then(([evals, r, s, m]) => {
      setAllEvals(evals);
      setResumes(r);
      setSettings(s);
      setAllModels(m);
      if (r.length > 0) setResumeId(r[0].id);
      setSelModels({
        anthropic: m.anthropic.find(x => x.recommended)?.id ?? m.anthropic[0]?.id ?? '',
        openai:    m.openai.find(x => x.recommended)?.id    ?? m.openai[0]?.id    ?? '',
        deepseek:  m.deepseek.find(x => x.recommended)?.id  ?? m.deepseek[0]?.id  ?? '',
        qwen:      m.qwen.find(x => x.recommended)?.id      ?? m.qwen[0]?.id      ?? '',
      });
    });
  }, []);

  useEffect(() => {
    if (!resumeId) return;
    const jobs = getUniqueJobs(allEvals);
    setCellState(prev => {
      const next = new Map<string, CellStatus>();
      for (const { key: provider } of PROVIDERS) {
        if (!enabledProviders.has(provider)) continue;
        const model = selModels[provider];
        if (!model) continue;
        for (const job of jobs) {
          const key     = cellKey(job.job_id, provider);
          const current = prev.get(key);
          if (current?.loading) { next.set(key, current); continue; }
          const existing = allEvals.find(
            e => e.job_id      === job.job_id &&
                 e.resume_id   === Number(resumeId) &&
                 e.llm_provider === provider &&
                 e.llm_model    === model
          );
          next.set(key, { eval: existing ?? null, loading: false, error: current?.error ?? '' });
        }
      }
      return next;
    });
  }, [allEvals, resumeId, selModels, enabledProviders]);

  const pendingCells = useMemo(() => {
    const cells: { job_id: number; provider: Provider }[] = [];
    for (const jobId of selJobs) {
      for (const { key: provider } of activeProviders) {
        if (!selModels[provider]) continue;
        const cell = cellState.get(cellKey(jobId, provider));
        if (!cell?.eval && !cell?.loading) cells.push({ job_id: jobId, provider });
      }
    }
    return cells;
  }, [selJobs, cellState, selModels, activeProviders]);

  function toggleJob(id: number) {
    setSelJobs(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const allChecked  = uniqueJobs.length > 0 && selJobs.size === uniqueJobs.length;
  const someChecked = selJobs.size > 0 && !allChecked;
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked;
  }, [someChecked]);

  async function runComparison() {
    if (!resumeId || running || pendingCells.length === 0) return;
    setRunning(true);
    setProgress({ done: 0, total: pendingCells.length });
    let done = 0;
    for (const { job_id, provider } of pendingCells) {
      const model = selModels[provider];
      const key   = cellKey(job_id, provider);
      setCellState(prev => { const n = new Map(prev); n.set(key, { eval: null, loading: true, error: '' }); return n; });
      try {
        const result = await compareScore({ job_id, resume_id: Number(resumeId), provider, model });
        setAllEvals(prev => [...prev, result]);
        setCellState(prev => { const n = new Map(prev); n.set(key, { eval: result, loading: false, error: '' }); return n; });
      } catch (err) {
        setCellState(prev => { const n = new Map(prev); n.set(key, { eval: null, loading: false, error: (err as Error).message }); return n; });
      }
      done++;
      setProgress({ done, total: pendingCells.length });
    }
    setRunning(false);
    setProgress(null);
  }

  const weights: Weights = settings?.weights ?? {
    duties: 20, requirements: 20, years_experience: 15, skills: 15, preferences: 10, industry: 20,
  };

  const btnLabel = running
    ? `Running… ${progress?.done ?? 0} / ${progress?.total ?? 0}`
    : pendingCells.length > 0
      ? `Run ${pendingCells.length} evaluation${pendingCells.length !== 1 ? 's' : ''}`
      : selJobs.size > 0 ? 'All scores loaded' : 'Select jobs below';

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">AI Compare</h1>

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Resume</label>
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={resumeId}
            onChange={e => setResumeId(Number(e.target.value))}
            disabled={running}
          >
            {resumes.map(r => (
              <option key={r.id} value={r.id}>{r.name} ({r.category_name})</option>
            ))}
          </select>
        </div>

        {PROVIDERS.map(({ key: provider, label }) => {
          const enabled = enabledProviders.has(provider);
          return (
            <div key={provider} className={`transition-opacity ${enabled ? '' : 'opacity-40'}`}>
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={running}
                  onChange={() => setEnabledProviders(prev => {
                    const next = new Set(prev);
                    next.has(provider) ? next.delete(provider) : next.add(provider);
                    return next;
                  })}
                  className="rounded border-gray-300"
                />
                {label} Model
              </label>
              <select
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                value={selModels[provider]}
                onChange={e => setSelModels(prev => ({ ...prev, [provider]: e.target.value }))}
                disabled={running || !enabled}
              >
                {(allModels[provider] ?? []).map(m => (
                  <option key={m.id} value={m.id}>{m.label}{m.recommended ? ' ★' : ''}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={runComparison}
          disabled={running || pendingCells.length === 0 || !resumeId}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
        >
          {running && <Loader2 size={14} className="animate-spin" />}
          {btnLabel}
        </button>
        <span className="text-sm text-gray-400">
          {selJobs.size} of {uniqueJobs.length} job{uniqueJobs.length !== 1 ? 's' : ''} selected
        </span>
      </div>

      {/* Chart — rendered whenever at least one score is loaded */}
      <ScoreComparisonChart
        jobs={uniqueJobs}
        cellState={cellState}
        activeProviders={activeProviders}
        weights={weights}
      />

      {/* Table */}
      {uniqueJobs.length === 0 ? (
        <p className="text-sm text-gray-400">No jobs in archive yet. Evaluate some jobs first.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allChecked}
                    onChange={e => {
                      if (e.target.checked) setSelJobs(new Set(uniqueJobs.map(j => j.job_id)));
                      else setSelJobs(new Set());
                    }}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Company</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Title</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 text-xs">Date</th>
                {activeProviders.map(({ key: provider, label }) => (
                  <th key={provider} className="px-4 py-3 text-center font-medium text-gray-600 min-w-[120px]">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm flex-shrink-0 inline-block" style={{ background: PROVIDER_COLORS[provider] ?? '#6b7280' }} />
                      <span className="text-xs text-gray-400 font-normal">{label}</span>
                    </div>
                    <div className="text-xs truncate max-w-[150px] mx-auto mt-0.5">
                      {allModels[provider]?.find(m => m.id === selModels[provider])?.label ?? selModels[provider] ?? '—'}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-3 text-center font-medium text-gray-400 text-xs w-16">Spread</th>
                <th className="w-8 px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {uniqueJobs.map(job => {
                const isExpanded = expandedJob === job.job_id;

                const loadedScores = activeProviders
                  .map(({ key: p }) => cellState.get(cellKey(job.job_id, p))?.eval)
                  .filter((e): e is Evaluation => e != null)
                  .map(e => computeOverallScore(e, weights));
                const spread = loadedScores.length >= 2
                  ? Math.max(...loadedScores) - Math.min(...loadedScores) : null;

                return (
                  <Fragment key={job.job_id}>
                    <tr
                      className={`border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer select-none ${selJobs.has(job.job_id) ? 'bg-blue-50/30' : ''}`}
                      onClick={() => setExpandedJob(isExpanded ? null : job.job_id)}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selJobs.has(job.job_id)}
                          onChange={() => toggleJob(job.job_id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800 max-w-[140px] truncate">
                        {job.company || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-[220px] truncate">
                        {job.title || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(job.created_at).toLocaleDateString()}
                      </td>
                      {activeProviders.map(({ key: provider }) => (
                        <td key={provider} className="px-4 py-3 text-center">
                          <ScoreCell cell={cellState.get(cellKey(job.job_id, provider))} weights={weights} color={PROVIDER_COLORS[provider]} />
                        </td>
                      ))}
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        {spread != null
                          ? <span className={`text-xs font-semibold ${deltaClass(spread)}`}>Δ {spread.toFixed(1)}</span>
                          : <span className="text-gray-200 text-xs">—</span>
                        }
                      </td>
                      <td className="px-2 py-3 text-gray-400">
                        {isExpanded
                          ? <ChevronUp size={14} className="mx-auto" />
                          : <ChevronDown size={14} className="mx-auto" />}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={4 + activeProviders.length + 2} className="p-0">
                          <BreakdownPanel
                            job={job}
                            cellState={cellState}
                            selModels={selModels}
                            allModels={allModels}
                            weights={weights}
                            activeProviders={activeProviders}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Summary score cell ───────────────────────────────────────────────────────

function ScoreCell({ cell, weights, color }: { cell: CellStatus | undefined; weights: Weights; color?: string }) {
  if (!cell || (!cell.eval && !cell.loading && !cell.error)) {
    return <span className="text-gray-300">—</span>;
  }
  if (cell.loading) return <Loader2 size={14} className="animate-spin text-blue-400 mx-auto" />;
  if (cell.error)   return <span className="text-red-400 text-xs cursor-help" title={cell.error}>Error</span>;
  if (!cell.eval)   return <span className="text-gray-300">—</span>;

  const score = computeOverallScore(cell.eval, weights);
  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <span className={`font-semibold text-base ${scoreColor(score)}`}>{score.toFixed(1)}</span>
      <div className="h-1 w-12 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score * 10}%`, background: color ?? '#6b7280' }} />
      </div>
    </div>
  );
}

// ─── Expanded breakdown panel ─────────────────────────────────────────────────

interface BreakdownPanelProps {
  job:             UniqueJob;
  cellState:       Map<string, CellStatus>;
  selModels:       Record<Provider, string>;
  allModels:       Record<Provider, ModelOption[]>;
  weights:         Weights;
  activeProviders: { key: Provider; label: string }[];
}

function BreakdownPanel({ job, cellState, selModels, allModels, weights, activeProviders }: BreakdownPanelProps) {
  const overallScores = activeProviders
    .map(({ key: p }) => cellState.get(cellKey(job.job_id, p))?.eval)
    .filter((e): e is Evaluation => e != null)
    .map(e => computeOverallScore(e, weights));
  const overallSpread = overallScores.length >= 2
    ? Math.max(...overallScores) - Math.min(...overallScores) : null;

  return (
    <div className="border-b border-blue-100 bg-slate-50 px-6 py-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">
        Score Breakdown — {job.company}{job.title ? ` · ${job.title}` : ''}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left font-medium text-gray-500 pb-2 pr-4 w-40">Dimension</th>
              <th className="text-center font-medium text-gray-500 pb-2 pr-6 w-14">Weight</th>
              {activeProviders.map(({ key: provider, label }) => (
                <th key={provider} className="text-center font-medium text-gray-500 pb-2 min-w-[160px]">
                  <div className="flex items-center justify-center gap-1">
                    <span className="w-2 h-2 rounded-sm flex-shrink-0 inline-block" style={{ background: PROVIDER_COLORS[provider] ?? '#6b7280' }} />
                    <span className="text-gray-400">{label}</span>
                  </div>
                  <div className="font-normal text-gray-400 mt-0.5">
                    {allModels[provider]?.find(m => m.id === selModels[provider])?.label ?? selModels[provider] ?? '—'}
                  </div>
                </th>
              ))}
              <th className="text-right font-medium text-gray-400 pb-2 pl-6 w-16">Spread</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {SCORE_DIMS.map(dim => {
              const wt = weights[dim.weightKey];

              const dimScores = activeProviders
                .map(({ key: provider }) => {
                  const c = cellState.get(cellKey(job.job_id, provider));
                  return c?.eval?.score_details[dim.key]?.score ?? null;
                })
                .filter((s): s is number => s != null);
              const dimMax    = dimScores.length > 0 ? Math.max(...dimScores) : null;
              const dimSpread = dimScores.length >= 2
                ? (dimMax! - Math.min(...dimScores)) : null;

              return (
                <tr key={dim.key} className="hover:bg-white/60 transition-colors">
                  <td className="py-2 pr-4 font-medium text-gray-700">{dim.label}</td>
                  <td className="py-2 pr-6 text-center text-gray-400">{wt}%</td>

                  {activeProviders.map(({ key: provider }) => {
                    const cell = cellState.get(cellKey(job.job_id, provider));
                    if (cell?.loading) {
                      return (
                        <td key={provider} className="py-2 text-center">
                          <Loader2 size={10} className="animate-spin text-blue-400 mx-auto" />
                        </td>
                      );
                    }
                    if (!cell?.eval) {
                      return <td key={provider} className="py-2 text-center text-gray-300">—</td>;
                    }

                    const raw     = cell.eval.score_details[dim.key];
                    const score   = raw?.score ?? null;
                    const contrib = score != null ? (score * wt / 100) : null;
                    const isBest  = score != null && dimMax != null && score === dimMax && dimScores.length >= 2;

                    const tip = raw
                      ? [
                          raw.rationale,
                          raw.jd_evidence     ? `JD: ${raw.jd_evidence}` : '',
                          raw.resume_evidence ? `Resume: ${raw.resume_evidence}` : '',
                          raw.missing && !/^none/i.test(raw.missing) ? `Missing: ${raw.missing}` : '',
                          raw.confidence ? `Confidence: ${raw.confidence}` : '',
                        ].filter(Boolean).join('\n\n')
                      : '';

                    const col = PROVIDER_COLORS[provider] ?? '#6b7280';

                    return (
                      <td key={provider} className={`py-2 text-center ${isBest ? 'bg-green-50/60' : ''}`}>
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`font-semibold cursor-help ${score != null ? scoreColor(score) : 'text-gray-300'} ${isBest ? 'underline decoration-dotted' : ''}`}
                              title={tip || undefined}
                            >
                              {score ?? '—'}
                            </span>
                            {contrib != null && (
                              <span className="text-gray-400">
                                ×{wt}%=<span className="font-medium text-gray-500">+{contrib.toFixed(2)}</span>
                              </span>
                            )}
                          </div>
                          {score != null && (
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ width: '60px', background: '#f3f4f6' }}>
                              <div className="h-full rounded-full" style={{ width: `${score * 10}%`, background: col }} />
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}

                  <td className="py-2 pl-6 text-right">
                    {dimSpread != null
                      ? <span className={`font-semibold ${deltaClass(dimSpread)}`}>Δ {dimSpread.toFixed(1)}</span>
                      : <span className="text-gray-200">—</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300">
              <td className="pt-3 font-semibold text-gray-700" colSpan={2}>Overall Score</td>
              {activeProviders.map(({ key: provider }) => {
                const cell = cellState.get(cellKey(job.job_id, provider));
                if (!cell?.eval) {
                  return <td key={provider} className="pt-3 text-center text-gray-300">—</td>;
                }
                const score = computeOverallScore(cell.eval, weights);
                const isBest = overallScores.length >= 2 && score === Math.max(...overallScores);
                const col    = PROVIDER_COLORS[provider] ?? '#6b7280';
                return (
                  <td key={provider} className={`pt-3 text-center ${isBest ? 'bg-green-50/60' : ''}`}>
                    <div className="flex flex-col items-center gap-1">
                      <span className={`text-sm font-bold ${scoreColor(score)} ${isBest ? 'underline decoration-dotted' : ''}`}>
                        {score.toFixed(2)} / 10
                      </span>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ width: '60px', background: '#f3f4f6' }}>
                        <div className="h-full rounded-full" style={{ width: `${score * 10}%`, background: col }} />
                      </div>
                    </div>
                  </td>
                );
              })}
              <td className="pt-3 pl-6 text-right">
                {overallSpread != null
                  ? <span className={`text-sm font-bold ${deltaClass(overallSpread)}`}>Δ {overallSpread.toFixed(2)}</span>
                  : <span className="text-gray-200">—</span>
                }
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
