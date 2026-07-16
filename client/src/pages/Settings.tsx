import { useEffect, useState } from 'react';
import type { AppSettings, Category, ModelOption, Provider, Resume, Weights } from '../types';
import {
  createCategory,
  createResume,
  deleteCategory,
  deleteResume,
  getCategories,
  getModels,
  getResumes,
  getSettings,
  updateResume,
  updateSettings,
} from '../api/client';
import { Plus, Trash2, Eye, EyeOff, Pencil, X, Check } from 'lucide-react';

const SCORE_DIMS: { key: keyof Weights; label: string }[] = [
  { key: 'duties', label: 'Duties Match' },
  { key: 'requirements', label: 'Requirements Match' },
  { key: 'preferences', label: 'Preferences Match' },
  { key: 'years_experience', label: 'Years of Experience Match' },
  { key: 'skills', label: 'Skill / Keyword Match' },
  { key: 'industry', label: 'Industry / Business Model Fit' },
];

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);

  const [weights, setWeights] = useState<Weights>({
    duties: 20, requirements: 20, years_experience: 15, skills: 15, preferences: 10, industry: 20,
  });
  const [weightsSaved, setWeightsSaved] = useState(false);

  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [qwenKey, setQwenKey] = useState('');
  const [deepseekKey, setDeepseekKey] = useState('');
  const [serperKey, setSerperKey] = useState('');
  const [showOpenai, setShowOpenai] = useState(false);
  const [showAnthropic, setShowAnthropic] = useState(false);
  const [showQwen, setShowQwen] = useState(false);
  const [showDeepseek, setShowDeepseek] = useState(false);
  const [showSerper, setShowSerper] = useState(false);
  const [keysSaved, setKeysSaved] = useState(false);

  const [newCat, setNewCat] = useState('');
  const [newResumeName, setNewResumeName] = useState('');
  const [newResumeCat, setNewResumeCat] = useState<number | ''>('');
  const [newResumeText, setNewResumeText] = useState('');

  const [editingResume, setEditingResume] = useState<Resume | null>(null);
  const [editName, setEditName] = useState('');
  const [editCat, setEditCat] = useState<number | ''>('');
  const [editText, setEditText] = useState('');

  const [models, setModels] = useState<Record<Provider, ModelOption[]>>({ anthropic: [], openai: [], deepseek: [], qwen: [] });
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getSettings(), getCategories(), getResumes(), getModels()]).then(([s, c, r, m]) => {
      setSettings(s);
      setWeights(s.weights);
      setOpenaiKey(s.openai_key);
      setAnthropicKey(s.anthropic_key);
      setQwenKey(s.qwen_key ?? '');
      setDeepseekKey(s.deepseek_key ?? '');
      setSerperKey(s.serper_key ?? '');
      setCategories(c);
      setResumes(r);
      setModels(m);
      if (c.length > 0) setNewResumeCat(c[0].id);
    });
  }, []);

  const weightTotal = Object.values(weights).reduce((s, v) => s + Number(v), 0);

  async function saveWeights() {
    if (Math.round(weightTotal) !== 100) return;
    await updateSettings({ weights });
    setWeightsSaved(true);
    setTimeout(() => setWeightsSaved(false), 2000);
  }

  async function saveKeys() {
    await updateSettings({
      openai_key: openaiKey, anthropic_key: anthropicKey, qwen_key: qwenKey, deepseek_key: deepseekKey,
      serper_key: serperKey,
    });
    setKeysSaved(true);
    setTimeout(() => setKeysSaved(false), 2000);
  }

  async function handleAddCategory() {
    if (!newCat.trim()) return;
    try {
      const cat = await createCategory(newCat.trim());
      setCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)));
      if (!newResumeCat) setNewResumeCat(cat.id);
      setNewCat('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDeleteCategory(id: number) {
    try {
      await deleteCategory(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleAddResume() {
    if (!newResumeName.trim() || !newResumeCat || !newResumeText.trim()) return;
    await createResume({ name: newResumeName.trim(), category_id: Number(newResumeCat), text: newResumeText.trim() });
    const r = await getResumes();
    setResumes(r);
    setNewResumeName('');
    setNewResumeText('');
  }

  function startEdit(r: Resume) {
    setEditingResume(r);
    setEditName(r.name);
    setEditCat(r.category_id);
    setEditText(r.text);
  }

  async function saveEdit() {
    if (!editingResume || !editName.trim() || !editCat || !editText.trim()) return;
    await updateResume(editingResume.id, { name: editName.trim(), category_id: Number(editCat), text: editText.trim() });
    const r = await getResumes();
    setResumes(r);
    setEditingResume(null);
  }

  async function handleDeleteResume(id: number) {
    if (!confirm('Delete this resume?')) return;
    await deleteResume(id);
    setResumes((prev) => prev.filter((r) => r.id !== id));
  }

  if (!settings) return null;

  const section = 'space-y-4';
  const card = 'bg-white rounded-xl border border-gray-200 p-6 space-y-4';
  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const btnPrimary = 'px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors';
  const btnGhost = 'px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors';
  const formatPrice = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex justify-between">
          {error}
          <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      {/* API Keys */}
      <div className={section}>
        <h2 className="text-lg font-semibold text-gray-800">API Keys</h2>
        <div className={card}>
          {[
            { label: 'Anthropic', value: anthropicKey, set: setAnthropicKey, show: showAnthropic, setShow: setShowAnthropic },
            { label: 'OpenAI', value: openaiKey, set: setOpenaiKey, show: showOpenai, setShow: setShowOpenai },
            { label: 'DeepSeek', value: deepseekKey, set: setDeepseekKey, show: showDeepseek, setShow: setShowDeepseek },
            { label: 'Qwen (DashScope)', value: qwenKey, set: setQwenKey, show: showQwen, setShow: setShowQwen },
          ].map(({ label, value, set, show, setShow }) => (
            <div key={label}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <div className="flex gap-2">
                <input
                  type={show ? 'text' : 'password'}
                  className={inputCls}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  placeholder={`${label} API key`}
                />
                <button onClick={() => setShow((v: boolean) => !v)} className={btnGhost}>
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          ))}

          <div className="pt-3 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-1">Serper (Google Search)</label>
            <div className="flex gap-2">
              <input
                type={showSerper ? 'text' : 'password'}
                className={inputCls}
                value={serperKey}
                onChange={(e) => setSerperKey(e.target.value)}
                placeholder="Serper API key"
              />
              <button onClick={() => setShowSerper((v) => !v)} className={btnGhost}>
                {showSerper ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Optional — powers real Google-backed results for Cover Letters' hiring-manager/org contact search
              (Claude's own web search otherwise has much weaker LinkedIn coverage). Get a free key at{' '}
              <a href="https://serper.dev" target="_blank" rel="noreferrer" className="underline">serper.dev</a>{' '}
              (2,500 free searches, then a small per-search fee).
            </p>
          </div>

          <button onClick={saveKeys} className={btnPrimary}>
            {keysSaved ? '✓ Saved' : 'Save Keys'}
          </button>
        </div>
      </div>

      {/* Model Pricing */}
      <div className={section}>
        <h2 className="text-lg font-semibold text-gray-800">Model Pricing</h2>
        <p className="text-sm text-gray-500">Cost per 1M tokens. Used for pre-submission estimates.</p>
        <div className="space-y-4">
          {([['anthropic', 'Anthropic'], ['openai', 'OpenAI'], ['deepseek', 'DeepSeek'], ['qwen', 'Qwen']] as [Provider, string][]).map(([provider, label]) => (
            <div key={provider} className={card + ' !space-y-3'}>
              <p className="text-sm font-semibold text-gray-700">{label}</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-1.5 font-medium text-gray-500 w-1/2">Model</th>
                    <th className="text-right py-1.5 font-medium text-gray-500 w-1/4">Input</th>
                    <th className="text-right py-1.5 font-medium text-gray-500 w-1/4">Output</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {models[provider].map((m) => {
                    const noPrice = m.pricing.input === 0 && m.pricing.output === 0;
                    return (
                      <tr key={m.id}>
                        <td className="py-1.5 text-gray-700">{m.label}</td>
                        <td className={`py-1.5 text-right font-mono ${noPrice ? 'text-gray-300 italic' : 'text-gray-600'}`}>
                          {noPrice ? 'TBD' : formatPrice(m.pricing.input)}
                        </td>
                        <td className={`py-1.5 text-right font-mono ${noPrice ? 'text-gray-300 italic' : 'text-gray-600'}`}>
                          {noPrice ? 'TBD' : formatPrice(m.pricing.output)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {provider === 'qwen' && (
                <p className="text-xs text-gray-400">
                  Tiered Qwen pricing is shown using the standard non-thinking rate and the lowest input tier.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Score Weights */}
      <div className={section}>
        <h2 className="text-lg font-semibold text-gray-800">Score Weights</h2>
        <p className="text-sm text-gray-500">
          Adjust how each dimension contributes to the overall score. Must sum to 100%.
        </p>
        <div className={card}>
          {SCORE_DIMS.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-4">
              <label className="text-sm text-gray-700 w-52 shrink-0">{label}</label>
              <input
                type="number"
                min="0"
                max="100"
                className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={weights[key]}
                onChange={(e) =>
                  setWeights((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                }
              />
              <span className="text-sm text-gray-400">%</span>
            </div>
          ))}
          <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
            <span className="text-sm text-gray-700 w-52 font-medium">Total</span>
            <span
              className={`text-sm font-bold ${
                Math.round(weightTotal) === 100 ? 'text-green-600' : 'text-red-500'
              }`}
            >
              {weightTotal}%
            </span>
          </div>
          <button
            onClick={saveWeights}
            disabled={Math.round(weightTotal) !== 100}
            className={`${btnPrimary} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {weightsSaved ? '✓ Saved — Archive scores updated' : 'Save Weights'}
          </button>
        </div>
      </div>

      {/* Categories */}
      <div className={section}>
        <h2 className="text-lg font-semibold text-gray-800">Resume Categories</h2>
        <div className={card}>
          {categories.length === 0 ? (
            <p className="text-sm text-gray-400">No categories yet.</p>
          ) : (
            <ul className="space-y-2">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{c.name}</span>
                  <button
                    onClick={() => handleDeleteCategory(c.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <input
              type="text"
              className={inputCls}
              placeholder="New category name (e.g. IR)"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
            />
            <button onClick={handleAddCategory} className={btnPrimary}>
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Resumes */}
      <div className={section}>
        <h2 className="text-lg font-semibold text-gray-800">Resumes</h2>
        <div className={card}>
          {resumes.length === 0 ? (
            <p className="text-sm text-gray-400">No resumes yet.</p>
          ) : (
            <ul className="space-y-3">
              {resumes.map((r) =>
                editingResume?.id === r.id ? (
                  <li key={r.id} className="border border-blue-200 rounded-lg p-4 space-y-3">
                    <div className="flex gap-2">
                      <input
                        className={`${inputCls} flex-1 min-w-0`}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Resume name"
                      />
                      <select
                        className="w-32 shrink-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={editCat}
                        onChange={(e) => setEditCat(Number(e.target.value))}
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      className={`${inputCls} resize-none font-mono`}
                      rows={8}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button onClick={saveEdit} className={btnPrimary}>
                        <Check size={14} className="inline mr-1" />Save
                      </button>
                      <button onClick={() => setEditingResume(null)} className={btnGhost}>
                        Cancel
                      </button>
                    </div>
                  </li>
                ) : (
                  <li key={r.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-2">
                    <div>
                      <span className="text-sm font-medium text-gray-800">{r.name}</span>
                      <span className="ml-2 text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                        {r.category_name}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(r)} className="text-gray-300 hover:text-blue-500 transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDeleteResume(r.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                )
              )}
            </ul>
          )}

          {/* Add resume form */}
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <p className="text-sm font-medium text-gray-700">Add Resume</p>
            <div className="flex gap-2">
              <input
                className={`${inputCls} flex-1 min-w-0`}
                placeholder="Resume name"
                value={newResumeName}
                onChange={(e) => setNewResumeName(e.target.value)}
              />
              <select
                className="w-32 shrink-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newResumeCat}
                onChange={(e) => setNewResumeCat(Number(e.target.value))}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <textarea
              className={`${inputCls} resize-none font-mono`}
              rows={10}
              placeholder="Paste resume text here…"
              value={newResumeText}
              onChange={(e) => setNewResumeText(e.target.value)}
            />
            <button
              onClick={handleAddResume}
              disabled={!newResumeName.trim() || !newResumeCat || !newResumeText.trim()}
              className={`${btnPrimary} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <Plus size={14} className="inline mr-1" />Add Resume
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
