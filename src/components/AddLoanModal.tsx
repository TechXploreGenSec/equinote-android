import { useState, useEffect } from 'react';
import { X, Calculator, HelpCircle } from 'lucide-react';
import { LoanItem, LoanCategory } from '../types';
import { CATEGORIES } from '../utils/categories';
import { calculateEmi } from '../utils/finance';

interface AddLoanModalProps {
  initialLoan?: LoanItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (loan: Partial<LoanItem>) => void;
  currencySymbol: string;
}

export default function AddLoanModal({
  initialLoan,
  isOpen,
  onClose,
  onSave,
  currencySymbol,
}: AddLoanModalProps) {
  const [title, setTitle] = useState('');
  const [lender, setLender] = useState('');
  const [category, setCategory] = useState<LoanCategory>('home');
  const [principal, setPrincipal] = useState<number>(500000);
  const [interestRate, setInterestRate] = useState<number>(8.5);
  const [tenureUnit, setTenureUnit] = useState<'months' | 'years'>('months');
  const [tenureValue, setTenureValue] = useState<number>(60);
  const [paidMonths, setPaidMonths] = useState<number>(0);
  const [monthlyEmi, setMonthlyEmi] = useState<number>(0);
  const [isManualEmi, setIsManualEmi] = useState<boolean>(false);
  const [dueDay, setDueDay] = useState<number>(5);
  const [startDate, setStartDate] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState('');
  const [autoDebitBank, setAutoDebitBank] = useState('');
  const [notes, setNotes] = useState('');
  // Same-month post-due-date confirm (new loans only)
  const [paidThisMonth, setPaidThisMonth] = useState<'yes' | 'no' | null>(null);
  const [paidCountIncludesThisMonth, setPaidCountIncludesThisMonth] = useState<'yes' | 'no' | null>(null);

  // Total months based on unit
  const totalMonths = tenureUnit === 'years' ? tenureValue * 12 : tenureValue;

  useEffect(() => {
    if (initialLoan) {
      setTitle(initialLoan.title);
      setLender(initialLoan.lender);
      setCategory(initialLoan.category);
      setPrincipal(initialLoan.principal);
      setInterestRate(initialLoan.interestRate);
      setTenureUnit('months');
      setTenureValue(initialLoan.totalMonths);
      setPaidMonths(initialLoan.paidMonths);
      setMonthlyEmi(initialLoan.monthlyEmi);
      setIsManualEmi(true);
      setDueDay(initialLoan.dueDay);
      setStartDate(initialLoan.startDate || '');
      setAccountNumber(initialLoan.accountNumber || '');
      setAutoDebitBank(initialLoan.autoDebitBank || '');
      setNotes(initialLoan.notes || '');
      setPaidThisMonth(null);
      setPaidCountIncludesThisMonth(null);
    } else {
      // Defaults for new loan
      setTitle('');
      setLender('');
      setCategory('gadget');
      setPrincipal(60000);
      setInterestRate(0);
      setTenureUnit('months');
      setTenureValue(12);
      setPaidMonths(0);
      setMonthlyEmi(5000);
      setIsManualEmi(false);
      setDueDay(5);
      setStartDate(new Date().toISOString().split('T')[0]);
      setAccountNumber('');
      setAutoDebitBank('');
      setNotes('');
      setPaidThisMonth(null);
      setPaidCountIncludesThisMonth(null);
    }
  }, [initialLoan, isOpen]);

  // Recalculate auto EMI whenever principal, rate, or tenure changes unless manual
  useEffect(() => {
    if (!isManualEmi) {
      const computed = calculateEmi(principal, interestRate, totalMonths);
      setMonthlyEmi(computed);
    }
  }, [principal, interestRate, totalMonths, isManualEmi]);

  if (!isOpen) return null;

  const today = new Date();
  const thisMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  // New loan added after this month's due day: ask whether it is already paid.
  const showPaidConfirm = !initialLoan && today.getDate() > dueDay;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !lender.trim() || principal <= 0 || totalMonths <= 0 || monthlyEmi <= 0) {
      return;
    }
    if (showPaidConfirm && !paidThisMonth) {
      return;
    }
    if (showPaidConfirm && paidThisMonth === 'yes' && !paidCountIncludesThisMonth) {
      return;
    }

    let finalPaidMonths = Number(paidMonths) || 0;
    let lastPaidMonthYear: string | undefined = initialLoan?.lastPaidMonthYear;
    if (showPaidConfirm) {
      if (paidThisMonth === 'yes') {
        // Mark this month paid WITHOUT double counting:
        // bump the count only if the entered number doesn't include this month yet.
        if (paidCountIncludesThisMonth === 'no') {
          finalPaidMonths = Math.min(totalMonths, finalPaidMonths + 1);
        }
        lastPaidMonthYear = thisMonthStr;
      } else {
        lastPaidMonthYear = undefined;
      }
    }

    onSave({
      id: initialLoan?.id,
      title: title.trim(),
      lender: lender.trim(),
      category,
      principal: Number(principal),
      interestRate: Number(interestRate),
      monthlyEmi: Number(monthlyEmi),
      dueDay: Number(dueDay),
      totalMonths: Number(totalMonths),
      paidMonths: finalPaidMonths,
      lastPaidMonthYear,
      startDate: startDate || new Date().toISOString().split('T')[0],
      accountNumber: accountNumber.trim(),
      autoDebitBank: autoDebitBank.trim(),
      notes: notes.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom duration-200">
        {/* Top Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">
              {initialLoan ? 'Edit Loan & EMI' : 'Add New Loan or EMI'}
            </h3>
            <p className="text-xs text-slate-400">
              Track upcoming payments, remaining balance &amp; foreclosure notes
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-4 text-xs text-slate-300">
          {/* Category Picker */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Category
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {Object.values(CATEGORIES).map((cat) => {
                const Icon = cat.icon;
                const isSelected = category === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => {
                      setCategory(cat.key);
                      // smart default rate for gadgets / BNPL
                      if (cat.key === 'gadget' || cat.key === 'bnpl') {
                        setInterestRate(0);
                      } else if (interestRate === 0) {
                        setInterestRate(8.5);
                      }
                    }}
                    className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition text-center ${
                      isSelected
                        ? 'bg-emerald-500/20 border-emerald-500 text-white font-bold'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[10px] leading-tight truncate w-full">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title & Lender */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Loan / Purchase Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. HDFC Home Loan, MacBook Pro"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Lender / Bank / Platform *
              </label>
              <input
                type="text"
                required
                value={lender}
                onChange={(e) => setLender(e.target.value)}
                placeholder="e.g. SBI, HDFC, Amazon, Bajaj"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Principal & Interest Rate */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Total Principal Amount ({currencySymbol}) *
              </label>
              <input
                type="number"
                required
                min="100"
                step="any"
                value={principal || ''}
                onChange={(e) => setPrincipal(Number(e.target.value))}
                placeholder="e.g. 1500000"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-semibold text-slate-400">
                  Annual Interest Rate (%) *
                </label>
                <button
                  type="button"
                  onClick={() => setInterestRate(0)}
                  className="text-[10px] text-emerald-400 hover:underline"
                >
                  Set 0% (No-cost)
                </button>
              </div>
              <input
                type="number"
                required
                min="0"
                max="99"
                step="0.05"
                value={interestRate}
                onChange={(e) => setInterestRate(Number(e.target.value))}
                placeholder="e.g. 8.5"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Tenure & Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-semibold text-slate-400">
                  Total Loan Tenure *
                </label>
                <div className="flex items-center gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setTenureUnit('months')}
                    className={`px-1.5 py-0.5 rounded ${
                      tenureUnit === 'months' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400'
                    }`}
                  >
                    Months
                  </button>
                  <button
                    type="button"
                    onClick={() => setTenureUnit('years')}
                    className={`px-1.5 py-0.5 rounded ${
                      tenureUnit === 'years' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400'
                    }`}
                  >
                    Years
                  </button>
                </div>
              </div>
              <input
                type="number"
                required
                min="1"
                max="600"
                value={tenureValue || ''}
                onChange={(e) => setTenureValue(Number(e.target.value))}
                placeholder={tenureUnit === 'years' ? 'e.g. 20 years' : 'e.g. 60 months'}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                = {totalMonths} monthly installments
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Already Paid Months (Installments)
              </label>
              <input
                type="number"
                min="0"
                max={totalMonths}
                value={paidMonths}
                onChange={(e) => setPaidMonths(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                {Math.max(0, totalMonths - paidMonths)} months remaining
              </span>
            </div>
          </div>

          {/* Monthly EMI & Override */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/90 space-y-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-white text-xs">Monthly EMI Amount</span>
              </div>
              <button
                type="button"
                onClick={() => setIsManualEmi(!isManualEmi)}
                className="text-[10px] text-emerald-400 hover:underline"
              >
                {isManualEmi ? 'Auto-calculate' : 'Override manual amount'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-bold text-base">{currencySymbol}</span>
              <input
                type="number"
                required
                min="1"
                step="any"
                value={monthlyEmi || ''}
                readOnly={!isManualEmi}
                onChange={(e) => setMonthlyEmi(Number(e.target.value))}
                className={`w-full bg-slate-900 border rounded-xl px-3 py-2 text-base font-extrabold text-emerald-400 font-mono focus:outline-none ${
                  isManualEmi ? 'border-emerald-500/50' : 'border-slate-800'
                }`}
              />
            </div>
            <p className="text-[10px] text-slate-500">
              {isManualEmi
                ? 'Manual override active. Enter exact bank debited amount.'
                : 'Calculated using standard reducing balance amortization formula.'}
            </p>
          </div>

          {/* Due Day & Start Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Due Day of Month (1 - 31) *
              </label>
              <select
                value={dueDay}
                onChange={(e) => setDueDay(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    {day}th of every month
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Loan Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Same-month post-due-date confirm */}
          {showPaidConfirm && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
              <p className="text-xs text-amber-200 font-semibold">
                This month's due day ({dueDay}th) has already passed. Is this month's
                installment already paid?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaidThisMonth('yes')}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition ${
                    paidThisMonth === 'yes'
                      ? 'bg-emerald-500/20 border-emerald-500 text-white'
                      : 'bg-slate-950 border-slate-700 text-slate-300'
                  }`}
                >
                  Yes, paid
                </button>
                <button
                  type="button"
                  onClick={() => { setPaidThisMonth('no'); setPaidCountIncludesThisMonth(null); }}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition ${
                    paidThisMonth === 'no'
                      ? 'bg-rose-500/20 border-rose-500 text-white'
                      : 'bg-slate-950 border-slate-700 text-slate-300'
                  }`}
                >
                  No, not yet
                </button>
              </div>

              {paidThisMonth === 'yes' && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs text-slate-300 font-semibold">
                    Does the "Already Paid Months" count you entered include this month's payment?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaidCountIncludesThisMonth('yes')}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition ${
                        paidCountIncludesThisMonth === 'yes'
                          ? 'bg-emerald-500/20 border-emerald-500 text-white'
                          : 'bg-slate-950 border-slate-700 text-slate-300'
                      }`}
                    >
                      Yes, includes it
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaidCountIncludesThisMonth('no')}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition ${
                        paidCountIncludesThisMonth === 'no'
                          ? 'bg-emerald-500/20 border-emerald-500 text-white'
                          : 'bg-slate-950 border-slate-700 text-slate-300'
                      }`}
                    >
                      No, add +1
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {paidCountIncludesThisMonth === 'no'
                      ? 'We will add 1 to your count and mark this month paid.'
                      : 'We will only mark this month paid — your count stays as entered.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Account Number & Auto-Debit Bank */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Agreement / Loan Account # (Optional)
              </label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g. HL-8849201"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Auto-Debit Account / Card (Optional)
              </label>
              <input
                type="text"
                value={autoDebitBank}
                onChange={(e) => setAutoDebitBank(e.target.value)}
                placeholder="e.g. HDFC Salary A/C, ICICI CC"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Notes & Preclosure conditions */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Personal Notes &amp; Preclosure Terms (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Zero foreclosure fee after 2 years. Tax deduction under 80C."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-emerald-950/40 active:scale-98"
            >
              {initialLoan ? 'Save Changes' : 'Create EMI Tracker'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
