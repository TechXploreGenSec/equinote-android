import { useState, useMemo } from 'react';
import {
  X, Plus, Trash2, Wallet, MessageSquareText, Check, ChevronDown, Sparkles, Pencil,
  UtensilsCrossed, Car, ShoppingBag, Receipt, HeartPulse, Clapperboard,
  CircleDashed, Landmark, CreditCard, Banknote, Smartphone, ArrowUpRight, ArrowDownLeft, FolderOpen,
} from 'lucide-react';
import { ExpenseItem, ExpenseAccount, ExpenseCategory, ExpenseAccountKind, UserSettings } from '../types';
import { formatCurrency } from '../utils/finance';
import {
  isSmsSupported, ensureSmsPermission, readInboxSmsThisMonth,
  collectTransactionCandidates, filterByUserBanks,
  suggestExpenseTitle, inferCategory,
} from '../utils/smsImport';
import { monthRangeLabel, todayStr as todayIST, monthPrefix as monthPrefixIST } from '../utils/datetime';
import { senderIdsForBankName } from '../utils/bankDirectory';
import { analyzeMessages, analyzeSpends, DEFAULT_GROQ_MODEL } from '../utils/aiReason';

interface ExpensesViewProps {
  expenses: ExpenseItem[];
  accounts: ExpenseAccount[];
  settings: UserSettings;
  onSaveExpense: (expense: ExpenseItem) => void;
  onUpdateExpense: (expense: ExpenseItem) => void;
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

function defaultDueDate(): string {
  const now = new Date();
  // Default to the 5th of next month as the pay note
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 5);
  return d.toISOString().split('T')[0];
}

interface SmsRow {
  smsId: string;
  amount: number;
  accountLast4?: string;
  merchant?: string;
  sender: string;
  date: string;
  body: string;
  selected: boolean;
  title: string;
  reason: string;
  accountId: string;
  direction: 'out' | 'in';
  category: ExpenseCategory;
  /** True after AI analyzed this row (shows the AI badge). */
  aiDone: boolean;
  /** True once the user hand-edits the title — AI will no longer overwrite it. */
  userEditedTitle: boolean;
}

type SpendFolder = 'all' | 'out' | 'in';

export default function ExpensesView({
  expenses,
  accounts,
  settings,
  onSaveExpense,
  onUpdateExpense,
  onDeleteExpense,
  onSaveAccount,
  onDeleteAccount,
  onImportSmsExpenses,
}: ExpensesViewProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIST());
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [accountId, setAccountId] = useState('');
  const [reason, setReason] = useState('');
  const [direction, setDirection] = useState<'out' | 'in'>('out');

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
  const [smsBodies, setSmsBodies] = useState<Map<string, string>>(new Map());
  const [isScanning, setIsScanning] = useState(false);
  const [isAiFilling, setIsAiFilling] = useState(false);
  const [isAiSuggesting, setIsAiSuggesting] = useState(false);

  // Separate Sent / Received folders + per-record SMS viewer + edit flow.
  const [folder, setFolder] = useState<SpendFolder>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ExpenseItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editCategory, setEditCategory] = useState<ExpenseCategory>('other');
  const [editAccountId, setEditAccountId] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editDirection, setEditDirection] = useState<'out' | 'in'>('out');

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openEdit = (e: ExpenseItem) => {
    setEditing(e);
    setEditTitle(e.title);
    setEditAmount(String(e.amount));
    setEditDate(e.date);
    setEditCategory(e.category);
    setEditAccountId(e.accountId || '');
    setEditReason(e.reason);
    setEditDirection(e.direction === 'in' ? 'in' : 'out');
  };

  const handleSubmitEdit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!editing) return;
    const amt = Number(editAmount);
    if (!editTitle.trim() || !Number.isFinite(amt) || amt <= 0 || !editDate) return;
    if (editReason.trim().length < 2) return;
    onUpdateExpense({
      ...editing,
      title: editTitle.trim(),
      amount: amt,
      date: editDate,
      category: editCategory,
      accountId: editAccountId || undefined,
      reason: editReason.trim(),
      direction: editDirection,
    });
    setEditing(null);
  };

  const monthPrefix = monthPrefixIST();

  const { todayOut, monthOut, monthIn, monthNet } = useMemo(() => {
    const t = todayIST();
    let today = 0;
    let monthO = 0;
    let monthI = 0;
    for (const e of expenses) {
      const isIn = e.direction === 'in';
      if (e.date === t && !isIn) today += e.amount;
      if (e.date.startsWith(monthPrefix)) {
        if (isIn) monthI += e.amount;
        else monthO += e.amount;
      }
    }
    return { todayOut: today, monthOut: monthO, monthIn: monthI, monthNet: monthI - monthO };
  }, [expenses, monthPrefix]);

  const folderCounts = useMemo(() => {
    let out = 0;
    let inn = 0;
    let outTotal = 0;
    let inTotal = 0;
    for (const e of expenses) {
      if (!e.date.startsWith(monthPrefix)) continue;
      if (e.direction === 'in') { inn++; inTotal += e.amount; }
      else { out++; outTotal += e.amount; }
    }
    return { all: out + inn, out, in: inn, outTotal, inTotal };
  }, [expenses, monthPrefix]);

  const categoryTotals = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    for (const e of expenses) {
      if (!e.date.startsWith(monthPrefix) || e.direction === 'in') continue;
      map.set(e.category, (map.get(e.category) || 0) + e.amount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses, monthPrefix]);

  const accountStats = useMemo(() => {
    return accounts.map((a) => {
      const spent = expenses
        .filter((e) => e.accountId === a.id && e.date.startsWith(monthPrefix) && e.direction !== 'in')
        .reduce((s, e) => s + e.amount, 0);
      const received = expenses
        .filter((e) => e.accountId === a.id && e.date.startsWith(monthPrefix) && e.direction === 'in')
        .reduce((s, e) => s + e.amount, 0);
      return { account: a, spent, received };
    });
  }, [accounts, expenses, monthPrefix]);

  const grouped = useMemo(() => {
    const map = new Map<string, ExpenseItem[]>();
    const list = [...expenses]
      .filter((e) => folder === 'all' || (e.direction === 'in' ? 'in' : 'out') === folder)
      .sort((a, b) => b.date.localeCompare(a.date));
    for (const e of list) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return [...map.entries()];
  }, [expenses, folder]);

  const accountName = (id?: string) => accounts.find((a) => a.id === id)?.name || '—';

  const resetExpenseForm = () => {
    setTitle(''); setAmount(''); setDate(todayIST());
    setCategory('food'); setAccountId(''); setReason(''); setDirection('out');
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
      direction,
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
      setSmsStatus('Reading this month’s inbox… (stays on your phone)');
      const messages = await readInboxSmsThisMonth(300);
      const { loadImportedSmsIds } = await import('../utils/storage');
      const { candidates, bodies } = collectTransactionCandidates(messages, loadImportedSmsIds());
      setSmsBodies(bodies);
      const range = monthRangeLabel();
      if (candidates.length === 0) {
        setSmsStatus(`Scanned ${messages.length} SMS (${range}) — no new bank transactions found.`);
        setSmsRows([]);
        return;
      }
      const { mine, others, filtered } = filterByUserBanks(candidates, accounts);
      if (mine.length === 0) {
        setSmsStatus(
          `Scanned ${messages.length} SMS (${range}), found ${candidates.length} transaction${candidates.length > 1 ? 's' : ''} — but none match your banks. Add sender IDs / last-4 digits in My accounts below.`
        );
        setSmsRows([]);
        return;
      }
      setSmsRows(mine.map(({ candidate: d, accountId }) => ({
        smsId: d.smsId,
        amount: d.amount,
        accountLast4: d.accountLast4,
        merchant: d.merchant,
        sender: d.sender,
        date: d.date,
        body: bodies.get(d.smsId) || d.body || '',
        selected: true,
        title: suggestExpenseTitle(d),
        reason: '',
        accountId: accountId || accounts[0]?.id || '',
        direction: d.direction === 'credit' ? 'in' as const : 'out' as const,
        category: inferCategory(d.merchant, bodies.get(d.smsId) || d.body || ''),
        aiDone: false,
        userEditedTitle: false,
      })));
      setSmsStatus(
        `Showing ${mine.length} from your bank${mine.length > 1 ? 's' : ''} (${range})` +
        (filtered && others > 0 ? ` — hid ${others} non-bank message${others > 1 ? 's' : ''}` : '') +
        '. Tap “Analyze with AI” for paid-vs-received reasoning, or review and import directly.' +
        (!filtered ? ' Tip: add sender IDs in My accounts to filter only your banks.' : '')
      );
    } catch (err) {
      setSmsStatus(`SMS scan failed (${err instanceof Error ? err.message : 'unknown error'}).`);
    } finally {
      setIsScanning(false);
    }
  };

  const groqKey = settings.groqApiKey || '';
  const groqModel = settings.groqModel || DEFAULT_GROQ_MODEL;

  // One batched AI call over the FULL matched messages: decides paid-to
  // vs received-from, exact name, reason + category. Explicit tap only.
  // Results are validated against the SMS on-device; hand-edited titles win.
  const handleAiFillReasons = async () => {
    if (smsRows.length === 0) return;
    if (!groqKey.trim()) {
      setSmsStatus('Add your free Groq key in Settings → AI Reason Analysis first.');
      return;
    }
    setIsAiFilling(true);
    try {
      const out = await analyzeMessages(
        smsRows.map((r, i) => ({ index: i, sender: r.sender, date: r.date, body: r.body || smsBodies.get(r.smsId) || '' })),
        groqKey,
        groqModel
      );
      let applied = 0;
      setSmsRows((rows) =>
        rows.map((row, i) => {
          const hit = out.find((o) => o.index === i);
          if (!hit) return row;
          applied++;
          const aiTitle = (hit.name || '').trim();
          const keepUserTitle = row.userEditedTitle && row.title.trim().length >= 2;
          return {
            ...row,
            title: keepUserTitle ? row.title : aiTitle || row.title,
            reason: row.reason.trim() ? row.reason : hit.reason,
            direction: hit.direction || row.direction,
            category: hit.category || row.category,
            aiDone: true,
          };
        })
      );
      setSmsStatus(`AI analyzed ${out.length} message${out.length > 1 ? 's' : ''} — paid vs received, exact names, reasons, categories. Review each row (tap Original SMS to verify), then import.`);
    } catch (err) {
      setSmsStatus(`AI fill failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsAiFilling(false);
    }
  };

  // Single AI suggestion for a manually added (latest) spend.
  const handleAiSuggestReason = async () => {
    if (!groqKey.trim()) return;
    if (!title.trim() && amount === '') return;
    setIsAiSuggesting(true);
    try {
      const out = await analyzeSpends(
        [{
          index: 0,
          merchant: title.trim() || undefined,
          sender: 'manual',
          amount: Number(amount) || 0,
          date: date || todayIST(),
        }],
        groqKey,
        groqModel
      );
      const hit = out[0];
      if (hit) {
        if (!title.trim() && hit.name) setTitle(hit.name);
        if (hit.reason) setReason(hit.reason);
      }
    } catch {
      // Silent — the field stays manual.
    } finally {
      setIsAiSuggesting(false);
    }
  };

  const handleImportSms = () => {
    const chosen = smsRows.filter((r) => r.selected);
    if (chosen.length === 0) {
      setSmsStatus('Select at least one spending to import.');
      return;
    }
    // Bulk month import: reason is optional — fall back to the SMS source
    // so history imports never get blocked. Manual adds still require it.
    // The FULL original message is saved on each record so it can be
    // re-opened later from the spends list (same viewer as the import step).
    const items: ExpenseItem[] = chosen.map((r) => ({
      id: `exp-${Date.now()}-${r.smsId}`,
      title: r.title.trim() || suggestExpenseTitle(r),
      amount: r.amount,
      date: r.date,
      category: r.category,
      accountId: r.accountId || undefined,
      reason: r.reason.trim() || `From SMS (${r.sender})`,
      direction: r.direction,
      smsId: r.smsId,
      smsBody: r.body || smsBodies.get(r.smsId) || undefined,
      smsSender: r.sender || undefined,
      aiAnalyzed: r.aiDone || undefined,
      createdAt: new Date().toISOString(),
    }));
    onImportSmsExpenses(items, chosen.map((r) => r.smsId));
    setSmsRows([]);
    const ins = items.filter((i) => i.direction === 'in').length;
    setSmsStatus(
      `Imported ${items.length} record${items.length > 1 ? 's' : ''}` +
      (ins > 0 ? ` (${items.length - ins} paid out, ${ins} received)` : '') +
      '.'
    );
  };

  const maxCat = categoryTotals.length > 0 ? categoryTotals[0][1] : 0;

  return (
    <div className="space-y-4 px-4 pb-28 pt-2 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">Daily Spends</h2>
          <p className="text-xs text-slate-400">Sent & received, every rupee with a reason</p>
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

      {/* Totals hero: today out + month sent/received/net */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800/90">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Sent today</span>
          <div className="text-lg font-extrabold text-white mt-1 font-mono">
            {formatCurrency(todayOut, settings.currencySymbol)}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-slate-900 border border-rose-500/25">
          <span className="text-[10px] text-rose-300/80 uppercase tracking-wider font-semibold flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3" /> Sent · month
          </span>
          <div className="text-lg font-extrabold text-rose-300 mt-1 font-mono">
            {formatCurrency(monthOut, settings.currencySymbol)}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-slate-900 border border-emerald-500/25">
          <span className="text-[10px] text-emerald-300/80 uppercase tracking-wider font-semibold flex items-center gap-1">
            <ArrowDownLeft className="w-3 h-3" /> Got · month
          </span>
          <div className="text-lg font-extrabold text-emerald-300 mt-1 font-mono">
            {formatCurrency(monthIn, settings.currencySymbol)}
          </div>
        </div>
      </div>
      {(monthOut > 0 || monthIn > 0) && (
        <p className="text-[11px] text-slate-400 px-1 -mt-1">
          Net this month:{' '}
          <span className={`font-bold font-mono ${monthNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {monthNet >= 0 ? '+' : ''}{formatCurrency(monthNet, settings.currencySymbol)}
          </span>
        </p>
      )}

      {/* Separate Sent / Received folders */}
      <div className="p-1.5 rounded-2xl bg-slate-900 border border-slate-800/90 grid grid-cols-3 gap-1.5">
        {([
          { key: 'all', label: 'All', count: folderCounts.all },
          { key: 'out', label: 'Sent', count: folderCounts.out },
          { key: 'in', label: 'Received', count: folderCounts.in },
        ] as { key: SpendFolder; label: string; count: number }[]).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFolder(t.key)}
            className={`py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              folder === t.key
                ? t.key === 'in'
                  ? 'bg-emerald-500/20 border border-emerald-500 text-white'
                  : t.key === 'out'
                    ? 'bg-rose-500/20 border border-rose-500 text-white'
                    : 'bg-slate-700 border border-slate-600 text-white'
                : 'bg-transparent border border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>{t.label}</span>
            <span className="text-[10px] font-mono opacity-80">({t.count})</span>
          </button>
        ))}
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
                type="text" value={accBankName}
                onChange={(e) => {
                  const v = e.target.value;
                  setAccBankName(v);
                  // Auto-suggest sender IDs from the built-in bank directory.
                  if (!accSenderIds.trim()) {
                    const ids = senderIdsForBankName(v);
                    if (ids.length > 0) setAccSenderIds(ids.join(', '));
                  }
                }}
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
          accountStats.map(({ account: a, spent, received }) => {
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
                      {received > 0 ? ` · in ${formatCurrency(received, settings.currencySymbol)}` : ''}
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

      {/* Expense list (filtered by Sent / Received folder) */}
      <div className="space-y-3">
        {grouped.length === 0 ? (
          <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-400">
            {folder === 'all'
              ? 'No spends recorded yet. Add one manually or scan your bank SMS.'
              : folder === 'out'
                ? 'No sent records this month — switch to All or scan SMS.'
                : 'No received records this month — switch to All or scan SMS.'}
          </div>
        ) : (
          grouped.map(([day, items]) => (
            <div key={day} className="space-y-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1">{day}</div>
              {items.map((e) => {
                const Icon = categoryIcon(e.category);
                const isIn = e.direction === 'in';
                const expanded = expandedIds.has(e.id);
                return (
                  <div key={e.id} className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800/90 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4 text-slate-300" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="text-xs font-bold text-white truncate">{e.title}</div>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${isIn ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
                              {isIn ? 'Received' : 'Sent'}
                            </span>
                            {e.aiAnalyzed && (
                              <span className="text-[10px] font-semibold text-violet-300 bg-violet-500/10 px-1.5 py-0.5 rounded shrink-0">
                                AI ✓
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-amber-300/90 mt-0.5 truncate">Why: {e.reason}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {EXPENSE_CATEGORIES[e.category].label} · {accountName(e.accountId)}
                            {e.smsId ? ' · via SMS' : ''}
                            {e.smsSender ? ` · ${e.smsSender}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-1.5">
                        <div className={`font-extrabold text-sm font-mono ${isIn ? 'text-emerald-300' : 'text-white'}`}>
                          {isIn ? '+' : ''}{formatCurrency(e.amount, settings.currencySymbol)}
                        </div>
                        <button
                          onClick={() => openEdit(e)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-sky-400 transition"
                          title="Edit record"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { if (window.confirm('Delete this record?')) onDeleteExpense(e.id); }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition"
                          title="Delete record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {/* Whole original message — same viewer as the import step */}
                    {e.smsBody && (
                      <details
                        className="text-[10px] text-slate-500"
                        open={expanded}
                        onToggle={() => toggleExpanded(e.id)}
                      >
                        <summary className="cursor-pointer flex items-center gap-1 hover:text-slate-300">
                          <ChevronDown className="w-3 h-3" /> Original SMS
                        </summary>
                        <p className="mt-1 leading-relaxed bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-300 whitespace-pre-wrap break-words">
                          {e.smsBody}
                        </p>
                      </details>
                    )}
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
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button" onClick={() => setDirection('out')}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition ${direction === 'out' ? 'bg-rose-500/20 border-rose-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                >
                  Paid out
                </button>
                <button
                  type="button" onClick={() => setDirection('in')}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition ${direction === 'in' ? 'bg-emerald-500/20 border-emerald-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                >
                  Received in
                </button>
              </div>
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
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-400">
                    Reason *
                  </label>
                  {groqKey.trim() && (
                    <button
                      type="button"
                      onClick={handleAiSuggestReason}
                      disabled={isAiSuggesting}
                      className="text-[10px] font-bold text-violet-300 hover:underline flex items-center gap-1 disabled:opacity-50"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{isAiSuggesting ? 'Thinking…' : 'Suggest with AI'}</span>
                    </button>
                  )}
                </div>
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
                <span>{isScanning ? 'Scanning…' : smsRows.length > 0 ? 'Scan again' : 'Scan this month'}</span>
              </button>

              {smsStatus && (
                <p className="text-[11px] leading-relaxed bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300">
                  {smsStatus}
                </p>
              )}

              {smsRows.length > 0 && (
                <>
                  <button
                    onClick={handleAiFillReasons}
                    disabled={isAiFilling}
                    className="w-full py-2.5 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 text-violet-300 font-bold text-xs transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {isAiFilling
                        ? 'AI analyzing… (one batched call)'
                        : groqKey.trim()
                          ? '✨ Analyze with AI — paid vs received + names'
                          : '✨ AI analysis — add free Groq key in Settings'}
                    </span>
                  </button>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    {groqKey.trim()
                      ? 'AI reads the matched bank messages only, on your tap — paid vs received, exact name, reason + category. Every result is cross-checked against the SMS text; tap Original SMS on any row to verify.'
                      : 'Without a key, rows use on-device parsing (direction editable below).'}
                  </p>
                </>
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
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${r.direction === 'in' ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
                        {r.direction === 'in' ? 'Received' : 'Paid out'}
                      </span>
                      {r.aiDone && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 text-violet-300 bg-violet-500/10">
                          AI ✓
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 truncate">
                        {r.date}{r.accountLast4 ? ` · ·${r.accountLast4}` : ''} · <span className="font-mono text-sky-400/90">{r.sender}</span>
                      </span>
                    </button>
                  </div>
                  <input
                    type="text" value={r.title}
                    onChange={(e) => setSmsRows((rows) => rows.map((x, j) => j === i ? { ...x, title: e.target.value, userEditedTitle: true } : x))}
                    placeholder="Name — exact payee/sender as in SMS"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="text" value={r.reason}
                    onChange={(e) => setSmsRows((rows) => rows.map((x, j) => j === i ? { ...x, reason: e.target.value } : x))}
                    placeholder="Reason — e.g. upi transfer to person, food delivery order"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={r.category}
                      onChange={(e) => setSmsRows((rows) => rows.map((x, j) => j === i ? { ...x, category: e.target.value as ExpenseCategory } : x))}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      {(Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]).map((c) => (
                        <option key={c} value={c}>{EXPENSE_CATEGORIES[c].label}</option>
                      ))}
                    </select>
                    <select
                      value={r.accountId}
                      onChange={(e) => setSmsRows((rows) => rows.map((x, j) => j === i ? { ...x, accountId: e.target.value } : x))}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">No account</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setSmsRows((rows) => rows.map((x, j) => j === i ? { ...x, direction: 'out' as const } : x))}
                      className={`py-1.5 rounded-xl border text-[11px] font-bold transition ${r.direction === 'out' ? 'bg-rose-500/20 border-rose-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                    >
                      Out · Sent
                    </button>
                    <button
                      type="button"
                      onClick={() => setSmsRows((rows) => rows.map((x, j) => j === i ? { ...x, direction: 'in' as const } : x))}
                      className={`py-1.5 rounded-xl border text-[11px] font-bold transition ${r.direction === 'in' ? 'bg-emerald-500/20 border-emerald-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                    >
                      In · Received
                    </button>
                  </div>
                  <details className="text-[10px] text-slate-500">
                    <summary className="cursor-pointer flex items-center gap-1"><ChevronDown className="w-3 h-3" /> Original SMS</summary>
                    <p className="mt-1 leading-relaxed bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-300 whitespace-pre-wrap break-words">{r.body}</p>
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

      {/* Edit record modal — fix AI names/reasons after import */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Edit Record</h3>
                <p className="text-xs text-slate-400">Correct the name, reason, direction or category</p>
              </div>
              <button onClick={() => setEditing(null)} className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitEdit} className="p-5 space-y-3.5 text-xs text-slate-300">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button" onClick={() => setEditDirection('out')}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition ${editDirection === 'out' ? 'bg-rose-500/20 border-rose-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                >
                  Sent
                </button>
                <button
                  type="button" onClick={() => setEditDirection('in')}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition ${editDirection === 'in' ? 'bg-emerald-500/20 border-emerald-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                >
                  Received
                </button>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Name *</label>
                <input type="text" required value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Amount ({settings.currencySymbol}) *</label>
                  <input type="number" required min="1" step="any" value={editAmount} onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Date *</label>
                  <input type="date" required value={editDate} onChange={(e) => setEditDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">Category</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]).map((c) => {
                    const Icon = categoryIcon(c);
                    return (
                      <button key={c} type="button" onClick={() => setEditCategory(c)}
                        className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition ${
                          editCategory === c ? 'bg-emerald-500/20 border-emerald-500 text-white' : 'bg-slate-950/60 border-slate-800 text-slate-400'
                        }`}>
                        <Icon className="w-4 h-4" />
                        <span className="text-[9px] leading-tight">{EXPENSE_CATEGORIES[c].label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Account</label>
                <select value={editAccountId} onChange={(e) => setEditAccountId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500">
                  <option value="">No account</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Reason *</label>
                <input type="text" required minLength={2} value={editReason} onChange={(e) => setEditReason(e.target.value)}
                  className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500" />
              </div>
              {editing.smsBody && (
                <details className="text-[10px] text-slate-500">
                  <summary className="cursor-pointer flex items-center gap-1"><ChevronDown className="w-3 h-3" /> Original SMS</summary>
                  <p className="mt-1 leading-relaxed bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-300 whitespace-pre-wrap break-words">{editing.smsBody}</p>
                </details>
              )}
              <button type="submit" className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition active:scale-98">
                Save Changes
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
