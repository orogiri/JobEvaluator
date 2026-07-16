import type { Evaluation, ResumeSuggestion, Weights } from '../types';
import { computeOverallScore, scoreColor, scoreBg, ordSuffix, pctileColor, formatDaysAgo } from '../types';
import type { SalaryBenchmark } from '../utils/benchmark';
import { fmtK } from '../utils/benchmark';
import { ScoreCard } from './ScoreCard';
import { Building2, Briefcase, DollarSign, Clock, TrendingUp, CalendarClock } from 'lucide-react';

function MeetsBadge({ value, notes }: { value: string | null; notes: string | null }) {
  if (!value) return <span className="text-gray-400">—</span>;
  const color =
    value === 'Yes' ? 'bg-green-100 text-green-700' :
    value === 'No'  ? 'bg-red-100 text-red-700' :
    value === 'N/A' ? 'bg-gray-100 text-gray-500' :
                      'bg-yellow-100 text-yellow-700';
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold ${color}`} title={notes ?? ''}>
      {value}
    </span>
  );
}

interface Props {
  evaluation: Evaluation;
  weights: Weights;
  percentile?: number | null;
  normPercentile?: number | null;
  salaryBenchmark?: SalaryBenchmark | null;
}

const SCORE_LABELS: { key: keyof Evaluation; label: string; weightKey: keyof Weights }[] = [
  { key: 'score_duties',           label: 'Duties Match',              weightKey: 'duties' },
  { key: 'score_requirements',     label: 'Requirements Match',        weightKey: 'requirements' },
  { key: 'score_preferences',      label: 'Preferences Match',         weightKey: 'preferences' },
  { key: 'score_years_experience', label: 'Years of Experience',       weightKey: 'years_experience' },
  { key: 'score_skills',           label: 'Skills / Keywords',         weightKey: 'skills' },
  { key: 'score_industry',         label: 'Industry / Business Model', weightKey: 'industry' },
];

const DETAIL_KEYS: (keyof NonNullable<Evaluation['score_details']>)[] = [
  'duties',
  'requirements',
  'preferences',
  'years_experience',
  'skills',
  'industry',
];

function fmt(n: number | null, prefix = '') {
  if (n == null) return '—';
  return prefix + n.toLocaleString();
}

export function DiffPct({ diffPct }: { diffPct: number | null }) {
  if (diffPct == null) return null;
  const color = diffPct > 2 ? 'text-green-600' : diffPct < -2 ? 'text-red-500' : 'text-gray-500';
  const sign = diffPct > 0 ? '+' : '';
  return <span className={`font-semibold ${color}`}>{sign}{diffPct.toFixed(1)}%</span>;
}

export function EvaluationDetail({ evaluation, weights, percentile, normPercentile, salaryBenchmark }: Props) {
  const overall = computeOverallScore(evaluation, weights);
  const fieldEntries = Object.entries(evaluation.field_values || {});

  const salaryStr =
    evaluation.salary_min != null || evaluation.salary_max != null
      ? `${fmt(evaluation.salary_min, '$')} – ${fmt(evaluation.salary_max, '$')}`
      : '—';

  return (
    <div className="space-y-6">
      {/* JD text */}
      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-gray-500 select-none">
          View Full Job Description
        </summary>
        <pre className="mt-3 whitespace-pre-wrap text-sm text-gray-600 bg-gray-50 rounded-lg p-4 border border-gray-200 max-h-96 overflow-y-auto">
          {evaluation.jd_text}
        </pre>
      </details>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {evaluation.title || 'Untitled Role'}
          </h2>
          <p className="text-gray-500 mt-0.5">{evaluation.company || 'Unknown Company'}</p>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Building2 size={14} />
              {evaluation.category_name} · {evaluation.resume_name}
            </span>
            <span className="flex items-center gap-1">
              <DollarSign size={14} />
              {salaryStr}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={14} />
              {evaluation.years_experience != null
                ? `${evaluation.years_experience} yrs required`
                : 'Experience: —'}
            </span>
            {evaluation.job_level && (
              <span className="flex items-center gap-1">
                <TrendingUp size={14} />
                {evaluation.job_level}
              </span>
            )}
            {evaluation.posted_date && (
              <span className="flex items-center gap-1" title={`Posted ${evaluation.posted_date}`}>
                <CalendarClock size={14} />
                Posted {formatDaysAgo(evaluation.posted_date)}
              </span>
            )}
            {evaluation.reports_to && (
              <span className="flex items-center gap-1">
                <TrendingUp size={14} />
                Reports to: {evaluation.reports_to}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Briefcase size={14} />
              {evaluation.llm_provider} · {evaluation.llm_model}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center shrink-0">
          <span className={`text-5xl font-bold ${scoreColor(overall)}`}>
            {overall.toFixed(1)}
          </span>
          <span className="text-gray-400 text-sm">/10 overall</span>
          {(percentile != null || normPercentile != null) && (
            <div className="flex gap-3 mt-2 text-xs whitespace-nowrap">
              {percentile != null && (
                <span className="text-gray-500">
                  <span className={`font-semibold ${pctileColor(percentile)}`}>
                    {Math.round(percentile)}{ordSuffix(Math.round(percentile))}
                  </span> pctile
                </span>
              )}
              {normPercentile != null && (
                <span className="text-gray-500" title="Percentile relative to other jobs scored by the same model">
                  <span className={`font-semibold ${pctileColor(normPercentile)}`}>
                    {Math.round(normPercentile)}{ordSuffix(Math.round(normPercentile))}
                  </span> norm.
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Requirements & Preferences */}
      {(evaluation.meets_requirements || evaluation.meets_preferences) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {evaluation.meets_requirements && (
            <div className="rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Meets Requirements</p>
              <div className="flex items-center gap-2">
                <MeetsBadge value={evaluation.meets_requirements} notes={null} />
                {evaluation.meets_requirements_notes && (
                  <p className="text-sm text-gray-600">{evaluation.meets_requirements_notes}</p>
                )}
              </div>
            </div>
          )}
          {evaluation.meets_preferences && (
            <div className="rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Meets Preferences</p>
              <div className="flex items-center gap-2">
                <MeetsBadge value={evaluation.meets_preferences} notes={null} />
                {evaluation.meets_preferences_notes && (
                  <p className="text-sm text-gray-600">{evaluation.meets_preferences_notes}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Salary Benchmark */}
      {salaryBenchmark && (salaryBenchmark.level || salaryBenchmark.trend) && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
            Salary Benchmark
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {salaryBenchmark.level && (
              <div className="rounded-lg border border-gray-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                  {evaluation.category_name} · {salaryBenchmark.level.level} market range
                </p>
                <p className="text-sm text-gray-700">
                  <span className="text-gray-400 text-xs">10th</span>{' '}
                  {fmtK(salaryBenchmark.level.p10)}{' '}
                  <span className="text-gray-400 mx-1">·</span>{' '}
                  <span className="text-gray-400 text-xs">median</span>{' '}
                  <span className="font-medium">{fmtK(salaryBenchmark.level.median)}</span>{' '}
                  <span className="text-gray-400 mx-1">·</span>{' '}
                  <span className="text-gray-400 text-xs">90th</span>{' '}
                  {fmtK(salaryBenchmark.level.p90)}
                </p>
                {salaryBenchmark.salaryMid != null && (
                  <p className="text-sm text-gray-700 mt-1">
                    This job: {fmtK(salaryBenchmark.salaryMid)}{' '}
                    (<DiffPct diffPct={salaryBenchmark.level.diffPct} /> vs. median)
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">n = {salaryBenchmark.level.count}</p>
              </div>
            )}
            {salaryBenchmark.trend && (
              <div className="rounded-lg border border-gray-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                  {evaluation.category_name} trendline @ {salaryBenchmark.trend.years} yrs
                </p>
                <p className="text-sm text-gray-700">
                  Predicted: <span className="font-medium">{fmtK(salaryBenchmark.trend.predicted)}</span>
                </p>
                {salaryBenchmark.salaryMid != null && (
                  <p className="text-sm text-gray-700 mt-1">
                    This job: {fmtK(salaryBenchmark.salaryMid)}{' '}
                    (<DiffPct diffPct={salaryBenchmark.trend.diffPct} /> vs. predicted)
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  n = {salaryBenchmark.trend.count} · R² = {salaryBenchmark.trend.r2.toFixed(2)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-scores */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
          Score Breakdown
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SCORE_LABELS.map((s, i) => (
            <ScoreCard
              key={s.key}
              label={s.label}
              weight={weights[s.weightKey]}
              detail={evaluation.score_details[DETAIL_KEYS[i]]}
            />
          ))}
        </div>
      </div>

      {/* Key Gaps */}
      {(() => {
        const gaps = SCORE_LABELS.map((s, i) => {
          const detail = evaluation.score_details[DETAIL_KEYS[i]];
          if (!detail || detail.score >= 10) return null;
          const missing = detail.missing?.trim();
          if (!missing || /^none identified\.?$/i.test(missing)) return null;
          return { label: s.label, score: detail.score, missing };
        }).filter(Boolean) as { label: string; score: number; missing: string }[];

        if (gaps.length === 0) return null;
        return (
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Key Gaps
            </h3>
            <div className="rounded-lg border border-red-100 bg-red-50 divide-y divide-red-100">
              {gaps.map((g) => (
                <div key={g.label} className="px-4 py-3 flex gap-3">
                  <div className="shrink-0 mt-0.5">
                    <span className="inline-block text-xs font-bold text-red-500 bg-red-100 rounded px-1.5 py-0.5">
                      {g.score}/10
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-red-700 mb-0.5">{g.label}</p>
                    <p className="text-sm text-red-800">{g.missing}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Resume Improvement Suggestions */}
      {evaluation.resume_suggestions && evaluation.resume_suggestions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
            Resume Improvement Suggestions
          </h3>
          <div className="space-y-3">
            {evaluation.resume_suggestions.map((s: ResumeSuggestion, i: number) => {
              const typeConfig = {
                rewrite:    { label: 'Rewrite',    bg: 'bg-blue-50 border-blue-200',   badge: 'bg-blue-100 text-blue-700' },
                add:        { label: 'Add',         bg: 'bg-green-50 border-green-200', badge: 'bg-green-100 text-green-700' },
                delete:     { label: 'Delete',      bg: 'bg-red-50 border-red-200',     badge: 'bg-red-100 text-red-700' },
                reorganize: { label: 'Reorganize',  bg: 'bg-yellow-50 border-yellow-200', badge: 'bg-yellow-100 text-yellow-700' },
              }[s.type] ?? { label: s.type, bg: 'bg-gray-50 border-gray-200', badge: 'bg-gray-100 text-gray-700' };

              return (
                <div key={i} className={`rounded-lg border px-4 py-3 space-y-2 ${typeConfig.bg}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-block text-xs font-bold rounded px-1.5 py-0.5 ${typeConfig.badge}`}>
                      {typeConfig.label}
                    </span>
                    <span className="text-xs text-gray-500">{s.section}</span>
                    {s.score_dimension && (
                      <span className="text-xs text-gray-400 italic">↳ {s.score_dimension}</span>
                    )}
                  </div>
                  {s.current && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-0.5">Current</p>
                      <p className="text-sm text-gray-700 bg-white/60 rounded px-2 py-1">{s.current}</p>
                    </div>
                  )}
                  {s.suggested && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-0.5">Suggested</p>
                      <p className="text-sm text-gray-800 font-medium bg-white/60 rounded px-2 py-1">{s.suggested}</p>
                    </div>
                  )}
                  <p className="text-xs text-gray-600">{s.rationale}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Field comparison */}
      {fieldEntries.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
            Field Comparison
          </h3>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600 w-48">Field</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Job Description</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Resume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {fieldEntries.map(([name, val]) => (
                  <tr key={name} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-700">{name}</td>
                    <td
                      className={`px-4 py-2 ${
                        val.jd === 'N/A' ? 'text-gray-400 italic' : 'text-gray-700'
                      }`}
                    >
                      {val.jd}
                    </td>
                    <td className="px-4 py-2 text-gray-400 italic">
                      {val.jd === 'N/A' ? 'N/A' : val.resume === 'N/A' ? <span className="italic">N/A</span> : <span className="text-gray-700 not-italic">{val.resume}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
