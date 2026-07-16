import { useEffect, useMemo, useState } from 'react';
import { deleteBenchmarkImport, getBenchmarkImports } from '../api/client';
import type { BenchmarkImport } from '../types';
import { normalizeLevel } from '../types';
import { Search, Trash2, X } from 'lucide-react';

type SortKey = 'date' | 'company' | 'title' | 'rank' | 'years_experience' | 'salary_mid';

function fmtSalary(n: number | null): string {
  return n == null ? '—' : `$${Math.round(n / 1000)}k`;
}

export function BenchmarkImportsPage() {
  const [rows, setRows] = useState<BenchmarkImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    getBenchmarkImports().then(setRows).finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: number) {
    setRows(prev => prev.filter(r => r.id !== id));
    try {
      await deleteBenchmarkImport(id);
    } catch {
      getBenchmarkImports().then(setRows);
    }
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  const filtered = useMemo(() => {
    if (!searchQuery) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(r =>
      [r.company, r.title, r.function].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

  const sorted = useMemo(() => {
    const dir = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [filtered, sortKey, sortAsc]);

  const th = 'sticky top-0 z-10 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap border-b border-gray-200 cursor-pointer hover:text-gray-800 select-none';

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Benchmarking Archive Import</h1>
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search company, title, function…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          )}
        </div>
        <span className="text-sm text-gray-400 whitespace-nowrap">{sorted.length} row{sorted.length !== 1 ? 's' : ''}</span>
      </div>
      <p className="text-sm text-gray-400">
        Historical salary data imported from an external spreadsheet, kept separate from your evaluated jobs in Archive.
        These rows roll into the Benchmarking page's charts when "Include imported benchmark data" is enabled.
      </p>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : sorted.length === 0 ? (
        <div className="flex items-center justify-center h-40 border border-gray-200 rounded-lg text-gray-400 text-sm">
          No imported benchmark data.
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-gray-200 max-h-[calc(100vh-220px)]">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>
                <th className={th} onClick={() => toggleSort('date')}>Date</th>
                <th className={th} onClick={() => toggleSort('company')}>Company</th>
                <th className={th} onClick={() => toggleSort('title')}>Title</th>
                <th className={th} onClick={() => toggleSort('rank')}>Level</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap border-b border-gray-200">RTO</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap border-b border-gray-200">Function</th>
                <th className={th} onClick={() => toggleSort('years_experience')}>YoE</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap border-b border-gray-200">Sal Low</th>
                <th className={th} onClick={() => toggleSort('salary_mid')}>Sal Mid</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap border-b border-gray-200">Sal High</th>
                <th className="px-3 py-2 border-b border-gray-200" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 whitespace-nowrap text-gray-500">{r.date ? new Date(r.date).toLocaleDateString() : '—'}</td>
                  <td className="px-3 py-1.5 font-medium text-gray-900 whitespace-nowrap">{r.company || '—'}</td>
                  <td className="px-3 py-1.5 text-gray-700 max-w-[220px] truncate" title={r.title}>{r.title || '—'}</td>
                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{r.level || normalizeLevel(r.title) || '—'}</td>
                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{r.rto || '—'}</td>
                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{r.function || '—'}</td>
                  <td className="px-3 py-1.5 text-gray-500 text-center">{r.years_experience ?? '—'}</td>
                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{fmtSalary(r.salary_low)}</td>
                  <td className="px-3 py-1.5 font-medium text-gray-700 whitespace-nowrap">{fmtSalary(r.salary_mid)}</td>
                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{fmtSalary(r.salary_high)}</td>
                  <td className="px-3 py-1.5">
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                      title="Delete row"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
