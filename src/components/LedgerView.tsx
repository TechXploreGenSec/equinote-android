import { useState, useMemo, useRef } from 'react';
import {
  Download, Search, Trash2, Calendar,
  CreditCard, CheckCircle2, ArrowDownLeft, Upload, FileSpreadsheet
} from 'lucide-react';
import { PaymentRecord, UserSettings, LoanItem } from '../types';
import { formatCurrency } from '../utils/finance';
import { exportPaymentsCsv, parsePaymentsCsv, PAYMENTS_CSV_EXAMPLE } from '../utils/storage';
import { downloadTextFile } from '../utils/shareFile';

interface LedgerViewProps {
  payments: PaymentRecord[];
  loans: LoanItem[];
  settings: UserSettings;
  onDeletePayment: (paymentId: string) => void;
  onImportPayments: (records: PaymentRecord[]) => void;
}

export default function LedgerView({
  payments,
  loans,
  settings,
  onDeletePayment,
  onImportPayments,
}: LedgerViewProps) {
  const [search, setSearch] = useState('');
  const [selectedLoanFilter, setSelectedLoanFilter] = useState<string>('all');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

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

  const handleDownloadCsv = async () => {
    try {
      const saved = await downloadTextFile(
        `EquiNote_Payment_Ledger_${new Date().toISOString().split('T')[0]}.csv`,
        exportPaymentsCsv(payments),
        'EquiNote Ledger'
      );
      setImportStatus(`Ledger saved at ${saved.location} — use the share sheet to keep a copy.`);
      setTimeout(() => setImportStatus(null), 8000);
    } catch (err) {
      setImportStatus(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setImportStatus(null), 8000);
    }
  };

  const handleDownloadExampleCsv = async () => {
    try {
      await downloadTextFile('EquiNote_Payments_Example.csv', PAYMENTS_CSV_EXAMPLE, 'EquiNote Example');
    } catch (err) {
      setImportStatus(`Example download failed: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setImportStatus(null), 8000);
    }
  };

  const handleImportCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      runPaymentsImport(event.target?.result as string);
    };
    reader.readAsText(file);
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const runPaymentsImport = (content: string) => {
    const { records, imported, skipped } = parsePaymentsCsv(content, loans);
    if (imported > 0) {
      onImportPayments(records);
      setImportStatus(
        `Imported ${imported} payment${imported > 1 ? 's' : ''}` +
        (skipped > 0 ? `, skipped ${skipped} (unknown loan or bad row)` : '') +
        '. Loan progress aligned to highest installment.'
      );
      setPasteText('');
    } else {
      setImportStatus('No rows imported. Check the example CSV format and loan titles.');
    }
    setTimeout(() => setImportStatus(null), 6000);
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

        <div className="flex items-center gap-2">
          <button
            onClick={() => csvInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs text-emerald-300 font-semibold transition active:scale-95"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Bulk Upload CSV</span>
          </button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={handleImportCsvFile}
            className="hidden"
          />

          <button
            onClick={handleDownloadCsv}
            disabled={payments.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 font-semibold transition active:scale-95 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* CSV format help + example */}
      <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            Bulk upload format
          </span>
          <button
            onClick={handleDownloadExampleCsv}
            className="text-[11px] font-bold text-emerald-400 hover:underline"
          >
            Download example CSV
          </button>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Columns: <span className="font-mono text-slate-300">Loan Title, Amount, Date, Month-Year, Installment #, Payment Mode, Reference ID, Notes</span>.
          Loan Title must match an existing loan. Dates as <span className="font-mono">YYYY-MM-DD</span>.
        </p>
        <pre className="text-[10px] font-mono text-slate-400 bg-slate-950 border border-slate-800 rounded-xl p-2.5 overflow-x-auto whitespace-pre">
{PAYMENTS_CSV_EXAMPLE}
        </pre>
        <button
          onClick={() => setShowPaste(!showPaste)}
          className="text-[11px] font-bold text-sky-400 hover:underline"
        >
          {showPaste ? 'Hide paste box' : 'File picker not opening? Paste CSV text instead'}
        </button>
        {showPaste && (
          <div className="space-y-2">
            <textarea
              rows={5}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste your payments CSV here, header row included…"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-[11px] font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={() => runPaymentsImport(pasteText)}
              disabled={!pasteText.trim()}
              className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs transition active:scale-98"
            >
              Import Pasted CSV
            </button>
          </div>
        )}
        {importStatus && (
          <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs">
            {importStatus}
          </div>
        )}
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
