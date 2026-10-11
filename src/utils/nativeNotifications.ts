import { Capacitor } from '@capacitor/core';
import { LoanItem, UserSettings } from '../types';
import { calculateDueStatus, currentMonthYear } from './storage';
import {
  requestNotificationPermission as requestWebPermission,
  getNotificationPermissionStatus,
} from './notifications';

const ASKED_KEY = 'equinote_notif_asked_v1';

export const SETTINGS_HINT =
  'System dialog did not appear — notifications are blocked for EquiNote. Open Android Settings → Apps → EquiNote → Notifications and turn them on, then tap Enable again.';

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** True only when the native notification bridge is actually callable. */
export function isNotificationBridgeOk(): boolean {
  try {
    return !isNative() || Capacitor.isPluginAvailable('LocalNotifications');
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

export interface PermissionResult {
  granted: boolean;
  /** Raw status: granted | denied | prompt | default | unsupported | unavailable | unknown */
  status: string;
  /** False when running native but the plugin bridge is missing. */
  bridge: boolean;
}

/**
 * First-run permission flow.
 * - Android (native): request via LocalNotifications plugin (system dialog).
 * - Web: request via Notification API (needs a user gesture; retry from the
 *   in-app "Enable reminders" banner).
 * Always reports back what happened so the UI can show it — never silent.
 */
export async function ensureNotificationPermission(): Promise<PermissionResult> {
  const fail = (status: string, bridge = true): PermissionResult => ({ granted: false, status, bridge });
  try {
    if (isNative()) {
      if (!Capacitor.isPluginAvailable('LocalNotifications')) {
        return fail('unavailable', false);
      }
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const current = await LocalNotifications.checkPermissions();
      if (current.display === 'granted') return { granted: true, status: 'granted', bridge: true };
      const asked = await LocalNotifications.requestPermissions();
      try {
        localStorage.setItem(ASKED_KEY, 'yes');
      } catch { /* ignore */ }
      return { granted: asked.display === 'granted', status: asked.display, bridge: true };
    }
    const status = getNotificationPermissionStatus();
    if (status === 'granted') return { granted: true, status, bridge: true };
    if (status === 'denied' || status === 'unsupported') return fail(status);
    const granted = await requestWebPermission();
    try {
      localStorage.setItem(ASKED_KEY, 'yes');
    } catch { /* ignore */ }
    return { granted, status: granted ? 'granted' : getNotificationPermissionStatus(), bridge: true };
  } catch {
    return fail('unknown');
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
): Promise<{ scheduled: number; ok: boolean; error?: string }> {
  if (!isNative() || !settings.notificationsEnabled) return { scheduled: 0, ok: true };
  try {
    if (!Capacitor.isPluginAvailable('LocalNotifications')) {
      return { scheduled: 0, ok: false, error: 'notification bridge unavailable' };
    }
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

    if (toSchedule.length === 0) return { scheduled: 0, ok: true };
    await LocalNotifications.schedule({
      notifications: toSchedule.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: { at: n.at },
      })),
    });
    return { scheduled: toSchedule.length, ok: true };
  } catch (e) {
    return { scheduled: 0, ok: false, error: e instanceof Error ? e.message : 'schedule failed' };
  }
}
