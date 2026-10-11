import { registerPlugin, Capacitor } from '@capacitor/core';

export interface SmsMessage {
  id: string;
  address: string;
  body: string;
  date: number; // epoch millis
}

interface SmsReaderPlugin {
  checkSmsPermission(): Promise<{ granted: boolean }>;
  requestSmsPermission(): Promise<{ granted: boolean }>;
  readInbox(options: { limit: number; since: number }): Promise<{ messages: SmsMessage[] }>;
}

const SmsReader = registerPlugin<SmsReaderPlugin>('SmsReader');

export function isSmsSupported(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('SmsReader');
  } catch {
    return false;
  }
}

export async function ensureSmsPermission(): Promise<{ granted: boolean; bridge: boolean }> {
  if (!isSmsSupported()) return { granted: false, bridge: false };
  try {
    const current = await SmsReader.checkSmsPermission();
    if (current.granted) return { granted: true, bridge: true };
    const asked = await SmsReader.requestSmsPermission();
    return { granted: asked.granted, bridge: true };
  } catch {
    return { granted: false, bridge: true };
  }
}

export async function readInboxSms(limit = 200, sinceDays = 45): Promise<SmsMessage[]> {
  const since = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const res = await SmsReader.readInbox({ limit, since });
  return res.messages || [];
}

export type SpendDirection = 'debit' | 'credit' | 'unknown';

export interface SpendCandidate {
  smsId: string;
  amount: number;
  direction: SpendDirection;
  accountLast4?: string;
  merchant?: string;
  sender: string;
  date: string; // YYYY-MM-DD
  body: string;
}

const AMOUNT_RE = /(?:rs\.?|inr|₹)\s?([\d,]+(?:\.\d{1,2})?)/gi;
const DEBIT_RE = /debited|debit\b|spent|paid|withdrawn|withdrawal|purchase|charged|transferred/i;
const CREDIT_RE = /credited|credit\b|received|refund|cashback|deposited/i;
const ACCOUNT_RE = /(?:a\/c|ac\b|account|acct|card|xx|x{2,}|ending|no\.?)\s?[^\d]{0,8}(\d{4})/i;
const MERCHANT_RE = /(?:\bat\b|\btowards\b|\bto\b)\s+([A-Za-z0-9 .&'_-]{2,32}?)(?:\s+on\s|\s+dated|\s+for\s|,\s*|\s*\.|\s*$)/i;

function parseAmount(raw: string): number {
  return Number(raw.replace(/,/g, ''));
}

function pickAmount(body: string): number {
  AMOUNT_RE.lastIndex = 0;
  const matches: { value: number; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = AMOUNT_RE.exec(body)) !== null) {
    const v = parseAmount(m[1]);
    if (Number.isFinite(v) && v > 0) matches.push({ value: v, index: m.index });
  }
  if (matches.length === 0) return 0;
  if (matches.length === 1) return matches[0].value;
  // Multiple amounts (txn + balance): prefer the one nearest a debit/credit keyword.
  DEBIT_RE.lastIndex = 0;
  CREDIT_RE.lastIndex = 0;
  const dk = DEBIT_RE.exec(body);
  const ck = CREDIT_RE.exec(body);
  const anchor = Math.min(
    dk ? dk.index : Number.MAX_SAFE_INTEGER,
    ck ? ck.index : Number.MAX_SAFE_INTEGER
  );
  if (!Number.isFinite(anchor) || anchor === Number.MAX_SAFE_INTEGER) return matches[0].value;
  let best = matches[0];
  for (const c of matches) {
    if (Math.abs(c.index - anchor) < Math.abs(best.index - anchor)) best = c;
  }
  return best.value;
}

/** Parse one bank/UPI SMS into a spend candidate. Pure string logic, on-device. */
export function parseSmsBody(msg: SmsMessage): SpendCandidate | null {
  const body = msg.body || '';
  const amount = pickAmount(body);
  if (!amount) return null;

  DEBIT_RE.lastIndex = 0;
  CREDIT_RE.lastIndex = 0;
  const hasDebit = DEBIT_RE.test(body);
  CREDIT_RE.lastIndex = 0;
  const hasCredit = CREDIT_RE.test(body);
  const direction: SpendDirection =
    hasDebit && !hasCredit ? 'debit' : !hasDebit && hasCredit ? 'credit' : hasDebit ? 'debit' : 'unknown';

  const acc = ACCOUNT_RE.exec(body);
  const merch = MERCHANT_RE.exec(body.replace(/\s+/g, ' '));
  const d = new Date(msg.date);
  const dateStr = Number.isNaN(d.getTime())
    ? new Date().toISOString().split('T')[0]
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return {
    smsId: msg.id,
    amount,
    direction,
    accountLast4: acc ? acc[1] : undefined,
    merchant: merch ? merch[1].trim() : undefined,
    sender: msg.address || 'SMS',
    date: dateStr,
    body,
  };
}

/** Keep only money-out candidates not imported before. */
export function filterDebitCandidates(
  messages: SmsMessage[],
  importedIds: string[]
): { debits: SpendCandidate[]; skippedCredits: number } {
  const seen = new Set(importedIds);
  const debits: SpendCandidate[] = [];
  let skippedCredits = 0;
  for (const msg of messages) {
    if (seen.has(msg.id)) continue;
    const c = parseSmsBody(msg);
    if (!c) continue;
    if (c.direction === 'credit') {
      skippedCredits++;
      continue;
    }
    debits.push(c);
  }
  return { debits, skippedCredits };
}

export function suggestExpenseTitle(c: SpendCandidate): string {
  if (c.merchant) return c.merchant;
  const sender = (c.sender || '').replace(/^[A-Z]{2}-/, '');
  if (sender && !/^\d+$/.test(sender)) return sender;
  return 'SMS spend';
}
