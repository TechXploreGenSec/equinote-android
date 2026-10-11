import { registerPlugin, Capacitor } from '@capacitor/core';
import { ExpenseAccount } from '../types';

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
const DEBIT_RE = /debited|debit\b|\bdr\.?\b|spent|paid|withdrawn|withdrawal|purchase|charged|transferred/i;
const CREDIT_RE = /credited|credit\b|\bcr\.?\b|received|refund|cashback|deposited/i;
const OTP_RE = /\botp\b|one[\s-]?time[\s-]?password|verification code/i;
const ACCOUNT_RE = /(?:a\/c|ac\b|account|acct|card|xx|x{2,}|ending|no\.?)\s?[^\d]{0,8}(\d{4})/i;

/** Payee after to/at/towards — first ~3 words, e.g. "to Mr V GOKUL P:" -> "Mr V GOKUL". */
const TO_AT_RE = /\b(?:to|at|towards)\s+([A-Za-z][A-Za-z0-9 .&'_-]{1,48})/i;
const PAYEE_STOPS = [' on ', ' dated', ' for ', ' via ', ' upi', ' utr', ' ref', ' rr', ' with ', ' using ', ' from '];

export function extractPayee(body: string): string | undefined {
  const flat = body.replace(/\s+/g, ' ');
  TO_AT_RE.lastIndex = 0;
  const m = TO_AT_RE.exec(flat);
  if (!m) return undefined;
  let chunk = m[1];
  const punct = chunk.search(/[:;,.]/);
  if (punct >= 0) chunk = chunk.slice(0, punct);
  const low = ` ${chunk.toLowerCase()} `;
  for (const stop of PAYEE_STOPS) {
    const i = low.indexOf(stop);
    if (i > 1) {
      chunk = chunk.slice(0, i - 1);
      break;
    }
  }
  const words = chunk.trim().split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
  if (words.length === 0) return undefined;
  const name = words.slice(0, 3).join(' ');
  return name.length >= 2 ? name : undefined;
}

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
  // OTP / verification codes are never spends.
  OTP_RE.lastIndex = 0;
  if (OTP_RE.test(body)) return null;

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
  const merch = extractPayee(body);
  const d = new Date(msg.date);
  const dateStr = Number.isNaN(d.getTime())
    ? new Date().toISOString().split('T')[0]
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return {
    smsId: msg.id,
    amount,
    direction,
    accountLast4: acc ? acc[1] : undefined,
    merchant: merch || undefined,
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
  // Keep the name exactly as the SMS mentions it: merchant text first,
  // otherwise the raw sender id untouched (e.g. "JD-HDFCBK" stays as-is).
  if (c.merchant) return c.merchant;
  const sender = (c.sender || '').trim();
  if (sender && !/^\d+$/.test(sender)) return sender;
  return 'SMS spend';
}

const GENERIC_BANK_WORDS = new Set(['bank', 'of', 'the', 'and', 'a']);

function splitSenderIds(raw?: string): string[] {
  return (raw || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length >= 3);
}

function bankNameTokens(bankName?: string): string[] {
  return (bankName || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !GENERIC_BANK_WORDS.has(t));
}

/** True when the user configured any bank filter on any account. */
export function hasUserBankFilters(accounts: ExpenseAccount[]): boolean {
  return accounts.some(
    (a) =>
      splitSenderIds(a.senderIds).length > 0 ||
      (a.last4 || '').trim().length === 4 ||
      bankNameTokens(a.bankName).length > 0
  );
}

export interface BankMatch {
  candidate: SpendCandidate;
  /** Account auto-matched by sender id / last-4, if any. */
  accountId?: string;
}

/**
 * Keep only candidates from the user's own banks:
 * sender-id hit, last-4 hit, or bank-name token in the sender id.
 * Everything else is reported as filtered-out noise.
 */
export function filterByUserBanks(
  candidates: SpendCandidate[],
  accounts: ExpenseAccount[]
): { mine: BankMatch[]; others: number; filtered: boolean } {
  if (!hasUserBankFilters(accounts)) {
    return { mine: candidates.map((candidate) => ({ candidate })), others: 0, filtered: false };
  }
  const mine: BankMatch[] = [];
  let others = 0;
  for (const candidate of candidates) {
    const senderU = (candidate.sender || '').toUpperCase();
    let accountId: string | undefined;
    let matched = false;

    for (const acc of accounts) {
      const ids = splitSenderIds(acc.senderIds);
      if (ids.some((id) => senderU.includes(id))) {
        matched = true;
        accountId = accountId || acc.id;
      }
      const last4 = (acc.last4 || '').trim();
      if (!matched && last4.length === 4 && candidate.accountLast4 === last4) {
        matched = true;
        accountId = acc.id;
      }
      if (!matched) {
        const tokens = bankNameTokens(acc.bankName);
        if (tokens.some((t) => senderU.includes(t.toUpperCase()))) {
          matched = true;
          accountId = accountId || acc.id;
        }
      }
      if (matched && accountId) break;
    }

    if (matched) mine.push({ candidate, accountId });
    else others++;
  }
  return { mine, others, filtered: true };
}
