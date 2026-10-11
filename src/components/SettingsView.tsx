import { useState, useRef } from 'react';
import {
  Download, Upload, Trash2,
  User, DollarSign, Bell, Shield, Check, FileText
} from 'lucide-react';
import { UserSettings } from '../types';
import { exportAppData, importAppData } from '../utils/storage';
import { downloadTextFile } from '../utils/shareFile';
import { formatCurrency } from '../utils/finance';

interface SettingsViewProps {
  settings: UserSettings;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
  onReloadData: () => void;
  onOpenNotifications: () => void;
  onOpenPdfExport?: () => void;
}

const CURRENCIES = [
  { code: 'INR', symbol: '₹', label: 'INR (₹) - Indian Rupee' },
  { code: 'USD', symbol: '$', label: 'USD ($) - US Dollar' },
  { code: 'EUR', symbol: '€', label: 'EUR (€) - Euro' },
  { code: 'GBP', symbol: '£', label: 'GBP (£) - British Pound' },
  { code: 'AED', symbol: 'AED', label: 'AED - UAE Dirham' },
  { code: 'CAD', symbol: 'C$', label: 'CAD (C$) - Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', label: 'AUD (A$) - Australian Dollar' },
  { code: 'SGD', symbol: 'S$', label: 'SGD (S$) - Singapore Dollar' },
];

export default function SettingsView({
  settings,
  onUpdateSettings,
  onReloadData,
  onOpenNotifications,
  onOpenPdfExport,
}: SettingsViewProps) {
  const [userName, setUserName] = useState(settings.userName || '');
  const [monthlyIncome, setMonthlyIncome] = useState<number>(settings.monthlyIncome || 100000);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      userName: userName.trim(),
      monthlyIncome: Number(monthlyIncome),
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleCurrencyChange = (currCode: string) => {
    const found = CURRENCIES.find((c) => c.code === currCode);
    if (found) {
      onUpdateSettings({
        currency: found.code,
        currencySymbol: found.symbol,
      });
    }
  };

  const handleExportData = async () => {
    try {
      const jsonStr = exportAppData();
      const saved = await downloadTextFile(
        `EquiNote_Backup_${new Date().toISOString().split('T')[0]}.json`,
        jsonStr,
        'EquiNote Backup'
      );
      setExportStatus(`Backup saved at ${saved.location} — use the share sheet to keep a copy.`);
    } catch (err) {
      setExportStatus(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setTimeout(() => setExportStatus(null), 8000);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const success = importAppData(content);
      if (success) {
        setImportStatus('Backup restored successfully!');
        onReloadData();
      } else {
        setImportStatus('Failed to parse backup file. Please check format.');
      }
      setTimeout(() => setImportStatus(null), 4000);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClearAll = () => {
    if (window.confirm('Warning: This will delete all your loans and payment records. Continue?')) {
      localStorage.setItem('equinote_loans_v1', JSON.stringify([]));
      localStorage.setItem('equinote_payments_v1', JSON.stringify([]));
      onReloadData();
    }
  };

  return (
    <div className="space-y-4 px-4 pb-28 pt-2 max-w-2xl mx-auto text-xs">
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold text-white tracking-tight">
          Settings &amp; Backup
        </h2>
        <p className="text-xs text-slate-400">
          Personalize currency, financial health parameters &amp; manage offline data
        </p>
      </div>

      {/* Profile & Monthly Income */}
      <form onSubmit={handleSaveProfile} className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-emerald-400" />
          <h3 className="font-bold text-white text-xs uppercase tracking-wider">
            Personal &amp; Income Parameters
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Your Name</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Net Monthly Take-Home Income ({settings.currencySymbol})
            </label>
            <input
              type="number"
              min="0"
              step="5000"
              value={monthlyIncome}
              onChange={(e) => setMonthlyIncome(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-slate-500 mt-0.5 block">
              Used to calculate Debt-to-Income (DTI) ratio
            </span>
          </div>
        </div>

        <div className="pt-1 flex items-center justify-between">
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition active:scale-95 flex items-center gap-1.5"
          >
            {saveSuccess && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
            <span>{saveSuccess ? 'Saved' : 'Save Parameters'}</span>
          </button>
        </div>
      </form>

      {/* Currency Selection */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-400" />
          <h3 className="font-bold text-white text-xs uppercase tracking-wider">
            Display Currency
          </h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CURRENCIES.map((curr) => {
            const isSelected = settings.currency === curr.code;
            return (
              <button
                key={curr.code}
                type="button"
                onClick={() => handleCurrencyChange(curr.code)}
                className={`p-2.5 rounded-xl border text-left transition ${
                  isSelected
                    ? 'bg-emerald-500/15 border-emerald-500 text-white font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="text-base font-extrabold">{curr.symbol}</div>
                <div className="text-[10px] text-slate-400 truncate">{curr.code}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Notification Shortcut */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-white text-xs">Due Date Reminders &amp; Push Alerts</h4>
            <p className="text-[11px] text-slate-400">
              Configure lead time (1–5 days) and system browser permissions.
            </p>
          </div>
        </div>

        <button
          onClick={onOpenNotifications}
          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition"
        >
          Configure
        </button>
      </div>

      {/* Data Management & Offline Storage */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <h3 className="font-bold text-white text-xs uppercase tracking-wider">
            Offline Storage &amp; Data Portability
          </h3>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          EquiNote is 100% offline-first. Your financial figures, loan agreements, and payment records remain strictly in your private local browser storage and never touch external analytics or ads.
        </p>

        {importStatus && (
          <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>{importStatus}</span>
          </div>
        )}

        {exportStatus && (
          <div className="p-2.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>{exportStatus}</span>
          </div>
        )}

        {onOpenPdfExport && (
          <button
            onClick={onOpenPdfExport}
            className="w-full p-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 font-bold flex items-center justify-center gap-2 transition active:scale-98"
          >
            <FileText className="w-4 h-4" />
            <span>Generate Official PDF Statement</span>
          </button>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <button
            onClick={handleExportData}
            className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold flex items-center justify-center gap-2 transition"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export JSON Backup</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold flex items-center justify-center gap-2 transition"
          >
            <Upload className="w-3.5 h-3.5 text-sky-400" />
            <span>Restore from Backup</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>

        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-end text-[11px]">
          <button
            onClick={handleClearAll}
            className="text-rose-400 hover:text-rose-300 flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear All Data</span>
          </button>
        </div>
      </div>
    </div>
  );
}
