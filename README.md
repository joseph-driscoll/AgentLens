# AgentLens

A real-time LLM observability dashboard built on top of the LangSmith API and LangGraph - designed to demonstrate hands-on experience with the full LangChain ecosystem.

Connect your LangSmith workspace and a local LangGraph agent to get live traces, LLM-graded evaluations, dataset management, and in-app experiment execution - all in one window.

---

## Screenshots

### Dashboard

Live KPI cards (traces, avg latency, total cost, avg eval score, error rate) sourced from LangSmith session stats. Trace volume time-series, latency distribution, cost-by-model, and evaluation score radar chart update as your agent runs.

Dashboard

---

### Chat

Talk to your local LangGraph agent without leaving the dashboard. Every reply shows latency, token counts, cost, and a "View trace" link. After each message, GPT-4o-mini silently scores the response on helpfulness, correctness, and relevance - scores appear inline and are logged to LangSmith as structured feedback.

Chat

---

### Traces

Every agent invocation captured with input query, final answer, and a full expandable span tree (chain → LLM call → tool calls). Search by query text, trace ID, or tag. Click "Add to Dataset" on any trace to save that input/output pair as a labeled example for regression testing.

Traces

---

### Evaluations

Per-run LLM-judge scores with source badges (LLM Judge vs Experiment), a 7-day score trend, and a sortable/filterable table. Filter by evaluator dimension or sort by score to surface underperforming runs instantly.

Evaluations

---

### Datasets & Experiments

Browse LangSmith datasets, view examples, and run full experiments directly in the app. The experiment runner sends each example through your agent, calls GPT-4o-mini for scoring, logs feedback to LangSmith, and shows live per-example progress with aggregate scores.

Datasets & Experiments

---

### Settings

Paste your LangSmith and OpenAI API keys to go live - keys are stored in `localStorage` and never leave your browser. Includes a Danger Zone for clearing evaluations, traces, or the entire project when you want a clean slate.

Settings

---

## Running it locally

You need two terminals - one for the dashboard, one for the agent. Everything else is configured in the browser.

### Step 1 - Start the dashboard

```bash
npm install
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)** in your browser.

> **No API keys yet?** The app runs in demo mode with mock data. You can explore every page before connecting anything.

---

### Step 2 - Add your API keys in Settings

Open **Settings** (bottom of the left nav) and paste:


| Key                   | Where to get it                                                                 |
| --------------------- | ------------------------------------------------------------------------------- |
| **LangSmith API key** | [smith.langchain.com/settings](https://smith.langchain.com/settings) → API Keys |
| **OpenAI API key**    | [platform.openai.com/api-keys](https://platform.openai.com/api-keys)            |


Once the LangSmith key is saved, the Dashboard, Traces, Evaluations, and Datasets pages switch to live data from your workspace automatically.

The OpenAI key enables **LLM-as-judge**-  after every Chat message, GPT-4o-mini scores the response and logs it to LangSmith. Without it, Chat still works but no eval scores are generated.

---

### Step 3 - Start the LangGraph agent (enables Chat)

The Chat page requires a LangGraph agent running at `localhost:2024`. Open a second terminal:

```bash
cd langgraph-agent
npm install
```

Create a `.env` file in the `langgraph-agent/` folder:

```
LANGSMITH_API_KEY=your_langsmith_key_here
OPENAI_API_KEY=your_openai_key_here
```

Then start the server:

```bash
npx @langchain/langgraph-cli dev
```

When you see `Ready on http://localhost:2024`, go back to the dashboard and open **Chat** - it connects automatically.

The agent is a `createReactAgent` graph with five tools: weather (wttr.in), web search (DuckDuckGo), calculator, date/time, and a knowledge base. Try asking it anything - every response is traced to LangSmith and shows up in the Traces page within seconds.

> **Traces, Evaluations, Datasets, and Dashboard work without this step.** Only the Chat page needs the local agent running.

---

### Step 4 - Take the tour (optional)

Click **Start Tour** in the left nav. It will automatically send three messages to your agent, then walk through every page explaining what it shows. Takes about 3 minutes.

---

### Step 5 - Seed more data (optional)

The Python agent runs 12 preset questions through a LangChain ReAct agent and logs everything to LangSmith - useful for filling out the Dashboard charts and Evaluations table quickly.

```bash
cd agent
pip install -r requirements.txt
```

Create a `.env` file in the `agent/` folder:

```
LANGSMITH_API_KEY=your_langsmith_key_here
OPENAI_API_KEY=your_openai_key_here
```

```bash
python agent.py
```

---

## Running tests

```bash
npm run test:run
```

Tests cover the core data pipeline and UI components:

```
src/test/
├── adapters.test.ts     extractInputStr, adaptRunToTrace, buildSpanTree, adaptFeedbackToEvalResults
└── Pagination.test.tsx  page navigation, item range display, page-size selector
```

---

## Tech stack

### Frontend

- **React 19** + **TypeScript** - component architecture, custom hooks, context
- **Vite** - dev server with proxy rules for LangSmith API, LangGraph server, and OpenAI
- **Tailwind CSS v4** - utility-first styling, fully responsive (mobile → desktop)
- **Recharts** - trace volume, latency distribution, and cost-by-model charts
- **React Router v7** - client-side routing
- **Sonner** - toast notifications for the guided tour and inline trace feedback
- **Vitest + Testing Library** - unit and component tests

### LangChain ecosystem

- **LangSmith REST API** - traces, feedback, session stats, datasets, examples, experiments
- **LangGraph JS** (`@langchain/langgraph`) - local ReAct agent served via `langgraph-cli`
- **LangGraph SDK** - thread management, `/runs/wait` for synchronous agent calls
- **LangChain Python** - offline agent script for seeding evaluation data

### AI / Evaluation

- **OpenAI GPT-4o-mini** - powers the LangGraph agent and the LLM-as-judge evaluator
- **LLM-as-Judge pattern** - single `gpt-4o-mini` call at `temperature: 0` returns `{"helpfulness": 0.x, "correctness": 0.x, "relevance": 0.x}`, POSTed to LangSmith as structured feedback

---

## Key engineering decisions

**LangSmith API via Vite proxy** - The LangSmith REST API rejects browser-origin requests (CORS). The Vite dev server proxies `/langsmith/*` → `https://api.smith.langchain.com/*`. For production, this would be replaced by a serverless edge function (Vercel/Cloudflare) that injects the API key server-side.

**Rate-limit resilience** - `langsmithRequest()` wraps every fetch with exponential backoff on HTTP 429. A 5-minute TTL cache shared across all hooks means a single `/runs` fetch is reused across page navigations.

**Cache invalidation** - A version counter + listener set pattern. `invalidateCache()` bumps `_cacheVersion` and notifies every mounted hook to refetch - so all pages update in parallel without a full reload.

**Session stats vs. run sampling** - Dashboard KPIs use `GET /api/v1/sessions/{id}` for accurate totals across all runs. Charts use a 100-run sample to stay within API limits.

**LLM-as-Judge** - After every Chat message, a `gpt-4o-mini` call scores the response and POSTs three feedback entries to LangSmith. At ~$0.00001 per message it's effectively free. The experiment runner uses the same evaluator across entire datasets.

**LangGraph `/runs/wait`** - Synchronous agent calls with no SSE parsing. The LangSmith `run_id` isn't in the response body, so a follow-up `GET /threads/{id}/runs?limit=1` retrieves it for feedback logging.

---

## Project structure

```
src/
├── contexts/         LangSmithContext (API keys, localStorage)
├── hooks/            useLangSmithData · useTutorial
├── pages/            Dashboard · Traces · Evaluations · Datasets · Chat · Settings
├── utils/
│   ├── langsmith.ts  Typed fetch client (retry, backoff, TTL cache)
│   ├── langgraph.ts  LangGraph client (runAndWait, thread management)
│   ├── evaluator.ts  LLM-as-judge (GPT-4o-mini → JSON scores)
│   ├── adapters.ts   Raw API shapes → UI types
│   └── format.ts     Duration, cost, number formatters
├── components/       Layout · Charts · Pagination · UI primitives
└── test/             Vitest unit + component tests

langgraph-agent/      TypeScript LangGraph ReAct agent (5 tools)
agent/                Python LangChain ReAct agent + batch runner
docs/screenshots/     UI screenshots
```

---

## License

MIT