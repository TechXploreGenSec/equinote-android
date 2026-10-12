/**
 * Bank / UPI statement CSV import — the fast non-SMS tracking path.
 * Works fully offline: download the statement from your bank / GPay /
 * PhonePe / Paytm app, then import the CSV here. No account linking,
 * no network, file never leaves the phone.
 *
 * Accepted shapes (headers case-insensitive, extra columns ignored):
 *   Date, Description/Narration/Particulars, Amount, Type/DrCr/DebitCredit
 *   Date, Description, Debit, Credit          (separate money-out/in columns)
 *   Date, Description, Withdrawal, Deposit
 *
 * Amounts may carry ₹, commas, and Dr/Cr or +/- suffixes.
 * Dates: YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, DD-Mon-YYYY, "12 Oct 2026".
 */
import { extractPayee, detectDirection, inferCategory, fallbackReason } from './smsImport';
import type { ExpenseCategory } from '../types';

export interface StatementRow {
  title: string;
  amount: number;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  reason: string;
  direction: 'out' | 'in';
}

export interface StatementParse {
  rows: StatementRow[];
  skipped: number;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** Parse common Indian statement date formats to YYYY-MM-DD. Null when unreadable. */
export function parseStatementDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    let y = m[3];
    if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]*(\d{2,4})/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!mon) return null;
    let y = m[3];
    if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
    return `${y}-${mon}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function parseAmountCell(raw: string): { amount: number; sign: 0 | 1 | -1 } {
  const s = raw.replace(/[₹\s,]/g, '');
  const low = raw.toLowerCase();
  let sign: 0 | 1 | -1 = 0;
  if (/\bdr\b|debit|withdrawal|paid/.test(low) || s.startsWith('-')) sign = -1;
  else if (/\bcr\b|credit|deposit|received/.test(low) || s.startsWith('+')) sign = 1;
  const num = Number(s.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(num) || num <= 0) return { amount: 0, sign: 0 };
  return { amount: num, sign };
}

export function parseSpendsCsv(csvText: string): StatementParse {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], skipped: 0 };
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = header.findIndex((h) => h === n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iDate = idx(['date', 'txn date', 'transaction date', 'value date']);
  const iDesc = idx(['description', 'narration', 'particulars', 'remarks', 'details', 'transaction remarks']);
  const iAmt = idx(['amount', 'transaction amount', 'txn amount']);
  const iType = idx(['type', 'dr/cr', 'drcr', 'debit/credit', 'debit credit', 'transaction type']);
  const iDebit = idx(['debit', 'withdrawal', 'money out', 'paid out']);
  const iCredit = idx(['credit', 'deposit', 'money in', 'received']);
  if (iDate < 0 || iDesc < 0 || (iAmt < 0 && (iDebit < 0 || iCredit < 0))) {
    return { rows: [], skipped: lines.length - 1 };
  }

  const rows: StatementRow[] = [];
  let skipped = 0;
  for (let r = 1; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r]);
    const date = parseStatementDate(cols[iDate] || '');
    const narration = (cols[iDesc] || '').trim();
    if (!date || !narration) {
      skipped++;
      continue;
    }
    let amount = 0;
    let direction: 'out' | 'in' = 'out';
    if (iAmt >= 0) {
      const parsed = parseAmountCell(cols[iAmt] || '');
      if (!parsed.amount) {
        skipped++;
        continue;
      }
      amount = parsed.amount;
      const typeCell = (iType >= 0 ? cols[iType] : '').toLowerCase();
      if (parsed.sign !== 0) direction = parsed.sign < 0 ? 'out' : 'in';
      else if (/\bcr\b|credit|deposit|received|\bin\b/.test(typeCell)) direction = 'in';
      else if (/\bdr\b|debit|withdrawal|paid|\bout\b/.test(typeCell)) direction = 'out';
      else {
        // No direction signal at all — infer from narration verbs, default out.
        direction = detectDirection(narration) === 'in' ? 'in' : 'out';
      }
    } else {
      const d = parseAmountCell(cols[iDebit] || '');
      const c = parseAmountCell(cols[iCredit] || '');
      if (d.amount && !c.amount) {
        amount = d.amount;
        direction = 'out';
      } else if (c.amount && !d.amount) {
        amount = c.amount;
        direction = 'in';
      } else {
        skipped++;
        continue;
      }
    }
    const name = extractPayee(narration) || narration.replace(/\s+/g, ' ').trim().slice(0, 40) || 'Statement entry';
    rows.push({
      title: name,
      amount,
      date,
      category: inferCategory(name, narration),
      reason: fallbackReason(name, direction, narration),
      direction,
    });
  }

  // Dedupe within the file (statements sometimes repeat rows across pages).
  const seen = new Set<string>();
  const unique = rows.filter((x) => {
    const k = `${x.date}|${x.amount}|${x.direction}|${x.title.toLowerCase()}`;
    if (seen.has(k)) {
      skipped++;
      return false;
    }
    seen.add(k);
    return true;
  });
  return { rows: unique, skipped };
}

export const SPENDS_CSV_EXAMPLE = [
  'Date,Description,Amount,Type',
  '2026-10-05,UPI/SWIGGY/412345678901 Paid to SWIGGY,499,Dr',
  '2026-10-01,NEFT SALARY MONTHLY CREDIT,85000,Cr',
  '05-10-2026,UPI/V GOKUL/987654321012 Transfer to V GOKUL,250,Dr',
].join('\n');
