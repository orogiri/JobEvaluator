import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppSettings, CostEstimate, ModelOption, Provider, Resume } from '../types';
import {
  estimateCost,
  getBenchmarkImports,
  getModels,
  getResumes,
  getSettings,
  runEvaluation,
} from '../api/client';
import { EvaluationDetail } from '../components/EvaluationDetail';
import type { Evaluation } from '../types';
import { computeOverallScore, rankPercentile } from '../types';
import { getJob, getJobs } from '../api/client';
import { computeSalaryBenchmark, type SalaryBenchmark } from '../utils/benchmark';
import { Loader2 } from 'lucide-react';

export function EvaluatePage() {
  const navigate = useNavigate();

  const [resumes, setResumes] = useState<Resume[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [models, setModels] = useState<Record<Provider, ModelOption[]>>({
    anthropic: [],
    openai: [],
    deepseek: [],
    qwen: [],
  });

  const [selectedResumeId, setSelectedResumeId] = useState<number | ''>('');
  const [provider, setProvider] = useState<Provider>('openai');
  const [model, setModel] = useState('gpt-5.6-luna');
  const [jdText, setJdText] = useState('');
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Evaluation | null>(null);
  const [percentile, setPercentile] = useState<number | null>(null);
  const [normPercentile, setNormPercentile] = useState<number | null>(null);
  const [salaryBenchmark, setSalaryBenchmark] = useState<SalaryBenchmark | null>(null);
  const [includeSuggestions, setIncludeSuggestions] = useState(false);
  const [includeFieldDb, setIncludeFieldDb] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([getResumes(), getSettings(), getModels()]).then(([r, s, m]) => {
      setResumes(r);
      setSettings(s);
      setModels(m);
      if (r.length > 0) setSelectedResumeId(r[0].id);
      const lastProvider = (s.last_provider as Provider) || 'openai';
      const lastModel = s.last_model || 'gpt-5.6-luna';
      setProvider(lastProvider);
      setModel(lastModel);
    });
  }, []);

  // Auto-estimate when inputs change
  useEffect(() => {
    if (!jdText.trim() || !selectedResumeId || !model) {
      setEstimate(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setEstimating(true);
      try {
        const est = await estimateCost({
          jd_text: jdText,
          resume_id: Number(selectedResumeId),
          provider,
          model,
          include_suggestions: includeSuggestions,
          include_field_db: includeFieldDb,
        });
        setEstimate(est);
      } catch {
        setEstimate(null);
      } finally {
        setEstimating(false);
      }
    }, 600);
  }, [jdText, selectedResumeId, provider, model, includeSuggestions, includeFieldDb]);

  function handleProviderChange(p: Provider) {
    setProvider(p);
    setModel(models[p]?.find(m => m.recommended)?.id ?? models[p]?.[0]?.id ?? '');
  }

  async function handleSubmit() {
    if (!jdText.trim() || !selectedResumeId || !model) return;
    setLoading(true);
    setError('');
    setResult(null);
    setPercentile(null);
    setNormPercentile(null);
    setSalaryBenchmark(null);
    try {
      const { evaluation_id } = await runEvaluation({
        jd_text: jdText,
        resume_id: Number(selectedResumeId),
        provider,
        model,
        include_suggestions: includeSuggestions,
        include_field_db: includeFieldDb,
      });
      const eval_ = await getJob(evaluation_id);
      setResult(eval_);

      const [allEvals, imports] = await Promise.all([getJobs(), getBenchmarkImports()]);
      setSalaryBenchmark(computeSalaryBenchmark(eval_, allEvals, imports));

      if (settings) {
        const overall = computeOverallScore(eval_, settings.weights);
        const allScores = allEvals.map(e => computeOverallScore(e, settings.weights));
        if (allScores.length > 1) setPercentile(rankPercentile(overall, allScores));

        const modelScores = allEvals
          .filter(e => e.llm_provider === eval_.llm_provider && e.llm_model === eval_.llm_model)
          .map(e => computeOverallScore(e, settings.weights));
        if (modelScores.length > 1) setNormPercentile(rankPercentile(overall, modelScores));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = !!jdText.trim() && !!selectedResumeId && !!model && !loading;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Evaluate a Job</h1>

      {/* Controls row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Resume selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Resume</label>
          {resumes.length === 0 ? (
            <p className="text-sm text-gray-400">
              No resumes yet.{' '}
              <button
                onClick={() => navigate('/settings')}
                className="text-blue-600 underline"
              >
                Add one in Settings.
              </button>
            </p>
          ) : (
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedResumeId}
              onChange={(e) => setSelectedResumeId(Number(e.target.value))}
            >
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.category_name})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Provider toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {(['anthropic', 'openai', 'deepseek', 'qwen'] as Provider[]).map((p) => (
              <button
                key={p}
                onClick={() => handleProviderChange(p)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  provider === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p === 'anthropic' ? 'Anthropic' : p === 'qwen' ? 'Qwen' : p === 'deepseek' ? 'DeepSeek' : 'OpenAI'}
              </button>
            ))}
          </div>
        </div>

        {/* Model selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {(models[provider] ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}{m.recommended ? ' ★' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* JD input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Job Description</label>
        <textarea
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
          rows={14}
          placeholder="Paste the full job description here…"
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
        />
      </div>

      {/* Options + submit */}
      <div className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer group w-fit">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            checked={includeSuggestions}
            onChange={(e) => setIncludeSuggestions(e.target.checked)}
          />
          <div>
            <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
              Include resume improvement suggestions
            </span>
            <p className="text-xs text-gray-400 mt-0.5">
              The LLM will recommend specific bullet rewrites, additions, deletions, and reorganizations that could raise your score for this JD — without inventing anything.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer group w-fit">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            checked={includeFieldDb}
            onChange={(e) => setIncludeFieldDb(e.target.checked)}
          />
          <div>
            <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
              Map to field database
            </span>
            <p className="text-xs text-gray-400 mt-0.5">
              The LLM will compare against and update the shared field database for this resume category. Increases cost. Off by default.
            </p>
          </div>
        </label>

        <div className="flex items-center gap-4">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          {loading ? 'Evaluating…' : 'Evaluate'}
        </button>

        {estimating && (
          <span className="text-sm text-gray-400 flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" /> Estimating cost…
          </span>
        )}

        {!estimating && estimate && (
          <span className="text-sm text-gray-500">
            Est. cost:{' '}
            <span className="font-medium text-gray-700">
              {estimate.estimatedCost < 0.01
                ? '< $0.01'
                : `$${estimate.estimatedCost.toFixed(4)}`}
            </span>{' '}
            <span className="text-gray-400">
              ({estimate.inputTokens.toLocaleString()} input + {estimate.outputTokens.toLocaleString()} output tokens)
            </span>
          </span>
        )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {result && settings && (
        <div className="border-t pt-8">
          <EvaluationDetail
            evaluation={result}
            weights={settings.weights}
            percentile={percentile}
            normPercentile={normPercentile}
            salaryBenchmark={salaryBenchmark}
          />
          <div className="mt-6">
            <button
              onClick={() => navigate('/archive')}
              className="text-sm text-blue-600 underline"
            >
              View in Archive →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
