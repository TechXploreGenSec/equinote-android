import { useState, useEffect } from 'react';
import { Bell, Wifi, WifiOff, Download, ShieldCheck } from 'lucide-react';
import { UserSettings, LoanItem } from '../types';
import { calculateDueStatus } from '../utils/storage';

interface NavbarProps {
  settings: UserSettings;
  loans: LoanItem[];
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  canInstallPwa?: boolean;
  onInstallPwa?: () => void;
}

export default function Navbar({
  loans,
  onOpenNotifications,
  canInstallPwa,
  onInstallPwa,
}: NavbarProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Count pending/overdue dues
  const alertCount = loans.filter((l) => {
    if (l.isClosed) return false;
    const status = calculateDueStatus(l);
    return status.status === 'overdue' || status.status === 'due_today' || status.status === 'due_soon';
  }).length;

  return (
    <header className="app-header-safe bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80 px-4 pb-3">
      <div className="max-w-2xl mx-auto flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-950/40 border border-emerald-300/30">
            <ShieldCheck className="w-5 h-5 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white leading-none">
                EquiNote
              </h1>
              {/* Online / Offline status badge */}
              <div
                className={`flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md ${
                  isOnline
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : 'text-amber-400 bg-amber-500/10'
                }`}
                title={isOnline ? 'Online (Data saved locally & ready offline)' : 'Offline mode active (Fully functional)'}
              >
                {isOnline ? (
                  <>
                    <Wifi className="w-3 h-3" />
                    <span>Offline Ready</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3" />
                    <span>Offline</span>
                  </>
                )}
              </div>
            </div>
            <p className="text-[11px] text-slate-400 tracking-wide mt-0.5">
              Personal EMI &amp; Debt Manager
            </p>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {canInstallPwa && onInstallPwa && (
            <button
              onClick={onInstallPwa}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-semibold transition active:scale-95"
              aria-label="Install App"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Install</span>
            </button>
          )}

          {/* Notification Bell */}
          <button
            onClick={onOpenNotifications}
            className="relative p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800/80 transition active:scale-95"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {alertCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-slate-950">
                {alertCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
