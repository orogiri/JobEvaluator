import { useEffect, useRef, useState } from 'react';
import type { AppSettings, CompanyResearch, ContactSearch, CostEstimate, CoverLetter, CoverLetterTemplate, Evaluation, ModelOption, Provider, Resume } from '../types';
import {
  createCoverLetterTemplate,
  deleteCompanyResearch,
  deleteContactSearch,
  deleteCoverLetter,
  deleteCoverLetterTemplate,
  estimateCoverLetterCost,
  generateCoverLetter,
  getCompanyResearch,
  getContactSearches,
  getCoverLetterTemplates,
  getCoverLetters,
  getJobs,
  getModels,
  getResumes,
  getSettings,
  runCompanyResearch,
  runContactSearch,
  updateCoverLetterTemplate,
  updateSettings,
} from '../api/client';
import { Copy, Download, ExternalLink, FileDown, Loader2, Newspaper, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { Document, Packer, Paragraph, TextRun } from 'docx';

type UniqueJob = { job_id: number; company: string; title: string; created_at: string };

function getUniqueJobs(evals: Evaluation[]): UniqueJob[] {
  const map = new Map<number, UniqueJob>();
  for (const e of evals) {
    if (!map.has(e.job_id)) {
      map.set(e.job_id, { job_id: e.job_id, company: e.company, title: e.title, created_at: e.created_at });
    }
  }
  return [...map.values()].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

const TEMPLATE_PLACEHOLDER = `Example template — instructions + sections for the LLM to fill in:

Write a 3-paragraph cover letter, professional and concise tone, no more than 350 words.

Paragraph 1 (Hook): Open by naming the role and company, and one sentence on why I'm a strong fit.

Paragraph 2 (Evidence): Match my top 2-3 achievements from the resume to the JD's main requirements, with specifics.

Paragraph 3 (Close): Reiterate interest, mention availability, and a call to action to discuss further.

Sign-off: "Sincerely, [Candidate Name]"`;

const INSTRUCTIONS_PLACEHOLDER = `Optional — objective, tone, and other guidance that applies whenever this template is used, e.g.:

Objective: Make the case that I'm ready to step up to a director-level scope, not just a lateral move.
Tone: Confident and warm, not stiff or overly formal. Avoid generic buzzwords like "synergy" or "passionate".
Other: Keep sentences short. Avoid starting more than one paragraph with "I".`;

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const btnGhost = 'px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors';

export function CoverLettersPage() {
  const [jobs, setJobs] = useState<Evaluation[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [templates, setTemplates] = useState<CoverLetterTemplate[]>([]);
  const [history, setHistory] = useState<CoverLetter[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [allModels, setAllModels] = useState<Record<Provider, ModelOption[]>>({ anthropic: [], openai: [], deepseek: [], qwen: [] });

  const [jobId, setJobId] = useState<number | ''>('');
  const [jobSearch, setJobSearch] = useState('');
  const [resumeId, setResumeId] = useState<number | ''>('');
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [provider, setProvider] = useState<Provider>('openai');
  const [model, setModel] = useState('gpt-5.6-luna');
  const [thinking, setThinking] = useState(false);

  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CoverLetter | null>(null);
  const [copied, setCopied] = useState(false);

  const [showTemplates, setShowTemplates] = useState(false);
  const [newTplName, setNewTplName] = useState('');
  const [newTplBody, setNewTplBody] = useState('');
  const [newTplInstructions, setNewTplInstructions] = useState('');
  const [editingTpl, setEditingTpl] = useState<CoverLetterTemplate | null>(null);
  const [editTplName, setEditTplName] = useState('');
  const [editTplBody, setEditTplBody] = useState('');
  const [editTplInstructions, setEditTplInstructions] = useState('');

  const [researchProvider, setResearchProvider] = useState<Provider>('anthropic');
  const [researchModel, setResearchModel] = useState('');

  const [contactSearching, setContactSearching] = useState(false);
  const [contactError, setContactError] = useState('');
  const [contactResult, setContactResult] = useState<ContactSearch | null>(null);
  const [contactHistory, setContactHistory] = useState<ContactSearch[]>([]);

  const [companyResearching, setCompanyResearching] = useState(false);
  const [companyError, setCompanyError] = useState('');
  const [companyResult, setCompanyResult] = useState<CompanyResearch | null>(null);
  const [companyHistory, setCompanyHistory] = useState<CompanyResearch[]>([]);
  const [copiedFindingKey, setCopiedFindingKey] = useState<string | null>(null);

  const [showCompanyInstructions, setShowCompanyInstructions] = useState(false);
  const [companyInstructionsDraft, setCompanyInstructionsDraft] = useState('');
  const [companyInstructionsSaved, setCompanyInstructionsSaved] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const uniqueJobs = getUniqueJobs(jobs);
  const filteredJobs = jobSearch.trim()
    ? uniqueJobs.filter(j => `${j.company} ${j.title}`.toLowerCase().includes(jobSearch.trim().toLowerCase()))
    : uniqueJobs;
  const modelSupportsThinking = !!allModels[provider]?.find(m => m.id === model)?.thinking;

  // Most recent evaluation for the selected job+resume — supplies reports_to/job_level
  // context for the contact-search feature below.
  const selectedEvalForContact = jobs
    .filter(e => e.job_id === jobId && e.resume_id === resumeId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  const contactHistoryForJob = contactHistory.filter(cs => cs.job_id === jobId && cs.resume_id === resumeId);
  const companyHistoryForJob = companyHistory.filter(cr => cr.job_id === jobId && cr.resume_id === resumeId);

  // Thinking only makes sense for models that expose the toggle — drop it silently
  // when the user switches to one that doesn't, so a stale "on" doesn't linger unseen.
  useEffect(() => {
    if (!modelSupportsThinking && thinking) setThinking(false);
  }, [modelSupportsThinking, thinking]);

  // The default resume (first alphabetically) usually isn't the one a given job was
  // actually evaluated with — without this, contact search silently disables itself
  // because selectedEvalForContact requires an exact job+resume evaluation match.
  // Snap resumeId to whichever resume the selected job does have an evaluation for.
  useEffect(() => {
    if (!jobId) return;
    const evalsForJob = jobs.filter(e => e.job_id === jobId);
    if (evalsForJob.length === 0) return;
    if (evalsForJob.some(e => e.resume_id === resumeId)) return;
    const mostRecent = evalsForJob.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    setResumeId(mostRecent.resume_id);
  }, [jobId, jobs]);

  // The <select> silently re-renders its visible selection when the option list
  // narrows (e.g. typing a job search down to one match) without firing onChange —
  // the browser shows the remaining option as selected but jobId state doesn't move,
  // so "Generate" would silently act on the stale, no-longer-visible job. Keep jobId
  // in sync with the filtered list.
  useEffect(() => {
    if (filteredJobs.length === 0) return;
    if (filteredJobs.some(j => j.job_id === jobId)) return;
    setJobId(filteredJobs[0].job_id);
  }, [filteredJobs, jobId]);

  useEffect(() => {
    Promise.all([
      getJobs(), getResumes(), getCoverLetterTemplates(), getCoverLetters(),
      getSettings(), getModels(), getContactSearches(), getCompanyResearch(),
    ]).then(
      ([j, r, t, h, s, m, cs, cr]) => {
        setJobs(j);
        setResumes(r);
        setTemplates(t);
        setHistory(h);
        setSettings(s);
        setAllModels(m);
        setContactHistory(cs);
        setCompanyHistory(cr);
        if (r.length > 0) setResumeId(r[0].id);
        if (t.length > 0) setTemplateId(t[0].id);
        const uj = getUniqueJobs(j);
        if (uj.length > 0) setJobId(uj[0].job_id);
        const lastProvider = (s.last_provider as Provider) || 'openai';
        const lastModel = s.last_model || 'gpt-5.6-luna';
        setProvider(lastProvider);
        setModel(lastModel);
        setResearchModel(m.anthropic?.find(x => x.recommended)?.id ?? m.anthropic?.[0]?.id ?? '');
        setCompanyInstructionsDraft(s.company_research_instructions || '');
      }
    );
  }, []);

  function handleResearchProviderChange(p: Provider) {
    setResearchProvider(p);
    setResearchModel(allModels[p]?.find(m => m.recommended)?.id ?? allModels[p]?.[0]?.id ?? '');
  }

  function handleProviderChange(p: Provider) {
    setProvider(p);
    setModel(allModels[p]?.find(m => m.recommended)?.id ?? allModels[p]?.[0]?.id ?? '');
  }

  // Auto-estimate cost when inputs change
  useEffect(() => {
    if (!jobId || !resumeId || !templateId || !model) {
      setEstimate(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setEstimating(true);
      try {
        const est = await estimateCoverLetterCost({
          job_id: Number(jobId), resume_id: Number(resumeId), template_id: Number(templateId), provider, model,
          thinking: modelSupportsThinking && thinking,
        });
        setEstimate(est);
      } catch {
        setEstimate(null);
      } finally {
        setEstimating(false);
      }
    }, 500);
  }, [jobId, resumeId, templateId, provider, model, thinking, modelSupportsThinking]);

  async function handleGenerate() {
    if (!jobId || !resumeId || !templateId || !model || generating) return;
    setGenerating(true);
    setError('');
    setResult(null);
    try {
      const cl = await generateCoverLetter({
        job_id: Number(jobId), resume_id: Number(resumeId), template_id: Number(templateId), provider, model,
        thinking: modelSupportsThinking && thinking,
      });
      setResult(cl);
      setHistory(prev => [cl, ...prev]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadFilenameBase() {
    return `cover-letter-${(result?.job_company || 'letter').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  }

  // Strips characters Windows/macOS disallow in filenames, but keeps the name readable
  // (spaces, punctuation like "&" survive) rather than slugifying it.
  function sanitizeFilename(name: string) {
    return name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownload() {
    if (!result) return;
    triggerDownload(new Blob([result.content], { type: 'text/plain' }), `${downloadFilenameBase()}.txt`);
  }

  async function handleDownloadDocx() {
    if (!result) return;
    const doc = new Document({
      styles: {
        default: {
          document: { run: { font: 'Calibri', size: 22 } }, // size is in half-points: 22 = 11pt
        },
      },
      sections: [{
        children: result.content.split('\n').map(
          line => new Paragraph({ children: [new TextRun(line)] })
        ),
      }],
    });
    const blob = await Packer.toBlob(doc);
    const company = result.job_company || 'Unknown Company';
    const title = result.job_title || 'Untitled Position';
    const filename = `${sanitizeFilename(`${company} - ${title} - Jack Huddleston`)}.docx`;
    triggerDownload(blob, filename);
  }

  async function handleDeleteHistoryItem(id: number, ev: React.MouseEvent) {
    ev.stopPropagation();
    await deleteCoverLetter(id);
    setHistory(prev => prev.filter(h => h.id !== id));
    if (result?.id === id) setResult(null);
  }

  async function handleContactSearch() {
    if (!jobId || !resumeId || !researchModel || contactSearching) return;
    setContactSearching(true);
    setContactError('');
    try {
      const cs = await runContactSearch({ job_id: Number(jobId), resume_id: Number(resumeId), provider: researchProvider, model: researchModel });
      setContactResult(cs);
      setContactHistory(prev => [cs, ...prev]);
    } catch (err) {
      setContactError((err as Error).message);
    } finally {
      setContactSearching(false);
    }
  }

  async function handleDeleteContactSearch(id: number, ev: React.MouseEvent) {
    ev.stopPropagation();
    await deleteContactSearch(id);
    setContactHistory(prev => prev.filter(cs => cs.id !== id));
    if (contactResult?.id === id) setContactResult(null);
  }

  async function handleCompanyResearch() {
    if (!jobId || !resumeId || !researchModel || companyResearching) return;
    setCompanyResearching(true);
    setCompanyError('');
    try {
      const cr = await runCompanyResearch({ job_id: Number(jobId), resume_id: Number(resumeId), provider: researchProvider, model: researchModel });
      setCompanyResult(cr);
      setCompanyHistory(prev => [cr, ...prev]);
    } catch (err) {
      setCompanyError((err as Error).message);
    } finally {
      setCompanyResearching(false);
    }
  }

  async function handleDeleteCompanyResearch(id: number, ev: React.MouseEvent) {
    ev.stopPropagation();
    await deleteCompanyResearch(id);
    setCompanyHistory(prev => prev.filter(cr => cr.id !== id));
    if (companyResult?.id === id) setCompanyResult(null);
  }

  async function handleSaveCompanyInstructions() {
    await updateSettings({ company_research_instructions: companyInstructionsDraft });
    setSettings(prev => (prev ? { ...prev, company_research_instructions: companyInstructionsDraft } : prev));
    setCompanyInstructionsSaved(true);
    setTimeout(() => setCompanyInstructionsSaved(false), 2000);
  }

  async function handleCopyFinding(key: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedFindingKey(key);
    setTimeout(() => setCopiedFindingKey(null), 1500);
  }

  async function handleAddTemplate() {
    if (!newTplName.trim() || !newTplBody.trim()) return;
    const t = await createCoverLetterTemplate({
      name: newTplName.trim(), body: newTplBody.trim(), instructions: newTplInstructions.trim(),
    });
    setTemplates(prev => [...prev, t].sort((a, b) => a.name.localeCompare(b.name)));
    setTemplateId(t.id);
    setNewTplName('');
    setNewTplBody('');
    setNewTplInstructions('');
  }

  function startEditTemplate(t: CoverLetterTemplate) {
    setEditingTpl(t);
    setEditTplName(t.name);
    setEditTplBody(t.body);
    setEditTplInstructions(t.instructions || '');
  }

  async function saveEditTemplate() {
    if (!editingTpl || !editTplName.trim() || !editTplBody.trim()) return;
    await updateCoverLetterTemplate(editingTpl.id, {
      name: editTplName.trim(), body: editTplBody.trim(), instructions: editTplInstructions.trim(),
    });
    setTemplates(prev =>
      prev.map(t => (t.id === editingTpl.id
        ? { ...t, name: editTplName.trim(), body: editTplBody.trim(), instructions: editTplInstructions.trim() }
        : t))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setEditingTpl(null);
  }

  async function handleDeleteTemplate(id: number) {
    if (!confirm('Delete this template?')) return;
    await deleteCoverLetterTemplate(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
    if (templateId === id) setTemplateId(templates.find(t => t.id !== id)?.id ?? '');
  }

  const canGenerate = !!jobId && !!resumeId && !!templateId && !!model && !generating;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Cover Letters</h1>

      {/* Controls row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Job</label>
          {uniqueJobs.length === 0 ? (
            <p className="text-sm text-gray-400">No evaluated jobs yet. Evaluate a job first.</p>
          ) : (
            <>
              {uniqueJobs.length > 8 && (
                <div className="relative mb-1.5">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search company or title…"
                    value={jobSearch}
                    onChange={e => setJobSearch(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {jobSearch && (
                    <button
                      onClick={() => setJobSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              )}
              {filteredJobs.length === 0 ? (
                <p className="text-sm text-gray-400">No jobs match "{jobSearch}".</p>
              ) : (
                <select className={inputCls} value={jobId} onChange={e => setJobId(Number(e.target.value))}>
                  {filteredJobs.map(j => (
                    <option key={j.job_id} value={j.job_id}>
                      {j.company || 'Unknown'} — {j.title || 'Untitled'} ({new Date(j.created_at).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Resume</label>
          {resumes.length === 0 ? (
            <p className="text-sm text-gray-400">No resumes yet — add one in Settings.</p>
          ) : (
            <select className={inputCls} value={resumeId} onChange={e => setResumeId(Number(e.target.value))}>
              {resumes.map(r => (
                <option key={r.id} value={r.id}>{r.name} ({r.category_name})</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {(['anthropic', 'openai', 'deepseek', 'qwen'] as Provider[]).map(p => (
              <button
                key={p}
                onClick={() => handleProviderChange(p)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${provider === p ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {p === 'anthropic' ? 'Anthropic' : p === 'qwen' ? 'Qwen' : p === 'deepseek' ? 'DeepSeek' : 'OpenAI'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
          <select className={inputCls} value={model} onChange={e => setModel(e.target.value)}>
            {(allModels[provider] ?? []).map(m => (
              <option key={m.id} value={m.id}>{m.label}{m.recommended ? ' ★' : ''}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Thinking mode toggle */}
      <label className={`flex items-start gap-3 w-fit group ${modelSupportsThinking ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
          checked={thinking}
          disabled={!modelSupportsThinking}
          onChange={e => setThinking(e.target.checked)}
        />
        <div>
          <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Thinking mode</span>
          <p className="text-xs text-gray-400 mt-0.5">
            {modelSupportsThinking
              ? 'Let the model reason before writing the letter. Can improve quality; increases cost and latency.'
              : `${allModels[provider]?.find(m => m.id === model)?.label ?? 'This model'} doesn't expose a thinking toggle.`}
          </p>
        </div>
      </label>

      {/* Research Tools — web search, shared between both sub-features below */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-gray-800">Research Tools</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Runs independently of the provider selected above. Only Anthropic has its own live web search; other
              providers can only reason over Google results (add a Serper key in Settings for that).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {(['anthropic', 'openai', 'deepseek', 'qwen'] as Provider[]).map(p => (
                <button
                  key={p}
                  onClick={() => handleResearchProviderChange(p)}
                  disabled={contactSearching || companyResearching}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${researchProvider === p ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {p === 'anthropic' ? 'Anthropic' : p === 'qwen' ? 'Qwen' : p === 'deepseek' ? 'DeepSeek' : 'OpenAI'}
                </button>
              ))}
            </div>
            <select
              className={`${inputCls} w-auto`}
              value={researchModel}
              onChange={e => setResearchModel(e.target.value)}
              disabled={contactSearching || companyResearching}
            >
              {(allModels[researchProvider] ?? []).map(m => (
                <option key={m.id} value={m.id}>{m.label}{m.recommended ? ' ★' : ''}</option>
              ))}
            </select>
          </div>
        </div>

        {researchProvider !== 'anthropic' && !settings?.serper_key && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-xs">
            This provider has no built-in web search — without a Serper key configured in Settings, it has nothing to
            ground its answer in and will refuse rather than guess. Add a Serper key for grounded results, or switch to Anthropic.
          </div>
        )}

        {/* Hiring manager / org contact search */}
        <div className="pt-4 border-t border-gray-100 space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              <Search size={14} /> Find Hiring Manager / Org Contacts
            </p>
            <p className="text-xs text-gray-400 mt-0.5 max-w-lg">
              {!selectedEvalForContact
                ? 'Select a job that has an evaluation for this resume to enable this.'
                : selectedEvalForContact.reports_to
                  ? <>This role reports to <strong>{selectedEvalForContact.reports_to}</strong> — search the web for the specific person in that role.</>
                  : selectedEvalForContact.job_level
                    ? <>Reports-to wasn't identified on the evaluation — search instead for people one level above <strong>{selectedEvalForContact.job_level}</strong> at this company.</>
                    : <>Neither reports-to nor job level was identified — search will fall back to general senior leadership.</>}
            </p>
          </div>

          <button
            onClick={handleContactSearch}
            disabled={!selectedEvalForContact || !researchModel || contactSearching}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {contactSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {contactSearching ? 'Searching the web…' : 'Search for Contact'}
          </button>

          {contactError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">{contactError}</div>
          )}

          {contactResult && (
            <div className="space-y-2 pt-3 border-t border-gray-100">
              {contactResult.summary && <p className="text-sm text-gray-600">{contactResult.summary}</p>}
              {contactResult.contacts.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No verifiable contacts found.</p>
              ) : (
                <ul className="space-y-2">
                  {contactResult.contacts.map((c, i) => (
                    <li key={i} className="border border-gray-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-gray-800">
                        {c.name} {c.title && <span className="text-gray-400 font-normal">— {c.title}</span>}
                      </p>
                      {c.url && (
                        <a href={c.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline break-all inline-flex items-center gap-1 mt-0.5">
                          {c.url} <ExternalLink size={11} />
                        </a>
                      )}
                      {c.note && <p className="text-xs text-gray-400 mt-1">{c.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {contactHistoryForJob.length > 0 && (
            <div className="pt-3 border-t border-gray-100 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Search History (this job)</p>
              {contactHistoryForJob.map(cs => (
                <div
                  key={cs.id}
                  onClick={() => setContactResult(cs)}
                  className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${contactResult?.id === cs.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                  <span className="text-gray-600">
                    {cs.mode === 'specific' ? cs.query_title : `${cs.query_title || 'org search'} (peers)`} · {cs.contacts.length} found · {new Date(cs.created_at).toLocaleString()}
                  </span>
                  <button onClick={ev => handleDeleteContactSearch(cs.id, ev)} className="text-gray-300 hover:text-red-500 transition-colors shrink-0">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Company research — cover letter hook */}
        <div className="pt-4 border-t border-gray-100 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                <Newspaper size={14} /> Research Company (Cover Letter Hook)
              </p>
              <p className="text-xs text-gray-400 mt-0.5 max-w-lg">
                {!selectedEvalForContact
                  ? 'Select a job that has an evaluation for this resume to enable this.'
                  : <>Research <strong>{selectedEvalForContact.company || 'this company'}</strong> and draft ready-to-paste cover-letter paragraphs, following the instructions below.</>}
              </p>
            </div>
            <button onClick={() => setShowCompanyInstructions(v => !v)} className="text-xs text-blue-600 underline shrink-0">
              {showCompanyInstructions ? 'Hide instructions' : 'Customize instructions'}
            </button>
          </div>

          {showCompanyInstructions && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
              <p className="text-xs text-gray-500">
                What this tool should look for and how it should write the hook. Applies to every company research run,
                regardless of job or resume.
              </p>
              <textarea
                className={`${inputCls} font-mono resize-none`}
                rows={8}
                value={companyInstructionsDraft}
                onChange={e => setCompanyInstructionsDraft(e.target.value)}
              />
              <button
                onClick={handleSaveCompanyInstructions}
                disabled={!companyInstructionsDraft.trim()}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {companyInstructionsSaved ? '✓ Saved' : 'Save Instructions'}
              </button>
            </div>
          )}

          <button
            onClick={handleCompanyResearch}
            disabled={!selectedEvalForContact || !researchModel || companyResearching}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {companyResearching ? <Loader2 size={14} className="animate-spin" /> : <Newspaper size={14} />}
            {companyResearching ? 'Researching…' : 'Research Company'}
          </button>

          {companyError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">{companyError}</div>
          )}

          {companyResult && (
            <div className="space-y-3 pt-3 border-t border-gray-100">
              {companyResult.summary && <p className="text-sm text-gray-600">{companyResult.summary}</p>}
              {companyResult.findings.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No solid recent findings.</p>
              ) : (
                <div className="space-y-3">
                  {companyResult.findings.map((f, i) => {
                    const key = `${companyResult.id}-${i}`;
                    return (
                      <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            {f.event}{f.date ? ` · ${f.date}` : ''}
                          </p>
                          <button
                            onClick={() => handleCopyFinding(key, f.paragraph)}
                            className="shrink-0 flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            <Copy size={11} /> {copiedFindingKey === key ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-sm text-gray-700">{f.paragraph}</p>
                        {f.url && (
                          <a href={f.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline break-all inline-flex items-center gap-1">
                            {f.source_title || f.url} <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {companyHistoryForJob.length > 0 && (
            <div className="pt-3 border-t border-gray-100 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Search History (this job)</p>
              {companyHistoryForJob.map(cr => (
                <div
                  key={cr.id}
                  onClick={() => setCompanyResult(cr)}
                  className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${companyResult?.id === cr.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                  <span className="text-gray-600">
                    {cr.findings.length} finding{cr.findings.length !== 1 ? 's' : ''} · {new Date(cr.created_at).toLocaleString()}
                  </span>
                  <button onClick={ev => handleDeleteCompanyResearch(cr.id, ev)} className="text-gray-300 hover:text-red-500 transition-colors shrink-0">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Template selector */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700">Template</label>
          <button onClick={() => setShowTemplates(v => !v)} className="text-xs text-blue-600 underline">
            {showTemplates ? 'Hide templates' : 'Manage templates'}
          </button>
        </div>
        {templates.length === 0 ? (
          <p className="text-sm text-gray-400">No templates yet — add one below.</p>
        ) : (
          <select className={inputCls} value={templateId} onChange={e => setTemplateId(Number(e.target.value))}>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {/* Template manager */}
      {showTemplates && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
          <p className="text-sm font-semibold text-gray-800">Templates</p>

          {templates.length > 0 && (
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {templates.map(t => (
                <div key={t.id} className="p-3">
                  {editingTpl?.id === t.id ? (
                    <div className="space-y-2">
                      <input className={inputCls} value={editTplName} onChange={e => setEditTplName(e.target.value)} placeholder="Template name" />
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Template</label>
                        <textarea
                          className={`${inputCls} font-mono resize-none`}
                          rows={8}
                          value={editTplBody}
                          onChange={e => setEditTplBody(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Additional Instructions (objective, tone, etc.)</label>
                        <textarea
                          className={`${inputCls} resize-none`}
                          rows={5}
                          placeholder={INSTRUCTIONS_PLACEHOLDER}
                          value={editTplInstructions}
                          onChange={e => setEditTplInstructions(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveEditTemplate} className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">Save</button>
                        <button onClick={() => setEditingTpl(null)} className={btnGhost}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{t.name}</p>
                        <p className="text-xs text-gray-400 whitespace-pre-wrap line-clamp-2 mt-0.5">{t.body}</p>
                        {t.instructions && (
                          <p className="text-xs text-blue-400 italic whitespace-pre-wrap line-clamp-1 mt-0.5">↳ {t.instructions}</p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => startEditTemplate(t)} className="text-gray-400 hover:text-blue-500 transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDeleteTemplate(t.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-700">Add Template</p>
            <input
              className={inputCls}
              placeholder="Template name (e.g. 'Standard 3-paragraph')"
              value={newTplName}
              onChange={e => setNewTplName(e.target.value)}
            />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Template</label>
              <textarea
                className={`${inputCls} font-mono resize-none`}
                rows={10}
                placeholder={TEMPLATE_PLACEHOLDER}
                value={newTplBody}
                onChange={e => setNewTplBody(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Additional Instructions (objective, tone, etc.)</label>
              <textarea
                className={`${inputCls} resize-none`}
                rows={5}
                placeholder={INSTRUCTIONS_PLACEHOLDER}
                value={newTplInstructions}
                onChange={e => setNewTplInstructions(e.target.value)}
              />
            </div>
            <button
              onClick={handleAddTemplate}
              disabled={!newTplName.trim() || !newTplBody.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={13} /> Add Template
            </button>
          </div>
        </div>
      )}

      {/* Generate */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
        >
          {generating && <Loader2 size={16} className="animate-spin" />}
          {generating ? 'Generating…' : 'Generate Cover Letter'}
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
              {estimate.estimatedCost < 0.01 ? '< $0.01' : `$${estimate.estimatedCost.toFixed(4)}`}
            </span>
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {/* Result */}
      {result && (
        <div className="border-t pt-6 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-gray-900">
              {result.job_company || 'Unknown'} — {result.job_title || 'Untitled'}
            </h2>
            <div className="flex gap-2">
              <button onClick={handleCopy} className={`${btnGhost} flex items-center gap-1.5`}>
                <Copy size={13} /> {copied ? 'Copied!' : 'Copy'}
              </button>
              <button onClick={handleDownload} className={`${btnGhost} flex items-center gap-1.5`}>
                <Download size={13} /> Download .txt
              </button>
              <button onClick={handleDownloadDocx} className={`${btnGhost} flex items-center gap-1.5`}>
                <FileDown size={13} /> Download .docx
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            {result.resume_name} · {result.template_name || 'No template'} · {result.provider} / {result.llm_model}
          </p>
          <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 rounded-lg p-4 border border-gray-200">
            {result.content}
          </pre>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="border-t pt-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Previously Generated</h2>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg bg-white">
            {history.map(h => (
              <div
                key={h.id}
                onClick={() => setResult(h)}
                className={`px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-blue-50 transition-colors ${result?.id === h.id ? 'bg-blue-50' : ''}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {h.job_company || 'Unknown'} — {h.job_title || 'Untitled'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {h.resume_name} · {h.template_name || 'No template'} · {new Date(h.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={ev => handleDeleteHistoryItem(h.id, ev)} className="text-gray-300 hover:text-red-500 transition-colors shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
