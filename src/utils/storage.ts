import { LoanItem, PaymentRecord, UserSettings, AppNotification } from '../types';

const STORAGE_KEYS = {
  LOANS: 'equinote_loans_v1',
  PAYMENTS: 'equinote_payments_v1',
  SETTINGS: 'equinote_settings_v1',
  NOTIFICATIONS: 'equinote_notifications_v1',
};

export const DEFAULT_SETTINGS: UserSettings = {
  currency: 'INR',
  currencySymbol: '₹',
  monthlyIncome: 125000,
  notificationLeadDays: 3,
  notificationTime: '09:00',
  notificationsEnabled: true,
  soundEnabled: true,
  userName: 'Sowndhar',
};

export const INITIAL_SAMPLE_LOANS: LoanItem[] = [
  {
    id: 'loan-1',
    title: 'HDFC Home Loan',
    lender: 'HDFC Bank',
    category: 'home',
    principal: 4200000,
    interestRate: 8.4,
    monthlyEmi: 36240,
    dueDay: 5,
    totalMonths: 240,
    paidMonths: 42,
    startDate: '2023-04-05',
    accountNumber: 'HL-0988472911',
    autoDebitBank: 'Salary Account (HDFC)',
    notes: 'No foreclosure fee after 36 months. Tax exemption under Sec 24b and 80C applicable.',
    isClosed: false,
    lastPaidMonthYear: '2026-09',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'loan-2',
    title: 'Creta SX Auto Loan',
    lender: 'State Bank of India',
    category: 'vehicle',
    principal: 950000,
    interestRate: 8.75,
    monthlyEmi: 19602,
    dueDay: 15,
    totalMonths: 60,
    paidMonths: 22,
    startDate: '2024-12-15',
    accountNumber: 'AL-SBI-558291',
    autoDebitBank: 'SBI Savings Acc',
    notes: 'Need Form 35 and NOC from branch upon final settlement for RTO hypothecation removal.',
    isClosed: false,
    lastPaidMonthYear: '2026-09',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'loan-3',
    title: 'MacBook Pro M3 Max',
    lender: 'Apple / ICICI CC',
    category: 'gadget',
    principal: 199900,
    interestRate: 0,
    monthlyEmi: 16658,
    dueDay: 12,
    totalMonths: 12,
    paidMonths: 8,
    startDate: '2026-02-12',
    accountNumber: 'ICICI-CC-EMI-9102',
    autoDebitBank: 'ICICI Credit Card Auto-Debit',
    notes: 'Zero percent brand subvention EMI. Auto-billed to credit card statement.',
    isClosed: false,
    lastPaidMonthYear: '2026-09',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'loan-4',
    title: 'Amazon Pay Later BNPL',
    lender: 'Axio / Amazon',
    category: 'bnpl',
    principal: 18000,
    interestRate: 0,
    monthlyEmi: 3000,
    dueDay: 25,
    totalMonths: 6,
    paidMonths: 4,
    startDate: '2026-06-25',
    accountNumber: 'APL-8841029',
    autoDebitBank: 'UPI AutoPay',
    notes: 'Standing instruction via UPI ID.',
    isClosed: false,
    lastPaidMonthYear: '2026-09',
    createdAt: new Date().toISOString(),
  },
];

export const INITIAL_SAMPLE_PAYMENTS: PaymentRecord[] = [
  {
    id: 'pay-1',
    loanId: 'loan-1',
    loanTitle: 'HDFC Home Loan',
    amount: 36240,
    paidDate: '2026-09-05',
    monthYear: '2026-09',
    installmentNumber: 42,
    transactionRef: 'TXN-99482910',
    paymentMode: 'Auto-Debit',
    note: 'September EMI cleared on schedule',
  },
  {
    id: 'pay-2',
    loanId: 'loan-2',
    loanTitle: 'Creta SX Auto Loan',
    amount: 19602,
    paidDate: '2026-09-15',
    monthYear: '2026-09',
    installmentNumber: 22,
    transactionRef: 'NEFT-55102948',
    paymentMode: 'Auto-Debit',
    note: 'September auto loan installment',
  },
  {
    id: 'pay-3',
    loanId: 'loan-3',
    loanTitle: 'MacBook Pro M3 Max',
    amount: 16658,
    paidDate: '2026-09-12',
    monthYear: '2026-09',
    installmentNumber: 8,
    transactionRef: 'CC-STMT-0926',
    paymentMode: 'Credit Card Bill',
    note: 'Installment 8 of 12 paid',
  },
];

// Helper to load or initialize
export function loadLoans(): LoanItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOANS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(INITIAL_SAMPLE_LOANS));
      return INITIAL_SAMPLE_LOANS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_SAMPLE_LOANS;
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
      localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(INITIAL_SAMPLE_PAYMENTS));
      return INITIAL_SAMPLE_PAYMENTS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_SAMPLE_PAYMENTS;
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
    version: '1.0',
    exportDate: new Date().toISOString(),
    loans: loadLoans(),
    payments: loadPayments(),
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
