import { useState, useMemo } from 'react';
import { 
  Sparkles, TrendingDown, Clock, ShieldCheck, 
  ArrowRight, Check, HelpCircle, GitCompare, Calculator
} from 'lucide-react';
import { LoanItem, UserSettings } from '../types';
import { 
  calculateEmi, calculateRemainingBalance, 
  simulatePrepayment, formatCurrency, calculateTotalInterest 
} from '../utils/finance';

interface SimulatorViewProps {
  loans: LoanItem[];
  settings: UserSettings;
  preselectedLoan?: LoanItem | null;
}

type SimulatorTab = 'prepayment' | 'emi_calc' | 'comparison';

export default function SimulatorView({
  loans,
  settings,
  preselectedLoan,
}: SimulatorViewProps) {
  const [tab, setTab] = useState<SimulatorTab>('prepayment');

  // Prepayment Simulator state
  const activeLoans = useMemo(() => loans.filter((l) => !l.isClosed), [loans]);
  const [selectedLoanId, setSelectedLoanId] = useState<string>(
    preselectedLoan?.id || activeLoans[0]?.id || ''
  );
  const [lumpSum, setLumpSum] = useState<number>(50000);

  const currentLoan = useMemo(() => {
    return activeLoans.find((l) => l.id === selectedLoanId) || activeLoans[0];
  }, [activeLoans, selectedLoanId]);

  const prepayResults = useMemo(() => {
    if (!currentLoan) return null;
    return simulatePrepayment(
      currentLoan.principal,
      currentLoan.interestRate,
      currentLoan.totalMonths,
      currentLoan.paidMonths,
      currentLoan.monthlyEmi,
      lumpSum
    );
  }, [currentLoan, lumpSum]);

  // Standard EMI Calc state
  const [calcPrincipal, setCalcPrincipal] = useState<number>(1000000);
  const [calcRate, setCalcRate] = useState<number>(8.5);
  const [calcTenureYears, setCalcTenureYears] = useState<number>(10);

  const calcMonths = calcTenureYears * 12;
  const calcMonthlyEmi = useMemo(() => {
    return calculateEmi(calcPrincipal, calcRate, calcMonths);
  }, [calcPrincipal, calcRate, calcMonths]);
  const calcTotalInterest = useMemo(() => {
    return calculateTotalInterest(calcPrincipal, calcRate, calcMonths);
  }, [calcPrincipal, calcRate, calcMonths]);
  const calcTotalPayable = calcPrincipal + calcTotalInterest;
  const calcPrincipalPct = calcTotalPayable > 0 ? Math.round((calcPrincipal / calcTotalPayable) * 100) : 100;
  const calcInterestPct = 100 - calcPrincipalPct;

  // Year-by-year amortization preview
  const yearlySchedule = useMemo(() => {
    if (calcMonths <= 0 || calcPrincipal <= 0) return [];
    const schedule = [];
    let curBal = calcPrincipal;
    const r = calcRate / (12 * 100);

    for (let yr = 1; yr <= Math.min(calcTenureYears, 30); yr++) {
      let yearlyInterest = 0;
      let yearlyPrincipal = 0;

      for (let m = 1; m <= 12; m++) {
        if (curBal <= 0) break;
        const interestPart = curBal * r;
        const principalPart = Math.min(curBal, calcMonthlyEmi - interestPart);
        yearlyInterest += interestPart;
        yearlyPrincipal += principalPart;
        curBal = Math.max(0, curBal - principalPart);
      }

      schedule.push({
        year: yr,
        principalPaid: Math.round(yearlyPrincipal),
        interestPaid: Math.round(yearlyInterest),
        balanceLeft: Math.round(curBal),
      });

      if (curBal <= 0) break;
    }
    return schedule;
  }, [calcPrincipal, calcRate, calcMonths, calcMonthlyEmi, calcTenureYears]);

  // Loan Comparator state
  const [compLoanAmount, setCompLoanAmount] = useState<number>(2000000);
  const [compTenureYears, setCompTenureYears] = useState<number>(15);

  const [bankAName, setBankAName] = useState('Bank A (e.g. SBI)');
  const [bankARate, setBankARate] = useState(8.4);
  const [bankAFee, setBankAFee] = useState(5000);

  const [bankBName, setBankBName] = useState('Bank B (e.g. HDFC)');
  const [bankBRate, setBankBRate] = useState(8.75);
  const [bankBFee, setBankBFee] = useState(0);

  const compResults = useMemo(() => {
    const months = compTenureYears * 12;
    const emiA = calculateEmi(compLoanAmount, bankARate, months);
    const intA = calculateTotalInterest(compLoanAmount, bankARate, months);
    const totalA = compLoanAmount + intA + bankAFee;

    const emiB = calculateEmi(compLoanAmount, bankBRate, months);
    const intB = calculateTotalInterest(compLoanAmount, bankBRate, months);
    const totalB = compLoanAmount + intB + bankBFee;

    const diff = Math.abs(totalA - totalB);
    const winner = totalA < totalB ? bankAName : bankBName;
    const loser = totalA < totalB ? bankBName : bankAName;

    return { emiA, intA, totalA, emiB, intB, totalB, diff, winner, loser };
  }, [compLoanAmount, compTenureYears, bankARate, bankAFee, bankBRate, bankBFee, bankAName, bankBName]);

  return (
    <div className="space-y-4 px-4 pb-28 pt-2 max-w-2xl mx-auto">
      {/* Top Header */}
      <div>
        <h2 className="text-xl font-extrabold text-white tracking-tight">
          Financial Simulators
        </h2>
        <p className="text-xs text-slate-400">
          Professional calculators for prepayment optimization, EMIs &amp; loan comparisons
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-2xl">
        <button
          onClick={() => setTab('prepayment')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
            tab === 'prepayment'
              ? 'bg-emerald-500 text-slate-950 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Prepay Simulator
        </button>
        <button
          onClick={() => setTab('emi_calc')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
            tab === 'emi_calc'
              ? 'bg-emerald-500 text-slate-950 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          EMI Calculator
        </button>
        <button
          onClick={() => setTab('comparison')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
            tab === 'comparison'
              ? 'bg-emerald-500 text-slate-950 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Compare Loans
        </button>
      </div>

      {/* TAB 1: PREPAYMENT SIMULATOR */}
      {tab === 'prepayment' && (
        <div className="space-y-4">
          {activeLoans.length === 0 ? (
            <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-400">
              No active loans found. Please add a loan first to simulate prepayments.
            </div>
          ) : (
            <>
              {/* Select Loan & Prepayment Input */}
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800/90 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Select Loan to Prepay
                    </label>
                    <select
                      value={selectedLoanId}
                      onChange={(e) => setSelectedLoanId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                    >
                      {activeLoans.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.title} ({l.interestRate}% · EMI {formatCurrency(l.monthlyEmi, settings.currencySymbol)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Prepayment Lump Sum ({settings.currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="1000"
                      step="5000"
                      value={lumpSum}
                      onChange={(e) => setLumpSum(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-mono font-bold focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Quick preset buttons */}
                <div className="flex items-center gap-1.5 pt-1 overflow-x-auto text-[11px]">
                  <span className="text-slate-500 text-[10px] uppercase tracking-wider shrink-0">Quick presets:</span>
                  {[25000, 50000, 100000, 200000, 500000].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setLumpSum(amt)}
                      className={`px-2.5 py-1 rounded-lg border font-mono transition active:scale-95 ${
                        lumpSum === amt
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {formatCurrency(amt, settings.currencySymbol)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Simulation Comparison Cards */}
              {prepayResults && currentLoan && (
                <div className="space-y-3">
                  <div className="p-3 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div className="text-xs">
                      <strong className="text-white block font-bold">
                        Executive Recommendation:
                      </strong>
                      <span className="text-slate-300">
                        {prepayResults.interestSavedTenure >= prepayResults.interestSavedEmi
                          ? `Reducing tenure saves ${formatCurrency(prepayResults.interestSavedTenure, settings.currencySymbol)} in interest — maximizing your net worth!`
                          : `Reducing EMI saves ${formatCurrency(prepayResults.interestSavedEmi, settings.currencySymbol)} while giving you monthly cashflow relief.`}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Option 1: Reduce Tenure */}
                    <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/40 relative overflow-hidden shadow-lg space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Option A</span>
                          <h4 className="text-sm font-bold text-white mt-0.5">Reduce Tenure (Payoff Faster)</h4>
                        </div>
                        <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-md border border-emerald-500/30">
                          Recommended
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Total Interest Saved:</span>
                          <span className="text-base font-extrabold text-emerald-400 font-mono">
                            {formatCurrency(prepayResults.interestSavedTenure, settings.currencySymbol)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Time Shaved Off:</span>
                          <span className="font-bold text-white">
                            {prepayResults.monthsSaved} Months ({Math.round((prepayResults.monthsSaved / 12) * 10) / 10} yrs)
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">New Tenure:</span>
                          <span className="text-slate-200">
                            {prepayResults.newTenureMonths} months remaining
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Keeps monthly EMI unchanged at {formatCurrency(currentLoan.monthlyEmi, settings.currencySymbol)}, but finishes the loan {prepayResults.monthsSaved} months sooner!
                      </p>
                    </div>

                    {/* Option 2: Reduce Monthly EMI */}
                    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                      <div>
                        <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">Option B</span>
                        <h4 className="text-sm font-bold text-white mt-0.5">Reduce Monthly EMI (Cashflow Relief)</h4>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">New Lower EMI:</span>
                          <span className="text-base font-extrabold text-sky-400 font-mono">
                            {formatCurrency(prepayResults.newMonthlyEmi, settings.currencySymbol)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Monthly Cash Saved:</span>
                          <span className="font-bold text-white">
                            {formatCurrency(prepayResults.monthlyEmiReduction, settings.currencySymbol)} / month
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Total Interest Saved:</span>
                          <span className="text-slate-200">
                            {formatCurrency(prepayResults.interestSavedEmi, settings.currencySymbol)}
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Lowers your monthly outflow immediately, boosting your disposable income while keeping the original maturity date.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 2: STANDARD EMI CALCULATOR */}
      {tab === 'emi_calc' && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800/90 space-y-4">
            {/* Principal slider */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="text-slate-400 font-medium">Loan Principal</span>
                <span className="font-extrabold text-white text-sm font-mono">
                  {formatCurrency(calcPrincipal, settings.currencySymbol)}
                </span>
              </div>
              <input
                type="range"
                min="50000"
                max="10000000"
                step="50000"
                value={calcPrincipal}
                onChange={(e) => setCalcPrincipal(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Interest slider */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="text-slate-400 font-medium">Interest Rate</span>
                <span className="font-extrabold text-white text-sm font-mono">
                  {calcRate}% p.a.
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="25"
                step="0.1"
                value={calcRate}
                onChange={(e) => setCalcRate(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Tenure slider */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="text-slate-400 font-medium">Tenure Duration</span>
                <span className="font-extrabold text-white text-sm font-mono">
                  {calcTenureYears} Years ({calcMonths} months)
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={calcTenureYears}
                onChange={(e) => setCalcTenureYears(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Results Card */}
          <div className="p-5 rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 shadow-xl space-y-4">
            <div className="text-center">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Monthly EMI Outflow
              </span>
              <div className="text-3xl font-extrabold text-emerald-400 mt-1 font-mono tracking-tight">
                {formatCurrency(calcMonthlyEmi, settings.currencySymbol)}
              </div>
            </div>

            {/* Breakdown Bar */}
            <div className="space-y-2">
              <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${calcPrincipalPct}%` }}
                  title={`Principal: ${calcPrincipalPct}%`}
                />
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${calcInterestPct}%` }}
                  title={`Interest: ${calcInterestPct}%`}
                />
              </div>

              <div className="flex justify-between text-xs pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  <span className="text-slate-300">Principal: {formatCurrency(calcPrincipal, settings.currencySymbol)} ({calcPrincipalPct}%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                  <span className="text-slate-300">Interest: {formatCurrency(calcTotalInterest, settings.currencySymbol)} ({calcInterestPct}%)</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex justify-between text-xs text-slate-300">
              <span className="text-slate-400">Total Lifetime Outflow:</span>
              <span className="font-extrabold text-white font-mono">
                {formatCurrency(calcTotalPayable, settings.currencySymbol)}
              </span>
            </div>
          </div>

          {/* Amortization Table */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Year-by-Year Amortization Schedule
            </h4>

            <div className="overflow-x-auto max-h-60 overflow-y-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 pr-2">Year</th>
                    <th className="py-2 px-2">Principal</th>
                    <th className="py-2 px-2">Interest</th>
                    <th className="py-2 pl-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {yearlySchedule.map((row) => (
                    <tr key={row.year} className="hover:bg-slate-800/40">
                      <td className="py-2 pr-2 font-sans font-bold text-slate-300">Yr {row.year}</td>
                      <td className="py-2 px-2 text-emerald-400">{formatCurrency(row.principalPaid, settings.currencySymbol)}</td>
                      <td className="py-2 px-2 text-amber-400">{formatCurrency(row.interestPaid, settings.currencySymbol)}</td>
                      <td className="py-2 pl-2 text-right text-slate-200">{formatCurrency(row.balanceLeft, settings.currencySymbol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LOAN COMPARATOR */}
      {tab === 'comparison' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Compare Two Loan Offers
            </h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Loan Amount</label>
                <input
                  type="number"
                  value={compLoanAmount}
                  onChange={(e) => setCompLoanAmount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Tenure (Years)</label>
                <input
                  type="number"
                  value={compTenureYears}
                  onChange={(e) => setCompTenureYears(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white font-mono"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Offer A */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5 text-xs">
              <input
                type="text"
                value={bankAName}
                onChange={(e) => setBankAName(e.target.value)}
                className="w-full bg-transparent font-bold text-white text-sm border-b border-slate-700 pb-1 focus:outline-none"
              />
              <div className="space-y-2 pt-1">
                <div>
                  <label className="text-[11px] text-slate-400">Interest Rate (%)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={bankARate}
                    onChange={(e) => setBankARate(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400">Processing Fee ({settings.currencySymbol})</label>
                  <input
                    type="number"
                    value={bankAFee}
                    onChange={(e) => setBankAFee(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
                  />
                </div>

                <div className="pt-2 border-t border-slate-800/80 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Monthly EMI:</span>
                    <span className="font-extrabold text-white font-mono">
                      {formatCurrency(compResults.emiA, settings.currencySymbol)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Net Cost:</span>
                    <span className="font-bold text-slate-200 font-mono">
                      {formatCurrency(compResults.totalA, settings.currencySymbol)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Offer B */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5 text-xs">
              <input
                type="text"
                value={bankBName}
                onChange={(e) => setBankBName(e.target.value)}
                className="w-full bg-transparent font-bold text-white text-sm border-b border-slate-700 pb-1 focus:outline-none"
              />
              <div className="space-y-2 pt-1">
                <div>
                  <label className="text-[11px] text-slate-400">Interest Rate (%)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={bankBRate}
                    onChange={(e) => setBankBRate(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400">Processing Fee ({settings.currencySymbol})</label>
                  <input
                    type="number"
                    value={bankBFee}
                    onChange={(e) => setBankBFee(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
                  />
                </div>

                <div className="pt-2 border-t border-slate-800/80 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Monthly EMI:</span>
                    <span className="font-extrabold text-white font-mono">
                      {formatCurrency(compResults.emiB, settings.currencySymbol)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Net Cost:</span>
                    <span className="font-bold text-slate-200 font-mono">
                      {formatCurrency(compResults.totalB, settings.currencySymbol)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Verdict Card */}
          <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                Cost Verdict
              </span>
              <p className="text-xs text-white mt-0.5">
                <strong>{compResults.winner}</strong> is cheaper by{' '}
                <span className="text-emerald-400 font-mono font-bold">
                  {formatCurrency(compResults.diff, settings.currencySymbol)}
                </span>{' '}
                over {compTenureYears} years.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
