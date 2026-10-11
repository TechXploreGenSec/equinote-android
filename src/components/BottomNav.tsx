import { Radar, Landmark, BellRing, History, Settings } from 'lucide-react';

export type TabType = 'dashboard' | 'loans' | 'reminders' | 'ledger' | 'settings';

interface BottomNavProps {
  currentTab: TabType;
  onChangeTab: (tab: TabType) => void;
  dueSoonCount?: number;
  reminderCount?: number;
}

export default function BottomNav({
  currentTab,
  onChangeTab,
  dueSoonCount = 0,
  reminderCount = 0,
}: BottomNavProps) {
  const tabs = [
    {
      id: 'dashboard' as TabType,
      label: 'Radar',
      icon: Radar,
      badge: dueSoonCount > 0 ? dueSoonCount : undefined,
    },
    {
      id: 'loans' as TabType,
      label: 'Loans',
      icon: Landmark,
    },
    {
      id: 'reminders' as TabType,
      label: 'Reminders',
      icon: BellRing,
      badge: reminderCount > 0 ? reminderCount : undefined,
    },
    {
      id: 'ledger' as TabType,
      label: 'Ledger',
      icon: History,
    },
    {
      id: 'settings' as TabType,
      label: 'Settings',
      icon: Settings,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/80 px-2 py-1 pb-safe">
      <div className="max-w-md mx-auto grid grid-cols-5 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onChangeTab(tab.id)}
              className={`relative flex flex-col items-center justify-center py-2 px-1 rounded-xl transition active:scale-90 ${
                isActive
                  ? 'text-emerald-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110 stroke-[2.2]' : 'stroke-[1.8]'}`} />
                {tab.badge && (
                  <span className="absolute -top-1 -right-2 flex h-3.5 min-w-3.5 px-0.5 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white ring-2 ring-slate-950">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-1 tracking-tight leading-none">
                {tab.label}
              </span>
              {isActive && (
                <div className="w-1 h-1 rounded-full bg-emerald-400 mt-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
