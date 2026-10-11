import { Capacitor } from '@capacitor/core';
import { LoanItem, UserSettings } from '../types';
import { calculateDueStatus, currentMonthYear } from './storage';
import {
  requestNotificationPermission as requestWebPermission,
  getNotificationPermissionStatus,
} from './notifications';

const ASKED_KEY = 'equinote_notif_asked_v1';

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h % 2000000000);
}

/**
 * First-run permission flow.
 * - Android (native): request via LocalNotifications plugin (system dialog).
 * - Web: request via Notification API (may need a user gesture; caller can
 *   retry from the in-app "Enable reminders" banner).
 * Runs only once per device (flag), returns granted status.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    if (isNative()) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const current = await LocalNotifications.checkPermissions();
      if (current.display === 'granted') return true;
      const asked = await LocalNotifications.requestPermissions();
      try {
        localStorage.setItem(ASKED_KEY, 'yes');
      } catch { /* ignore */ }
      return asked.display === 'granted';
    }
    const status = getNotificationPermissionStatus();
    if (status === 'granted') return true;
    if (status === 'denied' || status === 'unsupported') return false;
    const granted = await requestWebPermission();
    try {
      localStorage.setItem(ASKED_KEY, 'yes');
    } catch { /* ignore */ }
    return granted;
  } catch {
    return false;
  }
}

export function wasPermissionAsked(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) === 'yes';
  } catch {
    return false;
  }
}

export async function getPermissionStatus(): Promise<string> {
  try {
    if (isNative()) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const p = await LocalNotifications.checkPermissions();
      return p.display;
    }
    return getNotificationPermissionStatus();
  } catch {
    return 'unknown';
  }
}

function atTime(base: Date, timeHHMM: string): Date {
  const [h, m] = timeHHMM.split(':').map(Number);
  const d = new Date(base);
  d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

/**
 * Schedule native due reminders for unpaid loans due within the lead window
 * (or already overdue / due today). Old pending EquiNote notifications are
 * cancelled first so lists never duplicate.
 */
export async function scheduleDueReminders(
  loans: LoanItem[],
  settings: UserSettings
): Promise<void> {
  if (!isNative() || !settings.notificationsEnabled) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    }

    const now = new Date();
    const monthStr = currentMonthYear(now);
    const toSchedule: { id: number; title: string; body: string; at: Date }[] = [];

    for (const loan of loans) {
      if (loan.isClosed || loan.lastPaidMonthYear === monthStr) continue;
      const due = calculateDueStatus(loan, now);
      if (due.status === 'paid_this_month' || due.status === 'upcoming') continue;

      let fireAt: Date;
      if (due.status === 'overdue' || due.status === 'due_today' || due.status === 'due_soon') {
        fireAt = new Date(now.getTime() + 15_000);
      } else {
        continue;
      }

      // Respect the user's daily reminder time when it is still ahead today
      const timed = atTime(now, settings.notificationTime || '09:00');
      if (timed.getTime() > now.getTime() + 60_000) fireAt = timed;

      toSchedule.push({
        id: hashId(`equinote-${loan.id}`),
        title: `EquiNote: ${loan.title} — ${due.statusText}`,
        body: `EMI of ${settings.currencySymbol}${loan.monthlyEmi} due ${due.dueDateString}. Open EquiNote to clear it.`,
        at: fireAt,
      });
    }

    if (toSchedule.length === 0) return;
    await LocalNotifications.schedule({
      notifications: toSchedule.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: { at: n.at },
      })),
    });
  } catch {
    // Notifications are best-effort; never break the app.
  }
}
