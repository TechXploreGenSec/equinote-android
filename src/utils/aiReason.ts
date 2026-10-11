/**
 * Groq free-tier reason analysis for spends.
 *
 * PRIVACY: the full SMS body never leaves the phone. Pattern-based
 * splitting runs on-device first (merchant / amount / sender / date) and
 * only those fragments are sent — batched into ONE request for all rows.
 */

export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

export interface SpendFragment {
  index: number;
  merchant?: string;
  sender: string;
  amount: number;
  date: string;
  accountLast4?: string;
}

export interface SpendAnalysis {
  index: number;
  /** Exact merchant/payee name, cleaned, ≤ 4 words. */
  name: string;
  /** Short reason phrase, e.g. "Food delivery dinner". */
  reason: string;
}

export function buildAnalysisPrompt(frags: SpendFragment[]): string {
  const lines = frags.map(
    (f) =>
      `${f.index}. merchant="${f.merchant || '?'}", sender="${f.sender}", amount=${f.amount}, date=${f.date}${
        f.accountLast4 ? `, acct=··${f.accountLast4}` : ''
      }`
  );
  return [
    'You clean up Indian bank/UPI spend records. For each numbered row, return the EXACT merchant or payee name as written (no paraphrasing, max 4 words) and a short lowercase reason phrase (2-5 words) saying why the spend likely happened.',
    'Reply with ONLY a JSON array like [{"index":0,"name":"SWIGGY","reason":"food delivery dinner"}]. No markdown, no commentary.',
    'Rows:',
    ...lines,
  ].join('\n');
}

/** Extract the JSON array from a model reply (tolerates fences/prose). */
export function parseAnalysisResponse(text: string, count: number): SpendAnalysis[] {
  const clean = text.replace(/```(?:json)?/gi, '').trim();
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(clean.slice(start, end + 1)) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (x): x is SpendAnalysis =>
          !!x &&
          typeof x === 'object' &&
          Number.isInteger((x as SpendAnalysis).index) &&
          (x as SpendAnalysis).index >= 0 &&
          (x as SpendAnalysis).index < count &&
          typeof (x as SpendAnalysis).name === 'string'
      )
      .map((x) => ({
        index: x.index,
        name: x.name.trim().slice(0, 60) || 'SMS spend',
        reason: typeof x.reason === 'string' ? x.reason.trim().slice(0, 120) : '',
      }));
  } catch {
    return [];
  }
}

export async function analyzeSpends(
  frags: SpendFragment[],
  apiKey: string,
  model: string
): Promise<SpendAnalysis[]> {
  if (frags.length === 0) throw new Error('nothing to analyze');
  if (!apiKey.trim()) throw new Error('Add your Groq API key in Settings first.');
  const res = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: (model || DEFAULT_GROQ_MODEL).trim(),
      temperature: 0.2,
      max_tokens: 1024,
      messages: [
        {
          role: 'system',
          content: 'You output only JSON arrays. No markdown, no explanations.',
        },
        { role: 'user', content: buildAnalysisPrompt(frags) },
      ],
    }),
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      if (err?.error?.message) detail += ` — ${err.error.message}`;
    } catch {
      /* ignore */
    }
    throw new Error(`Groq error ${detail}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content || '';
  const parsed = parseAnalysisResponse(content, frags.length);
  if (parsed.length === 0) throw new Error('AI returned no usable rows — try again.');
  return parsed;
}

/** Quick key check: tiny completion, true when Groq accepts the key. */
export async function testGroqKey(apiKey: string, model: string): Promise<{ ok: boolean; message: string }> {
  try {
    const out = await analyzeSpends(
      [{ index: 0, merchant: 'TEST', sender: 'TEST', amount: 1, date: '2026-10-11' }],
      apiKey,
      model
    );
    return { ok: out.length > 0, message: 'Key works — AI analysis ready.' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
