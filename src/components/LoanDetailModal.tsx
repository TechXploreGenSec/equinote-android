import { useState } from 'react';
import { 
  X, Calendar, Landmark, Percent, Clock, 
  Trash2, Edit3, ArrowRight, CheckCircle,
  FileCheck2, CheckSquare, Square
} from 'lucide-react';
import { LoanItem, UserSettings, PaymentRecord } from '../types';
import { formatCurrency, calculateRemainingBalance, calculateTotalInterest } from '../utils/finance';
import { CATEGORIES } from '../utils/categories';
import { calculateDueStatus } from '../utils/storage';

interface LoanDetailModalProps {
  loan: LoanItem | null;
  settings: UserSettings;
  payments: PaymentRecord[];
  onClose: () => void;
  onEdit: (loan: LoanItem) => void;
  onDelete: (loanId: string) => void;
  onToggleClose: (loan: LoanItem) => void;
  onPrepaySimulate: (loan: LoanItem) => void;
  onOpenPayModal: (loan: LoanItem) => void;
}

export default function LoanDetailModal({
  loan,
  settings,
  payments,
  onClose,
  onEdit,
  onDelete,
  onToggleClose,
  onPrepaySimulate,
  onOpenPayModal,
}: LoanDetailModalProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`equinote_noc_${loan?.id}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  if (!loan) return null;

  const cat = CATEGORIES[loan.category] || CATEGORIES.personal;
  const CatIcon = cat.icon;
  const balance = calculateRemainingBalance(loan.principal, loan.interestRate, loan.totalMonths, loan.paidMonths);
  const totalInterest = calculateTotalInterest(loan.principal, loan.interestRate, loan.totalMonths);
  const totalPayable = loan.principal + totalInterest;
  const dueInfo = calculateDueStatus(loan);
  const progressPercent = Math.min(100, Math.round((loan.paidMonths / loan.totalMonths) * 100));

  // Maturity date calculation
  const startDate = new Date(loan.startDate || '2025-01-01');
  const maturityDate = new Date(startDate);
  maturityDate.setMonth(maturityDate.getMonth() + loan.totalMonths);
  const maturityDateStr = maturityDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  // Filter payments for this loan
  const loanPayments = payments.filter((p) => p.loanId === loan.id);

  const toggleChecklistItem = (key: string) => {
    const updated = { ...checklist, [key]: !checklist[key] };
    setChecklist(updated);
    localStorage.setItem(`equinote_noc_${loan.id}`, JSON.stringify(updated));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom duration-200">
        {/* Top Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${cat.bgColor}`}>
              <CatIcon className={`w-5 h-5 ${cat.color}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white truncate max-w-[220px]">
                  {loan.title}
                </h3>
                {loan.isClosed && (
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                    Settled
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">{loan.lender}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto p-5 space-y-5 text-xs text-slate-300">
          {/* Due Status Banner */}
          {!loan.isClosed && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <div>
                  <div className="font-semibold text-white">
                    Due Day {loan.dueDay} of every month
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Next due: {dueInfo.dueDateString} ({dueInfo.statusText})
                  </div>
                </div>
              </div>

              {dueInfo.status !== 'paid_this_month' && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenPayModal(loan);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition shadow-sm"
                >
                  Pay Now
                </button>
              )}
            </div>
          )}

          {/* Key Figures Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Monthly EMI</span>
              <div className="text-lg font-extrabold text-white mt-0.5">
                {formatCurrency(loan.monthlyEmi, settings.currencySymbol)}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Outstanding</span>
              <div className="text-lg font-extrabold text-emerald-400 mt-0.5">
                {loan.isClosed ? '₹ 0' : formatCurrency(balance, settings.currencySymbol)}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Original Principal</span>
              <div className="text-sm font-bold text-slate-200 mt-0.5">
                {formatCurrency(loan.principal, settings.currencySymbol)}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Interest Rate</span>
              <div className="text-sm font-bold text-slate-200 mt-0.5">
                {loan.interestRate > 0 ? `${loan.interestRate}% p.a.` : '0% (No-cost)'}
              </div>
            </div>
          </div>

          {/* Progress & Tenure Timeline */}
          <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800/80 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-300">Tenure Progress</span>
              <span className="font-bold text-emerald-400">
                {loan.paidMonths} / {loan.totalMonths} Months ({progressPercent}%)
              </span>
            </div>

            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex justify-between text-[11px] text-slate-400 pt-1">
              <span>Started: {loan.startDate || 'N/A'}</span>
              <span>Estimated Payoff: {maturityDateStr}</span>
            </div>

            {totalInterest > 0 && (
              <div className="pt-2 border-t border-slate-800/60 flex justify-between text-[11px] text-slate-400">
                <span>Total Lifetime Interest:</span>
                <span className="text-slate-300 font-semibold">{formatCurrency(totalInterest, settings.currencySymbol)}</span>
              </div>
            )}
          </div>

          {/* Loan Notes & Particulars */}
          <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800/80 space-y-2">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider">
              Account &amp; Agreement Details
            </h4>

            <div className="space-y-1.5 text-xs text-slate-300">
              {loan.accountNumber && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Account / Agreement #:</span>
                  <span className="font-mono text-slate-200">{loan.accountNumber}</span>
                </div>
              )}

              {loan.autoDebitBank && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Auto-debit Mandate:</span>
                  <span className="text-slate-200">{loan.autoDebitBank}</span>
                </div>
              )}

              {loan.notes && (
                <div className="pt-2 border-t border-slate-800/60">
                  <span className="text-slate-400 block mb-1">Remarks &amp; Preclosure Notes:</span>
                  <p className="text-slate-300 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 leading-relaxed">
                    {loan.notes}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Pre-closure & Foreclosure Checklist */}
          <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800/80 space-y-2.5">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-emerald-400" />
              <h4 className="font-bold text-white text-xs uppercase tracking-wider">
                Pre-closure &amp; Settlement Checklist
              </h4>
            </div>
            <p className="text-[11px] text-slate-400">
              Essential documents to obtain from {loan.lender} when closing or pre-closing this loan:
            </p>

            <div className="space-y-2 pt-1">
              {[
                { id: 'noc', label: 'No Objection Certificate (NOC) / No Dues Certificate' },
                { id: 'docs', label: 'Return of original documents (Property Deed / Vehicle RC)' },
                { id: 'lien', label: 'Lien / Hypothecation removal (RTO Form 35 for auto loan)' },
                { id: 'cibil', label: 'Credit bureau update (CIBIL marked as "Closed / Settled")' },
              ].map((item) => {
                const checked = !!checklist[item.id];
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleChecklistItem(item.id)}
                    className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/60 cursor-pointer transition"
                  >
                    {checked ? (
                      <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                    <span className={`text-xs ${checked ? 'line-through text-slate-500' : 'text-slate-300'}`}>
                      {item.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Past Payments for this loan */}
          {loanPayments.length > 0 && (
            <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800/80 space-y-2">
              <h4 className="font-bold text-white text-xs uppercase tracking-wider">
                Recorded Payments ({loanPayments.length})
              </h4>

              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {loanPayments.map((p) => (
                  <div
                    key={p.id}
                    className="flex justify-between items-center p-2 rounded-lg bg-slate-900/60 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-white">
                        {formatCurrency(p.amount, settings.currencySymbol)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {p.paidDate} · Inst. #{p.installmentNumber}
                      </div>
                    </div>
                    {p.transactionRef && (
                      <span className="font-mono text-[10px] text-slate-400">
                        {p.transactionRef}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Simulation CTA */}
          <button
            onClick={() => {
              onClose();
              onPrepaySimulate(loan);
            }}
            className="w-full py-3 px-4 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95"
          >
            <span>Simulate Prepayment Savings for this Loan</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleClose(loan)}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 font-semibold transition"
            >
              {loan.isClosed ? 'Reopen Loan' : 'Mark as Settled'}
            </button>

            <button
              onClick={() => {
                onClose();
                onEdit(loan);
              }}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 font-semibold transition"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
          </div>

          <div>
            {showDeleteConfirm ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onDelete(loan.id)}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 rounded-xl text-rose-400 hover:bg-rose-500/10 transition"
                aria-label="Delete loan"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
