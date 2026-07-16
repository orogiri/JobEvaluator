import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart, Scatter, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { getBenchmarkImports, getJobs } from '../api/client';
import type { BenchmarkImport, Evaluation } from '../types';
import { LEVEL_ORDER } from '../types';
import {
  linReg, pct, fmtK, evalToBenchmarkPoints, importsToBenchmarkPoints,
  type BenchmarkPoint as ScatterPoint,
} from '../utils/benchmark';

function mean(vals: (number | null)[]): number | null {
  const v = vals.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function percentile(sortedVals: number[], p: number): number {
  const idx = (p / 100) * (sortedVals.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedVals[lo];
  return sortedVals[lo] + (sortedVals[hi] - sortedVals[lo]) * (idx - lo);
}

function fmtCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function BenchmarkingPage() {
  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [imports, setImports] = useState<BenchmarkImport[]>([]);
  const [includeImports, setIncludeImports] = useState(true);
  const [filterLevel, setFilterLevel] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterRemote, setFilterRemote] = useState<'' | 'remote' | 'in-person-hybrid'>('');
  const [trendYears, setTrendYears] = useState(10);

  useEffect(() => {
    getJobs().then(setEvals);
    getBenchmarkImports().then(setImports);
  }, []);

  const evalPoints = useMemo<ScatterPoint[]>(() => evalToBenchmarkPoints(evals), [evals]);

  const importPoints = useMemo<ScatterPoint[]>(() => importsToBenchmarkPoints(imports), [imports]);

  const allPoints = useMemo(
    () => includeImports ? [...evalPoints, ...importPoints] : evalPoints,
    [evalPoints, importPoints, includeImports]
  );

  const chartPoints = useMemo(() =>
    allPoints.filter(p =>
      (!filterLevel || p.level === filterLevel) &&
      (!filterCategory || p.category === filterCategory) &&
      (!filterRemote || p.remoteClass === filterRemote)
    ),
    [allPoints, filterLevel, filterCategory, filterRemote]
  );

  const reg = useMemo(() => linReg(chartPoints), [chartPoints]);

  const xMin = chartPoints.length ? Math.min(...chartPoints.map(p => p.x)) : 0;
  const xMax = chartPoints.length ? Math.max(...chartPoints.map(p => p.x)) : 15;
  const xDomainLo = Math.max(0, xMin - 1);
  const xDomainHi = xMax + 1;

  // Trend line: 60 points spanning chart x-domain
  const trendLine = useMemo(() => {
    if (!reg) return [];
    return Array.from({ length: 60 }, (_, i) => {
      const x = xDomainLo + (i / 59) * (xDomainHi - xDomainLo);
      return { x, trendY: reg.slope * x + reg.intercept };
    });
  }, [reg, xDomainLo, xDomainHi]);

  const salaryAtTrendYears = reg ? reg.slope * trendYears + reg.intercept : null;

  // Level ranges — use category filter but not level filter so all levels always show
  const categoryPoints = useMemo(() =>
    allPoints.filter(p =>
      (!filterCategory || p.category === filterCategory) &&
      (!filterRemote || p.remoteClass === filterRemote)
    ),
    [allPoints, filterCategory, filterRemote]
  );

  const levelStats = useMemo(() => {
    const byLevel: Record<string, number[]> = {};
    categoryPoints.forEach(p => {
      if (p.level) {
        byLevel[p.level] = byLevel[p.level] ?? [];
        byLevel[p.level].push(p.y);
      }
    });
    return LEVEL_ORDER
      .filter(l => byLevel[l]?.length)
      .map(l => ({
        level: l,
        count: byLevel[l].length,
        p10: pct(byLevel[l], 10),
        median: pct(byLevel[l], 50),
        p90: pct(byLevel[l], 90),
      }));
  }, [categoryPoints]);

  const globalLo = levelStats.length ? Math.min(...levelStats.map(l => l.p10)) : 0;
  const globalHi = levelStats.length ? Math.max(...levelStats.map(l => l.p90)) : 1;

  const zoneJobs = useMemo(() =>
    evals.filter(e => e.salary_zones && e.salary_zones.length > 0),
    [evals]
  );

  const zoneSpreads = useMemo(() =>
    zoneJobs.map(e => {
      const zones = e.salary_zones ?? [];
      const zoneAvgs = zones.map(z => (z.min + z.max) / 2);
      const highest = Math.max(...zoneAvgs);
      const lowest = Math.min(...zoneAvgs);
      return { id: e.id, spread: highest - lowest };
    }),
    [zoneJobs]
  );

  const avgZoneSpread = useMemo(() =>
    mean(zoneSpreads.map(s => s.spread)),
    [zoneSpreads]
  );

  const avgZoneSpreadTrimmed = useMemo(() => {
    const sorted = zoneSpreads.map(s => s.spread).sort((a, b) => a - b);
    if (sorted.length < 3) return null;
    const p10 = percentile(sorted, 10);
    const p90 = percentile(sorted, 90);
    const trimmed = sorted.filter(v => v >= p10 && v <= p90);
    return mean(trimmed);
  }, [zoneSpreads]);

  const levels = LEVEL_ORDER.filter(l => allPoints.some(p => p.level === l));
  const categories = [...new Set(allPoints.map(p => p.category))].sort();

  const selectCls = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Benchmarking</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Level</label>
          <select className={selectCls} value={filterLevel} onChange={e => setFilterLevel(e.target.value)}>
            <option value="">All levels</option>
            {levels.map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
          <select className={selectCls} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
          <select className={selectCls} value={filterRemote} onChange={e => setFilterRemote(e.target.value as '' | 'remote' | 'in-person-hybrid')}>
            <option value="">All locations</option>
            <option value="remote">Remote</option>
            <option value="in-person-hybrid">In Person / Hybrid</option>
          </select>
        </div>
        {(filterLevel || filterCategory || filterRemote) && (
          <button
            onClick={() => { setFilterLevel(''); setFilterCategory(''); setFilterRemote(''); }}
            className="text-sm text-gray-400 hover:text-gray-700 mt-4"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-sm text-gray-400 mt-4">{chartPoints.length} data point{chartPoints.length !== 1 ? 's' : ''}</span>
      </div>

      {importPoints.length > 0 && (
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer w-fit">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            checked={includeImports}
            onChange={e => setIncludeImports(e.target.checked)}
          />
          Include imported benchmark data ({importPoints.length} row{importPoints.length !== 1 ? 's' : ''})
        </label>
      )}

      <div className="flex gap-6 items-start">
        {/* Chart */}
        <div className="flex-1 min-w-0">
          {chartPoints.length < 2 ? (
            <div className="flex items-center justify-center h-80 border border-gray-200 rounded-xl text-gray-400 text-sm">
              Need at least 2 jobs with both salary and years-of-experience data.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <ResponsiveContainer width="100%" height={420}>
                <ComposedChart margin={{ top: 20, right: 20, bottom: 40, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[xDomainLo, xDomainHi]}
                    name="Years Exp"
                    label={{ value: 'Years of Experience Required', position: 'insideBottom', offset: -20, style: { fontSize: 12, fill: '#6b7280' } }}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    tickFormatter={v => fmtK(v)}
                    label={{ value: 'Salary Midpoint', angle: -90, position: 'insideLeft', offset: 15, style: { fontSize: 12, fill: '#6b7280' } }}
                    tick={{ fontSize: 11 }}
                    width={70}
                  />
                  <Tooltip
                    content={({ payload }) => {
                      if (!payload?.length) return null;
                      const d = payload[0]?.payload as ScatterPoint;
                      if (!d?.title && !d?.company) return null;
                      return (
                        <div className="bg-white border border-gray-200 rounded-lg shadow-md p-3 text-xs">
                          <p className="font-semibold text-gray-800">{d.title || '—'}</p>
                          <p className="text-gray-500">{d.company || '—'}</p>
                          <p className="mt-1.5">Yrs req: <span className="font-medium">{d.x}</span></p>
                          <p>Salary mid: <span className="font-medium">{fmtK(d.y)}</span></p>
                          {d.level && <p>Level: <span className="font-medium">{d.level}</span></p>}
                          {d.source === 'import' && <p className="text-amber-600 mt-1">Imported benchmark data</p>}
                        </div>
                      );
                    }}
                  />
                  {/* Scatter points */}
                  <Scatter data={chartPoints.filter(p => p.source === 'eval')} fill="#3b82f6" fillOpacity={0.75} r={5} />
                  <Scatter data={chartPoints.filter(p => p.source === 'import')} fill="#f59e0b" fillOpacity={0.75} r={5} />
                  {/* Trend line */}
                  {reg && (
                    <Line
                      data={trendLine}
                      type="linear"
                      dataKey="trendY"
                      dot={false}
                      activeDot={false}
                      stroke="#ef4444"
                      strokeWidth={1.5}
                      strokeDasharray="6 3"
                      legendType="none"
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
              {reg && (
                <p className="text-center text-sm text-gray-500 mt-1">
                  R² = <span className="font-semibold text-gray-700">{reg.r2.toFixed(3)}</span>
                  <span className="mx-3 text-gray-300">|</span>
                  n = {chartPoints.length}
                  <span className="mx-3 text-gray-300">|</span>
                  slope = <span className="font-semibold text-gray-700">{fmtK(reg.slope)}/yr</span>
                </p>
              )}
              {includeImports && chartPoints.some(p => p.source === 'import') && (
                <div className="flex items-center justify-center gap-5 mt-2 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Your evaluations</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Imported benchmark data</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="w-72 shrink-0 space-y-4">
          {/* Trendline at N yrs */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Trendline @</p>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={trendYears}
                  onChange={e => setTrendYears(Math.max(0, Number(e.target.value) || 0))}
                  className="w-14 border border-gray-300 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-500">yrs exp</span>
              </div>
            </div>
            {salaryAtTrendYears != null && salaryAtTrendYears > 0 ? (
              <p className="text-3xl font-bold text-gray-900">{fmtK(salaryAtTrendYears)}</p>
            ) : (
              <p className="text-sm text-gray-400">Insufficient data</p>
            )}
          </div>

          {/* Level salary ranges */}
          {levelStats.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Salary Range by Level</p>
              <p className="text-xs text-gray-400 mb-4">P10 – P90 of salary midpoints</p>
              <div className="space-y-4">
                {levelStats.map(({ level, count, p10, median, p90 }) => {
                  const range = globalHi - globalLo || 1;
                  const barLeft = ((p10 - globalLo) / range) * 100;
                  const barWidth = ((p90 - p10) / range) * 100;
                  const medPct = ((median - globalLo) / range) * 100;
                  return (
                    <div key={level}>
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-xs font-medium text-gray-700">{level}</span>
                        <span className="text-xs text-gray-400">{count} job{count !== 1 ? 's' : ''}</span>
                      </div>
                      {/* Bar */}
                      <div className="relative h-2 bg-gray-100 rounded-full mb-1">
                        <div
                          className="absolute h-full bg-blue-200 rounded-full"
                          style={{ left: `${barLeft}%`, width: `${barWidth}%` }}
                        />
                        <div
                          className="absolute w-0.5 h-3 bg-blue-500 rounded-full -top-0.5"
                          style={{ left: `${medPct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{fmtK(p10)}</span>
                        <span className="text-blue-500 font-medium">{fmtK(median)}</span>
                        <span>{fmtK(p90)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Salary by geographic zone */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-700">Salary by Geographic Zone</p>
          <p className="text-xs text-gray-400 mt-0.5">Jobs whose posting breaks out pay by location/zone</p>
        </div>
        {zoneJobs.length === 0 ? (
          <p className="text-gray-400 text-sm py-8 text-center">No zone-based salary data yet.</p>
        ) : (
          <div>
            <table className="w-full table-fixed text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {['Company', 'Title', 'Zone', 'Range', 'Zone Spread'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {zoneJobs.flatMap((e, idx) => (e.salary_zones ?? []).map((z, i) => (
                  <tr key={`${e.id}-${i}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-700 truncate" title={i === 0 ? e.company : undefined}>{i === 0 ? e.company : ''}</td>
                    <td className="px-3 py-2 text-gray-600 truncate" title={i === 0 ? e.title : undefined}>{i === 0 ? e.title : ''}</td>
                    <td className="px-3 py-2 text-gray-600 truncate" title={z.zone}>{z.zone}</td>
                    <td className="px-3 py-2 text-gray-700">{fmtCurrency(z.min)} – {fmtCurrency(z.max)}</td>
                    <td className="px-3 py-2 text-gray-700">{i === 0 ? fmtCurrency(zoneSpreads[idx].spread) : ''}</td>
                  </tr>
                )))}
              </tbody>
              {avgZoneSpread != null && (
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td className="px-3 py-2 font-semibold text-gray-700" colSpan={4}>
                      Average zone spread (high-zone avg − low-zone avg, per job)
                    </td>
                    <td className="px-3 py-2 font-semibold text-gray-700">{fmtCurrency(avgZoneSpread)}</td>
                  </tr>
                  {avgZoneSpreadTrimmed != null && (
                    <tr className="border-t border-gray-100 bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-gray-700" colSpan={4}>
                        Average zone spread, excluding outliers (10th–90th percentile)
                      </td>
                      <td className="px-3 py-2 font-semibold text-gray-700">{fmtCurrency(avgZoneSpreadTrimmed)}</td>
                    </tr>
                  )}
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
