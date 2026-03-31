/**
 * AgentLens - Multi-Tool LangGraph ReAct Agent
 *
 * Five capabilities the agent can route between:
 *   1. get_weather     - live conditions from wttr.in
 *   2. web_search      - instant answers via DuckDuckGo API (no key needed)
 *   3. calculate       - evaluates math expressions
 *   4. get_datetime    - current date/time in any timezone
 *   5. knowledge_base  - curated LangChain/AI knowledge (simulates RAG)
 *
 * The agent decides which tool(s) to call based on the user's question.
 * Complex questions may chain multiple tools in a single turn.
 *
 * Served via `npx @langchain/langgraph-cli dev` → http://localhost:2024
 */
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// ── Tool 1: get_weather ─────────────────────────────────────────────────

const getWeather = tool(
  async ({ city }: { city: string }) => {
    try {
      const res = await fetch(
        `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
        { headers: { "User-Agent": "AgentLens/1.0" }, signal: AbortSignal.timeout(6000) },
      );
      if (!res.ok) return `Weather data for "${city}" is unavailable.`;
      const data = await res.json() as Record<string, unknown>;
      const current = (data.current_condition as Array<Record<string, unknown>>)?.[0];
      if (!current) return `No current conditions found for "${city}".`;
      return JSON.stringify({
        city,
        temp_C: current.temp_C,
        temp_F: current.temp_F,
        feels_like_C: current.FeelsLikeC,
        humidity: current.humidity,
        description: (current.weatherDesc as Array<Record<string, string>>)?.[0]?.value,
        wind_kmph: current.windspeedKmph,
        wind_dir: current.winddir16Point,
        visibility_km: current.visibility,
        uv_index: current.uvIndex,
        precip_mm: current.precipMM,
      });
    } catch (err) {
      return `Could not reach weather service: ${err}`;
    }
  },
  {
    name: "get_weather",
    description:
      "Get detailed current weather for a city including temperature, humidity, wind, " +
      "UV index, and precipitation. Use for weather, temperature, forecast, rain, or packing questions.",
    schema: z.object({
      city: z.string().describe("City name, e.g. 'Tokyo' or 'New York'"),
    }),
  },
);

// ── Tool 2: web_search ──────────────────────────────────────────────────

const webSearch = tool(
  async ({ query }: { query: string }) => {
    try {
      const res = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (!res.ok) return `Search failed with status ${res.status}`;
      const data = await res.json() as Record<string, unknown>;

      const results: string[] = [];

      // Abstract (direct answer)
      if (data.Abstract && typeof data.Abstract === "string") {
        results.push(`Abstract: ${data.Abstract}`);
        if (data.AbstractSource) results.push(`Source: ${data.AbstractSource}`);
        if (data.AbstractURL) results.push(`URL: ${data.AbstractURL}`);
      }

      // Related topics
      const topics = data.RelatedTopics as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(topics)) {
        const top = topics.slice(0, 5);
        for (const t of top) {
          if (t.Text && typeof t.Text === "string") {
            results.push(`- ${(t.Text as string).slice(0, 200)}`);
          }
        }
      }

      // Answer (for calculations, conversions, etc.)
      if (data.Answer && typeof data.Answer === "string") {
        results.push(`Answer: ${data.Answer}`);
      }

      if (results.length === 0) {
        return `No instant answer found for "${query}". Try rephrasing or using a more specific query.`;
      }
      return results.join("\n");
    } catch (err) {
      return `Search error: ${err}`;
    }
  },
  {
    name: "web_search",
    description:
      "Search the web for factual information, definitions, current events, people, " +
      "places, companies, or any topic the assistant is unsure about. " +
      "Returns instant answers from DuckDuckGo.",
    schema: z.object({
      query: z.string().describe("The search query"),
    }),
  },
);

// ── Tool 3: calculate ───────────────────────────────────────────────────

const calculate = tool(
  async ({ expression }: { expression: string }) => {
    try {
      // Safe math evaluation: only allow numbers, operators, parens, and common functions
      const sanitized = expression.replace(/[^0-9+\-*/().,%^ ]/g, "");
      if (!sanitized.trim()) return "Invalid expression. Use numbers and operators like: 2 * (3 + 4)";

      // Replace ^ with ** for exponentiation
      const jsExpr = sanitized.replace(/\^/g, "**");
      const result = new Function(`"use strict"; return (${jsExpr})`)();

      if (typeof result !== "number" || !isFinite(result)) {
        return `Could not evaluate: ${expression}`;
      }

      return `${expression} = ${result}`;
    } catch (err) {
      return `Math error: ${err}. Use format like: 2 * (3 + 4) or 15 / 3`;
    }
  },
  {
    name: "calculate",
    description:
      "Evaluate a mathematical expression. Supports +, -, *, /, parentheses, " +
      "and ^ for exponents. Use this for any math, arithmetic, percentages, " +
      "unit conversions, tip calculations, or numerical comparisons.",
    schema: z.object({
      expression: z.string().describe("Math expression, e.g. '(15 * 1.2) + 50' or '2^10'"),
    }),
  },
);

// ── Tool 4: get_datetime ────────────────────────────────────────────────

const getDatetime = tool(
  async ({ timezone }: { timezone: string }) => {
    try {
      const now = new Date();
      const formatted = now.toLocaleString("en-US", {
        timeZone: timezone,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      });
      return `Current date/time in ${timezone}: ${formatted}`;
    } catch {
      return `Invalid timezone "${timezone}". Use IANA format like "America/New_York", "Europe/London", or "Asia/Tokyo".`;
    }
  },
  {
    name: "get_datetime",
    description:
      "Get the current date and time in any timezone. Use IANA timezone names. " +
      "Useful for scheduling, time zone comparisons, or 'what time is it in...' questions.",
    schema: z.object({
      timezone: z
        .string()
        .describe("IANA timezone, e.g. 'America/New_York', 'Europe/London', 'Asia/Tokyo'"),
    }),
  },
);

// ── Tool 5: knowledge_base ──────────────────────────────────────────────

const KB_ENTRIES: Record<string, string> = {
  langchain:
    "LangChain is a framework for building applications powered by language models. " +
    "It provides abstractions for chains, agents, memory, callbacks, and tool use. " +
    "Key components: ChatModels, Prompts, OutputParsers, Retrievers, Tools, and Chains. " +
    "LangChain supports OpenAI, Anthropic, Google, and many other LLM providers.",

  langsmith:
    "LangSmith is LangChain's observability and evaluation platform. " +
    "Features: trace logging, span trees, feedback/evaluation scoring, datasets & experiments, " +
    "prompt hub, annotation queues, and online evaluators. " +
    "API endpoints: /runs/query (traces), /feedback (eval scores), /datasets (test sets), /sessions (projects). " +
    "Pricing: free tier with 5K traces/month, Plus at $39/seat/month.",

  langgraph:
    "LangGraph is a framework for building stateful, multi-actor LLM applications as graphs. " +
    "Core concepts: StateGraph, nodes (functions), edges (routing), checkpointing (persistence). " +
    "Prebuilt: createReactAgent for Thought→Act→Observe loops. " +
    "LangGraph Cloud provides deployment, cron jobs, and long-running workflows. " +
    "The CLI serves agents locally at localhost:2024 with LangGraph Studio UI.",

  react_agent:
    "ReAct (Reasoning + Acting) is an agent pattern where the LLM alternates between " +
    "thinking about what to do and taking actions (tool calls). " +
    "Steps: Thought → Action → Observation → Thought → ... → Final Answer. " +
    "LangGraph implements this via createReactAgent which builds a StateGraph with " +
    "an 'agent' node (LLM) and a 'tools' node (tool executor) connected in a loop.",

  rag:
    "RAG (Retrieval-Augmented Generation) is a pattern where relevant documents are retrieved " +
    "from a vector store and injected into the LLM prompt as context. " +
    "Pipeline: Query → Embed → Vector Search → Retrieve top-K docs → Augment prompt → Generate. " +
    "Popular vector DBs: Pinecone, Weaviate, Chroma, Qdrant, pgvector. " +
    "LangChain supports RAG via Retrievers, VectorStores, and RecursiveCharacterTextSplitter.",

  evaluation:
    "LLM evaluation approaches: " +
    "1. LLM-as-Judge - use GPT-4 to score outputs on dimensions like helpfulness, correctness, relevance. " +
    "2. Human annotation - manual review via LangSmith annotation queues. " +
    "3. Heuristic - rule-based checks (regex, length, format). " +
    "4. Reference-based - compare against gold-standard answers (BLEU, ROUGE, exact match). " +
    "5. Pairwise - compare two model outputs side by side. " +
    "LangSmith Datasets + Experiments enable regression testing before deploying agent changes.",

  vector_databases:
    "Vector databases store embeddings for similarity search. " +
    "Top options: Pinecone (managed, scalable), Weaviate (open-source, hybrid search), " +
    "Chroma (lightweight, local-first), Qdrant (Rust, high performance), " +
    "pgvector (PostgreSQL extension), Milvus (distributed), FAISS (Meta, in-memory). " +
    "Key concepts: cosine similarity, approximate nearest neighbors (ANN), HNSW index.",

  prompt_engineering:
    "Key prompt engineering techniques: " +
    "1. Few-shot - include examples in the prompt. " +
    "2. Chain-of-thought (CoT) - ask the model to reason step by step. " +
    "3. Role prompting - set a system message with persona. " +
    "4. Output formatting - request JSON, XML, or structured output. " +
    "5. Self-consistency - sample multiple responses and pick the majority. " +
    "6. ReAct - interleave reasoning with tool use. " +
    "LangSmith Prompt Hub enables versioning and A/B testing of prompts.",
};

const knowledgeBase = tool(
  async ({ topic }: { topic: string }) => {
    const key = topic.toLowerCase().replace(/[\s-_]+/g, "_");
    // Exact match first
    if (KB_ENTRIES[key]) return KB_ENTRIES[key];
    // Fuzzy match: find entries whose key contains the search term
    const matches = Object.entries(KB_ENTRIES).filter(
      ([k, v]) =>
        k.includes(key) ||
        key.includes(k) ||
        v.toLowerCase().includes(topic.toLowerCase()),
    );
    if (matches.length > 0) {
      return matches.map(([k, v]) => `## ${k}\n${v}`).join("\n\n");
    }
    return `No knowledge base entry found for "${topic}". Available topics: ${Object.keys(KB_ENTRIES).join(", ")}`;
  },
  {
    name: "knowledge_base",
    description:
      "Look up curated knowledge about AI/ML concepts, LangChain ecosystem, " +
      "vector databases, evaluation methods, prompt engineering, and related topics. " +
      "Use this for technical questions about LangChain, LangSmith, LangGraph, RAG, " +
      "agents, evaluation, or vector databases.",
    schema: z.object({
      topic: z
        .string()
        .describe("Topic to look up, e.g. 'langsmith', 'rag', 'vector_databases', 'evaluation'"),
    }),
  },
);

// ── LLM ─────────────────────────────────────────────────────────────────

const llm = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0,
});

// ── Graph ───────────────────────────────────────────────────────────────

export const graph = createReactAgent({
  llm,
  tools: [getWeather, webSearch, calculate, getDatetime, knowledgeBase],
  stateModifier:
    "You are a capable AI assistant with access to multiple tools. " +
    "Choose the right tool for each question - you can use multiple tools in one turn. " +
    "For weather → get_weather. For facts/current events → web_search. " +
    "For math/calculations → calculate. For time/date → get_datetime. " +
    "For AI/LangChain/tech concepts → knowledge_base. " +
    "For simple conversational questions, answer directly without tools. " +
    "Always provide clear, helpful answers based on tool results.",
});

graph.name = "AgentLens";
