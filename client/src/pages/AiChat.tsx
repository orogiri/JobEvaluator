import { useEffect, useRef, useState } from 'react';
import type { ModelOption, Provider } from '../types';
import { getModels } from '../api/client';
import { Loader2, MessageSquarePlus, Send, Trash2 } from 'lucide-react';

interface Message  { role: 'user' | 'assistant'; content: string; }
interface Session  { id: number; title: string; provider: string; model: string; updated_at: string; }

const SUGGESTED = [
  'For FP&A jobs, what factors tend to drive lower scores in duties, requirements, and preferences?',
  'Which job am I the best fit for, and what makes it a strong match?',
  'What skills or qualifications am I consistently missing across job descriptions?',
  'How do my scores compare across different seniority levels?',
  'Which jobs should I prioritize applying to, and why?',
  'What patterns do you see in the roles that score highest for me?',
];

function fmtCost(n: number | null | undefined) {
  if (n == null) return '…';
  if (n < 0.0001) return '< $0.0001';
  return `$${n.toFixed(4)}`;
}

function relativeDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.details || data.error || `HTTP ${res.status}`);
  return data as T;
}

export function AiChatPage() {
  const [sessions, setSessions]               = useState<Session[]>([]);
  const [currentId, setCurrentId]             = useState<number | null>(null);
  const [messages, setMessages]               = useState<Message[]>([]);
  const [input, setInput]                     = useState('');
  const [provider, setProvider]               = useState<Provider>('openai');
  const [model, setModel]                     = useState('gpt-5.6-luna');
  const [allModels, setAllModels]             = useState<Record<Provider, ModelOption[]>>({ anthropic: [], openai: [], deepseek: [], qwen: [] });
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState('');
  const [estimate, setEstimate]               = useState<number | null>(null);
  const [estimating, setEstimating]           = useState(false);

  const bottomRef        = useRef<HTMLDivElement>(null);
  const textareaRef      = useRef<HTMLTextAreaElement>(null);
  const estimateDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load session list + models on mount
  useEffect(() => {
    Promise.all([
      apiFetch<Session[]>('/api/chat/sessions'),
      getModels(),
    ]).then(([s, m]) => {
      setSessions(s);
      setAllModels(m);
      // Auto-load most recent session
      if (s.length > 0) loadSession(s[0]);
    });
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  // Debounced cost estimate
  useEffect(() => {
    if (!model) return;
    if (estimateDebounce.current) clearTimeout(estimateDebounce.current);
    estimateDebounce.current = setTimeout(async () => {
      setEstimating(true);
      try {
        const historyLength = messages.reduce((s, m) => s + m.content.length, 0);
        const data = await apiFetch<{ estimatedCost: number }>('/api/chat/estimate', {
          method: 'POST',
          body: JSON.stringify({ provider, model, historyLength, messageLength: input.length }),
        });
        setEstimate(data.estimatedCost);
      } catch { /* ignore */ }
      finally { setEstimating(false); }
    }, 400);
  }, [input, provider, model, messages.length]);

  function handleProviderChange(p: Provider) {
    setProvider(p);
    setModel(allModels[p]?.find(m => m.recommended)?.id ?? allModels[p]?.[0]?.id ?? '');
  }

  function loadSession(s: Session) {
    setCurrentId(s.id);
    setProvider((s.provider as Provider) || 'openai');
    setModel(s.model || 'gpt-5.6-luna');
    setError('');
    // Fetch full messages for this session
    apiFetch<Session & { messages: Message[] }>(`/api/chat/sessions/${s.id}`)
      .then(full => setMessages(full.messages));
  }

  function newChat() {
    setCurrentId(null);
    setMessages([]);
    setError('');
    setInput('');
  }

  async function deleteSession(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    await apiFetch(`/api/chat/sessions/${id}`, { method: 'DELETE' });
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentId === id) newChat();
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const outgoing: Message[] = [...messages, { role: 'user', content }];
    setMessages(outgoing);
    setInput('');
    setError('');
    setLoading(true);

    // Create or reuse session
    let sessionId = currentId;
    const title = content.slice(0, 65);

    try {
      if (!sessionId) {
        const created = await apiFetch<{ id: number }>('/api/chat/sessions', {
          method: 'POST',
          body: JSON.stringify({ title, messages: outgoing, provider, model }),
        });
        sessionId = created.id;
        setCurrentId(sessionId);
        setSessions(prev => [{ id: sessionId!, title, provider, model, updated_at: new Date().toISOString() }, ...prev]);
      }

      const data = await apiFetch<{ response: string }>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: outgoing, provider, model }),
      });

      const finalMessages: Message[] = [...outgoing, { role: 'assistant', content: data.response }];
      setMessages(finalMessages);

      // Save updated messages
      await apiFetch(`/api/chat/sessions/${sessionId}`, {
        method: 'PUT',
        body: JSON.stringify({ title, messages: finalMessages, provider, model }),
      });
      setSessions(prev =>
        prev.map(s => s.id === sessionId ? { ...s, title, updated_at: new Date().toISOString() } : s)
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      );
    } catch (err) {
      setError((err as Error).message);
      setMessages(messages);
      // Remove the newly created session if we failed on first message
      if (!currentId && sessionId) {
        await apiFetch(`/api/chat/sessions/${sessionId}`, { method: 'DELETE' }).catch(() => {});
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        setCurrentId(null);
      }
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }

  return (
    <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>

      {/* ── Left sidebar: session history ── */}
      <div className="w-56 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-3 border-b border-gray-100 shrink-0">
          <button
            onClick={newChat}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <MessageSquarePlus size={15} />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {sessions.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6 px-2">No past conversations yet.</p>
          ) : (
            sessions.map(s => (
              <button
                key={s.id}
                onClick={() => loadSession(s)}
                className={`w-full text-left px-3 py-2.5 rounded-lg group relative transition-colors ${
                  currentId === s.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <p className={`text-xs font-medium truncate pr-5 ${currentId === s.id ? 'text-blue-700' : 'text-gray-800'}`}>
                  {s.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{relativeDate(s.updated_at)}</p>
                <button
                  onClick={(e) => deleteSession(s.id, e)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Chat area ── */}
      <div className="flex-1 min-w-0 flex flex-col">

        {/* Header */}
        <div className="shrink-0 px-6 py-3 border-b border-gray-200 bg-white">
          <h1 className="text-xl font-bold text-gray-900">AI Chat</h1>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto space-y-6 pt-8">
              <p className="text-gray-500 text-sm text-center leading-relaxed">
                Ask anything about your job evaluations. I have full context on all archived jobs —
                scores, rationale, gaps, field comparisons, and metadata.
              </p>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 text-center mb-3">
                  Suggested questions
                </p>
                {SUGGESTED.map(q => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    disabled={loading}
                    className="w-full text-left text-sm text-gray-700 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-blue-300 hover:bg-blue-50 transition-colors disabled:opacity-40"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-4 w-full">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                    <Loader2 size={15} className="animate-spin text-gray-400" />
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="max-w-3xl mx-auto bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {(['anthropic', 'openai', 'deepseek', 'qwen'] as Provider[]).map(p => (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    provider === p ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {p === 'anthropic' ? 'Anthropic' : p === 'qwen' ? 'Qwen' : p === 'deepseek' ? 'DeepSeek' : 'OpenAI'}
                </button>
              ))}
            </div>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {(allModels[provider] ?? []).map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <span className="ml-auto text-xs text-gray-400">
              {estimating
                ? <span className="flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Estimating…</span>
                : <>Est. cost: <span className="font-medium text-gray-600">{fmtCost(estimate)}</span></>
              }
            </span>
          </div>

          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Ask about your job evaluations… (Enter to send, Shift+Enter for new line)"
              rows={2}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="shrink-0 w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
