import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, Cell, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, ComposedChart, Scatter, Line,
} from 'recharts';
import { getJobs, getSettings } from '../api/client';
import type { AppSettings, Evaluation, Weights } from '../types';
import { computeOverallScore } from '../types';

const PIE_COLORS = [
  '#3b82f6', '#8b5cf6', '#f97316', '#10b981',
  '#ec4899', '#06b6d4', '#f59e0b', '#ef4444',
  '#84cc16', '#a78bfa', '#fb923c', '#34d399',
];

const STAGES: { label: string; field: keyof Evaluation | null }[] = [
  { label: 'All Jobs',   field: null },
  { label: 'Applied',    field: 'applied' },
  { label: '1st Round',  field: 'interview_1' },
  { label: '2nd Round',  field: 'interview_2' },
  { label: '3rd Round',  field: 'interview_3' },
  { label: 'Offer',      field: 'offer_made' },
];

function mean(vals: (number | null)[]): number | null {
  const v = vals.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(1);
}

function rateStyle(n: number | null): string {
  if (n == null) return 'text-gray-400';
  if (n >= 50) return 'text-green-600 font-semibold';
  if (n >= 25) return 'text-yellow-600';
  return 'text-red-500';
}

function scoreStyle(n: number | null): string {
  if (n == null) return 'text-gray-400';
  if (n >= 8) return 'text-green-600 font-semibold';
  if (n >= 6) return 'text-yellow-600';
  if (n >= 4) return 'text-orange-500';
  return 'text-red-500';
}

function barColor(n: number): string {
  if (n >= 8) return '#16a34a';
  if (n >= 6) return '#ca8a04';
  return '#dc2626';
}

interface StageStat {
  label: string;
  count: number;
  overall: number | null;
  duties: number | null;
  requirements: number | null;
  preferences: number | null;
  years_exp: number | null;
  skills: number | null;
  industry: number | null;
}

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

export function AnalyticsPage() {
  const [evals, setEvals]       = useState<Evaluation[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterRemote, setFilterRemote]     = useState('');
  const [filterResume, setFilterResume]     = useState<number | ''>('');
  const [scoreModel, setScoreModel]         = useState('');
  const [filterStage, setFilterStage]       = useState('');

  useEffect(() => {
    Promise.all([getJobs(), getSettings()]).then(([j, s]) => { setEvals(j); setSettings(s); });
  }, []);

  const availableScoreModels = useMemo(() =>
    [...new Set(evals.map(e => `${e.llm_provider}:${e.llm_model}`))].sort(),
    [evals]
  );
  const resumeOptions = useMemo(() =>
    [...new Map(evals.map(e => [e.resume_id, e.resume_name])).entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [evals]
  );

  // Deduplicate by job_id before applying any filters
  const dedupedEvals = useMemo(() => {
    const groups = new Map<number, Evaluation[]>();
    for (const e of evals) {
      if (!groups.has(e.job_id)) groups.set(e.job_id, []);
      groups.get(e.job_id)!.push(e);
    }
    return [...groups.values()].map(g => {
      if (filterResume) {
        const subset = g.filter(e => e.resume_id === filterResume);
        if (subset.length === 0) return null;
        return pickEval(subset, scoreModel);
      }
      return pickEval(g, scoreModel);
    }).filter((e): e is Evaluation => e !== null);
  }, [evals, scoreModel, filterResume]);

  const categories   = useMemo(() => [...new Set(dedupedEvals.map(e => e.category_name))].sort(), [dedupedEvals]);
  const remoteValues = useMemo(() =>
    [...new Set(dedupedEvals.map(e => e.remote).filter((r): r is string => !!r))].sort(),
    [dedupedEvals]
  );

  const filtered = useMemo(() => {
    let result = dedupedEvals;
    if (filterCategory) result = result.filter(e => e.category_name === filterCategory);
    if (filterRemote)   result = result.filter(e => e.remote === filterRemote);
    return result;
  }, [dedupedEvals, filterCategory, filterRemote]);

  const stageStats = useMemo((): StageStat[] => {
    if (!settings) return [];
    return STAGES.map(({ label, field }) => {
      const group = field ? filtered.filter(e => !!(e[field] as number)) : filtered;
      return {
        label,
        count: group.length,
        overall:       mean(group.map(e => computeOverallScore(e, settings.weights))),
        duties:        mean(group.map(e => e.score_duties)),
        requirements:  mean(group.map(e => e.score_requirements)),
        preferences:   mean(group.map(e => e.score_preferences)),
        years_exp:     mean(group.map(e => e.score_years_experience)),
        skills:        mean(group.map(e => e.score_skills)),
        industry:      mean(group.map(e => e.score_industry)),
      };
    });
  }, [filtered, settings]);

  const barData = useMemo(() =>
    stageStats
      .filter(s => s.count > 0 && s.overall != null)
      .map(s => ({ name: s.label, score: parseFloat(s.overall!.toFixed(2)), count: s.count })),
    [stageStats]
  );

  const histData = useMemo(() => {
    if (!settings) return [];
    let base = filtered;
    if      (filterStage === 'none') base = filtered.filter(e => !e.interview_1);
    else if (filterStage === '1')    base = filtered.filter(e => !!e.interview_1);
    else if (filterStage === '2')    base = filtered.filter(e => !!e.interview_2);
    else if (filterStage === '3')    base = filtered.filter(e => !!e.interview_3);
    const total = base.length;
    if (total === 0) return [];
    const buckets = Array.from({ length: 10 }, (_, i) => ({
      range: `${i}–${i + 1}`,
      not_interviewed: 0,
      round1: 0,
      round2: 0,
      round3: 0,
    }));
    base.forEach(e => {
      const score = computeOverallScore(e, settings.weights);
      const bi = Math.min(Math.floor(score), 9);
      if (e.interview_3)      buckets[bi].round3++;
      else if (e.interview_2) buckets[bi].round2++;
      else if (e.interview_1) buckets[bi].round1++;
      else                    buckets[bi].not_interviewed++;
    });
    return buckets
      .filter(b => b.not_interviewed + b.round1 + b.round2 + b.round3 > 0)
      .map(b => {
        const n = b.not_interviewed + b.round1 + b.round2 + b.round3;
        return { ...b, pct: Math.round((n / total) * 100), phantom: 0 };
      });
  }, [filtered, settings, filterStage]);

  const conversionData = useMemo(() => {
    if (!settings) return [];
    const buckets = Array.from({ length: 10 }, () => ({
      not_interviewed: 0, round1: 0, round2: 0, round3: 0,
    }));
    filtered.forEach(e => {
      const score = computeOverallScore(e, settings.weights);
      const bi = Math.min(Math.floor(score), 9);
      if (e.interview_3)      buckets[bi].round3++;
      else if (e.interview_2) buckets[bi].round2++;
      else if (e.interview_1) buckets[bi].round1++;
      else                    buckets[bi].not_interviewed++;
    });
    return buckets.map((b, i) => {
      const total = b.not_interviewed + b.round1 + b.round2 + b.round3;
      if (total === 0) return null;
      const had1 = b.round1 + b.round2 + b.round3;
      const had2 = b.round2 + b.round3;
      const had3 = b.round3;
      return {
        range: `${i}–${i + 1}`,
        total,
        rate1: total > 0 ? (had1 / total) * 100 : null,
        rate2: had1 > 0 ? (had2 / had1) * 100 : null,
        rate3: had2 > 0 ? (had3 / had2) * 100 : null,
      };
    }).filter((b): b is NonNullable<typeof b> => b !== null);
  }, [filtered, settings]);

  const regressionData = useMemo(() => {
    const applied = filtered.filter(e => !!e.applied);
    if (!settings || applied.length < 2) return { points: [], trendLine: [], r2: null, slope: null };
    const points = applied.map(e => {
      const x = parseFloat(computeOverallScore(e, settings.weights).toFixed(2));
      const stage = e.interview_3 ? 3 : e.interview_2 ? 2 : e.interview_1 ? 1 : 0;
      // Deterministic per-job jitter so dots don't pile up on discrete y values
      const jitter = ((e.job_id * 7 + 13) % 100) / 100 * 0.28 - 0.14;
      return { x, y: stage + jitter, realStage: stage, title: e.title };
    });
    const n = points.length;
    const sumX  = points.reduce((s, p) => s + p.x, 0);
    const sumY  = points.reduce((s, p) => s + p.realStage, 0);
    const sumXY = points.reduce((s, p) => s + p.x * p.realStage, 0);
    const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
    const meanY = sumY / n;
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return { points, trendLine: [], r2: null, slope: null };
    const m = (n * sumXY - sumX * sumY) / denom;
    const b = (sumY - m * sumX) / n;
    const ssRes = points.reduce((s, p) => s + Math.pow(p.realStage - (m * p.x + b), 2), 0);
    const ssTot = points.reduce((s, p) => s + Math.pow(p.realStage - meanY, 2), 0);
    const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
    const xs = points.map(p => p.x);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    return {
      points,
      trendLine: [
        { x: xMin, y: m * xMin + b },
        { x: xMax, y: m * xMax + b },
      ],
      r2,
      slope: m,
    };
  }, [filtered, settings]);

  const industryData = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach(e => {
      const ind = e.company_industry?.trim() || 'Unknown';
      counts[ind] = (counts[ind] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const remoteData = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach(e => {
      const r = e.remote?.trim() || 'Unknown';
      counts[r] = (counts[r] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [filtered]);

  if (!settings) return null;

  const selectCls = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const card = 'bg-white border border-gray-200 rounded-xl p-5';

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Score source</label>
            <select className={selectCls} value={scoreModel} onChange={e => setScoreModel(e.target.value)}>
              <option value="">Latest</option>
              {availableScoreModels.map(key => {
                const sep = key.indexOf(':');
                const provider = key.slice(0, sep);
                const model = key.slice(sep + 1);
                const provLabel = provider === 'anthropic' ? 'Anthropic' : provider === 'openai' ? 'OpenAI' : 'Qwen';
                return <option key={key} value={key}>{provLabel}: {model}</option>;
              })}
            </select>
          </div>
          {resumeOptions.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">Resume</label>
              <select className={selectCls} value={filterResume} onChange={e => setFilterResume(e.target.value ? Number(e.target.value) : '')}>
                <option value="">All</option>
                {resumeOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Category</label>
            <select className={selectCls} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="">All</option>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          {remoteValues.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">Work type</label>
              <select className={selectCls} value={filterRemote} onChange={e => setFilterRemote(e.target.value)}>
                <option value="">All</option>
                {remoteValues.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-400 text-sm py-16 text-center">No evaluations yet.</p>
      ) : (
        <div className="flex gap-6 items-start">

          {/* ── Left column ── */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* Stage score cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {stageStats.map(s => (
                <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{s.label}</p>
                  <p className={`text-3xl font-bold ${scoreStyle(s.overall)}`}>{fmt(s.overall)}</p>
                  <p className="text-xs text-gray-400 mt-1">{s.count} job{s.count !== 1 ? 's' : ''}</p>
                </div>
              ))}
            </div>

            {/* Bar chart */}
            {barData.length >= 2 && (
              <div className={card}>
                <p className="text-sm font-semibold text-gray-700 mb-4">Average Overall Score by Stage</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={barData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} width={25} />
                    <Tooltip
                      content={({ payload, label }) => {
                        if (!payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white border border-gray-200 rounded-lg shadow p-2 text-xs">
                            <p className="font-semibold text-gray-800">{label}</p>
                            <p className="text-gray-600">Avg score: <span className="font-medium">{d.score}/10</span></p>
                            <p className="text-gray-600">{d.count} job{d.count !== 1 ? 's' : ''}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                      {barData.map((d, i) => (
                        <Cell key={i} fill={barColor(d.score)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Score distribution histogram */}
            <div className={card}>
              <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Score Distribution & Interview Outcomes</p>
                  <p className="text-xs text-gray-400 mt-0.5">% of total shown above each bar · stacked by highest round reached</p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { value: '',     label: 'All' },
                    { value: 'none', label: 'No Interview' },
                    { value: '1',    label: '1st Round' },
                    { value: '2',    label: '2nd Round' },
                    { value: '3',    label: '3rd Round' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setFilterStage(opt.value)}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        filterStage === opt.value
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-5 mb-4">
                {[
                  { color: '#d1d5db', label: 'No interview' },
                  { color: '#60a5fa', label: '1st Round' },
                  { color: '#a78bfa', label: '2nd Round' },
                  { color: '#10b981', label: '3rd Round' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
                    <span className="text-xs text-gray-600">{label}</span>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={histData} margin={{ top: 22, right: 10, bottom: 20, left: 0 }} barCategoryGap="8%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="range"
                    tick={{ fontSize: 10 }}
                    label={{ value: 'Overall Score', position: 'insideBottom', offset: -12, fontSize: 11, fill: '#6b7280' }}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} label={{ value: 'Jobs', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#6b7280' }} />
                  <Tooltip
                    content={({ payload, label }) => {
                      if (!payload?.length) return null;
                      const real = (payload as { dataKey: string; value: number; fill: string; name: string }[])
                        .filter(p => p.dataKey !== 'phantom');
                      const total = real.reduce((sum, p) => sum + (p.value ?? 0), 0);
                      if (total === 0) return null;
                      return (
                        <div className="bg-white border border-gray-200 rounded-lg shadow p-2 text-xs space-y-0.5">
                          <p className="font-semibold text-gray-800">Score {label}</p>
                          <p className="text-gray-400 mb-1">{total} job{total !== 1 ? 's' : ''}</p>
                          {[...real].reverse().map(p =>
                            p.value > 0 ? (
                              <p key={p.dataKey} style={{ color: p.fill }}>
                                {p.name}: {p.value}
                              </p>
                            ) : null
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="not_interviewed" name="No interview" stackId="a" fill="#d1d5db" />
                  <Bar dataKey="round1" name="1st Round" stackId="a" fill="#60a5fa" />
                  <Bar dataKey="round2" name="2nd Round" stackId="a" fill="#a78bfa" />
                  <Bar dataKey="round3" name="3rd Round" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar
                    dataKey="phantom"
                    stackId="a"
                    fill="transparent"
                    stroke="none"
                    isAnimationActive={false}
                    label={({ x, y, width, index }: { x: number; y: number; width: number; index: number }) => {
                      const d = histData[index];
                      if (!d?.pct) return <g />;
                      return (
                        <text x={x + width / 2} y={y - 5} textAnchor="middle" fontSize={10} fill="#9ca3af">
                          {d.pct}%
                        </text>
                      );
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>

              {/* Conversion rates by bracket */}
              {conversionData.length > 0 && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold text-gray-600 mb-1">Interview Conversion Rates by Score Bracket</p>
                  <p className="text-xs text-gray-400 mb-3">Based on all applications · rates are conditional on reaching the prior stage</p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="pb-1.5 pr-4 text-left font-semibold text-gray-500 whitespace-nowrap">Score</th>
                          <th className="pb-1.5 px-3 text-left font-semibold text-gray-500 whitespace-nowrap">n</th>
                          <th className="pb-1.5 px-3 text-center font-semibold text-gray-500 whitespace-nowrap">
                            1st Round<br /><span className="font-normal text-gray-400">given applied</span>
                          </th>
                          <th className="pb-1.5 px-3 text-center font-semibold text-gray-500 whitespace-nowrap">
                            2nd Round<br /><span className="font-normal text-gray-400">given 1st round</span>
                          </th>
                          <th className="pb-1.5 px-3 text-center font-semibold text-gray-500 whitespace-nowrap">
                            3rd Round<br /><span className="font-normal text-gray-400">given 2nd round</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {conversionData.map(b => (
                          <tr key={b.range} className="hover:bg-gray-50">
                            <td className="py-1.5 pr-4 text-gray-600 font-medium">{b.range}</td>
                            <td className="py-1.5 px-3 text-gray-400">{b.total}</td>
                            <td className={`py-1.5 px-3 text-center ${rateStyle(b.rate1)}`}>
                              {b.rate1 != null ? `${b.rate1.toFixed(0)}%` : '—'}
                            </td>
                            <td className={`py-1.5 px-3 text-center ${rateStyle(b.rate2)}`}>
                              {b.rate2 != null ? `${b.rate2.toFixed(0)}%` : '—'}
                            </td>
                            <td className={`py-1.5 px-3 text-center ${rateStyle(b.rate3)}`}>
                              {b.rate3 != null ? `${b.rate3.toFixed(0)}%` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Score vs Interview Stage scatter */}
            {regressionData.points.length >= 2 && (
              <div className={card}>
                <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
                  <p className="text-sm font-semibold text-gray-700">Score vs. Interview Stage</p>
                  {regressionData.r2 != null && (
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>R² = <span className="font-semibold text-gray-800">{regressionData.r2.toFixed(3)}</span></span>
                      <span>slope = <span className="font-semibold text-gray-800">{regressionData.slope!.toFixed(3)}</span></span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-4">Each dot is one job · y-axis jittered slightly for visibility · red line is OLS fit</p>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart margin={{ top: 10, right: 20, bottom: 30, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      domain={[0, 10]}
                      tick={{ fontSize: 11 }}
                      label={{ value: 'Overall Score', position: 'insideBottom', offset: -15, fontSize: 11, fill: '#6b7280' }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      domain={[-0.5, 3.5]}
                      ticks={[0, 1, 2, 3]}
                      tickFormatter={v => (['None', '1st', '2nd', '3rd'] as string[])[v as number] ?? ''}
                      tick={{ fontSize: 11 }}
                      width={38}
                    />
                    <Tooltip
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0]?.payload;
                        if (!d || !('realStage' in d)) return null;
                        const stageLabel = ['No interview', '1st Round', '2nd Round', '3rd Round'][d.realStage as number];
                        return (
                          <div className="bg-white border border-gray-200 rounded-lg shadow p-2 text-xs">
                            <p className="font-semibold text-gray-800 truncate max-w-[180px]">{d.title}</p>
                            <p className="text-gray-600">Score: {(d.x as number).toFixed(1)}</p>
                            <p className="text-gray-600">{stageLabel}</p>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={regressionData.points} fill="#60a5fa" opacity={0.8} />
                    {regressionData.trendLine.length === 2 && (
                      <Line
                        data={regressionData.trendLine}
                        type="linear"
                        dataKey="y"
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={false}
                        activeDot={false}
                        isAnimationActive={false}
                        legendType="none"
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Detailed breakdown table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <p className="text-sm font-semibold text-gray-700 px-4 py-3 border-b border-gray-100">
                Score Breakdown by Stage
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Stage', 'n', 'Overall', 'Duties', 'Req', 'Prefs', 'Yrs Exp', 'Skills', 'Industry'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {stageStats.map(s => (
                      <tr key={s.label} className={`hover:bg-gray-50 ${s.count === 0 ? 'opacity-40' : ''}`}>
                        <td className="px-3 py-2 font-medium text-gray-700 whitespace-nowrap">{s.label}</td>
                        <td className="px-3 py-2 text-gray-400">{s.count}</td>
                        <td className={`px-3 py-2 ${scoreStyle(s.overall)}`}>{fmt(s.overall)}</td>
                        <td className={`px-3 py-2 ${scoreStyle(s.duties)}`}>{fmt(s.duties)}</td>
                        <td className={`px-3 py-2 ${scoreStyle(s.requirements)}`}>{fmt(s.requirements)}</td>
                        <td className={`px-3 py-2 ${scoreStyle(s.preferences)}`}>{fmt(s.preferences)}</td>
                        <td className={`px-3 py-2 ${scoreStyle(s.years_exp)}`}>{fmt(s.years_exp)}</td>
                        <td className={`px-3 py-2 ${scoreStyle(s.skills)}`}>{fmt(s.skills)}</td>
                        <td className={`px-3 py-2 ${scoreStyle(s.industry)}`}>{fmt(s.industry)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── Right column: pie chart ── */}
          <div className="w-72 shrink-0">
            <div className={card}>
              <p className="text-sm font-semibold text-gray-700 mb-2">By Industry</p>
              <p className="text-xs text-gray-400 mb-4">{filtered.length} job{filtered.length !== 1 ? 's' : ''}</p>

              {industryData.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No industry data yet.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={210}>
                    <PieChart>
                      <Pie
                        data={industryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={88}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {industryData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ payload }) => {
                          if (!payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-white border border-gray-200 rounded-lg shadow p-2 text-xs">
                              <p className="font-semibold text-gray-800">{d.name}</p>
                              <p className="text-gray-600">{d.value} job{d.value !== 1 ? 's' : ''}</p>
                              <p className="text-gray-400">
                                {((d.value / filtered.length) * 100).toFixed(0)}%
                              </p>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Legend */}
                  <div className="space-y-1.5 mt-3 border-t border-gray-100 pt-3">
                    {industryData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="text-xs text-gray-600 flex-1 truncate" title={d.name}>{d.name}</span>
                        <span className="text-xs text-gray-400">{((d.value / filtered.length) * 100).toFixed(0)}%</span>
                        <span className="text-xs font-medium text-gray-700 w-4 text-right">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className={`${card} mt-5`}>
              <p className="text-sm font-semibold text-gray-700 mb-2">By Work Arrangement</p>
              <p className="text-xs text-gray-400 mb-4">{filtered.length} job{filtered.length !== 1 ? 's' : ''}</p>

              {remoteData.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No work-arrangement data yet.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={210}>
                    <PieChart>
                      <Pie
                        data={remoteData}
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={88}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {remoteData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ payload }) => {
                          if (!payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-white border border-gray-200 rounded-lg shadow p-2 text-xs">
                              <p className="font-semibold text-gray-800">{d.name}</p>
                              <p className="text-gray-600">{d.value} job{d.value !== 1 ? 's' : ''}</p>
                              <p className="text-gray-400">
                                {((d.value / filtered.length) * 100).toFixed(0)}%
                              </p>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Legend */}
                  <div className="space-y-1.5 mt-3 border-t border-gray-100 pt-3">
                    {remoteData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="text-xs text-gray-600 flex-1 truncate" title={d.name}>{d.name}</span>
                        <span className="text-xs text-gray-400">{((d.value / filtered.length) * 100).toFixed(0)}%</span>
                        <span className="text-xs font-medium text-gray-700 w-4 text-right">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
