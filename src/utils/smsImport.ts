import { registerPlugin, Capacitor } from '@capacitor/core';
import { ExpenseAccount } from '../types';
import { todayStr, monthStartMillis } from './datetime';
import { brandOfSender, senderIdsForBankName } from './bankDirectory';

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

/** Inbox scan for the current calendar month only (1st → today, India time). */
export async function readInboxSmsThisMonth(limit = 300): Promise<SmsMessage[]> {
  const res = await SmsReader.readInbox({ limit, since: monthStartMillis() });
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
// Ads/offers: amount present but no money-movement signal -> not a spend.
const PROMO_RE = /% off|discount|sale is|mega sale|limited period|hurry|grab the deal|apply now to get|click here to (buy|shop|avail)|promo(code)?|advertisement|recharge with|recharge now|extra data|plan.*validity|dth.*recharge|offer valid|t&c apply/i;
const TXN_SIGNAL_RE = /debited|credited|\bdr\.?\b|\bcr\.?\b|spent|paid|withdraw|purchase|upi|txn|transaction|neft|imps|rtgs|nach|mandate|\ba\/c\b|account|card|xx\d|x{2,}\d|balance|\bavl\b|available|statement|\bdue\b|bill|emi/i;

/**
 * Deterministic payee/sender extraction tuned for real Indian bank/UPI SMS.
 * Handles: "to V GOKUL", "towards SWIGGY", "paid to ZOMATO", "at DMART",
 * "UPI/P2A/1234/Payment from THAAMU", "UPI/5678/RECVD FROM ARUN",
 * "by NEFT from SALARY", "from A/c .. THAAMU", card "spent at AMAZON".
 * Returns the name EXACTLY as written (upper-case preserved), ≤ 4 words.
 */
const UPI_SEG_RE = /UPI\/[^/\s]*\/[^/\s]*\/([A-Za-z0-9 .&'_-]{2,48})/i;
const RECEIVED_FROM_RE = /\b(?:recvd|received|recevied)\s+from\s+([A-Za-z][A-Za-z0-9 .&'_-]{1,48})/i;
const PAID_TO_RE = /\bpaid\s+to\s+([A-Za-z][A-Za-z0-9 .&'_-]{1,48})/i;
const TRANSFER_TO_RE = /\btransfer(?:red)?\s+to\s+([A-Za-z][A-Za-z0-9 .&'_-]{1,48})/i;
const TO_AT_RE = /\b(?:to|towards|at)\s+([A-Za-z][A-Za-z0-9 .&'_-]{1,48})/i;
const FROM_RE = /\bfrom\s+([A-Za-z][A-Za-z0-9 .&'_-]{1,48})/i;
const VPA_RE = /\bto\s+VPA\s+([A-Za-z0-9._-]{2,48}(?:@[A-Za-z]{2,})?)/i;
const PAYEE_STOPS = [' on ', ' dated', ' for ', ' via ', ' upi', ' utr', ' ref', ' rr', ' with ', ' using ', ' from ', ' by ', ' neft', ' imps', ' rtgs', ' nach', ' txn', ' transaction', ' ibill', ' bill ', ' to ', ' rs ', ' inr ', ' credited ', ' debited ', ' a/c ', ' ac ', ' account ', ' card '];

function cleanPayeeChunk(raw: string): string | undefined {
  // A UPI narration segment sometimes embeds the real payee after "from"
  // ("UPI/P2A/123/Payment from THAAMU Rs 1500") — prefer that tail.
  const fromTail = raw.split(/\bfrom\b/i);
  let chunk = (fromTail.length > 1 ? fromTail[fromTail.length - 1] : raw).trim();
  // Cut at first hard punctuation.
  const punct = chunk.search(/[:;,.()]/);
  if (punct >= 0) chunk = chunk.slice(0, punct);
  // Cut at the EARLIEST stop-word boundary (not first-in-list).
  const low = ` ${chunk.toLowerCase()} `;
  let cut = -1;
  for (const stop of PAYEE_STOPS) {
    const i = low.indexOf(stop);
    if (i > 1 && (cut < 0 || i < cut)) cut = i;
  }
  if (cut > 1) chunk = chunk.slice(0, cut - 1).trim();
  // Drop leading titles/noise words but keep the real name.
  chunk = chunk.replace(/^(?:mr|mrs|ms|shri|smt|a\/c|ac|account|card|upi|vpa)\s+/i, '').trim();
  const words = chunk.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
  // Drop trailing pure numbers (UTR fragments, dates).
  while (words.length > 0 && /^\d+$/.test(words[words.length - 1])) words.pop();
  if (words.length === 0) return undefined;
  const name = words.slice(0, 4).join(' ');
  if (name.length < 2) return undefined;
  // Reject bank-noise captures ("HDFC Bank", "A/c XX4821", "UPI transaction").
  if (/^(?:hdfc|sbi|icici|axis|kotak|pnb|bob|canara|union|idbi|yes|bank|upi|neft|imps|rtgs|emi|bill)\b/i.test(name) && words.length <= 2) {
    return undefined;
  }
  return name;
}

export function extractPayee(body: string): string | undefined {
  const flat = body.replace(/\s+/g, ' ');
  const patterns = [VPA_RE, PAID_TO_RE, RECEIVED_FROM_RE, TRANSFER_TO_RE, UPI_SEG_RE, TO_AT_RE, FROM_RE];
  for (const re of patterns) {
    re.lastIndex = 0;
    const m = re.exec(flat);
    if (!m || !m[1]) continue;
    const cleaned = cleanPayeeChunk(m[1]);
    if (cleaned) return cleaned;
  }
  return undefined;
}

/** Stronger on-device direction detection (used to anchor/validate the AI). */
export function detectDirection(body: string): 'out' | 'in' | 'unknown' {
  const b = body.toLowerCase();
  const outHit = /\bdebited\b|\bdebit\b|\bspent\b|\bpaid\b|\bwithdrawn?\b|\bwithdrawal\b|\bpurchase\b|\bcharged\b|\btransferred\b|\bemi\b.*\bdebit/.test(b);
  const inHit = /\bcredited\b|\bcredit\b|\breceived\b|\brecvd\b|\bdeposited\b|\brefund\b|\bcashback\b|\bamount received\b|\bpayment received\b/.test(b);
  if (outHit && !inHit) return 'out';
  if (inHit && !outHit) return 'in';
  if (outHit && inHit) {
    // Both verbs present (rare) — the verb nearest the amount wins.
    const amtIdx = b.search(/rs\.?|inr|₹/);
    const outIdx = b.search(/debited|debit|spent|paid|withdraw|purchase|charged|transferred/);
    const inIdx = b.search(/credited|credit|received|recvd|deposited|refund|cashback/);
    if (amtIdx >= 0 && outIdx >= 0 && inIdx >= 0) {
      return Math.abs(outIdx - amtIdx) <= Math.abs(inIdx - amtIdx) ? 'out' : 'in';
    }
    return 'out';
  }
  return 'unknown';
}

type MerchantCat = import('../types').ExpenseCategory;

const MERCHANT_CATEGORY_HINTS: { cat: MerchantCat; keys: string[] }[] = [
  { cat: 'food', keys: ['swiggy', 'zomato', 'dominos', 'pizza', 'kfc', 'mcdonald', 'restaurant', 'hotel', 'canteen', 'dhaba', 'bakery', 'cafe', 'food'] },
  { cat: 'travel', keys: ['uber', 'ola', 'rapido', 'irctc', 'redbus', 'makemytrip', 'indigo', 'spicejet', 'airtel', 'petrol', 'diesel', 'fuel', 'fastag', 'metro', 'cab', 'flight'] },
  { cat: 'shopping', keys: ['amazon', 'flipkart', 'myntra', 'dmart', 'reliance', 'bigbasket', 'blinkit', 'zepto', 'decathlon', 'shopping', 'store', 'mart', 'mall'] },
  { cat: 'bills', keys: ['jio', 'airtel', 'vi ', 'vodafone', 'bsnl', 'electricity', 'bescom', 'tneb', 'tata power', 'gas', 'water', 'broadband', 'recharge', 'bill', 'emi', 'loan', 'insurance', 'rent'] },
  { cat: 'health', keys: ['apollo', 'pharmacy', 'medical', 'hospital', 'clinic', 'diagnostic', 'pharmeasy', 'netmeds', 'doctor'] },
  { cat: 'fun', keys: ['bookmyshow', 'pvr', 'inox', 'netflix', 'prime', 'hotstar', 'spotify', 'movie', 'game', 'entertainment'] },
];

/** Guess a category from merchant/name/body text. Defaults to 'other'. */
export function inferCategory(merchant?: string, body?: string): MerchantCat {
  const hay = `${merchant || ''} ${body || ''}`.toLowerCase();
  for (const { cat, keys } of MERCHANT_CATEGORY_HINTS) {
    if (keys.some((k) => hay.includes(k))) return cat;
  }
  return 'other';
}

const PERSON_HINT_RE = /^[A-Z][A-Z .]{2,30}$|upi.*person|payment from [a-z]/i;

/**
 * Offline fallback reason when the AI is unreachable or returns junk.
 * Person names → transfer phrasing; known merchants → what was bought.
 */
export function fallbackReason(name: string | undefined, direction: 'out' | 'in', body: string): string {
  const n = (name || '').toUpperCase();
  const b = body.toLowerCase();
  if (direction === 'in') {
    if (/salary|sal\b/.test(b)) return 'monthly salary credit';
    if (/refund|cashback/.test(b)) return 'refund received';
    if (/interest|dividend/.test(b)) return 'interest payout received';
    if (n && PERSON_HINT_RE.test(n)) return `received from person ${n.toLowerCase()}`;
    if (n) return `received from ${n.toLowerCase()}`;
    return 'money received';
  }
  if (/swiggy|zomato|dominos|kfc|pizza|restaurant|hotel|canteen|food|cafe|dhaba/i.test(`${n} ${b}`)) return 'food delivery order';
  if (/uber|ola|rapido|irctc|redbus|flight|metro|cab|fuel|petrol|fastag/i.test(`${n} ${b}`)) return 'travel ride booking';
  if (/amazon|flipkart|myntra|dmart|shopping|store|mart|mall|bigbasket|blinkit/i.test(`${n} ${b}`)) return 'online shopping order';
  if (/jio|airtel|recharge|electricity|gas|water|broadband|bill|insurance|rent/i.test(`${n} ${b}`)) return 'bill payment';
  if (/emi|loan|bajaj|hdfc.*loan/i.test(b)) return 'loan emi payment';
  if (/apollo|pharmacy|medical|hospital|clinic|doctor/i.test(`${n} ${b}`)) return 'medical expense';
  if (/bookmyshow|pvr|netflix|movie|prime|hotstar/i.test(`${n} ${b}`)) return 'entertainment booking';
  if (n && /^[A-Z][A-Z .]*$/.test(n) && n.split(' ').length <= 3) return `upi transfer to person ${n.toLowerCase()}`;
  if (n) return `paid to ${n.toLowerCase()}`;
  return 'upi payment';
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
  // Promotional noise ("50% off, recharge now!") is never a spend.
  PROMO_RE.lastIndex = 0;
  if (PROMO_RE.test(body)) return null;

  const amount = pickAmount(body);
  if (!amount) return null;

  DEBIT_RE.lastIndex = 0;
  CREDIT_RE.lastIndex = 0;
  const hasDebit = DEBIT_RE.test(body);
  CREDIT_RE.lastIndex = 0;
  const hasCredit = CREDIT_RE.test(body);
  const direction: SpendDirection =
    hasDebit && !hasCredit ? 'debit' : !hasDebit && hasCredit ? 'credit' : hasDebit ? 'debit' : 'unknown';
  if (direction === 'unknown') {
    // Amount without any money-movement signal (e.g. ads) -> skip.
    TXN_SIGNAL_RE.lastIndex = 0;
    if (!TXN_SIGNAL_RE.test(body)) return null;
  }

  const acc = ACCOUNT_RE.exec(body);
  const merch = extractPayee(body);
  const d = new Date(msg.date);
  const dateStr = Number.isNaN(d.getTime())
    ? todayStr()
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

/** All bank-transaction candidates (in + out) not imported before — for AI analysis. */
export function collectTransactionCandidates(
  messages: SmsMessage[],
  importedIds: string[]
): { candidates: SpendCandidate[]; bodies: Map<string, string> } {
  const seen = new Set(importedIds);
  const candidates: SpendCandidate[] = [];
  const bodies = new Map<string, string>();
  for (const msg of messages) {
    if (seen.has(msg.id)) continue;
    const c = parseSmsBody(msg);
    if (!c) continue;
    candidates.push(c);
    bodies.set(msg.id, msg.body || '');
  }
  return { candidates, bodies };
}

export function suggestExpenseTitle(c: Pick<SpendCandidate, 'merchant' | 'sender'>): string {
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

/** Explicit sender ids + directory-implied ids from the account's bank name. */
function accountSenderIds(acc: ExpenseAccount): string[] {
  const ids = new Set(splitSenderIds(acc.senderIds));
  for (const implied of senderIdsForBankName(acc.bankName)) ids.add(implied);
  return [...ids];
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
    const brand = brandOfSender(candidate.sender);
    let accountId: string | undefined;
    let matched = false;

    for (const acc of accounts) {
      // Sender-id hit against the normalized brand token too
      // (JD-HDFCBK-S and JD-HDFCBK both match HDFCBK).
      const ids = accountSenderIds(acc);
      if (ids.some((id) => brand.includes(id) || id.includes(brand) && brand.length >= 4)) {
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
        if (tokens.some((t) => brand.includes(t.toUpperCase()))) {
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
