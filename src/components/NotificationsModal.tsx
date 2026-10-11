import { useState, useEffect } from 'react';
import { 
  X, Bell, BellRing, CheckCircle, AlertTriangle, 
  Clock, Volume2, VolumeX, Smartphone 
} from 'lucide-react';
import { LoanItem, UserSettings, AppNotification } from '../types';
import {
  getNotificationPermissionStatus,
  showSystemNotification,
  playChimeSound
} from '../utils/notifications';
import {
  ensureNotificationPermission,
  getPermissionStatus,
  SETTINGS_HINT,
} from '../utils/nativeNotifications';
import { calculateDueStatus } from '../utils/storage';
import { formatCurrency } from '../utils/finance';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  loans: LoanItem[];
  settings: UserSettings;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
}

export default function NotificationsModal({
  isOpen,
  onClose,
  loans,
  settings,
  onUpdateSettings,
}: NotificationsModalProps) {
  const [permissionStatus, setPermissionStatus] = useState(getNotificationPermissionStatus());
  const [testSent, setTestSent] = useState(false);
  const [permMessage, setPermMessage] = useState<string | null>(null);

  // Refresh live permission status every time the modal opens
  useEffect(() => {
    if (isOpen) {
      void getPermissionStatus().then((s) => setPermissionStatus(s as NotificationPermission));
      setTestSent(false);
      setPermMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Gather active alerts from loans
  const alerts = loans
    .filter((l) => !l.isClosed)
    .map((loan) => {
      const due = calculateDueStatus(loan);
      return { loan, due };
    })
    .filter(({ due }) => due.status === 'overdue' || due.status === 'due_today' || due.status === 'due_soon')
    .sort((a, b) => a.due.daysRemaining - b.due.daysRemaining);

  const handleRequestPermission = async () => {
    setPermMessage('Requesting permission — answer the system dialog…');
    const result = await ensureNotificationPermission();
    setPermissionStatus(result.status as NotificationPermission);
    onUpdateSettings({ notificationsEnabled: result.granted });

    if (result.granted) {
      setPermMessage('Granted — due alerts are now scheduled on this device.');
      showSystemNotification('EquiNote Alerts Enabled! 🔔', {
        body: 'You will receive reminders before your EMI due dates.',
      });
      playChimeSound('success');
    } else if (!result.bridge) {
      setPermMessage('Notification bridge missing in this build — please reinstall the latest APK from Releases.');
    } else if (result.status === 'denied') {
      setPermMessage(SETTINGS_HINT);
    } else {
      setPermMessage('Permission not granted yet — tap the button again after answering the dialog.');
    }
  };

  const handleSendTestNotification = () => {
    setTestSent(true);
    playChimeSound('alert');
    const firstDue = loans.find((l) => !l.isClosed);
    showSystemNotification('EquiNote EMI Reminder Test 🔔', {
      body: firstDue
        ? `Your ${firstDue.title} EMI of ${settings.currencySymbol}${firstDue.monthlyEmi} reminder channel works. Dues appear here before the due date.`
        : 'Reminder channel works. Add a loan and dues will appear here before the due date.',
    });
    setTimeout(() => setTestSent(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-md w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <BellRing className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Notifications &amp; Due Radar</h3>
              <p className="text-xs text-slate-400">Offline reminders &amp; payment alerts</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-5 space-y-4 text-xs text-slate-300">
          {/* Permission card */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/90 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-bold text-white text-xs">System Push Notifications</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Receive notifications on your device even when the browser or app is closed.
                </p>
              </div>

              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                permissionStatus === 'granted'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : permissionStatus === 'denied'
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-amber-500/20 text-amber-300'
              }`}>
                {permissionStatus === 'granted'
                  ? 'Active'
                  : permissionStatus === 'denied'
                  ? 'Blocked'
                  : 'Needs Permission'}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              {permissionStatus !== 'granted' ? (
                <button
                  onClick={handleRequestPermission}
                  className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition active:scale-95"
                >
                  Enable Device Notifications
                </button>
              ) : (
                <button
                  onClick={handleSendTestNotification}
                  disabled={testSent}
                  className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <Bell className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{testSent ? 'Alert Dispatched!' : 'Send Test Notification'}</span>
                </button>
              )}
            </div>

            {permMessage && (
              <p className="text-[11px] leading-relaxed bg-slate-900 rounded-xl px-3 py-2 text-slate-300 border border-slate-800">
                {permMessage}
              </p>
            )}
          </div>

          {/* Preferences */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/90 space-y-3">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider">
              Reminder Preferences
            </h4>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-300">Advance Reminder Window:</span>
                <select
                  value={settings.notificationLeadDays}
                  onChange={(e) => onUpdateSettings({ notificationLeadDays: Number(e.target.value) })}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none"
                >
                  <option value={1}>1 day before due date</option>
                  <option value={2}>2 days before due date</option>
                  <option value={3}>3 days before due date</option>
                  <option value={5}>5 days before due date</option>
                </select>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-800/60">
                <span className="text-slate-300">Audio Feedback &amp; Chimes:</span>
                <button
                  onClick={() => onUpdateSettings({ soundEnabled: !settings.soundEnabled })}
                  className={`p-1.5 rounded-lg border flex items-center gap-1 text-xs transition ${
                    settings.soundEnabled
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}
                >
                  {settings.soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                  <span>{settings.soundEnabled ? 'Enabled' : 'Muted'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Pending Alerts List */}
          <div className="space-y-2">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider">
              Active Due Alerts ({alerts.length})
            </h4>

            {alerts.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>All clear! No upcoming dues in the immediate radar.</span>
              </div>
            ) : (
              alerts.map(({ loan, due }) => (
                <div
                  key={loan.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                    due.status === 'overdue'
                      ? 'bg-rose-950/20 border-rose-500/30'
                      : due.status === 'due_today'
                      ? 'bg-amber-950/20 border-amber-500/30'
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h5 className="font-bold text-white truncate">{loan.title}</h5>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        due.status === 'overdue'
                          ? 'text-rose-400 bg-rose-500/10'
                          : due.status === 'due_today'
                          ? 'text-amber-400 bg-amber-500/10'
                          : 'text-sky-400 bg-sky-500/10'
                      }`}>
                        {due.statusText}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {loan.lender} · Due {due.dueDateString}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-extrabold text-white text-xs font-mono">
                      {formatCurrency(loan.monthlyEmi, settings.currencySymbol)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
