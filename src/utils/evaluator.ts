/**
 * LLM-as-Judge evaluator.
 *
 * Sends the user question + agent answer to GPT-4o-mini and asks it to score
 * three dimensions 0.0–1.0. The scores are then POSTed to LangSmith as
 * feedback entries so they appear in the Evaluations page.
 *
 * In dev the /openai Vite proxy routes requests to https://api.openai.com.
 */

const OPENAI_BASE = import.meta.env.DEV ? '/openai' : 'https://api.openai.com';

export interface EvalScores {
  helpfulness: number;
  correctness: number;
  relevance: number;
}

const SYSTEM_PROMPT = `You are a strict but fair AI evaluator. Given a user question and an AI assistant's response, rate the response on three dimensions from 0.0 to 1.0 (two decimal places):

- helpfulness: Is the response genuinely useful and actionable for the user?
- correctness: Is the information accurate and free of factual errors?
- relevance: Does the response directly address what was asked?

Return ONLY valid JSON with no explanation, no markdown, no code fences:
{"helpfulness": 0.85, "correctness": 0.90, "relevance": 0.80}`;

/**
 * Ask GPT-4o-mini to score a question/answer pair.
 * Returns null if the OpenAI key is missing or the call fails.
 */
export async function judgeResponse(
  openAiKey: string,
  question: string,
  answer: string,
): Promise<EvalScores | null> {
  if (!openAiKey.trim()) return null;

  const userMsg = `Question: ${question}\n\nAnswer: ${answer}`;

  try {
    const res = await fetch(`${OPENAI_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 60,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
      }),
    });

    if (!res.ok) {
      console.warn('[AgentLens] LLM judge failed:', res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const raw = data.choices[0]?.message?.content?.trim() ?? '';
    const scores = JSON.parse(raw) as EvalScores;

    // Clamp each score to [0, 1]
    return {
      helpfulness: Math.min(1, Math.max(0, scores.helpfulness ?? 0)),
      correctness: Math.min(1, Math.max(0, scores.correctness ?? 0)),
      relevance:   Math.min(1, Math.max(0, scores.relevance   ?? 0)),
    };
  } catch (err) {
    console.warn('[AgentLens] LLM judge parse error:', err);
    return null;
  }
}
