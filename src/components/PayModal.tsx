import { useState, useEffect } from 'react';
import { X, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import { LoanItem, UserSettings } from '../types';
import { formatCurrency } from '../utils/finance';
import { playChimeSound } from '../utils/notifications';

interface PayModalProps {
  loan: LoanItem | null;
  settings: UserSettings;
  isOpen: boolean;
  onClose: () => void;
  onConfirmPayment: (data: {
    loanId: string;
    amount: number;
    paidDate: string;
    paymentMode: string;
    transactionRef: string;
    note: string;
  }) => void;
}

export default function PayModal({
  loan,
  settings,
  isOpen,
  onClose,
  onConfirmPayment,
}: PayModalProps) {
  const [amount, setAmount] = useState<number>(0);
  const [paidDate, setPaidDate] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<string>('Auto-Debit');
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [note, setNote] = useState<string>('');

  useEffect(() => {
    if (loan) {
      setAmount(loan.monthlyEmi);
      setPaidDate(new Date().toISOString().split('T')[0]);
      setPaymentMode(loan.autoDebitBank ? 'Auto-Debit' : 'UPI');
      setTransactionRef('');
      setNote('');
    }
  }, [loan, isOpen]);

  if (!isOpen || !loan) return null;

  const currentInstallment = loan.paidMonths + 1;
  const isFinalPayment = currentInstallment >= loan.totalMonths;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) return;

    // Trigger celebration effects
    try {
      confetti({
        particleCount: isFinalPayment ? 120 : 60,
        spread: isFinalPayment ? 100 : 70,
        origin: { y: 0.65 },
        colors: ['#10b981', '#38bdf8', '#fbbf24', '#ffffff'],
      });
      playChimeSound('success');
    } catch {
      // Ignore if confetti fails
    }

    onConfirmPayment({
      loanId: loan.id,
      amount: Number(amount),
      paidDate: paidDate || new Date().toISOString().split('T')[0],
      paymentMode,
      transactionRef: transactionRef.trim(),
      note: note.trim(),
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Record Monthly EMI</h3>
              <p className="text-xs text-slate-400">{loan.title} · {loan.lender}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs text-slate-300">
          {/* Milestone highlight if final payment */}
          {isFinalPayment ? (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2.5 text-amber-300">
              <Sparkles className="w-5 h-5 shrink-0 text-amber-400" />
              <div>
                <strong className="block text-xs font-bold">Final Installment Milestone!</strong>
                <span className="text-[11px] text-amber-300/80">
                  Clearing this payment will mark this entire loan as 100% debt-free!
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400">Installment Number:</span>
              <span className="font-bold text-white">
                #{currentInstallment} of {loan.totalMonths}
              </span>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Paid Amount ({settings.currencySymbol}) *
            </label>
            <input
              type="number"
              required
              min="1"
              step="any"
              value={amount || ''}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-lg font-extrabold text-emerald-400 font-mono focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Scheduled EMI: {formatCurrency(loan.monthlyEmi, settings.currencySymbol)}
            </span>
          </div>

          {/* Payment Date & Mode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Payment Date *
              </label>
              <input
                type="date"
                required
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Payment Mode
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="Auto-Debit">Auto-Debit</option>
                <option value="UPI">UPI / GPay / PhonePe</option>
                <option value="Net Banking">Net Banking</option>
                <option value="Credit Card">Credit Card Bill</option>
                <option value="Cheque / Cash">Cheque / Cash</option>
              </select>
            </div>
          </div>

          {/* Transaction Ref */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Transaction ID / UTR / Reference (Optional)
            </label>
            <input
              type="text"
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              placeholder="e.g. TXN-884920491 or Bank Ref"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Remarks (Optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Cleared on time via Salary Account"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-emerald-950/40 active:scale-98 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
              <span>Confirm &amp; Clear Installment #{currentInstallment}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
