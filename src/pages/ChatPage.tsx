import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Send, Plus, Wrench, Loader2, AlertTriangle, ListTree, Clock, Hash, DollarSign, ExternalLink } from 'lucide-react';
import { fetchFirstAssistant, createThread, runAndWait } from '../utils/langgraph';
import { invalidateCache } from '../hooks/useLangSmithData';
import { createFeedback } from '../utils/langsmith';
import { judgeResponse } from '../utils/evaluator';
import { useLangSmith } from '../contexts/LangSmithContext';
import { formatDuration, formatCost, formatNumber } from '../utils/format';

// ── Types ──────────────────────────────────────────────────────────────────

interface EvalScoreSet {
  helpfulness: number;
  correctness: number;
  relevance: number;
}

interface ChatMsg {
  id: string;
  role: 'human' | 'ai';
  content: string;
  toolCalls: string[];
  streaming: boolean;
  runId?: string;
  durationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
  evalScores?: EvalScoreSet;
  evalPending?: boolean;
}

// gpt-4o-mini pricing: $0.15/1M input, $0.60/1M output
function estimateCost(promptTokens: number, completionTokens: number): number {
  return (promptTokens * 0.00000015) + (completionTokens * 0.0000006);
}

// ── Markdown renderer (bold + bullets + line breaks) ──────────────────────

function MdLine({ text }: { text: string }) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1
          ? <strong key={i} className="font-semibold text-slate-100">{p}</strong>
          : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <span>
      {lines.map((line, i) => {
        const isBullet = /^[-*] /.test(line);
        const content = isBullet ? line.slice(2) : line;
        return (
          <Fragment key={i}>
            {isBullet ? (
              <span className="flex items-baseline gap-1.5">
                <span className="mt-0.5 shrink-0 text-slate-500">•</span>
                <span><MdLine text={content} /></span>
              </span>
            ) : (
              <MdLine text={content} />
            )}
            {i < lines.length - 1 && '\n'}
          </Fragment>
        );
      })}
    </span>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ToolBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/8 px-2 py-0.5 text-[11px] font-medium text-amber-400">
      <Wrench className="h-3 w-3" />
      {name}(…)
    </span>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

function ScorePill({ label, score }: { label: string; score: number }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.8 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    : score >= 0.5 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    : 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${color}`}>
      {label} {pct}%
    </span>
  );
}

function MsgAnalytics({ msg, onViewTrace }: { msg: ChatMsg; onViewTrace: (id: string) => void }) {
  if (msg.streaming || !msg.runId) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
        {msg.durationMs != null && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(msg.durationMs)}
          </span>
        )}
        {msg.totalTokens != null && msg.totalTokens > 0 && (
          <span className="flex items-center gap-1">
            <Hash className="h-3 w-3" />
            {formatNumber(msg.promptTokens ?? 0)} in · {formatNumber(msg.completionTokens ?? 0)} out
          </span>
        )}
        {msg.cost != null && msg.cost > 0 && (
          <span className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            {formatCost(msg.cost)}
          </span>
        )}
        {msg.runId && (
          <button
            onClick={() => onViewTrace(msg.runId!)}
            className="flex items-center gap-1 text-emerald-600 transition-colors hover:text-emerald-400"
          >
            <ExternalLink className="h-3 w-3" />
            View trace
          </button>
        )}
      </div>
      {msg.evalPending && (
        <div className="flex items-center gap-1.5 text-[10px] text-violet-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Scoring with GPT-4o-mini…
        </div>
      )}
      {msg.evalScores && (
        <div className="flex flex-wrap items-center gap-1.5">
          <ScorePill label="Helpful" score={msg.evalScores.helpfulness} />
          <ScorePill label="Correct" score={msg.evalScores.correctness} />
          <ScorePill label="Relevant" score={msg.evalScores.relevance} />
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg, onViewTrace }: { msg: ChatMsg; onViewTrace: (id: string) => void }) {
  const isHuman = msg.role === 'human';

  if (isHuman) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[72%] rounded-2xl rounded-tr-sm bg-emerald-600/20 px-4 py-2.5 text-sm text-slate-100 ring-1 ring-emerald-500/25">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] space-y-2">
        {msg.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {msg.toolCalls.map((t) => <ToolBadge key={t} name={t} />)}
          </div>
        )}
        <div className="rounded-2xl rounded-tl-sm bg-slate-800/70 px-4 py-2.5 text-sm leading-relaxed text-slate-200 ring-1 ring-slate-700/50">
          {msg.content ? (
            <span className="whitespace-pre-wrap">
              <MarkdownText text={msg.content} />
              {msg.streaming && (
                <span className="ml-0.5 inline-block h-[1em] w-0.5 translate-y-[2px] animate-[blink_0.8s_ease-in-out_infinite] bg-emerald-400" />
              )}
            </span>
          ) : msg.streaming ? (
            <TypingDots />
          ) : null}
        </div>
        <MsgAnalytics msg={msg} onViewTrace={onViewTrace} />
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export function ChatPage() {
  const navigate = useNavigate();
  const { config: lsConfig, openAiKey } = useLangSmith();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [graphId, setGraphId] = useState<string>('agent');
  const [serverError, setServerError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const revealRef = useRef<{ id: string; full: string; shown: number } | null>(null);

  // Character-reveal animation loop
  useEffect(() => {
    let rafId: number;
    function reveal() {
      const r = revealRef.current;
      if (r && r.shown < r.full.length) {
        const next = Math.min(r.shown + 6, r.full.length);
        revealRef.current = { ...r, shown: next };
        const visible = r.full.slice(0, next);
        setMessages((prev) =>
          prev.map((m) => m.id === r.id ? { ...m, content: visible } : m),
        );
      }
      rafId = requestAnimationFrame(reveal);
    }
    rafId = requestAnimationFrame(reveal);
    return () => cancelAnimationFrame(rafId);
  }, []);

  function viewTrace(runId: string) {
    navigate(`/traces?q=${runId}`);
  }

  // ── Init: find assistant + create thread ────────────────────────────────

  const init = useCallback(async () => {
    setInitializing(true);
    setServerError(null);
    const assistant = await fetchFirstAssistant();
    if (!assistant) {
      setServerError(
        'Cannot reach LangGraph server at localhost:2024.\nMake sure it\'s running:\n  cd langgraph-agent && npx @langchain/langgraph-cli dev',
      );
      setInitializing(false);
      return;
    }
    const thread = await createThread();
    if (!thread) {
      setServerError('LangGraph server is up but failed to create a thread.');
      setInitializing(false);
      return;
    }
    setAssistantId(assistant.assistant_id);
    setThreadId(thread.thread_id);
    setGraphId(assistant.graph_id ?? 'agent');
    setInitializing(false);
  }, []);

  useEffect(() => { init(); }, [init]);

  // ── New thread ───────────────────────────────────────────────────────────

  async function newThread() {
    if (streaming) return;
    const thread = await createThread();
    if (!thread) return;
    setThreadId(thread.thread_id);
    setMessages([]);
  }

  // ── Core send logic ─────────────────────────────────────────────────────

  async function sendMessage(text: string, aId: string, tId: string): Promise<void> {
    const humanId = crypto.randomUUID();
    const aiId = crypto.randomUUID();
    const startMs = Date.now();
    revealRef.current = null;

    setMessages((prev) => [
      ...prev,
      { id: humanId, role: 'human', content: text, toolCalls: [], streaming: false },
      { id: aiId, role: 'ai', content: '', toolCalls: [], streaming: true },
    ]);
    setInput('');
    setStreaming(true);

    try {
      const result = await runAndWait(tId, aId, text);
      const durationMs = Date.now() - startMs;
      const cost = estimateCost(result.promptTokens, result.completionTokens);

      if (result.toolCalls.length > 0) {
        setMessages((prev) =>
          prev.map((m) => m.id === aiId ? { ...m, toolCalls: result.toolCalls } : m),
        );
      }

      revealRef.current = { id: aiId, full: result.content, shown: 0 };

      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiId
            ? { ...m, runId: result.runId, durationMs, promptTokens: result.promptTokens,
                completionTokens: result.completionTokens, totalTokens: result.totalTokens, cost }
            : m,
        ),
      );

      // Wait for character-reveal animation to finish
      await new Promise<void>((resolve) => {
        const check = () => {
          const r = revealRef.current;
          if (!r || r.shown >= r.full.length) { resolve(); return; }
          requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      });

      setMessages((prev) =>
        prev.map((m) => m.id === aiId ? { ...m, streaming: false } : m),
      );
      setStreaming(false);

      // LLM-as-judge scoring
      if (lsConfig?.apiKey && result.runId && openAiKey) {
        setMessages((prev) =>
          prev.map((m) => m.id === aiId ? { ...m, evalPending: true } : m),
        );
        try {
          const scores = await judgeResponse(openAiKey, text, result.content);
          if (scores) {
            setMessages((prev) =>
              prev.map((m) => m.id === aiId ? { ...m, evalScores: scores, evalPending: false } : m),
            );
            const judgeComment = 'LLM-as-judge (GPT-4o-mini)';
            await Promise.all([
              createFeedback(lsConfig.apiKey, result.runId!, 'helpfulness', scores.helpfulness, judgeComment),
              createFeedback(lsConfig.apiKey, result.runId!, 'correctness', scores.correctness, judgeComment),
              createFeedback(lsConfig.apiKey, result.runId!, 'relevance',   scores.relevance,   judgeComment),
            ]);
            invalidateCache();
            toast('Eval scores logged', {
              description: `Helpful ${Math.round(scores.helpfulness * 100)}% · Correct ${Math.round(scores.correctness * 100)}% · Relevant ${Math.round(scores.relevance * 100)}%`,
              duration: 4000,
            });
          } else {
            setMessages((prev) =>
              prev.map((m) => m.id === aiId ? { ...m, evalPending: false } : m),
            );
          }
        } catch {
          setMessages((prev) =>
            prev.map((m) => m.id === aiId ? { ...m, evalPending: false } : m),
          );
        }
      } else {
        invalidateCache();
        toast('Trace logged', {
          description: 'Add OpenAI key in Settings to enable LLM-as-judge scoring.',
          duration: 3000,
        });
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiId ? { ...m, content: `Error: ${String(err)}`, streaming: false } : m,
        ),
      );
    } finally {
      setStreaming(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || !assistantId || !threadId || streaming) return;
    await sendMessage(text, assistantId, threadId);
  }

  // ── Auto-scroll ──────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100dvh-130px)] flex-col sm:h-[calc(100dvh-112px)] lg:h-[calc(100vh-112px)]">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-100">Chat</h1>
          <p className="text-sm text-slate-500">
            {initializing
              ? 'Connecting to LangGraph server…'
              : serverError
                ? 'Server offline - start your LangGraph agent to enable chat'
                : `Graph: ${graphId} · Thread: ${threadId?.slice(0, 8)}… · Each reply is traced & scored`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/traces"
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-200"
          >
            <ListTree className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">View Traces</span>
          </Link>
          <button
            onClick={newThread}
            disabled={streaming || initializing}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New Thread</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {serverError && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-rose-500/20 bg-rose-500/5">
          <AlertTriangle className="h-8 w-8 text-rose-400" />
          <div className="text-center">
            <p className="text-sm font-medium text-rose-300">LangGraph server not running</p>
            <pre className="mt-2 text-[11px] leading-relaxed text-slate-500">{serverError}</pre>
          </div>
          <button
            onClick={init}
            className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Chat area */}
      {!serverError && (
        <>
          <div className="flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            {initializing ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting…
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm font-medium text-slate-500">Ask your agent anything</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    "What's the weather in Tokyo right now?",
                    "What time is it in London vs Sydney?",
                    "What is 15% tip on a $84.50 dinner?",
                    "How does RAG work in LangChain?",
                    "Search: who founded OpenAI?",
                    "Compare weather in NYC and Paris, and calculate the temp difference",
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} onViewTrace={viewTrace} />
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="mt-2 flex items-center gap-2 px-1">
            {openAiKey ? (
              <span className="flex items-center gap-1 text-[10px] font-medium text-violet-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400" />
                LLM judge active
              </span>
            ) : (
              <Link to="/settings" className="text-[10px] text-slate-600 hover:text-slate-400">
                Add OpenAI key in Settings to enable LLM-as-judge eval scoring
              </Link>
            )}
          </div>
          <div className="mt-1 flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={streaming || initializing}
              rows={1}
              placeholder="Ask your agent… (Enter to send, Shift+Enter for newline)"
              className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none transition-colors focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/25 disabled:opacity-40"
              style={{ maxHeight: '120px' }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || streaming || initializing}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {streaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
