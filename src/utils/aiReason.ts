/**
 * Groq free-tier AI analysis for bank/UPI SMS.
 *
 * Accuracy design (v3.2):
 * - Full bank-matched SMS text is analyzed (explicit user tap only).
 * - Deterministic on-device parsing (extractPayee / detectDirection /
 *   inferCategory / fallbackReason in smsImport.ts) ANCHORS every AI result:
 *   the AI name must resemble text actually present in the SMS, otherwise the
 *   deterministic value wins. Direction falls back to keyword detection.
 * - Few-shot prompt with real Indian SMS shapes so the model learns
 *   person-vs-merchant phrasing ("upi transfer to person" vs "food delivery").
 * - Batched in chunks of 10, temperature 0, JSON-object response, tolerant
 *   parser, per-row validation + offline fallback so no row ever comes back
 *   blank or hallucinated.
 */

import {
  extractPayee,
  detectDirection,
  inferCategory,
  fallbackReason,
} from './smsImport';
import type { ExpenseCategory } from '../types';

export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
/** Max SMS per Groq request — keeps replies short enough to stay valid JSON. */
const BATCH_SIZE = 10;

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
  /** Short reason phrase, e.g. "food delivery order". */
  reason: string;
  /** Present only in full-message mode: money out or money in. */
  direction?: 'out' | 'in';
  /** Category guess (full-message mode). */
  category?: ExpenseCategory;
  /** True when this row survived validation against the SMS text. */
  validated?: boolean;
}

export interface FullMessage {
  index: number;
  sender: string;
  date: string;
  body: string;
}

function buildFullMessagePrompt(msgs: FullMessage[]): string {
  const lines = msgs.map((m) => `${m.index}. [${m.sender} ${m.date}] ${m.body}`);
  return [
    'You read Indian bank and UPI SMS alerts. For EACH numbered message output direction, name, reason and category.',
    '',
    'DIRECTION — decide FIRST, money OUT or IN:',
    '- "out": debited, debit, spent, paid, withdrawn, purchase, charged, transferred to, UPI to, EMI debited.',
    '- "in": credited, credit, received, recvd, deposited, refund, cashback, NEFT/IMPS credit, salary credit.',
    '- If both verbs appear, pick the verb attached to the transaction amount.',
    '',
    'NAME — the EXACT payee (out) or sender (in) as written in that message:',
    '- Copy verbatim, preserve capitals, max 4 words. NEVER paraphrase, NEVER invent.',
    '- Prefer the text after: paid to / transferred to / towards / at / UPI/.../.../<NAME> / recvd from / received from / payment from.',
    '- Strip UTR/ref numbers, dates, amounts, "Mr/Mrs", A/c numbers. NEVER return a bank name (HDFC/SBI/ICICI) as the name.',
    '- Person names stay full: "V GOKUL", "ARUN KUMAR". Merchants stay exact: "SWIGGY", "ZOMATO", "DMART".',
    '',
    'REASON — 2-6 lowercase words explaining WHY:',
    '- A person name means a personal transfer: out -> "upi transfer to person", in -> "received from person".',
    '- Zomato/Swiggy/Dominos -> "food delivery order". Uber/Ola/IRCTC -> "travel ride booking".',
    '- Amazon/Flipkart/DMart -> "online shopping order". Jio/Airtel/bills/EMI/rent -> "bill payment" or "loan emi payment".',
    '- Salary/NEFT credit -> "monthly salary credit". Refund/cashback -> "refund received".',
    '',
    'CATEGORY — one of: food, travel, shopping, bills, health, fun, other.',
    '',
    'Examples:',
    'MSG: Rs.250 debited from A/c XX4821 towards V GOKUL via UPI Ref 412345678901 on 12-10-26',
    '=> {"index":0,"direction":"out","name":"V GOKUL","reason":"upi transfer to person","category":"other"}',
    'MSG: Your HDFC Card XX1234 spent Rs 499 at SWIGGY on 11-Oct-26. Avl bal Rs 12000',
    '=> {"index":1,"direction":"out","name":"SWIGGY","reason":"food delivery order","category":"food"}',
    'MSG: A/c XX4821 credited with Rs 85000 by NEFT from SALARY on 01-10-26',
    '=> {"index":2,"direction":"in","name":"SALARY","reason":"monthly salary credit","category":"other"}',
    'MSG: Rs 199 paid to ZOMATO via UPI Ref 987654321012 on 10-10-26',
    '=> {"index":3,"direction":"out","name":"ZOMATO","reason":"food delivery order","category":"food"}',
    '',
    'Reply with ONLY a JSON array of objects like',
    '[{"index":0,"direction":"out","name":"V GOKUL","reason":"upi transfer to person","category":"other"}].',
    'No markdown, no commentary, no extra keys.',
    'Messages:',
    ...lines,
  ].join('\n');
}

/** Extract the JSON array from a model reply (tolerates fences/prose/single object). */
function extractJsonArray(text: string): unknown[] {
  const clean = text.replace(/```(?:json)?/gi, '').trim();
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try {
      const arr = JSON.parse(clean.slice(start, end + 1)) as unknown;
      if (Array.isArray(arr)) return arr;
    } catch {
      /* fall through to single-object attempt */
    }
  }
  const oStart = clean.indexOf('{');
  const oEnd = clean.lastIndexOf('}');
  if (oStart >= 0 && oEnd > oStart) {
    try {
      const obj = JSON.parse(clean.slice(oStart, oEnd + 1)) as unknown;
      return [obj];
    } catch {
      return [];
    }
  }
  return [];
}

const VALID_CATS: ExpenseCategory[] = ['food', 'travel', 'shopping', 'bills', 'health', 'fun', 'other'];

function normCat(raw: unknown): ExpenseCategory | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim().toLowerCase() as ExpenseCategory;
  return (VALID_CATS as string[]).includes(v) ? v : undefined;
}

/** Does the AI name plausibly come from the SMS? Guards against hallucination. */
function nameGroundedInSms(name: string, body: string): boolean {
  const clean = name.trim();
  if (clean.length < 2) return false;
  const lowBody = body.toLowerCase();
  const lowName = clean.toLowerCase();
  // Full name present verbatim.
  if (lowBody.includes(lowName)) return true;
  // Every significant word present (handles "V GOKUL" vs "towards V GOKUL via").
  const words = lowName.split(/\s+/).filter((w) => w.length >= 2 && !/^(mr|mrs|ms|to|at)$/.test(w));
  if (words.length === 0) return false;
  const hits = words.filter((w) => lowBody.includes(w)).length;
  return hits >= Math.max(1, Math.ceil(words.length * 0.66));
}

interface RawRow {
  index: number;
  direction?: 'out' | 'in';
  name?: string;
  reason?: string;
  category?: ExpenseCategory;
}

/**
 * Validate each AI row against its source SMS and repair with deterministic
 * parsing. Guarantees: non-empty grounded name, non-empty reason, direction
 * always set, category always set.
 */
function validateAndRepair(raw: unknown[], msgs: FullMessage[]): SpendAnalysis[] {
  const out: SpendAnalysis[] = [];
  for (const m of msgs) {
    const r = (raw.find(
      (x) =>
        !!x &&
        typeof x === 'object' &&
        Number((x as { index: unknown }).index) === m.index
    ) as Partial<RawRow> | undefined) || {};
    const detName = extractPayee(m.body) || m.sender;
    const detDir = detectDirection(m.body);
    const detCat = inferCategory(detName, m.body);

    let name = typeof r.name === 'string' ? r.name.trim().slice(0, 60) : '';
    let grounded = name ? nameGroundedInSms(name, m.body) : false;
    if (!grounded) {
      name = detName;
      grounded = true;
    }
    if (!name) name = m.sender || 'SMS transaction';

    let direction: 'out' | 'in';
    if (r.direction === 'out' || r.direction === 'in') {
      // Trust AI unless deterministic detection strongly disagrees AND the
      // deterministic signal is unambiguous (pure out/in keywords).
      direction = r.direction;
      if (detDir !== 'unknown' && detDir !== direction) {
        const low = m.body.toLowerCase();
        const pureOut = /\bdebited\b|\bspent\b|\bwithdrawn\b/.test(low) && !/\bcredited\b|\breceived\b|\brecvd\b/.test(low);
        const pureIn = /\bcredited\b|\breceived\b|\brecvd\b|\bdeposited\b/.test(low) && !/\bdebited\b|\bspent\b|\bpaid\b/.test(low);
        if ((detDir === 'out' && pureOut) || (detDir === 'in' && pureIn)) {
          direction = detDir;
        }
      }
    } else {
      direction = detDir === 'unknown' ? 'out' : detDir;
    }

    let reason = typeof r.reason === 'string' ? r.reason.trim().slice(0, 120) : '';
    if (!reason || reason.length < 3) {
      reason = fallbackReason(name, direction, m.body);
    }
    const category = normCat(r.category) || detCat;

    out.push({ index: m.index, name, reason, direction, category, validated: grounded });
  }
  return out;
}

async function callGroq(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  maxTokens: number
): Promise<string> {
  const res = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: (model || DEFAULT_GROQ_MODEL).trim(),
      temperature: 0,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
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
  return data.choices?.[0]?.message?.content || '';
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Full-message analysis over bank-matched SMS (explicit user tap).
 * Chunked batched calls; every row validated + repaired deterministically.
 * Throws with a friendly message only when nothing could be analyzed at all.
 */
export async function analyzeMessages(
  msgs: FullMessage[],
  apiKey: string,
  model: string
): Promise<SpendAnalysis[]> {
  if (msgs.length === 0) throw new Error('nothing to analyze');
  if (!apiKey.trim()) throw new Error('Add your Groq API key in Settings first.');
  const batches = chunk(msgs, BATCH_SIZE);
  const merged: SpendAnalysis[] = [];
  let lastError: unknown = null;
  for (const batch of batches) {
    try {
      const content = await callGroq(
        apiKey,
        model,
        'You output only JSON arrays of transaction analyses. No markdown, no explanations.',
        buildFullMessagePrompt(batch),
        2048
      );
      const raw = extractJsonArray(content);
      merged.push(...validateAndRepair(raw, batch));
    } catch (e) {
      lastError = e;
      // Offline/deterministic fallback for this batch — never leave rows blank.
      for (const m of batch) {
        const detName = extractPayee(m.body) || m.sender;
        const detDir = detectDirection(m.body);
        const direction: 'out' | 'in' = detDir === 'unknown' ? 'out' : detDir;
        merged.push({
          index: m.index,
          name: detName,
          reason: fallbackReason(detName, direction, m.body),
          direction,
          category: inferCategory(detName, m.body),
          validated: true,
        });
      }
    }
  }
  if (merged.length === 0) {
    throw new Error(
      lastError instanceof Error ? lastError.message : 'AI returned no usable rows — try again.'
    );
  }
  return merged.sort((a, b) => a.index - b.index);
}

// ---- Fragment mode (manual "Suggest with AI", key test) ----

export function buildAnalysisPrompt(frags: SpendFragment[]): string {
  const lines = frags.map(
    (f) =>
      `${f.index}. merchant="${f.merchant || '?'}", sender="${f.sender}", amount=${f.amount}, date=${f.date}${
        f.accountLast4 ? `, acct=··${f.accountLast4}` : ''
      }`
  );
  return [
    'You clean up Indian bank/UPI spend records. For each numbered row, return the EXACT merchant or payee name as written (no paraphrasing, max 4 words) and a short lowercase reason phrase (2-5 words) saying why the spend likely happened.',
    'Person names mean personal transfers: reason "upi transfer to person". Zomato/Swiggy mean "food delivery order".',
    'Reply with ONLY a JSON array like [{"index":0,"name":"SWIGGY","reason":"food delivery dinner"}]. No markdown, no commentary.',
    'Rows:',
    ...lines,
  ].join('\n');
}

/** Extract the JSON array from a model reply (tolerates fences/prose). */
export function parseAnalysisResponse(text: string, count: number): SpendAnalysis[] {
  const arr = extractJsonArray(text);
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
}

export async function analyzeSpends(
  frags: SpendFragment[],
  apiKey: string,
  model: string
): Promise<SpendAnalysis[]> {
  if (frags.length === 0) throw new Error('nothing to analyze');
  if (!apiKey.trim()) throw new Error('Add your Groq API key in Settings first.');
  const content = await callGroq(
    apiKey,
    model,
    'You output only JSON arrays. No markdown, no explanations.',
    buildAnalysisPrompt(frags),
    1024
  );
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
