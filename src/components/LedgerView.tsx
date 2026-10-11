import { useState, useMemo } from 'react';
import { 
  Download, Search, Trash2, Calendar, 
  CreditCard, CheckCircle2, ArrowDownLeft 
} from 'lucide-react';
import { PaymentRecord, UserSettings, LoanItem } from '../types';
import { formatCurrency } from '../utils/finance';
import { exportPaymentsCsv } from '../utils/storage';

interface LedgerViewProps {
  payments: PaymentRecord[];
  loans: LoanItem[];
  settings: UserSettings;
  onDeletePayment: (paymentId: string) => void;
}

export default function LedgerView({
  payments,
  loans,
  settings,
  onDeletePayment,
}: LedgerViewProps) {
  const [search, setSearch] = useState('');
  const [selectedLoanFilter, setSelectedLoanFilter] = useState<string>('all');

  const filteredPayments = useMemo(() => {
    return payments
      .filter((p) => {
        if (selectedLoanFilter !== 'all' && p.loanId !== selectedLoanFilter) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchTitle = p.loanTitle.toLowerCase().includes(q);
          const matchRef = (p.transactionRef || '').toLowerCase().includes(q);
          const matchNote = (p.note || '').toLowerCase().includes(q);
          if (!matchTitle && !matchRef && !matchNote) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.paidDate).getTime() - new Date(a.paidDate).getTime());
  }, [payments, selectedLoanFilter, search]);

  const totalPaidAllTime = useMemo(() => {
    return payments.reduce((sum, p) => sum + p.amount, 0);
  }, [payments]);

  const thisYearTotal = useMemo(() => {
    const curYear = new Date().getFullYear().toString();
    return payments
      .filter((p) => p.paidDate.startsWith(curYear))
      .reduce((sum, p) => sum + p.amount, 0);
  }, [payments]);

  const handleDownloadCsv = () => {
    const csv = exportPaymentsCsv(payments);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `EquiNote_Payment_Ledger_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 px-4 pb-28 pt-2 max-w-2xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">
            Payment Ledger
          </h2>
          <p className="text-xs text-slate-400">
            Audit trail &amp; tax record for all cleared installments
          </p>
        </div>

        <button
          onClick={handleDownloadCsv}
          disabled={payments.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 font-semibold transition active:scale-95 disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Aggregate Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800/90">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
            Total Paid (All Time)
          </span>
          <div className="text-xl font-extrabold text-white mt-1 font-mono">
            {formatCurrency(totalPaidAllTime, settings.currencySymbol)}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            {payments.length} total payments logged
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800/90">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
            Paid in {new Date().getFullYear()}
          </span>
          <div className="text-xl font-extrabold text-emerald-400 mt-1 font-mono">
            {formatCurrency(thisYearTotal, settings.currencySymbol)}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            Year-to-date debt service
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transaction ref, loan title..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <select
          value={selectedLoanFilter}
          onChange={(e) => setSelectedLoanFilter(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
        >
          <option value="all">All Loans</option>
          {loans.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
      </div>

      {/* Payment Records Timeline */}
      <div className="space-y-2.5">
        {filteredPayments.length === 0 ? (
          <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-400">
            No payment records found. Record your first monthly installment from the Radar or Loans tab!
          </div>
        ) : (
          filteredPayments.map((payment) => (
            <div
              key={payment.id}
              className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800/90 hover:border-slate-700 transition flex items-center justify-between gap-3 text-xs"
            >
              {/* Left: Info */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-white truncate">
                      {payment.loanTitle}
                    </h4>
                    <span className="text-[10px] text-slate-400 font-mono">
                      #{payment.installmentNumber}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                    <span>{payment.paidDate}</span>
                    <span aria-hidden="true">·</span>
                    <span>{payment.paymentMode || 'Auto-Debit'}</span>
                    {payment.transactionRef && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-slate-400 truncate max-w-[120px]">
                          {payment.transactionRef}
                        </span>
                      </>
                    )}
                  </div>

                  {payment.note && (
                    <p className="text-[10px] text-slate-400 mt-0.5 italic">
                      "{payment.note}"
                    </p>
                  )}
                </div>
              </div>

              {/* Right: Amount & Delete */}
              <div className="text-right shrink-0 flex items-center gap-2.5">
                <div className="font-extrabold text-sm text-emerald-400 font-mono">
                  {formatCurrency(payment.amount, settings.currencySymbol)}
                </div>

                <button
                  onClick={() => onDeletePayment(payment.id)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                  title="Remove payment record"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
