import type { BenchmarkImport, Evaluation } from '../types';
import { normalizeLevel } from '../types';

export function salaryMid(e: Evaluation): number | null {
  if (e.salary_min != null && e.salary_max != null) return (e.salary_min + e.salary_max) / 2;
  if (e.salary_min != null) return e.salary_min;
  if (e.salary_max != null) return e.salary_max;
  return null;
}

export function classifyRemote(remote: string | null): 'remote' | 'in-person-hybrid' | null {
  if (!remote) return null;
  const v = remote.toLowerCase();
  if (v.includes('remote') && !v.includes('hybrid')) return 'remote';
  return 'in-person-hybrid';
}

export interface LinReg {
  slope: number;
  intercept: number;
  r2: number;
}

export function linReg(pts: { x: number; y: number }[]): LinReg | null {
  const n = pts.length;
  if (n < 2) return null;
  const sx = pts.reduce((s, p) => s + p.x, 0);
  const sy = pts.reduce((s, p) => s + p.y, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sx2 = pts.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sx2 - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const yMean = sy / n;
  const ssTot = pts.reduce((s, p) => s + (p.y - yMean) ** 2, 0);
  const ssRes = pts.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

export function pct(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const i = (p / 100) * (s.length - 1);
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (i - lo) * (s[hi] - s[lo]);
}

export function fmtK(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${(n / 1000).toFixed(0)}k`;
}

export interface BenchmarkPoint {
  x: number;
  y: number;
  title: string;
  company: string;
  level: string | null;
  category: string;
  remoteClass: 'remote' | 'in-person-hybrid' | null;
  source: 'eval' | 'import';
}

export function evalToBenchmarkPoints(evals: Evaluation[]): BenchmarkPoint[] {
  return evals
    .filter(e => e.years_experience != null && salaryMid(e) != null)
    .map(e => ({
      x: e.years_experience!,
      y: salaryMid(e)!,
      title: e.title || '',
      company: e.company || '',
      level: e.job_level,
      category: e.category_name,
      remoteClass: classifyRemote(e.remote),
      source: 'eval' as const,
    }));
}

export function importsToBenchmarkPoints(imports: BenchmarkImport[]): BenchmarkPoint[] {
  return imports
    .filter(r => r.years_experience != null && r.salary_mid != null)
    .map(r => ({
      x: r.years_experience!,
      y: r.salary_mid!,
      title: r.title || '',
      company: r.company || '',
      level: r.level || normalizeLevel(r.title),
      category: r.function || '',
      remoteClass: classifyRemote(r.rto),
      source: 'import' as const,
    }));
}

export interface SalaryBenchmark {
  salaryMid: number | null;  // null when the job has no salary data
  level: {
    level: string;
    count: number;
    p10: number;
    median: number;
    p90: number;
    diffPct: number | null;  // null when salaryMid is null
  } | null;
  trend: {
    years: number;
    count: number;
    r2: number;
    predicted: number;
    diffPct: number | null;  // null when salaryMid is null
  } | null;
}

// Mirrors the Benchmarking tab's calculations (category-filtered points, median by
// level, linear regression over years-of-experience), evaluated at this job's own
// level/years-of-experience so the Evaluate/Archive tabs can show how it stacks up.
// Always returns benchmark market ranges even when the job has no salary of its own;
// diffPct fields are null in that case. Takes the pre-built point pool so callers
// comparing many jobs (e.g. Archive) build `allPoints` once rather than per row.
export function computeSalaryBenchmarkFromPoints(
  evaluation: Evaluation,
  allPoints: BenchmarkPoint[]
): SalaryBenchmark | null {
  const mid = salaryMid(evaluation);  // null when job has no salary

  const categoryPoints = allPoints.filter(p => p.category === evaluation.category_name);

  let level: SalaryBenchmark['level'] = null;
  if (evaluation.job_level) {
    const levelYs = categoryPoints.filter(p => p.level === evaluation.job_level).map(p => p.y);
    if (levelYs.length > 0) {
      const median = pct(levelYs, 50);
      level = {
        level: evaluation.job_level,
        count: levelYs.length,
        p10: pct(levelYs, 10),
        median,
        p90: pct(levelYs, 90),
        diffPct: mid != null && median !== 0 ? ((mid - median) / median) * 100 : null,
      };
    }
  }

  let trend: SalaryBenchmark['trend'] = null;
  if (evaluation.years_experience != null) {
    const reg = linReg(categoryPoints);
    if (reg) {
      const predicted = reg.slope * evaluation.years_experience + reg.intercept;
      trend = {
        years: evaluation.years_experience,
        count: categoryPoints.length,
        r2: reg.r2,
        predicted,
        diffPct: mid != null && predicted !== 0 ? ((mid - predicted) / predicted) * 100 : null,
      };
    }
  }

  return level || trend ? { salaryMid: mid, level, trend } : null;
}

// Single-job convenience wrapper — builds the point pool from raw evals/imports.
// Prefer computeSalaryBenchmarkFromPoints when checking many jobs against the
// same pool (e.g. an Archive table) to avoid rebuilding it per row.
export function computeSalaryBenchmark(
  evaluation: Evaluation,
  evals: Evaluation[],
  imports: BenchmarkImport[],
  includeImports = true
): SalaryBenchmark | null {
  const allPoints = includeImports
    ? [...evalToBenchmarkPoints(evals), ...importsToBenchmarkPoints(imports)]
    : evalToBenchmarkPoints(evals);
  return computeSalaryBenchmarkFromPoints(evaluation, allPoints);
}
