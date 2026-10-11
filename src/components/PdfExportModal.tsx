import { useState } from 'react';
import { 
  X, FileText, Download, Printer, Check, 
  CheckSquare, Square, Layers, Eye, ChevronDown, ChevronUp
} from 'lucide-react';
import { LoanItem, PaymentRecord, UserSettings } from '../types';
import { generatePortfolioPdf, formatPdfCurrency } from '../utils/pdfGenerator';
import { savePdfNative, isNativeAndroid, friendlyNativeError } from '../utils/capacitorPdf';
import { formatCurrency, calculateRemainingBalance, calculateTotalInterest } from '../utils/finance';
import { calculateDueStatus } from '../utils/storage';
import { CATEGORIES } from '../utils/categories';

interface PdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  loans: LoanItem[];
  payments: PaymentRecord[];
  settings: UserSettings;
  defaultSpecificLoanId?: string;
}

export default function PdfExportModal({
  isOpen,
  onClose,
  loans,
  payments,
  settings,
  defaultSpecificLoanId,
}: PdfExportModalProps) {
  const [scope, setScope] = useState<'full' | 'specific'>(
    defaultSpecificLoanId ? 'specific' : 'full'
  );
  const [selectedLoanId, setSelectedLoanId] = useState<string>(
    defaultSpecificLoanId || loans[0]?.id || ''
  );
  const [includeClosed, setIncludeClosed] = useState(true);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [showPreview, setShowPreview] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const onNative = isNativeAndroid();

  if (!isOpen) return null;

  const activeLoans = loans.filter((l) => !l.isClosed);
  const targetLoans = scope === 'specific'
    ? loans.filter((l) => l.id === selectedLoanId)
    : includeClosed
    ? loans
    : activeLoans;

  const totalOutstanding = targetLoans.reduce((sum, l) => {
    return sum + (l.isClosed ? 0 : calculateRemainingBalance(l.principal, l.interestRate, l.totalMonths, l.paidMonths));
  }, 0);

  const totalMonthlyEmi = targetLoans.reduce((sum, l) => sum + (l.isClosed ? 0 : l.monthlyEmi), 0);

  const dtiRatio = settings.monthlyIncome > 0
    ? Math.round((totalMonthlyEmi / settings.monthlyIncome) * 100)
    : 0;

  const currentDateStr = new Date().toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const targetPayments = scope === 'specific'
    ? payments.filter((p) => p.loanId === selectedLoanId)
    : payments;

  // Direct PDF Download (web: browser download, Android: save to Documents + Share sheet)
  const handleDownloadPdf = () => {
    setIsGenerating(true);
    setPdfError(null);
    setTimeout(async () => {
      try {
        const doc = generatePortfolioPdf(loans, payments, settings, {
          includeClosedLoans: includeClosed,
          includePaymentHistory: includeHistory,
          specificLoanId: scope === 'specific' ? selectedLoanId : undefined,
          orientation,
        });

        const dateStr = new Date().toISOString().split('T')[0];
        const filename = scope === 'specific'
          ? `EquiNote_Loan_Dossier_${dateStr}.pdf`
          : `EquiNote_EMI_Statement_${dateStr}.pdf`;

        const savedNatively = await savePdfNative(doc, filename);
        if (!savedNatively) {
          doc.save(filename);
        }
        setDownloadSuccess(true);
        setTimeout(() => setDownloadSuccess(false), 2500);
      } catch (err) {
        setPdfError(friendlyNativeError(err));
      } finally {
        setIsGenerating(false);
      }
    }, 100);
  };

  // Print: browser print engine on web. Android WebView has no print
  // pipeline, so on native this routes to the same save+share flow.
  const handleNativePrint = () => {
    if (onNative) {
      handleDownloadPdf();
      return;
    }
    window.print();
  };

  return (
    <>
      {/* ON-SCREEN MODAL */}
      <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
        <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom duration-200">
          {/* Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                <FileText className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">EMI Statement &amp; PDF Print</h3>
                <p className="text-xs text-slate-400">100% visible, formatted without clipping</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Options Body */}
          <div className="overflow-y-auto p-5 space-y-4 text-xs text-slate-300">
            {/* Scope Selection */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Select Statement Scope
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScope('full')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-1 ${
                    scope === 'full'
                      ? 'bg-emerald-500/15 border-emerald-500 text-white font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs">Full Portfolio ({loans.length})</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-normal">
                    All active &amp; settled loans
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setScope('specific')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-1 ${
                    scope === 'specific'
                      ? 'bg-emerald-500/15 border-emerald-500 text-white font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-sky-400" />
                    <span className="text-xs">Single Loan Dossier</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-normal">
                    One loan with terms &amp; NOC
                  </span>
                </button>
              </div>
            </div>

            {/* Loan dropdown if specific */}
            {scope === 'specific' && (
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-400 font-semibold">
                  Choose Loan to Extract
                </label>
                <select
                  value={selectedLoanId}
                  onChange={(e) => setSelectedLoanId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                >
                  {loans.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title} ({l.lender} - {formatCurrency(l.monthlyEmi, settings.currencySymbol)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Page Orientation Selector */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                PDF Layout Orientation
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrientation('landscape')}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    orientation === 'landscape'
                      ? 'bg-emerald-500/15 border-emerald-500 text-white font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="text-xs flex items-center justify-between">
                    <span>Landscape (Wide)</span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                      Best Fit
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-normal mt-0.5">
                    Fits all 9 table columns with 0% clipping
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setOrientation('portrait')}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    orientation === 'portrait'
                      ? 'bg-emerald-500/15 border-emerald-500 text-white font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="text-xs">Portrait (Standard)</div>
                  <p className="text-[10px] text-slate-400 font-normal mt-0.5">
                    Standard vertical A4 page format
                  </p>
                </button>
              </div>
            </div>

            {/* Inclusions */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Sections to Include
              </span>

              {scope === 'full' && (
                <div
                  onClick={() => setIncludeClosed(!includeClosed)}
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  {includeClosed ? (
                    <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                  <span className="text-xs text-slate-300">
                    Include Settled / Closed loans in statement
                  </span>
                </div>
              )}

              <div
                onClick={() => setIncludeHistory(!includeHistory)}
                className="flex items-center gap-2 cursor-pointer select-none"
              >
                {includeHistory ? (
                  <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-500 shrink-0" />
                )}
                <span className="text-xs text-slate-300">
                  Include Recorded Payment Ledger ({targetPayments.length} records)
                </span>
              </div>
            </div>

            {/* Live Document Preview Toggle */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white transition"
              >
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-xs">
                    {showPreview ? 'Hide Document Preview' : 'Show Document Preview (Verify Full View)'}
                  </span>
                </div>
                {showPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showPreview && (
                <div className="mt-2.5 p-3 rounded-2xl bg-white text-slate-900 border border-slate-200 overflow-x-auto max-h-64 text-[10px]">
                  <div className="border-b border-slate-200 pb-2 mb-2 flex justify-between items-center">
                    <div>
                      <strong className="text-xs text-slate-900">EQUINOTE STATEMENT PREVIEW</strong>
                      <div className="text-slate-500">Holder: {settings.userName} · {currentDateStr}</div>
                    </div>
                    <div className="text-right">
                      <strong className="text-emerald-700 font-mono">
                        {formatCurrency(totalOutstanding, settings.currencySymbol)}
                      </strong>
                      <div className="text-slate-500">Total Outstanding</div>
                    </div>
                  </div>

                  {/* Sample table preview */}
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 border-b border-slate-300">
                        <th className="p-1 w-6 text-center">#</th>
                        <th className="p-1">Loan &amp; Lender</th>
                        <th className="p-1">Category</th>
                        <th className="p-1 text-right">EMI</th>
                        <th className="p-1 text-center">Tenure / Due</th>
                        <th className="p-1 text-right">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {targetLoans.map((l, idx) => {
                        const bal = calculateRemainingBalance(l.principal, l.interestRate, l.totalMonths, l.paidMonths);
                        const cat = CATEGORIES[l.category]?.label || l.category;
                        return (
                          <tr key={l.id}>
                            <td className="p-1 text-center font-mono">{idx + 1}</td>
                            <td className="p-1">
                              <strong className="text-slate-900 block">{l.title}</strong>
                              <span className="text-[9px] text-slate-500">
                                {l.lender} {l.autoDebitBank ? `· ${l.autoDebitBank}` : ''}
                              </span>
                            </td>
                            <td className="p-1 text-slate-600">{cat}</td>
                            <td className="p-1 text-right text-emerald-700 font-bold font-mono">
                              {formatCurrency(l.monthlyEmi, settings.currencySymbol)}
                            </td>
                            <td className="p-1 text-center">
                              <span className="font-mono block">{l.paidMonths}/{l.totalMonths}m</span>
                              <span className="text-[9px] text-slate-500">Day {l.dueDay}</span>
                            </td>
                            <td className="p-1 text-right font-mono font-bold text-slate-900">
                              {l.isClosed ? 'Settled' : formatCurrency(bal, settings.currencySymbol)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[9px] text-slate-500 italic">
                    All numbers and columns fit automatically without clipping.
                  </p>
                </div>
              )}
            </div>

            {/* Dual Action Buttons */}
            <div className="pt-2 space-y-2">
              <button
                onClick={handleNativePrint}
                disabled={isGenerating || targetLoans.length === 0}
                className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm transition shadow-lg shadow-emerald-950/40 active:scale-98 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Printer className="w-4 h-4 stroke-[2.5]" />
                <span>{onNative ? 'Share / Save PDF (Recommended)' : 'Print / Save as PDF (Native Engine)'}</span>
              </button>

              {pdfError && (
                <p className="text-[11px] leading-relaxed bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl px-3 py-2">
                  {pdfError}
                </p>
              )}

              <button
                onClick={handleDownloadPdf}
                disabled={isGenerating || targetLoans.length === 0}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition flex items-center justify-center gap-2"
              >
                {downloadSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400 font-bold">
                      {onNative ? 'Saved to Documents + Share sheet!' : 'Downloaded .PDF File!'}
                    </span>
                  </>
                ) : isGenerating ? (
                  <span>Generating Document...</span>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-slate-400" />
                    <span>Download Formatted .PDF File ({orientation})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* PRINT-ONLY CONTAINER (ACTIVE WHEN USER CLICKS PRINT / SAVE TO PDF) */}
      <div className="hidden print:block print-area p-4 bg-white text-slate-900 font-sans">
        {/* Header */}
        <div className="border-b-2 border-slate-900 pb-3 mb-4 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              EQUINOTE - EMI &amp; LOAN PORTFOLIO STATEMENT
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Personal Debt Management &amp; Repayment Schedule Statement
            </p>
          </div>
          <div className="text-right text-xs">
            <span className="font-bold text-slate-900 block">CONFIDENTIAL STATEMENT</span>
            <span className="text-slate-600">Generated: {currentDateStr}</span>
          </div>
        </div>

        {/* User Particulars */}
        <div className="bg-slate-50 border border-slate-300 rounded p-2.5 mb-4 grid grid-cols-3 text-xs">
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">Account Holder</span>
            <strong className="text-slate-900">{settings.userName || 'Account Lead'}</strong>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">Net Monthly Income</span>
            <strong className="text-slate-900">{formatCurrency(settings.monthlyIncome, settings.currencySymbol)}</strong>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">Scope</span>
            <strong className="text-slate-900">
              {scope === 'specific' ? 'Single Loan Dossier' : `${targetLoans.length} Loans Included`}
            </strong>
          </div>
        </div>

        {/* Aggregate Cards */}
        {scope === 'full' && (
          <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
            <div className="border border-slate-300 bg-slate-50 p-2.5 rounded">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Total Outstanding Debt</span>
              <div className="text-base font-extrabold text-slate-900 mt-0.5">
                {formatCurrency(totalOutstanding, settings.currencySymbol)}
              </div>
            </div>

            <div className="border border-slate-300 bg-slate-50 p-2.5 rounded">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Monthly EMI Burden</span>
              <div className="text-base font-extrabold text-emerald-700 mt-0.5">
                {formatCurrency(totalMonthlyEmi, settings.currencySymbol)}
              </div>
            </div>

            <div className="border border-slate-300 bg-slate-50 p-2.5 rounded">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Debt-To-Income (DTI)</span>
              <div className="text-base font-extrabold text-slate-900 mt-0.5">
                {dtiRatio}% of Income
              </div>
            </div>
          </div>
        )}

        {/* Main Table */}
        <div className="mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1.5">
            Active EMI &amp; Loan Schedule
          </h2>
          <table className="w-full text-left text-xs border border-slate-300 border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px]">
                <th className="p-1.5 border border-slate-900 text-center w-8">#</th>
                <th className="p-1.5 border border-slate-900">Loan Details &amp; Bank Mandate</th>
                <th className="p-1.5 border border-slate-900">Category</th>
                <th className="p-1.5 border border-slate-900 text-right">Monthly EMI</th>
                <th className="p-1.5 border border-slate-900 text-center">Tenure &amp; Due</th>
                <th className="p-1.5 border border-slate-900 text-right">Outstanding Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 text-[11px]">
              {targetLoans.map((loan, idx) => {
                const bal = calculateRemainingBalance(loan.principal, loan.interestRate, loan.totalMonths, loan.paidMonths);
                const cat = CATEGORIES[loan.category]?.label || loan.category;
                const rateText = loan.interestRate > 0 ? `${loan.interestRate}% p.a.` : '0% No-cost';
                return (
                  <tr key={loan.id} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                    <td className="p-1.5 border border-slate-300 text-center">{idx + 1}</td>
                    <td className="p-1.5 border border-slate-300">
                      <strong className="text-slate-900 block">{loan.title}</strong>
                      <span className="text-[10px] text-slate-600">
                        {loan.lender} {loan.autoDebitBank ? `· Mandate: ${loan.autoDebitBank}` : ''}
                      </span>
                    </td>
                    <td className="p-1.5 border border-slate-300">{cat}</td>
                    <td className="p-1.5 border border-slate-300 text-right font-bold text-emerald-800">
                      {formatCurrency(loan.monthlyEmi, settings.currencySymbol)}
                    </td>
                    <td className="p-1.5 border border-slate-300 text-center">
                      <span className="block font-semibold">{loan.paidMonths} / {loan.totalMonths}m</span>
                      <span className="text-[10px] text-slate-500">Due {loan.dueDay}th</span>
                    </td>
                    <td className="p-1.5 border border-slate-300 text-right">
                      <strong className="block font-bold">
                        {loan.isClosed ? 'Settled' : formatCurrency(bal, settings.currencySymbol)}
                      </strong>
                      <span className="text-[10px] text-slate-500">{rateText}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Single loan notes if single */}
        {scope === 'specific' && targetLoans.length > 0 && (
          <div className="border border-slate-300 bg-slate-50 p-3 rounded mb-4 text-xs space-y-1">
            <h3 className="font-bold text-slate-900 uppercase text-[11px]">
              Loan Particulars &amp; Preclosure Terms
            </h3>
            <div className="grid grid-cols-2 gap-2 text-slate-700">
              <div>
                <span>Original Principal: </span>
                <strong>{formatCurrency(targetLoans[0].principal, settings.currencySymbol)}</strong>
              </div>
              <div>
                <span>Account / Agreement #: </span>
                <strong>{targetLoans[0].accountNumber || 'N/A'}</strong>
              </div>
              <div>
                <span>Start Date: </span>
                <strong>{targetLoans[0].startDate || 'N/A'}</strong>
              </div>
              <div>
                <span>Auto-Debit Mandate: </span>
                <strong>{targetLoans[0].autoDebitBank || 'N/A'}</strong>
              </div>
            </div>
            {targetLoans[0].notes && (
              <div className="pt-2 border-t border-slate-200 mt-2">
                <span className="font-semibold block text-[10px] text-slate-600">Notes / Remarks:</span>
                <p className="italic text-slate-800 mt-0.5">{targetLoans[0].notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Payment History if included */}
        {includeHistory && targetPayments.length > 0 && (
          <div className="mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-1.5">
              Payment Audit Ledger ({targetPayments.length} Transactions)
            </h2>
            <table className="w-full text-left text-xs border border-slate-300 border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white text-[11px]">
                  <th className="p-1.5 border border-slate-800 text-center w-8">#</th>
                  <th className="p-1.5 border border-slate-800">Date</th>
                  <th className="p-1.5 border border-slate-800">Loan Title</th>
                  <th className="p-1.5 border border-slate-800 text-center">Inst #</th>
                  <th className="p-1.5 border border-slate-800">Mode</th>
                  <th className="p-1.5 border border-slate-800">Reference ID</th>
                  <th className="p-1.5 border border-slate-800 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300 text-[11px]">
                {targetPayments.slice(0, 30).map((p, idx) => (
                  <tr key={p.id} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                    <td className="p-1.5 border border-slate-300 text-center">{idx + 1}</td>
                    <td className="p-1.5 border border-slate-300">{p.paidDate}</td>
                    <td className="p-1.5 border border-slate-300 font-bold">{p.loanTitle}</td>
                    <td className="p-1.5 border border-slate-300 text-center">#{p.installmentNumber}</td>
                    <td className="p-1.5 border border-slate-300">{p.paymentMode || 'Auto-Debit'}</td>
                    <td className="p-1.5 border border-slate-300 text-[10px]">{p.transactionRef || '-'}</td>
                    <td className="p-1.5 border border-slate-300 text-right font-bold text-emerald-800">
                      {formatCurrency(p.amount, settings.currencySymbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer Notice */}
        <div className="border-t border-slate-300 pt-3 text-[10px] text-slate-500 flex justify-between items-center">
          <span>EquiNote Personal Finance Statement · Generated Offline · Private &amp; Confidential</span>
          <span>Printed on {currentDateStr}</span>
        </div>
      </div>
    </>
  );
}
