import { useEffect, useMemo, useState } from 'react';
import { getJobs, getSettings } from '../api/client';
import type { AppSettings, Evaluation } from '../types';
import { computeOverallScore, scoreColor } from '../types';
import { X } from 'lucide-react';

const FIELD_W  = 170; // px — sticky field-name column
const RESUME_W = 190; // px — sticky resume column

export function FieldComparisonPage() {
  const [evals, setEvals]       = useState<Evaluation[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterField, setFilterField]       = useState('');
  const [showResume, setShowResume]         = useState(true);

  useEffect(() => {
    Promise.all([getJobs(), getSettings()]).then(([j, s]) => {
      setEvals(j);
      setSettings(s);
    });
  }, []);

  const categories = useMemo(
    () => [...new Set(evals.map(e => e.category_name))].sort(),
    [evals]
  );

  const filteredEvals = useMemo(
    () => evals.filter(e => !filterCategory || e.category_name === filterCategory),
    [evals, filterCategory]
  );

  // All unique field names across filtered evals, sorted by how many jobs have a non-N/A JD value
  const allFields = useMemo(() => {
    const freq: Record<string, number> = {};
    filteredEvals.forEach(e =>
      Object.entries(e.field_values).forEach(([field, val]) => {
        if (val.jd && val.jd !== 'N/A') freq[field] = (freq[field] ?? 0) + 1;
      })
    );
    return Object.keys(freq).sort((a, b) => {
      const d = freq[b] - freq[a];
      return d !== 0 ? d : a.localeCompare(b);
    });
  }, [filteredEvals]);

  const displayFields = useMemo(
    () => filterField
      ? allFields.filter(f => f.toLowerCase().includes(filterField.toLowerCase()))
      : allFields,
    [allFields, filterField]
  );

  // Best resume evidence per field (first non-N/A occurrence across evals)
  const resumeValues = useMemo(() => {
    const vals: Record<string, string> = {};
    displayFields.forEach(field => {
      for (const e of filteredEvals) {
        const v = e.field_values[field]?.resume;
        if (v && v !== 'N/A') { vals[field] = v; break; }
      }
    });
    return vals;
  }, [displayFields, filteredEvals]);

  if (!settings) return null;

  const inputCls = 'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  // Shared th classes
  const thBase = 'sticky top-0 z-20 bg-gray-50 border-b border-gray-200 px-3 py-2 text-left whitespace-nowrap';
  const thLabel = `${thBase} text-xs font-semibold uppercase tracking-wide text-gray-500`;

  return (
    <div className="flex overflow-hidden p-4 gap-4" style={{ height: 'calc(100vh - 56px)' }}>

      {/* ── Table ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-baseline gap-3 shrink-0">
          <h1 className="text-xl font-bold text-gray-900">Field Comparison</h1>
          <span className="text-sm text-gray-400">
            {displayFields.length} field{displayFields.length !== 1 ? 's' : ''}
            {' · '}
            {filteredEvals.length} job{filteredEvals.length !== 1 ? 's' : ''}
          </span>
        </div>

        {filteredEvals.length === 0 ? (
          <div className="flex-1 flex items-center justify-center border border-gray-200 rounded-lg text-gray-400 text-sm">
            No evaluations yet.
          </div>
        ) : displayFields.length === 0 ? (
          <div className="flex-1 flex items-center justify-center border border-gray-200 rounded-lg text-gray-400 text-sm">
            No fields found{filterField ? ` matching "${filterField}"` : ' for this selection'}.
          </div>
        ) : (
          <div className="flex-1 overflow-auto rounded-lg border border-gray-200">
            <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>
              <thead>
                <tr>
                  {/* Field name — sticky top + left */}
                  <th
                    className={`${thLabel} z-30 left-0`}
                    style={{ minWidth: FIELD_W }}
                  >
                    Field
                  </th>

                  {/* Resume — sticky top + left (offset by FIELD_W) */}
                  {showResume && (
                    <th
                      className={`${thBase} z-30 border-r border-gray-300 text-xs font-semibold uppercase tracking-wide text-blue-500`}
                      style={{ left: FIELD_W, minWidth: RESUME_W }}
                    >
                      Your Resume
                    </th>
                  )}

                  {/* One column per job */}
                  {filteredEvals.map(e => {
                    const overall = computeOverallScore(e, settings.weights);
                    return (
                      <th
                        key={e.id}
                        className={`${thBase} border-l border-gray-100`}
                        style={{ minWidth: 165 }}
                      >
                        <div
                          className="font-semibold text-gray-800 truncate"
                          style={{ maxWidth: 155 }}
                          title={e.company || ''}
                        >
                          {e.company || '—'}
                        </div>
                        <div
                          className="text-gray-500 font-normal truncate"
                          style={{ maxWidth: 155 }}
                          title={e.title || ''}
                        >
                          {e.title || '—'}
                        </div>
                        <span className={`font-bold ${scoreColor(overall)}`}>
                          {overall.toFixed(1)}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayFields.map(field => (
                  <tr key={field} className="group hover:bg-blue-50 transition-colors">

                    {/* Sticky field name */}
                    <td
                      className="sticky left-0 z-10 bg-white group-hover:bg-blue-50 transition-colors px-3 py-2 font-medium text-gray-700 border-r border-gray-100 whitespace-nowrap"
                      style={{ minWidth: FIELD_W }}
                    >
                      {field}
                    </td>

                    {/* Sticky resume value */}
                    {showResume && (
                      <td
                        className="sticky z-10 bg-white group-hover:bg-blue-50 transition-colors px-3 py-2 border-r border-gray-300"
                        style={{ left: FIELD_W, minWidth: RESUME_W }}
                        title={resumeValues[field] ?? 'N/A'}
                      >
                        {resumeValues[field] ? (
                          <span
                            className="text-blue-700 block truncate"
                            style={{ maxWidth: RESUME_W - 24 }}
                          >
                            {resumeValues[field]}
                          </span>
                        ) : (
                          <span className="text-gray-300 italic">N/A</span>
                        )}
                      </td>
                    )}

                    {/* JD value per job */}
                    {filteredEvals.map(e => {
                      const val = e.field_values[field]?.jd;
                      const isNA = !val || val === 'N/A';
                      return (
                        <td
                          key={e.id}
                          className="px-3 py-2 border-l border-gray-100 align-top"
                          style={{ minWidth: 165 }}
                          title={val ?? 'N/A'}
                        >
                          {isNA ? (
                            <span className="text-gray-300 italic">N/A</span>
                          ) : (
                            <span
                              className="text-gray-700 block truncate"
                              style={{ maxWidth: 155 }}
                            >
                              {val}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Sidebar ── */}
      <div className="w-60 shrink-0 overflow-y-auto flex flex-col gap-3">

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Filters</p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Category</label>
            <select
              className={inputCls}
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Field keyword</label>
            <input
              type="text"
              placeholder="e.g. GTM, forecasting"
              className={inputCls}
              value={filterField}
              onChange={e => setFilterField(e.target.value)}
            />
          </div>
          {(filterCategory || filterField) && (
            <button
              onClick={() => { setFilterCategory(''); setFilterField(''); }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700"
            >
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {/* Display options */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Display</p>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showResume}
              onChange={e => setShowResume(e.target.checked)}
              className="rounded accent-blue-600"
            />
            <span className="text-sm text-gray-700">Show resume column</span>
          </label>
        </div>

        {/* Legend */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Reading the table</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            Fields are sorted by how many jobs mention them. <span className="text-blue-600 font-medium">Blue</span> = your resume evidence. <span className="text-gray-400 italic">N/A</span> = not mentioned in that job.
          </p>
        </div>
      </div>
    </div>
  );
}
