import { useState, useMemo, useRef } from 'react';
import {
  Search, Plus, Filter, CheckCircle2,
  ChevronRight, ArrowUpDown, ShieldCheck, Check, FileText, Upload, FileSpreadsheet
} from 'lucide-react';
import { LoanItem, UserSettings, LoanCategory } from '../types';
import { calculateDueStatus, parseLoansCsv, LOANS_CSV_EXAMPLE } from '../utils/storage';
import { formatCurrency, calculateRemainingBalance } from '../utils/finance';
import { downloadTextFile } from '../utils/shareFile';
import { CATEGORIES } from '../utils/categories';

interface LoansViewProps {
  loans: LoanItem[];
  settings: UserSettings;
  onOpenAddLoan: () => void;
  onSelectLoan: (loan: LoanItem) => void;
  onOpenPayModal: (loan: LoanItem) => void;
  onOpenPdfExport: () => void;
  onImportLoans: (loans: LoanItem[]) => void;
}

type FilterStatus = 'all_active' | 'due_soon' | 'closed' | 'all';
type SortOption = 'due_day' | 'emi_desc' | 'balance_desc' | 'progress_desc' | 'name';

export default function LoansView({
  loans,
  settings,
  onOpenAddLoan,
  onSelectLoan,
  onOpenPayModal,
  onOpenPdfExport,
  onImportLoans,
}: LoansViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all_active');
  const [selectedCategory, setSelectedCategory] = useState<LoanCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('due_day');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const loansInputRef = useRef<HTMLInputElement>(null);

  // Filter and sort loans
  const filteredLoans = useMemo(() => {
    return loans
      .filter((loan) => {
        // Status filter
        if (filterStatus === 'all_active' && loan.isClosed) return false;
        if (filterStatus === 'closed' && !loan.isClosed) return false;
        if (filterStatus === 'due_soon') {
          if (loan.isClosed) return false;
          const due = calculateDueStatus(loan);
          if (due.status !== 'overdue' && due.status !== 'due_today' && due.status !== 'due_soon') {
            return false;
          }
        }

        // Category filter
        if (selectedCategory !== 'all' && loan.category !== selectedCategory) return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = loan.title.toLowerCase().includes(q);
          const matchLender = loan.lender.toLowerCase().includes(q);
          const matchAcc = (loan.accountNumber || '').toLowerCase().includes(q);
          const matchNotes = (loan.notes || '').toLowerCase().includes(q);
          if (!matchTitle && !matchLender && !matchAcc && !matchNotes) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'due_day') {
          return a.dueDay - b.dueDay;
        }
        if (sortBy === 'emi_desc') {
          return b.monthlyEmi - a.monthlyEmi;
        }
        if (sortBy === 'balance_desc') {
          const balA = calculateRemainingBalance(a.principal, a.interestRate, a.totalMonths, a.paidMonths);
          const balB = calculateRemainingBalance(b.principal, b.interestRate, b.totalMonths, b.paidMonths);
          return balB - balA;
        }
        if (sortBy === 'progress_desc') {
          const progA = a.paidMonths / a.totalMonths;
          const progB = b.paidMonths / b.totalMonths;
          return progB - progA;
        }
        return a.title.localeCompare(b.title);
      });
  }, [loans, filterStatus, selectedCategory, searchQuery, sortBy]);

  // Aggregate stats
  const activeCount = useMemo(() => loans.filter((l) => !l.isClosed).length, [loans]);
  const closedCount = useMemo(() => loans.filter((l) => l.isClosed).length, [loans]);

  const handleDownloadLoansExample = async () => {
    await downloadTextFile('EquiNote_Loans_Example.csv', LOANS_CSV_EXAMPLE, 'EquiNote Example');
  };

  const handleImportLoansFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const { loans: parsed, imported, skipped } = parseLoansCsv(content);
      if (imported > 0) {
        onImportLoans(parsed);
        setImportStatus(
          `Imported ${imported} loan${imported > 1 ? 's' : ''}` +
          (skipped > 0 ? `, skipped ${skipped} bad row${skipped > 1 ? 's' : ''}` : '') +
          '.'
        );
      } else {
        setImportStatus('No loans imported. Check the example CSV format below.');
      }
      setTimeout(() => setImportStatus(null), 6000);
    };
    reader.readAsText(file);
    if (loansInputRef.current) loansInputRef.current.value = '';
  };

  return (
    <div className="space-y-4 px-4 pb-28 pt-2 max-w-2xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">
            My Loan Portfolio
          </h2>
          <p className="text-xs text-slate-400">
            {activeCount} Active · {closedCount} Closed
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loansInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition active:scale-95"
            title="Bulk upload loans from CSV"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Bulk Upload</span>
          </button>
          <input
            ref={loansInputRef}
            type="file"
            accept=".csv"
            onChange={handleImportLoansFile}
            className="hidden"
          />

          <button
            onClick={onOpenPdfExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold transition active:scale-95"
            title="Export Portfolio to PDF"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            <span>PDF Extract</span>
          </button>

          <button
            onClick={onOpenAddLoan}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition shadow-md shadow-emerald-950/30 active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Loan</span>
          </button>
        </div>
      </div>

      {/* Loans CSV format help + example */}
      <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            Loans bulk upload format
          </span>
          <button
            onClick={handleDownloadLoansExample}
            className="text-[11px] font-bold text-emerald-400 hover:underline"
          >
            Download example CSV
          </button>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Columns: <span className="font-mono text-slate-300">Title, Lender, Category, Principal, Interest Rate, Tenure Months, Paid Months, Monthly EMI (blank = auto), Due Day, Start Date, Account Number, Auto-Debit, Notes, Paid This Month (yes/no)</span>.
          Categories: home, vehicle, gadget, personal, credit_card, education, bnpl, peer, business.
        </p>
        <pre className="text-[10px] font-mono text-slate-400 bg-slate-950 border border-slate-800 rounded-xl p-2.5 overflow-x-auto whitespace-pre">
{LOANS_CSV_EXAMPLE}
        </pre>
        {importStatus && (
          <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs">
            {importStatus}
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search loan title, bank, agreement no..."
          className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
          >
            Clear
          </button>
        )}
      </div>

      {/* Status Segmented Control */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {[
          { key: 'all_active', label: `Active (${activeCount})` },
          { key: 'due_soon', label: 'Due Soon' },
          { key: 'closed', label: `Settled (${closedCount})` },
          { key: 'all', label: `All (${loans.length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterStatus(tab.key as FilterStatus)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition active:scale-95 ${
              filterStatus === tab.key
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Category & Sort Row */}
      <div className="flex items-center justify-between gap-2 text-xs">
        {/* Category selector */}
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as LoanCategory | 'all')}
            className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-300 text-xs focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Categories</option>
            {Object.values(CATEGORIES).map((cat) => (
              <option key={cat.key} value={cat.key}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sort selector */}
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-300 text-xs focus:outline-none focus:border-emerald-500"
          >
            <option value="due_day">Sort: Due Day</option>
            <option value="emi_desc">Sort: Highest EMI</option>
            <option value="balance_desc">Sort: Highest Balance</option>
            <option value="progress_desc">Sort: Most Progress</option>
            <option value="name">Sort: Name (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Loans Cards List */}
      <div className="space-y-3">
        {filteredLoans.length === 0 ? (
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center space-y-3">
            <p className="text-sm text-slate-400">No loans match your filters.</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterStatus('all_active');
                setSelectedCategory('all');
              }}
              className="text-xs text-emerald-400 hover:underline"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          filteredLoans.map((loan) => {
            const cat = CATEGORIES[loan.category] || CATEGORIES.personal;
            const CatIcon = cat.icon;
            const balance = calculateRemainingBalance(loan.principal, loan.interestRate, loan.totalMonths, loan.paidMonths);
            const dueInfo = calculateDueStatus(loan);
            const progress = Math.min(100, Math.round((loan.paidMonths / loan.totalMonths) * 100));
            const isPaidThisMonth = dueInfo.status === 'paid_this_month';

            return (
              <div
                key={loan.id}
                className={`rounded-2xl border p-4 transition-all shadow-md ${
                  loan.isClosed
                    ? 'bg-slate-900/40 border-slate-800/60 opacity-60'
                    : 'bg-slate-900 border-slate-800/90 hover:border-slate-700'
                }`}
              >
                {/* Header: Category, Title, Due Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                    onClick={() => onSelectLoan(loan)}
                  >
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${cat.bgColor}`}>
                      <CatIcon className={`w-5 h-5 ${cat.color}`} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white truncate hover:text-emerald-300 transition">
                          {loan.title}
                        </h4>
                        {loan.isClosed && (
                          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            Settled
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span>{loan.lender}</span>
                        {loan.interestRate > 0 ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{loan.interestRate}% p.a.</span>
                          </>
                        ) : (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-400">0% No Cost</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Due Tag */}
                  {!loan.isClosed && (
                    <div className="shrink-0 text-right">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                        dueInfo.status === 'overdue'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : dueInfo.status === 'due_today'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : isPaidThisMonth
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-300'
                      }`}>
                        {dueInfo.statusText}
                      </span>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                <div className="mt-3.5 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">
                      Paid: <strong className="text-slate-200">{loan.paidMonths}</strong> of {loan.totalMonths} months
                    </span>
                    <span className="font-bold text-emerald-400">{progress}%</span>
                  </div>

                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Numbers Row: EMI, Outstanding, Actions */}
                <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">Monthly EMI</span>
                    <div className="text-sm font-extrabold text-white">
                      {formatCurrency(loan.monthlyEmi, settings.currencySymbol)}
                    </div>
                  </div>

                  <div className="space-y-0.5 text-center">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">Outstanding</span>
                    <div className="text-sm font-bold text-slate-300">
                      {loan.isClosed ? '₹ 0' : formatCurrency(balance, settings.currencySymbol)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!loan.isClosed && (
                      isPaidThisMonth ? (
                        <div className="flex items-center gap-1 text-xs text-emerald-400 px-2.5 py-1.5 rounded-xl bg-emerald-500/10">
                          <Check className="w-3.5 h-3.5" />
                          <span>Cleared</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => onOpenPayModal(loan)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition shadow-sm active:scale-95"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Pay</span>
                        </button>
                      )
                    )}

                    <button
                      onClick={() => onSelectLoan(loan)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
                      aria-label="View loan details"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Account / AutoDebit Note snippet */}
                {(loan.autoDebitBank || loan.accountNumber) && (
                  <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-2 bg-slate-950/40 px-2.5 py-1 rounded-lg">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">
                      {loan.autoDebitBank ? `Auto-debit: ${loan.autoDebitBank}` : `A/C: ${loan.accountNumber}`}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
