# AgentLens - Architecture Guide

Everything you need to know to understand, change, or explain any part of the codebase.

---

## How the app works in one paragraph

The user pastes a LangSmith API key into Settings. From that point on, every page fetches live data from the LangSmith REST API via a Vite dev proxy (required because LangSmith blocks direct browser requests). A local LangGraph server running at `localhost:2024` powers the Chat page - the user sends a message, the agent runs, and the response is streamed back. After each chat reply, a second call to OpenAI scores the response (helpfulness / correctness / relevance) and posts the scores back to LangSmith as feedback. Those scores then show up on the Evaluations page. The Datasets page lets the user save any trace as a labeled example and run whole datasets through the agent in one click.

---

## Request flow

```
User types in Chat
       |
       v
POST /langgraph/threads/{id}/runs/wait      <- Vite proxy -> localhost:2024
       |
       v
LangGraph agent runs (gpt-4o-mini + tools)
       |
       v
Response arrives in ChatPage.tsx
       |
       +-- GET /langgraph/threads/{id}/runs  <- fetch the LangSmith run_id
       |
       v
POST /openai/v1/chat/completions            <- Vite proxy -> api.openai.com
       |
    GPT-4o-mini scores the response
       |
       v
POST /langsmith/api/v1/feedback  (x3)      <- Vite proxy -> api.smith.langchain.com
       |
       v
invalidateCache()  <- tells all mounted hooks to refetch
       |
       v
Traces + Evaluations pages show new data
```

---

## File map

### Entry points

| File | What it does |
|---|---|
| `index.html` | Single HTML shell. Sets the page title, loads Google Fonts, mounts `#root`. |
| `src/main.tsx` | React entry point. Wraps `<App>` in `StrictMode`, imports the SCSS stylesheet. |
| `src/App.tsx` | Router setup. Defines all routes, wraps everything in `AuthProvider` + `LangSmithProvider`, renders the global `<Toaster>`. |

---

### Contexts (`src/contexts/`)

Contexts are React's way of sharing state between components without passing props through every level.

| File | What it does |
|---|---|
| `AuthContext.tsx` | Stores whether the user is logged in. Login/logout persists to `localStorage`. The demo credentials are hardcoded (`demo@agentlens.dev` / `demo`). |
| `LangSmithContext.tsx` | Stores the LangSmith API key, project ID, and OpenAI key. All three come from `localStorage` so they survive page refreshes. Exposes `isConnected` (true when an API key is set). |

---

### Hooks (`src/hooks/`)

Custom hooks encapsulate data fetching and complex stateful logic so pages stay clean.

| File | What it does |
|---|---|
| `useLangSmithData.ts` | The data layer. Three exported hooks - `useTraces`, `useEvals`, `useDashboard` - each fetch from LangSmith, cache the result for 5 minutes, and return `{ data, loading, error, isLive }`. Also exports `invalidateCache()` which forces every mounted hook to refetch immediately (called after chat sends and settings changes). |
| `useTutorial.ts` | The self-running tour. `startTutorial()` navigates between pages, queues three chat messages for the agent to send automatically, waits for all responses and scores, then walks through every page with timed toast notifications. Uses `localStorage` to track whether the tour has been seen. |

---

### Pages (`src/pages/`)

Each page is a single React component. React Router mounts/unmounts them as the user navigates.

| File | What it does |
|---|---|
| `LoginPage.tsx` | Simple login form. Validates against hardcoded demo credentials via `AuthContext`. No real auth - this is a demo app. |
| `DashboardPage.tsx` | Fetches from `useDashboard`. Shows five KPI cards (traces, latency, cost, eval score, error rate) and four charts (trace volume, latency distribution, cost by model, eval scores radar). Falls back to mock data when not connected. |
| `TracesPage.tsx` | Fetches from `useTraces`. Shows a searchable, paginated list of agent runs. Each row expands to show input/output and a span tree. Contains the `AddToDataset` component - a floating dropdown (uses `position: fixed` + `getBoundingClientRect` to avoid clipping) that saves a trace as a labeled example in any LangSmith dataset. |
| `EvalsPage.tsx` | Fetches from `useEvals`. Shows summary cards with 7-day sparklines per evaluator, filter chips, and a sortable table. Each row has a source badge (LLM Judge vs Experiment). |
| `ChatPage.tsx` | The most complex page. Connects to the LangGraph server, manages a thread, sends messages, runs a character-reveal animation on responses, then fires the LLM-as-judge evaluator and logs scores to LangSmith. Also handles the tour's auto-send queue. |
| `DatasetsPage.tsx` | Fetches LangSmith datasets. Each dataset row expands to show examples and past experiments. Contains `ExperimentRunner` - sends every example through the agent, scores each with GPT-4o-mini, and logs feedback to LangSmith with live progress. |
| `SettingsPage.tsx` | API key management. Validates the LangSmith key against the API, saves to `localStorage`. Contains the Danger Zone - buttons to clear evaluations, clear all traces (delete + recreate the session), or delete the project entirely. |

---

### Utils (`src/utils/`)

Pure functions and typed API clients. No React - these can be tested and reasoned about in isolation.

| File | What it does |
|---|---|
| `langsmith.ts` | Typed fetch client for the LangSmith REST API. Every call goes through `langsmithRequest()` which adds the API key header, routes through the Vite proxy, and retries on HTTP 429 with exponential backoff. Exports functions for runs, feedback, sessions, datasets, examples. |
| `langgraph.ts` | Client for the local LangGraph dev server. `fetchFirstAssistant()` finds the deployed graph, `createThread()` starts a conversation, `runAndWait()` sends a message and blocks until the agent responds. |
| `evaluator.ts` | The LLM-as-judge. Sends a single GPT-4o-mini call with a structured prompt asking for `{helpfulness, correctness, relevance}` scores as JSON. Returns null if the call fails so the rest of the chat flow is unaffected. |
| `adapters.ts` | Transforms raw LangSmith API shapes into the UI types defined in `types/index.ts`. The trickiest part is `extractInputStr` / `extractOutputStr` which handle three different message serialization formats (Python SDK, LangChain JS SDK, and plain OpenAI). |
| `format.ts` | Display formatters: `formatDuration` (ms to "1.2s"), `formatCost` (number to "$0.0012"), `formatNumber` (tokens with K suffix). |

---

### Components (`src/components/`)

Reusable UI pieces used across multiple pages.

#### Layout

| File | What it does |
|---|---|
| `AppLayout.tsx` | The shell for every authenticated page. Renders `<Sidebar>` and an `<Outlet>` where the current page appears. |
| `Sidebar.tsx` | Left nav on desktop, top bar + drawer on mobile. Contains the nav links, connection status dot, tour button, user info, and sign out. |
| `ProtectedRoute.tsx` | Wrapper that redirects to `/login` if the user is not authenticated. |

#### Charts

All charts use Recharts. Each is a thin wrapper that takes typed data props and renders a `<ResponsiveContainer>`.

| File | What it does |
|---|---|
| `TraceVolumeChart.tsx` | Area chart - traces and errors per day over 7 days. |
| `LatencyChart.tsx` | Bar chart - count of runs per latency bucket (<1s, 1-2s, 2-5s, etc). |
| `CostByModelChart.tsx` | Horizontal bar chart - total cost grouped by model name. |
| `EvalScoreChart.tsx` | Radar chart - average score per evaluator (helpfulness, correctness, relevance). |

#### UI primitives

| File | What it does |
|---|---|
| `Card.tsx` | Dark rounded container. Used everywhere as the base surface. |
| `MetricCard.tsx` | A single KPI card: label, big number, trend indicator. Used on the Dashboard. |
| `Badge.tsx` | Small colored pill for status labels (success/error/pending). |
| `Pagination.tsx` | Page number nav with prev/next buttons and a page-size selector (15 / 50 / 100). |

---

### Styles (`src/styles/`)

| File | What it does |
|---|---|
| `index.scss` | Main entry. Loads Tailwind, registers brand color tokens, then imports the three partials below. |
| `_tokens.scss` | SCSS variables for colors, typography, spacing, shadows, and z-index layers. Referenced in the other partials. No CSS output on its own. |
| `_animations.scss` | `@keyframe` definitions: `blink` (chat cursor), `pulse-dot` (live indicator), `fade-in-up` (card entrance), `spin` (loaders). |
| `_components.scss` | Custom styles that can't be expressed as Tailwind utilities: scrollbar styling, Sonner toast width override, base font rules. |

---

### Types (`src/types/`)

| File | What it does |
|---|---|
| `index.ts` | All shared TypeScript types. `Trace`, `Span`, `EvalResult`, `DashboardMetrics`, and their sub-types. If a type is used in more than one file it lives here. |

---

### Data (`src/data/`)

| File | What it does |
|---|---|
| `mock.ts` | Static demo data shown on every page when no LangSmith API key is configured. Lets the app be explored without any setup. |

---

### Tests (`src/test/`)

| File | What it tests |
|---|---|
| `setup.ts` | Imports `@testing-library/jest-dom` matchers so `toBeInTheDocument()` etc. work in Vitest. |
| `adapters.test.ts` | Unit tests for all the pure functions in `adapters.ts`. 21 tests covering input extraction, trace building, span tree construction, and feedback adaptation. |
| `Pagination.test.tsx` | Component tests for `Pagination.tsx`. 9 tests covering page range display, disabled states, click handlers, and page-size selection. |

---

### Agent code

| Directory | What it does |
|---|---|
| `langgraph-agent/` | TypeScript LangGraph ReAct agent. Five tools: `get_weather` (wttr.in API), `web_search` (DuckDuckGo), `calculate` (safe math eval), `get_datetime` (timezone lookup), `knowledge_base` (curated LangChain/AI FAQ). Served by `langgraph-cli` at `localhost:2024`. |
| `agent/` | Python LangChain ReAct agent. Runs 12 preset questions, logs traces and LLM-judge feedback to LangSmith. Used to seed the dashboard with data quickly. |

---

## Key patterns to know

### The cache + invalidation pattern (`useLangSmithData.ts`)

All three data hooks share a module-level `Map` cache keyed by `${apiKey}:${projectId}`. When a hook runs, it checks the cache first - if the data is less than 5 minutes old it returns immediately with zero network requests.

When something changes (a chat message is sent, settings are updated), `invalidateCache()` clears the map AND increments a version counter. Every mounted hook subscribes to that counter via `useCacheVersion()` - when it bumps, their `useEffect` reruns and they fetch fresh data.

### The proxy pattern (`vite.config.ts`)

LangSmith, LangGraph, and OpenAI all block direct browser requests (CORS). In dev, Vite rewrites:
- `/langsmith/*` to `https://api.smith.langchain.com/*`
- `/langgraph/*` to `http://localhost:2024/*`
- `/openai/*` to `https://api.openai.com/*`

All fetch calls in `langsmith.ts`, `langgraph.ts`, and `evaluator.ts` use these local paths. In production you'd replace the proxy with a serverless edge function.

### The adapter pattern (`adapters.ts`)

The LangSmith API returns raw run objects. The adapter layer converts them into typed UI models (`Trace`, `Span`, `EvalResult`) before anything reaches a component. This means components never touch raw API shapes - if the API changes, you fix it in one place.

### The tour auto-send pattern (`useTutorial.ts` + `ChatPage.tsx`)

The tour stores an array of messages in `localStorage` under `agentlens_tour_queue`, then fires a `tour:start-chat` custom DOM event. `ChatPage` listens for this event and, when its agent connection is ready, picks up the queue and sends each message sequentially - waiting for the full response AND eval scores before sending the next. When all three are done it fires `tour:chat-done`, which the tour is awaiting with a 120-second timeout.

---

## State that lives in localStorage

| Key | What it stores |
|---|---|
| `agentlens_user` | Logged-in user object (set by AuthContext) |
| `agentlens_ls_key` | LangSmith API key |
| `agentlens_ls_project` | LangSmith project/session ID |
| `agentlens_openai_key` | OpenAI API key |
| `agentlens_tour_v2` | Set to "1" when the tour has been completed |
| `agentlens_tour_queue` | Temporary: array of messages for the tour auto-send |
| `agentlens_tour_stage` | Temporary: which tour step is currently running |
