import { useState, useMemo } from 'react';
import {
  X, Plus, BellRing, Check, Trash2, CreditCard, Users, StickyNote,
  CalendarDays, Undo2,
} from 'lucide-react';
import { ReminderItem, ReminderKind, UserSettings } from '../types';
import { formatCurrency } from '../utils/finance';
import { currentMonthYear } from '../utils/storage';

interface RemindersViewProps {
  reminders: ReminderItem[];
  settings: UserSettings;
  onSaveReminder: (reminder: ReminderItem) => void;
  onDeleteReminder: (id: string) => void;
  onToggleDone: (id: string) => void;
}

const KIND_META: Record<ReminderKind, { label: string; hint: string }> = {
  credit_card: { label: 'Credit Card Bill', hint: 'Full card statement, not an EMI' },
  borrow: { label: 'Friend / Family Borrow', hint: 'Money to return to a person' },
  other: { label: 'Other One-time Pay', hint: 'Any single upcoming payment' },
};

function defaultDueDate(): string {
  const now = new Date();
  // Default to the 5th of next month as the pay note
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 5);
  return d.toISOString().split('T')[0];
}

export default function RemindersView({
  reminders,
  settings,
  onSaveReminder,
  onDeleteReminder,
  onToggleDone,
}: RemindersViewProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ReminderKind>('credit_card');
  const [amount, setAmount] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>(defaultDueDate());
  const [person, setPerson] = useState('');
  const [note, setNote] = useState('');

  const monthYear = currentMonthYear();
  const todayStr = new Date().toISOString().split('T')[0];

  const sorted = useMemo(() => {
    return [...reminders].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [reminders]);

  const pendingTotal = useMemo(() => {
    return reminders
      .filter((r) => r.doneMonthYear !== monthYear)
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  }, [reminders, monthYear]);

  const resetForm = () => {
    setTitle('');
    setKind('credit_card');
    setAmount('');
    setDueDate(defaultDueDate());
    setPerson('');
    setNote('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    onSaveReminder({
      id: `rem-${Date.now()}`,
      title: title.trim(),
      kind,
      amount: amount ? Number(amount) : undefined,
      dueDate,
      person: person.trim() || undefined,
      note: note.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    resetForm();
    setIsFormOpen(false);
  };

  const kindIcon = (k: ReminderKind) => {
    if (k === 'credit_card') return CreditCard;
    if (k === 'borrow') return Users;
    return StickyNote;
  };

  return (
    <div className="space-y-4 px-4 pb-28 pt-2 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">
            Pay Reminders
          </h2>
          <p className="text-xs text-slate-400">
            One-time notes for next month — card bills &amp; borrows, not EMIs
          </p>
        </div>
        <button
          onClick={() => setIsFormOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition shadow-md shadow-emerald-950/30 active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Add Note</span>
        </button>
      </div>

      {/* Pending total strip */}
      {reminders.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <BellRing className="w-4 h-4 text-amber-400" />
            <span>Pending reminder value</span>
          </div>
          <span className="text-base font-extrabold text-white font-mono">
            {formatCurrency(pendingTotal, settings.currencySymbol)}
          </span>
        </div>
      )}

      {/* List */}
      <div className="space-y-2.5">
        {sorted.length === 0 ? (
          <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-400">
            No pay notes yet. Add your credit-card bill or a friend borrow to get
            reminded next month.
          </div>
        ) : (
          sorted.map((r) => {
            const Icon = kindIcon(r.kind);
            const isDone = r.doneMonthYear === monthYear;
            const isOverdue = !isDone && r.dueDate < todayStr;
            return (
              <div
                key={r.id}
                className={`p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 ${
                  isDone
                    ? 'bg-slate-900/40 border-slate-800/50 opacity-70'
                    : isOverdue
                    ? 'bg-rose-950/20 border-rose-500/30'
                    : 'bg-slate-900 border-slate-800/80'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className={`text-xs sm:text-sm font-bold truncate ${isDone ? 'line-through text-slate-500' : 'text-white'}`}>
                        {r.title}
                      </h4>
                      {isDone && (
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">
                          Done
                        </span>
                      )}
                      {isOverdue && (
                        <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded shrink-0">
                          Overdue
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {r.dueDate}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{KIND_META[r.kind].label}</span>
                      {r.person && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{r.person}</span>
                        </>
                      )}
                    </div>
                    {r.note && (
                      <p className="text-[10px] text-slate-400 mt-0.5 italic">"{r.note}"</p>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0 flex items-center gap-2">
                  {r.amount ? (
                    <div className="font-extrabold text-sm text-white font-mono">
                      {formatCurrency(r.amount, settings.currencySymbol)}
                    </div>
                  ) : null}
                  <button
                    onClick={() => onToggleDone(r.id)}
                    title={isDone ? 'Reopen' : 'Mark paid'}
                    className={`p-2 rounded-xl border transition active:scale-95 ${
                      isDone
                        ? 'bg-slate-800 border-slate-700 text-slate-400'
                        : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    }`}
                  >
                    {isDone ? <Undo2 className="w-4 h-4" /> : <Check className="w-4 h-4 stroke-[2.5]" />}
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('Delete this pay note?')) onDeleteReminder(r.id);
                    }}
                    title="Delete"
                    className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add form modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">New Pay Note</h3>
                <p className="text-xs text-slate-400">Reminded next month — never counted as EMI</p>
              </div>
              <button
                onClick={() => { setIsFormOpen(false); resetForm(); }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs text-slate-300">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Title *</label>
                <input
                  type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. HDFC Credit Card Bill, Return to Arun"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">Type</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.keys(KIND_META) as ReminderKind[]).map((k) => (
                    <button
                      key={k} type="button" onClick={() => setKind(k)}
                      className={`p-2 rounded-xl border text-center transition ${
                        kind === k
                          ? 'bg-emerald-500/20 border-emerald-500 text-white font-bold'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400'
                      }`}
                    >
                      <span className="text-[11px] block">{KIND_META[k].label}</span>
                      <span className="text-[9px] text-slate-500 block mt-0.5">{KIND_META[k].hint}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Amount ({settings.currencySymbol}, optional)
                  </label>
                  <input
                    type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 18450"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Pay By Date *</label>
                  <input
                    type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Person / Card (optional)
                </label>
                <input
                  type="text" value={person} onChange={(e) => setPerson(e.target.value)}
                  placeholder="e.g. Arun, HDFC Millennia"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Note (optional)</label>
                <input
                  type="text" value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Pay after salary credit"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition active:scale-98"
              >
                Save Pay Note
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
