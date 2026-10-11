import { useState, useMemo } from 'react';
import {
  X, Plus, Trash2, Wallet, MessageSquareText, Check, ChevronDown,
  UtensilsCrossed, Car, ShoppingBag, Receipt, HeartPulse, Clapperboard,
  CircleDashed, Landmark, CreditCard, Banknote, Smartphone,
} from 'lucide-react';
import { ExpenseItem, ExpenseAccount, ExpenseCategory, ExpenseAccountKind, UserSettings } from '../types';
import { formatCurrency } from '../utils/finance';
import {
  isSmsSupported, ensureSmsPermission, readInboxSms,
  filterDebitCandidates, filterByUserBanks,
  suggestExpenseTitle, SpendCandidate,
} from '../utils/smsImport';

interface ExpensesViewProps {
  expenses: ExpenseItem[];
  accounts: ExpenseAccount[];
  settings: UserSettings;
  onSaveExpense: (expense: ExpenseItem) => void;
  onDeleteExpense: (id: string) => void;
  onSaveAccount: (account: ExpenseAccount) => void;
  onDeleteAccount: (id: string) => void;
  onImportSmsExpenses: (expenses: ExpenseItem[], smsIds: string[]) => void;
}

const EXPENSE_CATEGORIES: Record<ExpenseCategory, { label: string }> = {
  food: { label: 'Food & Dining' },
  travel: { label: 'Travel & Fuel' },
  shopping: { label: 'Shopping' },
  bills: { label: 'Bills & Recharge' },
  health: { label: 'Health' },
  fun: { label: 'Fun & Movies' },
  other: { label: 'Other' },
};

const ACCOUNT_KINDS: Record<ExpenseAccountKind, { label: string }> = {
  cash: { label: 'Cash' },
  bank: { label: 'Bank A/c' },
  card: { label: 'Card' },
  wallet: { label: 'Wallet / UPI' },
};

function categoryIcon(cat: ExpenseCategory) {
  switch (cat) {
    case 'food': return UtensilsCrossed;
    case 'travel': return Car;
    case 'shopping': return ShoppingBag;
    case 'bills': return Receipt;
    case 'health': return HeartPulse;
    case 'fun': return Clapperboard;
    default: return CircleDashed;
  }
}

function accountIcon(kind: ExpenseAccountKind) {
  switch (kind) {
    case 'bank': return Landmark;
    case 'card': return CreditCard;
    case 'cash': return Banknote;
    default: return Smartphone;
  }
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

interface SmsRow extends SpendCandidate {
  selected: boolean;
  title: string;
  reason: string;
  accountId: string;
}

export default function ExpensesView({
  expenses,
  accounts,
  settings,
  onSaveExpense,
  onDeleteExpense,
  onSaveAccount,
  onDeleteAccount,
  onImportSmsExpenses,
}: ExpensesViewProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [accountId, setAccountId] = useState('');
  const [reason, setReason] = useState('');

  const [isAccountFormOpen, setIsAccountFormOpen] = useState(false);
  const [accName, setAccName] = useState('');
  const [accKind, setAccKind] = useState<ExpenseAccountKind>('bank');
  const [accBalance, setAccBalance] = useState('');
  const [accBankName, setAccBankName] = useState('');
  const [accLast4, setAccLast4] = useState('');
  const [accSenderIds, setAccSenderIds] = useState('');

  const [isSmsOpen, setIsSmsOpen] = useState(false);
  const [smsStatus, setSmsStatus] = useState<string | null>(null);
  const [smsRows, setSmsRows] = useState<SmsRow[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  const monthPrefix = todayStr().slice(0, 7);

  const { todayTotal, monthTotal } = useMemo(() => {
    const t = todayStr();
    let today = 0;
    let month = 0;
    for (const e of expenses) {
      if (e.date === t) today += e.amount;
      if (e.date.startsWith(monthPrefix)) month += e.amount;
    }
    return { todayTotal: today, monthTotal: month };
  }, [expenses, monthPrefix]);

  const categoryTotals = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    for (const e of expenses) {
      if (!e.date.startsWith(monthPrefix)) continue;
      map.set(e.category, (map.get(e.category) || 0) + e.amount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses, monthPrefix]);

  const accountStats = useMemo(() => {
    return accounts.map((a) => {
      const spent = expenses
        .filter((e) => e.accountId === a.id && e.date.startsWith(monthPrefix))
        .reduce((s, e) => s + e.amount, 0);
      return { account: a, spent };
    });
  }, [accounts, expenses, monthPrefix]);

  const grouped = useMemo(() => {
    const map = new Map<string, ExpenseItem[]>();
    for (const e of [...expenses].sort((a, b) => b.date.localeCompare(a.date))) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return [...map.entries()];
  }, [expenses]);

  const accountName = (id?: string) => accounts.find((a) => a.id === id)?.name || '—';

  const resetExpenseForm = () => {
    setTitle(''); setAmount(''); setDate(todayStr());
    setCategory('food'); setAccountId(''); setReason('');
  };

  const handleSubmitExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!title.trim() || !Number.isFinite(amt) || amt <= 0 || !date) return;
    if (reason.trim().length < 2) return; // reason is mandatory
    onSaveExpense({
      id: `exp-${Date.now()}`,
      title: title.trim(),
      amount: amt,
      date,
      category,
      accountId: accountId || undefined,
      reason: reason.trim(),
      createdAt: new Date().toISOString(),
    });
    resetExpenseForm();
    setIsFormOpen(false);
  };

  const handleSubmitAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) return;
    onSaveAccount({
      id: `acc-${Date.now()}`,
      name: accName.trim(),
      kind: accKind,
      balance: accBalance ? Number(accBalance) : undefined,
      bankName: accBankName.trim() || undefined,
      last4: accLast4.trim() || undefined,
      senderIds: accSenderIds.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    setAccName(''); setAccKind('bank'); setAccBalance('');
    setAccBankName(''); setAccLast4(''); setAccSenderIds('');
    setIsAccountFormOpen(false);
  };

  const handleScanSms = async () => {
    setIsScanning(true);
    setSmsStatus('Requesting SMS permission…');
    try {
      if (!isSmsSupported()) {
        setSmsStatus('SMS scan needs the Android app with the SMS bridge — reinstall the latest beta APK.');
        return;
      }
      const perm = await ensureSmsPermission();
      if (!perm.granted) {
        setSmsStatus('SMS permission denied. Allow it in Android Settings → Apps → EquiNote → SMS, then scan again.');
        return;
      }
      setSmsStatus('Reading inbox… (stays on your phone)');
      const messages = await readInboxSms(200, 45);
      const { loadImportedSmsIds } = await import('../utils/storage');
      const { debits, skippedCredits } = filterDebitCandidates(messages, loadImportedSmsIds());
      if (debits.length === 0) {
        setSmsStatus(
          messages.length === 0
            ? 'No SMS in the last 45 days.'
            : `Scanned ${messages.length} SMS — no new spendings found${skippedCredits > 0 ? ` (${skippedCredits} credits ignored)` : ''}.`
        );
        setSmsRows([]);
        return;
      }
      const { mine, others, filtered } = filterByUserBanks(debits, accounts);
      if (mine.length === 0) {
        setSmsStatus(
          `Scanned ${messages.length} SMS, found ${debits.length} spending${debits.length > 1 ? 's' : ''} — but none match your banks. Add sender IDs / last-4 digits in My accounts below.`
        );
        setSmsRows([]);
        return;
      }
      setSmsRows(mine.map(({ candidate: d, accountId }) => ({
        ...d,
        selected: true,
        title: suggestExpenseTitle(d),
        reason: '',
        accountId: accountId || accounts[0]?.id || '',
      })));
      setSmsStatus(
        `Showing ${mine.length} from your bank${mine.length > 1 ? 's' : ''}` +
        (filtered && others > 0 ? ` — hid ${others} non-bank message${others > 1 ? 's' : ''}` : '') +
        (skippedCredits > 0 ? ` (${skippedCredits} credits ignored)` : '') +
        '. Confirm each new spend below — names are kept exactly as the SMS mentions them.' +
        (!filtered ? ' Tip: add sender IDs in My accounts to filter only your banks.' : '')
      );
    } catch (err) {
      setSmsStatus(`SMS scan failed (${err instanceof Error ? err.message : 'unknown error'}).`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleImportSms = () => {
    const chosen = smsRows.filter((r) => r.selected);
    const missingReason = chosen.filter((r) => r.reason.trim().length < 2);
    if (chosen.length === 0) {
      setSmsStatus('Select at least one spending to import.');
      return;
    }
    if (missingReason.length > 0) {
      setSmsStatus(`Add a reason for ${missingReason.length} selected item${missingReason.length > 1 ? 's' : ''} first — every spend needs a why.`);
      return;
    }
    const items: ExpenseItem[] = chosen.map((r) => ({
      id: `exp-${Date.now()}-${r.smsId}`,
      title: r.title.trim() || suggestExpenseTitle(r),
      amount: r.amount,
      date: r.date,
      category: 'other' as ExpenseCategory,
      accountId: r.accountId || undefined,
      reason: r.reason.trim(),
      smsId: r.smsId,
      createdAt: new Date().toISOString(),
    }));
    onImportSmsExpenses(items, chosen.map((r) => r.smsId));
    setSmsRows([]);
    setSmsStatus(`Imported ${items.length} spend${items.length > 1 ? 's' : ''} with reasons.`);
  };

  const maxCat = categoryTotals.length > 0 ? categoryTotals[0][1] : 0;

  return (
    <div className="space-y-4 px-4 pb-28 pt-2 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">Daily Spends</h2>
          <p className="text-xs text-slate-400">Every rupee out, with a reason attached</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSmsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-semibold transition active:scale-95"
          >
            <MessageSquareText className="w-3.5 h-3.5" />
            <span>Scan SMS</span>
          </button>
          <button
            onClick={() => setIsFormOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition shadow-md shadow-emerald-950/30 active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Spend</span>
          </button>
        </div>
      </div>

      {/* Totals hero */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800/90">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Spent today</span>
          <div className="text-xl font-extrabold text-white mt-1 font-mono">
            {formatCurrency(todayTotal, settings.currencySymbol)}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800/90">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Spent this month</span>
          <div className="text-xl font-extrabold text-amber-300 mt-1 font-mono">
            {formatCurrency(monthTotal, settings.currencySymbol)}
          </div>
        </div>
      </div>

      {/* Category breakdown */}
      {categoryTotals.length > 0 && (
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800/90 space-y-2.5">
          <h4 className="font-bold text-white text-xs uppercase tracking-wider">This month by category</h4>
          {categoryTotals.map(([cat, total]) => {
            const Icon = categoryIcon(cat);
            return (
              <div key={cat} className="flex items-center gap-2.5">
                <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-xs text-slate-300 w-24 truncate">{EXPENSE_CATEGORIES[cat].label}</span>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: `${maxCat > 0 ? Math.round((total / maxCat) * 100) : 0}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-white font-mono w-20 text-right">
                  {formatCurrency(total, settings.currencySymbol)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Accounts */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800/90 space-y-2.5">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
            <Wallet className="w-4 h-4 text-emerald-400" />
            My accounts
          </h4>
          <button
            onClick={() => setIsAccountFormOpen(!isAccountFormOpen)}
            className="text-[11px] font-bold text-emerald-400 hover:underline flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Add account
          </button>
        </div>

        {isAccountFormOpen && (
          <form onSubmit={handleSubmitAccount} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
            <input
              type="text" required value={accName} onChange={(e) => setAccName(e.target.value)}
              placeholder="e.g. HDFC Salary, Cash in hand"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={accKind} onChange={(e) => setAccKind(e.target.value as ExpenseAccountKind)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                {(Object.keys(ACCOUNT_KINDS) as ExpenseAccountKind[]).map((k) => (
                  <option key={k} value={k}>{ACCOUNT_KINDS[k].label}</option>
                ))}
              </select>
              <input
                type="number" min="0" step="any" value={accBalance} onChange={(e) => setAccBalance(e.target.value)}
                placeholder={`Balance (${settings.currencySymbol}, optional)`}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text" value={accBankName} onChange={(e) => setAccBankName(e.target.value)}
                placeholder="Bank name, e.g. HDFC Bank"
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
              <input
                type="text" inputMode="numeric" maxLength={4} value={accLast4} onChange={(e) => setAccLast4(e.target.value.replace(/\D/g, ''))}
                placeholder="Last 4 digits, e.g. 4821"
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <input
              type="text" value={accSenderIds} onChange={(e) => setAccSenderIds(e.target.value.toUpperCase())}
              placeholder="SMS sender IDs, e.g. HDFCBK, SBIINB"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Bank name, last-4 and sender IDs power the SMS scan filter — only messages from your banks are shown.
            </p>
            <button type="submit" className="w-full py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold">
              Save account
            </button>
          </form>
        )}

        {accountStats.length === 0 ? (
          <p className="text-[11px] text-slate-500">No accounts yet — add where your money goes out from.</p>
        ) : (
          accountStats.map(({ account: a, spent }) => {
            const Icon = accountIcon(a.kind);
            const used = expenses.some((e) => e.accountId === a.id);
            return (
              <div key={a.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{a.name}</div>
                    <div className="text-[10px] text-slate-500">
                      {ACCOUNT_KINDS[a.kind].label} · out this month {formatCurrency(spent, settings.currencySymbol)}
                      {typeof a.balance === 'number' ? ` · left ${formatCurrency(Math.max(0, a.balance - spent), settings.currencySymbol)}` : ''}
                    </div>
                    {(a.bankName || a.last4 || a.senderIds) && (
                      <div className="text-[10px] text-sky-400/90 truncate mt-0.5">
                        {[a.bankName, a.last4 ? `··${a.last4}` : '', a.senderIds].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (used) {
                      alert('This account has spends recorded — delete those first.');
                      return;
                    }
                    if (window.confirm(`Delete account "${a.name}"?`)) onDeleteAccount(a.id);
                  }}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition shrink-0"
                  title="Delete account"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Expense list */}
      <div className="space-y-3">
        {grouped.length === 0 ? (
          <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-400">
            No spends recorded yet. Add one manually or scan your bank SMS.
          </div>
        ) : (
          grouped.map(([day, items]) => (
            <div key={day} className="space-y-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1">{day}</div>
              {items.map((e) => {
                const Icon = categoryIcon(e.category);
                return (
                  <div key={e.id} className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800/90 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-slate-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-white truncate">{e.title}</div>
                        <div className="text-[11px] text-amber-300/90 mt-0.5 truncate">Why: {e.reason}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {EXPENSE_CATEGORIES[e.category].label} · {accountName(e.accountId)}
                          {e.smsId ? ' · via SMS' : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <div className="font-extrabold text-sm text-white font-mono">
                        {formatCurrency(e.amount, settings.currencySymbol)}
                      </div>
                      <button
                        onClick={() => { if (window.confirm('Delete this spend?')) onDeleteExpense(e.id); }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition"
                        title="Delete spend"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Add spend modal (reason mandatory) */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Add Spend</h3>
                <p className="text-xs text-slate-400">Reason is required — every outflow needs a why</p>
              </div>
              <button onClick={() => { setIsFormOpen(false); resetExpenseForm(); }} className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitExpense} className="p-5 space-y-3.5 text-xs text-slate-300">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">What *</label>
                <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Lunch at canteen"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Amount ({settings.currencySymbol}) *</label>
                  <input type="number" required min="1" step="any" value={amount} onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Date *</label>
                  <input type="date" required value={date} onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">Category</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]).map((c) => {
                    const Icon = categoryIcon(c);
                    return (
                      <button key={c} type="button" onClick={() => setCategory(c)}
                        className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition ${
                          category === c ? 'bg-emerald-500/20 border-emerald-500 text-white' : 'bg-slate-950/60 border-slate-800 text-slate-400'
                        }`}>
                        <Icon className="w-4 h-4" />
                        <span className="text-[9px] leading-tight">{EXPENSE_CATEGORIES[c].label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Paid out of</label>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500">
                  <option value="">No account</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Reason *</label>
                <input type="text" required minLength={2} value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Team lunch after deployment"
                  className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500" />
              </div>
              <button type="submit" className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition active:scale-98">
                Save Spend
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SMS scan modal */}
      {isSmsOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-md w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Scan Bank SMS</h3>
                <p className="text-xs text-slate-400">Inbox is read on your phone only — you pick what to record</p>
              </div>
              <button onClick={() => { setIsSmsOpen(false); setSmsRows([]); setSmsStatus(null); }} className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 space-y-3 text-xs">
              <button
                onClick={handleScanSms}
                disabled={isScanning}
                className="w-full py-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <MessageSquareText className="w-4 h-4" />
                <span>{isScanning ? 'Scanning…' : smsRows.length > 0 ? 'Scan again' : 'Scan last 45 days'}</span>
              </button>

              {smsStatus && (
                <p className="text-[11px] leading-relaxed bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300">
                  {smsStatus}
                </p>
              )}

              {smsRows.map((r, i) => (
                <div key={r.smsId} className={`p-3 rounded-2xl border space-y-2 ${r.selected ? 'bg-slate-950 border-emerald-500/40' : 'bg-slate-950/60 border-slate-800'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSmsRows((rows) => rows.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left"
                    >
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${r.selected ? 'bg-emerald-500 border-emerald-500 text-slate-950' : 'border-slate-600 text-transparent'}`}>
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                      <span className="font-extrabold text-white font-mono">{formatCurrency(r.amount, settings.currencySymbol)}</span>
                      <span className="text-[10px] text-slate-400 truncate">
                        {r.date}{r.accountLast4 ? ` · ·${r.accountLast4}` : ''} · <span className="font-mono text-sky-400/90">{r.sender}</span>
                      </span>
                    </button>
                  </div>
                  <input
                    type="text" value={r.title}
                    onChange={(e) => setSmsRows((rows) => rows.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                    placeholder="Title"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text" value={r.reason}
                      onChange={(e) => setSmsRows((rows) => rows.map((x, j) => j === i ? { ...x, reason: e.target.value } : x))}
                      placeholder="Reason * (required)"
                      className="bg-slate-900 border border-emerald-500/40 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <select
                      value={r.accountId}
                      onChange={(e) => setSmsRows((rows) => rows.map((x, j) => j === i ? { ...x, accountId: e.target.value } : x))}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">No account</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <details className="text-[10px] text-slate-500">
                    <summary className="cursor-pointer flex items-center gap-1"><ChevronDown className="w-3 h-3" /> Original SMS</summary>
                    <p className="mt-1 leading-relaxed">{r.body}</p>
                  </details>
                </div>
              ))}

              {smsRows.length > 0 && (
                <button
                  onClick={handleImportSms}
                  className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition active:scale-98"
                >
                  Import selected as spends
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
