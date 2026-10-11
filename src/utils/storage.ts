import { LoanItem, LoanCategory, PaymentRecord, UserSettings, AppNotification, ReminderItem, ExpenseAccount, ExpenseItem } from '../types';
import { calculateEmi, calculatePrincipalFromEmi } from './finance';
import { monthPrefix as monthPrefixIST } from './datetime';

const STORAGE_KEYS = {
  LOANS: 'equinote_loans_v1',
  PAYMENTS: 'equinote_payments_v1',
  SETTINGS: 'equinote_settings_v1',
  NOTIFICATIONS: 'equinote_notifications_v1',
  REMINDERS: 'equinote_reminders_v1',
  ACCOUNTS: 'equinote_accounts_v1',
  EXPENSES: 'equinote_expenses_v1',
  IMPORTED_SMS: 'equinote_sms_imported_v1',
  MIGRATED_V3: 'equinote_migrated_v3',
};

export const DEFAULT_SETTINGS: UserSettings = {
  currency: 'INR',
  currencySymbol: '₹',
  monthlyIncome: 125000,
  notificationLeadDays: 3,
  notificationTime: '09:00',
  notificationsEnabled: true,
  soundEnabled: true,
  userName: '',
  groqApiKey: '',
  groqModel: 'llama-3.3-70b-versatile',
};

// v3: no sample / temp data. Fresh installs start empty.
// Known demo ids shipped in v1/v2 — removed once via migrateV3SampleData().
const LEGACY_SAMPLE_LOAN_IDS = ['loan-1', 'loan-2', 'loan-3', 'loan-4'];
const LEGACY_SAMPLE_PAYMENT_IDS = ['pay-1', 'pay-2', 'pay-3'];

// Helper to load or initialize (v3: starts empty, no sample data)
export function loadLoans(): LoanItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOANS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify([]));
      return [];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveLoans(loans: LoanItem[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(loans));
  } catch (e) {
    console.error('Failed to save loans to localStorage', e);
  }
}

export function loadPayments(): PaymentRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PAYMENTS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify([]));
      return [];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function savePayments(payments: PaymentRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(payments));
  } catch (e) {
    console.error('Failed to save payments', e);
  }
}

export function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
      return DEFAULT_SETTINGS;
    }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: UserSettings) {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings', e);
  }
}

export function loadNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveNotifications(notifications: AppNotification[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
  } catch (e) {
    console.error('Failed to save notifications', e);
  }
}

/**
 * v3 one-time migration: strip the v1/v2 bundled demo loans & payments
 * (loan-1..4 / pay-1..3) while keeping anything the user added themselves.
 */
export function migrateV3SampleData(): { removedLoans: number; removedPayments: number } {
  try {
    if (localStorage.getItem(STORAGE_KEYS.MIGRATED_V3) === 'done') {
      return { removedLoans: 0, removedPayments: 0 };
    }
    let removedLoans = 0;
    let removedPayments = 0;
    try {
      const loans: LoanItem[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOANS) || '[]');
      const kept = loans.filter((l) => !LEGACY_SAMPLE_LOAN_IDS.includes(l.id));
      removedLoans = loans.length - kept.length;
      localStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(kept));
    } catch {
      /* ignore */
    }
    try {
      const payments: PaymentRecord[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PAYMENTS) || '[]');
      const kept = payments.filter((p) => !LEGACY_SAMPLE_PAYMENT_IDS.includes(p.id));
      removedPayments = payments.length - kept.length;
      localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(kept));
    } catch {
      /* ignore */
    }
    localStorage.setItem(STORAGE_KEYS.MIGRATED_V3, 'done');
    return { removedLoans, removedPayments };
  } catch {
    return { removedLoans: 0, removedPayments: 0 };
  }
}

// ---- One-time pay reminders (credit-card bills, friend borrows, etc.) ----

export function loadReminders(): ReminderItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.REMINDERS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.REMINDERS, JSON.stringify([]));
      return [];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveReminders(reminders: ReminderItem[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.REMINDERS, JSON.stringify(reminders));
  } catch (e) {
    console.error('Failed to save reminders', e);
  }
}

export function currentMonthYear(date?: Date): string {
  return monthPrefixIST(date);
}

export function nextMonthYear(date?: Date): string {
  const base = monthPrefixIST(date);
  const [y, m] = base.split('-').map(Number);
  const d = new Date(y, m, 1); // month is 1-indexed here -> next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ---- Expense accounts & daily spends ----

export function loadAccounts(): ExpenseAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify([]));
      return [];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveAccounts(accounts: ExpenseAccount[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
  } catch (e) {
    console.error('Failed to save accounts', e);
  }
}

export function loadExpenses(): ExpenseItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.EXPENSES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify([]));
      return [];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveExpenses(expenses: ExpenseItem[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
  } catch (e) {
    console.error('Failed to save expenses', e);
  }
}

export function loadImportedSmsIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.IMPORTED_SMS) || '[]');
  } catch {
    return [];
  }
}

export function saveImportedSmsIds(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.IMPORTED_SMS, JSON.stringify(ids));
  } catch (e) {
    console.error('Failed to save imported SMS ids', e);
  }
}

export interface DueCalculation {
  dueDate: Date;
  dueDateString: string;
  daysRemaining: number;
  status: 'paid_this_month' | 'overdue' | 'due_today' | 'due_soon' | 'upcoming';
  statusText: string;
}

export function calculateDueStatus(loan: LoanItem, referenceDate: Date = new Date()): DueCalculation {
  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth(); // 0-indexed
  const todayDate = referenceDate.getDate();

  const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
  const isPaidThisMonth = loan.lastPaidMonthYear === currentMonthStr;

  if (isPaidThisMonth) {
    // Next due is in next month
    const nextMonthDate = new Date(currentYear, currentMonth + 1, Math.min(loan.dueDay, 28));
    const diffTime = nextMonthDate.getTime() - referenceDate.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return {
      dueDate: nextMonthDate,
      dueDateString: nextMonthDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      daysRemaining,
      status: 'paid_this_month',
      statusText: 'Paid for this month',
    };
  }

  // Not paid this month
  const targetDueDate = new Date(currentYear, currentMonth, Math.min(loan.dueDay, 28));
  
  if (todayDate > loan.dueDay) {
    const overdueDays = todayDate - loan.dueDay;
    return {
      dueDate: targetDueDate,
      dueDateString: targetDueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      daysRemaining: -overdueDays,
      status: 'overdue',
      statusText: `Overdue by ${overdueDays} day${overdueDays > 1 ? 's' : ''}`,
    };
  } else if (todayDate === loan.dueDay) {
    return {
      dueDate: targetDueDate,
      dueDateString: targetDueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      daysRemaining: 0,
      status: 'due_today',
      statusText: 'Due Today',
    };
  } else {
    const daysLeft = loan.dueDay - todayDate;
    const status = daysLeft <= 3 ? 'due_soon' : 'upcoming';
    const statusText = daysLeft === 1 ? 'Due tomorrow' : `Due in ${daysLeft} days`;

    return {
      dueDate: targetDueDate,
      dueDateString: targetDueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      daysRemaining: daysLeft,
      status,
      statusText,
    };
  }
}

// Export and Import JSON
export function exportAppData(): string {
  const data = {
    version: '3.0',
    exportDate: new Date().toISOString(),
    loans: loadLoans(),
    payments: loadPayments(),
    reminders: loadReminders(),
    accounts: loadAccounts(),
    expenses: loadExpenses(),
    settings: loadSettings(),
  };
  return JSON.stringify(data, null, 2);
}

export function importAppData(jsonString: string): boolean {
  try {
    const parsed = JSON.parse(jsonString);
    if (Array.isArray(parsed.loans)) {
      saveLoans(parsed.loans);
    }
    if (Array.isArray(parsed.payments)) {
      savePayments(parsed.payments);
    }
    if (Array.isArray(parsed.reminders)) {
      saveReminders(parsed.reminders);
    }
    if (Array.isArray(parsed.accounts)) {
      saveAccounts(parsed.accounts);
    }
    if (Array.isArray(parsed.expenses)) {
      saveExpenses(parsed.expenses);
    }
    if (parsed.settings) {
      saveSettings(parsed.settings);
    }
    return true;
  } catch (e) {
    console.error('Import failed', e);
    return false;
  }
}

// Export payments to CSV
export function exportPaymentsCsv(payments: PaymentRecord[]): string {
  const headers = ['Payment ID', 'Loan Title', 'Amount', 'Date', 'Month-Year', 'Installment #', 'Payment Mode', 'Reference ID', 'Notes'];
  const rows = payments.map(p => [
    `"${p.id}"`,
    `"${p.loanTitle.replace(/"/g, '""')}"`,
    p.amount,
    `"${p.paidDate}"`,
    `"${p.monthYear}"`,
    p.installmentNumber,
    `"${p.paymentMode || ''}"`,
    `"${p.transactionRef || ''}"`,
    `"${(p.note || '').replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

export const PAYMENTS_CSV_EXAMPLE = [
  'Loan Title,Amount,Date,Month-Year,Installment #,Payment Mode,Reference ID,Notes',
  '"HDFC Home Loan",36240,2026-10-05,2026-10,43,Auto-Debit,TXN-100231,October EMI cleared on schedule',
  '"HDFC Home Loan",36240,2026-11-05,2026-11,44,Auto-Debit,TXN-100884,November EMI cleared on schedule',
  '"SBI Credit Card Bill",18450,2026-10-12,2026-10,,Credit Card,CC-STMT-1026,Full statement paid',
].join('\n');

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

export interface CsvImportResult {
  records: PaymentRecord[];
  imported: number;
  skipped: number;
}

/**
 * Parse a bulk-upload CSV of payment records. Matches each row to an
 * existing loan by Loan Title (case-insensitive) or loan id.
 * Columns: Loan Title*, Amount*, Date*, Month-Year, Installment #,
 * Payment Mode, Reference ID, Notes (*required).
 */
export function parsePaymentsCsv(csvText: string, loans: LoanItem[]): CsvImportResult {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { records: [], imported: 0, skipped: 0 };

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = header.findIndex((h) => h === n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iTitle = idx(['loan title', 'loan', 'title']);
  const iAmount = idx(['amount', 'paid amount']);
  const iDate = idx(['date', 'paid date', 'paiddate']);
  const iMonth = idx(['month-year', 'month year', 'monthyear', 'month']);
  const iInst = idx(['installment #', 'installment', 'installment no', 'inst']);
  const iMode = idx(['payment mode', 'mode']);
  const iRef = idx(['reference id', 'reference', 'transaction ref', 'utr', 'transaction id']);
  const iNote = idx(['notes', 'note', 'remarks']);

  const records: PaymentRecord[] = [];
  let skipped = 0;

  for (let r = 1; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r]);
    const title = (iTitle >= 0 ? cols[iTitle] : '').trim();
    const amount = Number(iAmount >= 0 ? cols[iAmount] : NaN);
    const paidDate = (iDate >= 0 ? cols[iDate] : '').trim();
    if (!title || !Number.isFinite(amount) || amount <= 0 || !paidDate) {
      skipped++;
      continue;
    }
    const loan = loans.find(
      (l) => l.title.toLowerCase() === title.toLowerCase() || l.id.toLowerCase() === title.toLowerCase()
    );
    if (!loan) {
      skipped++;
      continue;
    }
    const d = new Date(paidDate);
    const monthYear =
      iMonth >= 0 && cols[iMonth]
        ? cols[iMonth].trim()
        : !Number.isNaN(d.getTime())
          ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          : currentMonthYear();
    const installmentNumber =
      iInst >= 0 && cols[iInst] ? Number(cols[iInst]) || loan.paidMonths + 1 : loan.paidMonths + 1;
    records.push({
      id: `pay-${Date.now()}-${r}`,
      loanId: loan.id,
      loanTitle: loan.title,
      amount,
      paidDate,
      monthYear,
      installmentNumber,
      paymentMode: iMode >= 0 ? cols[iMode] || 'Manual' : 'Manual',
      transactionRef: iRef >= 0 ? cols[iRef] || '' : '',
      note: iNote >= 0 ? cols[iNote] || '' : '',
    });
  }

  return { records, imported: records.length, skipped };
}

export const LOANS_CSV_EXAMPLE = [
  'Title,Lender,Category,Principal,Interest Rate,Tenure Months,Paid Months,Monthly EMI,Due Day,Start Date,Account Number,Auto-Debit,Notes,Paid This Month',
  '"HDFC Home Loan",HDFC Bank,home,4200000,8.4,240,42,,5,2023-04-05,HL-0988472911,Salary Account (HDFC),Tax exemption under Sec 24b and 80C,yes',
  '"Creta SX Auto Loan",State Bank of India,vehicle,950000,8.75,60,22,,15,2024-12-15,AL-SBI-558291,SBI Savings Acc,Need Form 35 on settlement,no',
  '"Laptop No-Cost EMI",Bajaj Finserv,gadget,90000,0,12,3,7500,12,2026-08-12,,,Brand subvention EMI,yes',
].join('\n');

const LOAN_CATEGORIES: LoanCategory[] = [
  'home', 'vehicle', 'gadget', 'personal', 'credit_card',
  'education', 'bnpl', 'peer', 'business',
];

// Human-readable labels (as shown in the app) also accepted in CSVs.
const LOAN_CATEGORY_LABELS: Record<string, LoanCategory> = {
  'home loan': 'home',
  'auto / vehicle': 'vehicle',
  'auto': 'vehicle',
  'vehicle': 'vehicle',
  'gadgets & tech': 'gadget',
  'gadgets': 'gadget',
  'gadget': 'gadget',
  'card emi / loan': 'credit_card',
  'credit card': 'credit_card',
  'personal loan': 'personal',
  'personal': 'personal',
  'education loan': 'education',
  'education': 'education',
  'bnpl / pay later': 'bnpl',
  'bnpl': 'bnpl',
  'pay later': 'bnpl',
  'peer / family': 'peer',
  'peer': 'peer',
  'family': 'peer',
  'friend': 'peer',
  'business / sme': 'business',
  'business': 'business',
};

export function normalizeLoanCategory(raw: string): LoanCategory {
  const key = raw.trim().toLowerCase();
  if (LOAN_CATEGORIES.includes(key as LoanCategory)) return key as LoanCategory;
  return LOAN_CATEGORY_LABELS[key] || 'personal';
}

export interface LoanCsvImportResult {
  loans: LoanItem[];
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * Parse a bulk-upload CSV of loans. Columns: Title*, Lender*, Category
 * (key or label, e.g. "peer" or "Peer / Family"), Principal* (blank = derived
 * from EMI + rate + tenure), Interest Rate, Tenure Months*, Paid Months,
 * Monthly EMI (blank = auto-calculated), Due Day*, Start Date,
 * Account Number, Auto-Debit, Notes, Paid This Month (yes/no) (*required
 * unless derivable).
 */
export function parseLoansCsv(csvText: string): LoanCsvImportResult {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { loans: [], imported: 0, skipped: 0, errors: ['CSV has no data rows.'] };

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = header.findIndex((h) => h === n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iTitle = idx(['title', 'loan title', 'loan', 'name']);
  const iLender = idx(['lender', 'bank', 'platform']);
  const iCat = idx(['category', 'type']);
  const iPrincipal = idx(['principal', 'principal amount', 'amount', 'total principal']);
  const iRate = idx(['interest rate', 'rate', 'interest', 'annual rate']);
  const iTenure = idx(['tenure months', 'tenure', 'total months', 'months']);
  const iPaid = idx(['paid months', 'already paid', 'paid']);
  const iEmi = idx(['monthly emi', 'emi']);
  const iDue = idx(['due day', 'due date day', 'due']);
  const iStart = idx(['start date', 'start', 'date']);
  const iAcc = idx(['account number', 'account', 'agreement']);
  const iDebit = idx(['auto-debit', 'auto debit', 'auto-debit account', 'mandate']);
  const iNotes = idx(['notes', 'note', 'remarks']);
  const iPaidMonth = idx(['paid this month', 'this month paid', 'current month paid']);

  const loans: LoanItem[] = [];
  let skipped = 0;
  const errors: string[] = [];
  const now = new Date();
  const monthStr = currentMonthYear(now);
  const noteError = (row: number, reason: string) => {
    skipped++;
    if (errors.length < 5) errors.push(`Row ${row}: ${reason}.`);
  };

  for (let r = 1; r < lines.length; r++) {
    const rowNum = r + 1;
    const cols = splitCsvLine(lines[r]);
    const title = (iTitle >= 0 ? cols[iTitle] : '').trim();
    const lender = (iLender >= 0 ? cols[iLender] : '').trim();
    if (!title || !lender) {
      noteError(rowNum, 'missing Title or Lender');
      continue;
    }
    const totalMonths = Math.round(Number(iTenure >= 0 ? cols[iTenure] : NaN));
    if (!Number.isFinite(totalMonths) || totalMonths <= 0) {
      noteError(rowNum, `"${title}" needs Tenure Months > 0`);
      continue;
    }
    const interestRate = iRate >= 0 && cols[iRate] !== '' ? Number(cols[iRate]) || 0 : 0;
    const emiGiven = iEmi >= 0 && cols[iEmi] !== '' ? Number(cols[iEmi]) : 0;

    let principal = Number(iPrincipal >= 0 ? cols[iPrincipal] : NaN);
    if (!Number.isFinite(principal) || principal <= 0) {
      // Derive from EMI + rate + tenure when Principal is blank.
      principal = calculatePrincipalFromEmi(emiGiven, interestRate, totalMonths);
      if (!Number.isFinite(principal) || principal <= 0) {
        noteError(rowNum, `"${title}" needs Principal, or a valid Monthly EMI to derive it`);
        continue;
      }
    }
    const category = normalizeLoanCategory(iCat >= 0 ? cols[iCat] || '' : '');
    const paidMonths = Math.max(
      0,
      Math.min(totalMonths, Math.round(Number(iPaid >= 0 && cols[iPaid] !== '' ? cols[iPaid] : 0)) || 0)
    );
    const dueDayRaw = Math.round(Number(iDue >= 0 && cols[iDue] !== '' ? cols[iDue] : 5)) || 5;
    const dueDay = Math.max(1, Math.min(31, dueDayRaw));
    let monthlyEmi = Number.isFinite(emiGiven) && emiGiven > 0
      ? emiGiven
      : calculateEmi(principal, interestRate, totalMonths);
    if (!Number.isFinite(monthlyEmi) || monthlyEmi <= 0) {
      noteError(rowNum, `"${title}" needs a valid Monthly EMI`);
      continue;
    }
    const paidFlag = (iPaidMonth >= 0 ? cols[iPaidMonth] : '').trim().toLowerCase();
    const paidThisMonth = ['yes', 'y', 'true', '1', 'paid'].includes(paidFlag);
    loans.push({
      id: `loan-${Date.now()}-${r}`,
      title,
      lender,
      category,
      principal,
      interestRate,
      monthlyEmi,
      dueDay,
      totalMonths,
      paidMonths,
      lastPaidMonthYear: paidThisMonth ? monthStr : undefined,
      startDate: (iStart >= 0 ? cols[iStart] : '').trim() || now.toISOString().split('T')[0],
      accountNumber: (iAcc >= 0 ? cols[iAcc] : '').trim() || undefined,
      autoDebitBank: (iDebit >= 0 ? cols[iDebit] : '').trim() || undefined,
      notes: (iNotes >= 0 ? cols[iNotes] : '').trim() || undefined,
      isClosed: false,
      createdAt: new Date().toISOString(),
    });
  }

  return { loans, imported: loans.length, skipped, errors };
}
