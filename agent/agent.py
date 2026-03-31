"""
ReAct-style agent with two components:
  - get_weather tool  : handles weather-related questions via wttr.in
  - LLM fallback      : handles all other general queries directly

LangSmith tracing + feedback logging enabled via .env vars.
Run this script directly: python agent.py
"""

import os
import sys
import random
import time
from datetime import datetime, timezone

# Force UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

from dotenv import load_dotenv

load_dotenv()

import requests
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage
from langchain.agents import create_agent
from langsmith import Client


# ── LangSmith client (for logging feedback after each run) ───────────────────

ls_client = Client()


# ── Tool: get_weather ────────────────────────────────────────────────────────

@tool
def get_weather(city: str) -> str:
    """Get the current weather conditions for a city.

    Use this tool whenever the user asks about weather, temperature,
    forecast, rain, sun, or whether to bring an umbrella.
    """
    try:
        resp = requests.get(
            f"https://wttr.in/{city}?format=3",
            timeout=6,
            headers={"User-Agent": "AgentLens/1.0"},
        )
        if resp.ok and resp.text.strip():
            return resp.text.strip()
        return f"Weather data for {city!r} is unavailable right now."
    except requests.RequestException as exc:
        return f"Could not reach weather service: {exc}"


# ── Agent ────────────────────────────────────────────────────────────────────

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

agent = create_agent(
    model=llm,
    tools=[get_weather],
    system_prompt=(
        "You are a helpful assistant. "
        "For weather questions, always use the get_weather tool. "
        "For everything else, answer directly from your own knowledge."
    ),
)


# ── Runner with feedback logging ─────────────────────────────────────────────

def run(query: str) -> str:
    """Invoke the agent, log feedback scores to LangSmith, return final answer."""
    # Record time just before the call so we can find this exact run afterwards
    start = datetime.now(timezone.utc)

    result = agent.invoke({"messages": [HumanMessage(content=query)]})
    answer = result["messages"][-1].content

    # Wait a moment for the trace to flush to LangSmith, then look it up
    # by start_time so we always get this specific run (not an older one)
    try:
        time.sleep(3)
        recent = list(ls_client.list_runs(
            project_name=os.getenv("LANGSMITH_PROJECT"),
            start_time=start,
            is_root=True,
            limit=1,
        ))
        if recent:
            run_id = recent[0].id  # already a UUID object — no parsing needed
            scores = {
                "helpfulness": round(random.uniform(0.75, 1.0), 2),
                "correctness": round(random.uniform(0.70, 1.0), 2),
                "relevance":   round(random.uniform(0.80, 1.0), 2),
            }
            for key, score in scores.items():
                ls_client.create_feedback(
                    run_id=run_id,
                    key=key,
                    score=score,
                    comment="Auto-logged by AgentLens demo agent",
                )
            print(f"  [feedback] {scores}")
        else:
            print("  [feedback skipped: run not found yet]")
    except Exception as exc:
        print(f"  [feedback skipped: {exc}]")

    return answer


# ── Demo queries ─────────────────────────────────────────────────────────────

QUERIES = [
    # Weather -- triggers get_weather tool
    "What's the weather like in San Francisco right now?",
    "Should I bring an umbrella to London today?",
    "Is it hot in Tokyo?",
    "What's the weather in Berlin?",
    "How's the weather in Sydney, Australia?",
    # General -- answered directly by LLM
    "What is the capital of France?",
    "Explain what a ReAct agent is in two sentences.",
    "What does LangSmith help with?",
    "What is the difference between an LLM and an agent?",
    "Name three popular vector databases.",
    # Mixed reasoning -- weather tool + LLM synthesis
    "I'm traveling from New York to Paris tomorrow. What should I pack given the weather?",
    "Compare the weather in Tokyo and London right now.",
]


if __name__ == "__main__":
    sep = "=" * 60
    thin = "-" * 60

    print(sep)
    print("  ReAct Agent  |  LangSmith tracing + feedback enabled")
    print(f"  Project: {os.getenv('LANGSMITH_PROJECT', '(none)')}")
    print(sep)

    for query in QUERIES:
        print(f"\n{thin}")
        print(f"User:  {query}")
        answer = run(query)
        print(f"Agent: {answer}")

    print(f"\n{sep}")
    print("Done -- refresh your AgentLens dashboard to see the new traces.")
    print(sep)
