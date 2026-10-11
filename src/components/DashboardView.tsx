import { useMemo } from 'react';
import { 
  Calendar, CheckCircle2, Clock, AlertTriangle, ArrowUpRight, 
  Plus, Check, ChevronRight, TrendingDown, FileText
} from 'lucide-react';
import { LoanItem, UserSettings } from '../types';
import { calculateDueStatus } from '../utils/storage';
import { formatCurrency, calculateRemainingBalance } from '../utils/finance';
import { CATEGORIES } from '../utils/categories';

interface DashboardViewProps {
  loans: LoanItem[];
  settings: UserSettings;
  onOpenAddLoan: () => void;
  onOpenPayModal: (loan: LoanItem) => void;
  onSelectLoan: (loan: LoanItem) => void;
  onGoToLoans: () => void;
  onGoToSimulators: () => void;
  onGoToSettings: () => void;
  onOpenPdfExport: () => void;
}

export default function DashboardView({
  loans,
  settings,
  onOpenAddLoan,
  onOpenPayModal,
  onSelectLoan,
  onGoToLoans,
  onGoToSimulators,
  onGoToSettings,
  onOpenPdfExport,
}: DashboardViewProps) {
  const currentMonthName = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const currentMonthYearStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const activeLoans = useMemo(() => loans.filter((l) => !l.isClosed), [loans]);

  // Aggregate monthly metrics
  const monthlyMetrics = useMemo(() => {
    let totalCommitment = 0;
    let paidAmount = 0;
    let paidCount = 0;

    activeLoans.forEach((loan) => {
      totalCommitment += loan.monthlyEmi;
      if (loan.lastPaidMonthYear === currentMonthYearStr) {
        paidAmount += loan.monthlyEmi;
        paidCount += 1;
      }
    });

    const pendingAmount = Math.max(0, totalCommitment - paidAmount);
    const progressPercent = totalCommitment > 0 ? Math.round((paidAmount / totalCommitment) * 100) : 0;

    return {
      totalCommitment,
      paidAmount,
      pendingAmount,
      paidCount,
      totalCount: activeLoans.length,
      progressPercent,
    };
  }, [activeLoans, currentMonthYearStr]);

  // Total Outstanding Debt across all loans
  const totalOutstanding = useMemo(() => {
    return activeLoans.reduce((sum, loan) => {
      return sum + calculateRemainingBalance(loan.principal, loan.interestRate, loan.totalMonths, loan.paidMonths);
    }, 0);
  }, [activeLoans]);

  // Debt to income ratio (DTI)
  const dtiRatio = useMemo(() => {
    if (!settings.monthlyIncome || settings.monthlyIncome <= 0) return 0;
    return Math.round((monthlyMetrics.totalCommitment / settings.monthlyIncome) * 100);
  }, [monthlyMetrics.totalCommitment, settings.monthlyIncome]);

  // DTI status category
  const dtiStatus = useMemo(() => {
    if (dtiRatio <= 0) return { label: 'Set Income', color: 'text-slate-400', border: 'border-slate-800' };
    if (dtiRatio <= 30) return { label: 'Healthy (<30%)', color: 'text-emerald-400', border: 'border-emerald-500/30' };
    if (dtiRatio <= 40) return { label: 'Moderate (30-40%)', color: 'text-sky-400', border: 'border-sky-500/30' };
    if (dtiRatio <= 50) return { label: 'Caution (40-50%)', color: 'text-amber-400', border: 'border-amber-500/30' };
    return { label: 'High Burden (>50%)', color: 'text-rose-400', border: 'border-rose-500/30' };
  }, [dtiRatio]);

  // Sorted upcoming dues (due soonest first, with unpaid taking precedence)
  const sortedUpcomingLoans = useMemo(() => {
    const list = [...activeLoans].map((loan) => {
      const dueInfo = calculateDueStatus(loan);
      return { loan, dueInfo };
    });

    return list.sort((a, b) => {
      // If one is overdue, it goes to top
      if (a.dueInfo.status === 'overdue' && b.dueInfo.status !== 'overdue') return -1;
      if (b.dueInfo.status === 'overdue' && a.dueInfo.status !== 'overdue') return 1;

      // Unpaid before paid
      const aPaid = a.dueInfo.status === 'paid_this_month';
      const bPaid = b.dueInfo.status === 'paid_this_month';
      if (!aPaid && bPaid) return -1;
      if (aPaid && !bPaid) return 1;

      // Smallest days remaining first
      return a.dueInfo.daysRemaining - b.dueInfo.daysRemaining;
    });
  }, [activeLoans]);

  // Hero loan (the one due next or overdue)
  const heroItem = useMemo(() => {
    return sortedUpcomingLoans.find((item) => item.dueInfo.status !== 'paid_this_month') || sortedUpcomingLoans[0];
  }, [sortedUpcomingLoans]);

  return (
    <div className="space-y-5 px-4 pb-28 pt-2 max-w-2xl mx-auto">
      {/* Top Greeting & Month */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
            {currentMonthName} Radar
          </span>
          <h2 className="text-xl font-extrabold text-white tracking-tight">
            Hello, {settings.userName || 'Finance Lead'}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenPdfExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold transition active:scale-95"
            title="Download PDF Statement"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            <span>PDF Statement</span>
          </button>

          <button
            onClick={onOpenAddLoan}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition shadow-md shadow-emerald-950/30 active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New EMI</span>
          </button>
        </div>
      </div>

      {/* Monthly Outflow Summary Card */}
      <div className="rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800/90 p-5 shadow-xl relative overflow-hidden">
        {/* Decorative backdrop light */}
        <div className="absolute -right-12 -top-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-start justify-between relative z-10">
          <div>
            <p className="text-xs font-medium text-slate-400">Total Monthly Commitment</p>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
              {formatCurrency(monthlyMetrics.totalCommitment, settings.currencySymbol)}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Across {monthlyMetrics.totalCount} active installments
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs font-semibold text-slate-400">Paid Progress</span>
            <div className="text-lg font-bold text-emerald-400 mt-0.5">
              {monthlyMetrics.progressPercent}%
            </div>
            <span className="text-[11px] text-slate-500">
              {monthlyMetrics.paidCount}/{monthlyMetrics.totalCount} cleared
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 relative z-10">
          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, monthlyMetrics.progressPercent)}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-xs mt-2.5">
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span>Paid: {formatCurrency(monthlyMetrics.paidAmount, settings.currencySymbol)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="w-2 h-2 rounded-full bg-slate-600 inline-block" />
              <span>Pending: {formatCurrency(monthlyMetrics.pendingAmount, settings.currencySymbol)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hero: Next Due Radar */}
      {heroItem ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs px-1">
            <span className="font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              Next Due in Radar
            </span>
            <button
              onClick={onGoToLoans}
              className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-0.5"
            >
              <span>View all</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 p-4 transition-all shadow-md relative overflow-hidden group">
            <div className="flex items-start justify-between gap-3">
              <div
                className="cursor-pointer flex-1"
                onClick={() => onSelectLoan(heroItem.loan)}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                    heroItem.dueInfo.status === 'overdue'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : heroItem.dueInfo.status === 'due_today'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : heroItem.dueInfo.status === 'paid_this_month'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  }`}>
                    {heroItem.dueInfo.statusText}
                  </span>

                  <span className="text-xs text-slate-400">
                    Due {heroItem.dueInfo.dueDateString}
                  </span>
                </div>

                <h4 className="text-base font-bold text-white group-hover:text-emerald-300 transition">
                  {heroItem.loan.title}
                </h4>

                <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                  <span>{heroItem.loan.lender}</span>
                  {heroItem.loan.autoDebitBank && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-400 truncate max-w-[180px]">
                        {heroItem.loan.autoDebitBank}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Amount and Pay Action */}
              <div className="text-right shrink-0 flex flex-col items-end justify-between">
                <div>
                  <span className="text-[11px] text-slate-400">EMI Amount</span>
                  <div className="text-lg font-extrabold text-white">
                    {formatCurrency(heroItem.loan.monthlyEmi, settings.currencySymbol)}
                  </div>
                </div>

                <div className="mt-2">
                  {heroItem.dueInfo.status === 'paid_this_month' ? (
                    <div className="flex items-center gap-1 text-xs text-emerald-400 font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10">
                      <Check className="w-3.5 h-3.5" />
                      <span>Cleared</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => onOpenPayModal(heroItem.loan)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition shadow-sm active:scale-95"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Mark Paid</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 text-center">
          <p className="text-sm text-slate-400">No active loans found.</p>
          <button
            onClick={onOpenAddLoan}
            className="mt-3 px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs"
          >
            Add Your First Loan
          </button>
        </div>
      )}

      {/* DTI Financial Health + Total Debt Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* DTI Gauge Card */}
        <div
          onClick={onGoToSettings}
          className="rounded-2xl bg-slate-900 border border-slate-800/80 hover:border-slate-700 p-4 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Debt-to-Income (DTI)</span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-800 ${dtiStatus.color}`}>
              {dtiStatus.label}
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-extrabold text-white">{dtiRatio}%</span>
            <span className="text-xs text-slate-400">of net salary</span>
          </div>

          <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                dtiRatio <= 30
                  ? 'bg-emerald-400'
                  : dtiRatio <= 40
                  ? 'bg-sky-400'
                  : dtiRatio <= 50
                  ? 'bg-amber-400'
                  : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(100, dtiRatio)}%` }}
            />
          </div>

          <p className="text-[11px] text-slate-500 mt-2 flex items-center justify-between">
            <span>Income: {formatCurrency(settings.monthlyIncome, settings.currencySymbol)}</span>
            <span className="text-emerald-400 group-hover:underline">Update</span>
          </p>
        </div>

        {/* Total Outstanding Debt Card */}
        <div
          onClick={onGoToSimulators}
          className="rounded-2xl bg-slate-900 border border-slate-800/80 hover:border-slate-700 p-4 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total Outstanding</span>
            <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-0.5 group-hover:underline">
              <span>Simulate Payoff</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>

          <div className="text-2xl font-extrabold text-white mt-2">
            {formatCurrency(totalOutstanding, settings.currencySymbol)}
          </div>

          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
            <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
            <span>Principal remaining across {activeLoans.length} loans</span>
          </p>

          <div className="mt-2 text-[11px] text-slate-500">
            Tip: Prepay ₹50k to save months of interest
          </div>
        </div>
      </div>

      {/* Due Date Radar List for this month */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs px-1">
          <span className="font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
            All Dues Schedule
          </span>
          <span className="text-xs text-slate-500">
            {sortedUpcomingLoans.length} Loans
          </span>
        </div>

        <div className="space-y-2">
          {sortedUpcomingLoans.map(({ loan, dueInfo }) => {
            const cat = CATEGORIES[loan.category] || CATEGORIES.personal;
            const CatIcon = cat.icon;
            const isPaid = dueInfo.status === 'paid_this_month';

            return (
              <div
                key={loan.id}
                className={`rounded-2xl border p-3.5 transition flex items-center justify-between gap-3 ${
                  isPaid
                    ? 'bg-slate-900/40 border-slate-800/50 opacity-70'
                    : dueInfo.status === 'overdue'
                    ? 'bg-rose-950/20 border-rose-500/30'
                    : 'bg-slate-900 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                {/* Left: Icon & Info */}
                <div
                  className="flex items-center gap-3 cursor-pointer min-w-0 flex-1"
                  onClick={() => onSelectLoan(loan)}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${cat.bgColor}`}>
                    <CatIcon className={`w-5 h-5 ${cat.color}`} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                        {loan.title}
                      </h4>
                      {isPaid && (
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          Paid
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                      <span>{loan.lender}</span>
                      <span aria-hidden="true">·</span>
                      <span className={
                        dueInfo.status === 'overdue'
                          ? 'text-rose-400 font-semibold'
                          : dueInfo.status === 'due_today'
                          ? 'text-amber-300 font-semibold'
                          : 'text-slate-400'
                      }>
                        {dueInfo.statusText}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: EMI & Action */}
                <div className="text-right shrink-0 flex items-center gap-3">
                  <div>
                    <div className="text-xs sm:text-sm font-extrabold text-white">
                      {formatCurrency(loan.monthlyEmi, settings.currencySymbol)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Day {loan.dueDay} of mo
                    </div>
                  </div>

                  {isPaid ? (
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <Check className="w-4 h-4 stroke-[2.5]" />
                    </div>
                  ) : (
                    <button
                      onClick={() => onOpenPayModal(loan)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 text-xs font-semibold border border-slate-700 transition active:scale-95"
                      title="Mark as paid"
                    >
                      Pay
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
