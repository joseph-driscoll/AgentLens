import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const TOUR_DONE_KEY   = 'agentlens_tour_v2';
const TOUR_QUEUE_KEY  = 'agentlens_tour_queue';   // JSON array of messages to auto-send
const TOUR_STAGE_KEY  = 'agentlens_tour_stage';   // which step is active

export const TOUR_MESSAGES = [
  "What's the weather like in Tokyo and London right now?",
  "How does RAG work in LangChain? Give me a quick summary.",
  "Calculate: if Tokyo is 22°C and London is 14°C, what's the difference in Fahrenheit?",
] as const;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Wait for a custom window event, with a max timeout. */
function waitForEvent(event: string, timeoutMs = 90_000): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = () => { window.removeEventListener(event, done); resolve(); };
    window.addEventListener(event, done);
    setTimeout(done, timeoutMs);
  });
}

export function useTutorial() {
  const navigate = useNavigate();

  const startTutorial = useCallback(async () => {
    toast.dismiss();
    localStorage.setItem(TOUR_STAGE_KEY, 'chat');

    // ── Step 1: Welcome ──────────────────────────────────────────────────────
    navigate('/');
    await sleep(300);
    toast('Welcome to AgentLens', {
      description: "Let's run a live demo. We'll send 3 real messages to your agent, then walk through traces, evaluations, and datasets.",
      duration: 7000,
    });
    await sleep(7500);

    // ── Step 2: Navigate to Chat, queue auto-messages ────────────────────────
    navigate('/chat');
    await sleep(600);
    toast('Starting live demo', {
      description: "Sending 3 queries to your agent automatically - weather, RAG explanation, and a calculation.",
      duration: 5000,
    });

    // Queue the messages for ChatPage to pick up
    localStorage.setItem(TOUR_QUEUE_KEY, JSON.stringify(TOUR_MESSAGES));
    window.dispatchEvent(new CustomEvent('tour:start-chat'));

    await sleep(1500);
    toast.loading('Running agent…', {
      description: 'Waiting for 3 responses. Scores will appear as each reply lands.',
      id: 'tour-chat-wait',
      duration: 120_000,
    });

    // Wait for ChatPage to finish all 3 sends
    await waitForEvent('tour:chat-done', 120_000);
    toast.dismiss('tour-chat-wait');
    await sleep(800);

    toast.success('3 traces created!', {
      description: 'Each agent run is now logged in LangSmith with input, output, and LLM-judge scores.',
      duration: 6000,
    });
    await sleep(6500);

    // ── Step 3: Traces page ──────────────────────────────────────────────────
    localStorage.setItem(TOUR_STAGE_KEY, 'traces');
    navigate('/traces');
    await sleep(600);
    toast('Trace explorer', {
      description: 'Your 3 new traces appear here. Click any row to expand the full input → LLM call → tool call → output span tree.',
      duration: 8000,
    });
    await sleep(8800);

    toast('Add to Dataset', {
      description: 'Expand a trace, then click the purple "Add to Dataset" button to capture that input/output pair as a labeled example.',
      duration: 8000,
    });
    await sleep(8800);

    // ── Step 4: Evaluations page ─────────────────────────────────────────────
    localStorage.setItem(TOUR_STAGE_KEY, 'evals');
    navigate('/evaluations');
    await sleep(600);
    toast('LLM-graded evaluations', {
      description: 'GPT-4o-mini scored each response on helpfulness, correctness, and relevance. The Experiment badge marks scores from dataset runs.',
      duration: 8000,
    });
    await sleep(6000);
    toast('Sort & filter', {
      description: 'Click a summary card to filter by evaluator, or the Score/Time headers to surface your worst-performing runs.',
      duration: 7000,
    });
    await sleep(7800);

    // ── Step 5: Datasets page ────────────────────────────────────────────────
    localStorage.setItem(TOUR_STAGE_KEY, 'datasets');
    navigate('/datasets');
    await sleep(600);
    toast('Datasets & Experiments', {
      description: 'Your LangSmith datasets live here - the labeled Q&A pairs you use for regression testing.',
      duration: 7000,
    });
    await sleep(7800);
    toast('Run Experiment', {
      description: 'Expand a dataset and click "Run Experiment" to automatically run every example through your agent and score the results.',
      duration: 8000,
    });
    await sleep(8800);

    // ── Step 6: Dashboard ────────────────────────────────────────────────────
    localStorage.setItem(TOUR_STAGE_KEY, 'done');
    navigate('/');
    await sleep(600);
    toast('Dashboard', {
      description: 'Latency, cost, eval scores, and trace volume update as your agent runs - all sourced live from LangSmith.',
      duration: 7000,
    });
    await sleep(7500);

    // ── Finale ───────────────────────────────────────────────────────────────
    toast.success('Demo complete 🎉', {
      description: 'Real traces · LLM-as-judge scoring · Dataset experiments - all live. Go to Chat to keep exploring.',
      duration: 10000,
    });

    localStorage.setItem(TOUR_DONE_KEY, '1');
    localStorage.removeItem(TOUR_STAGE_KEY);
  }, [navigate]);

  const hasSeenTour = () => !!localStorage.getItem(TOUR_DONE_KEY);
  const resetTour   = () => {
    localStorage.removeItem(TOUR_DONE_KEY);
    localStorage.removeItem(TOUR_QUEUE_KEY);
    localStorage.removeItem(TOUR_STAGE_KEY);
  };

  return { startTutorial, hasSeenTour, resetTour };
}
