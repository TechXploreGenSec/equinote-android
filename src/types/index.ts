export type LoanCategory =
  | 'home'
  | 'vehicle'
  | 'gadget'
  | 'personal'
  | 'credit_card'
  | 'education'
  | 'bnpl'
  | 'peer'
  | 'business';

export interface LoanItem {
  id: string;
  title: string;
  lender: string;
  category: LoanCategory;
  principal: number;          // Total original loan amount
  interestRate: number;       // Annual % rate (e.g., 8.5)
  monthlyEmi: number;         // Monthly payment amount
  dueDay: number;             // Day of month (1 - 31)
  totalMonths: number;        // Total tenure in months
  paidMonths: number;         // Months completed
  startDate: string;          // YYYY-MM-DD
  accountNumber?: string;     // Loan account / Agreement #
  autoDebitBank?: string;     // e.g. "HDFC Salary Account"
  notes?: string;             // Pre-closure condition, lock-in period, remarks
  isClosed?: boolean;         // Fully settled / paid off
  closedDate?: string;
  lastPaidMonthYear?: string; // e.g. "2026-10" to know if paid this month
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  loanId: string;
  loanTitle: string;
  amount: number;
  paidDate: string;           // ISO or YYYY-MM-DD
  monthYear: string;          // e.g. "2026-10"
  installmentNumber: number;  // e.g. 14 of 36
  transactionRef?: string;
  paymentMode?: string;
  note?: string;
}

export interface UserSettings {
  currency: string;
  currencySymbol: string;
  monthlyIncome: number;
  notificationLeadDays: number; // e.g. 3 days before
  notificationTime: string;     // e.g. "09:00"
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  userName: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  loanId?: string;
  type: 'due_soon' | 'due_today' | 'overdue' | 'paid' | 'milestone';
  timestamp: string;
  read: boolean;
}

export type ReminderKind = 'credit_card' | 'borrow' | 'other';

/**
 * One-time pay reminder (NOT a recurring EMI): e.g. full credit-card bill,
 * money borrowed from a friend. Shows up as a "next month pay note" and
 * can be marked done without touching any loan's paid-month count.
 */
export interface ReminderItem {
  id: string;
  title: string;
  kind: ReminderKind;
  amount?: number;
  dueDate: string; // YYYY-MM-DD
  note?: string;
  person?: string; // friend name / card name
  doneMonthYear?: string; // e.g. "2026-10" once marked paid
  createdAt: string;
}
