import { useState, useEffect, useCallback, useMemo } from 'react';
import Navbar from './components/Navbar';
import BottomNav, { TabType } from './components/BottomNav';
import PwaInstallBanner from './components/PwaInstallBanner';
import DashboardView from './components/DashboardView';
import LoansView from './components/LoansView';
import RemindersView from './components/RemindersView';
import LedgerView from './components/LedgerView';
import SettingsView from './components/SettingsView';
import AddLoanModal from './components/AddLoanModal';
import LoanDetailModal from './components/LoanDetailModal';
import PayModal from './components/PayModal';
import NotificationsModal from './components/NotificationsModal';
import PdfExportModal from './components/PdfExportModal';

import { LoanItem, PaymentRecord, UserSettings, ReminderItem } from './types';
import {
  loadLoans, saveLoans,
  loadPayments, savePayments,
  loadSettings, saveSettings,
  loadReminders, saveReminders,
  migrateV3SampleData,
  currentMonthYear,
  calculateDueStatus
} from './utils/storage';
import { showSystemNotification, playChimeSound } from './utils/notifications';
import { ensureNotificationPermission, scheduleDueReminders, getPermissionStatus, SETTINGS_HINT } from './utils/nativeNotifications';

export default function App() {
  const [loans, setLoans] = useState<LoanItem[]>(() => {
    migrateV3SampleData();
    return loadLoans();
  });
  const [payments, setPayments] = useState<PaymentRecord[]>(() => loadPayments());
  const [reminders, setReminders] = useState<ReminderItem[]>(() => loadReminders());
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');
  const [notifPermission, setNotifPermission] = useState<string>('unknown');
  const [notifMessage, setNotifMessage] = useState<string | null>(null);

  // Modals state
  const [isAddLoanOpen, setIsAddLoanOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<LoanItem | null>(null);
  const [selectedLoanForDetail, setSelectedLoanForDetail] = useState<LoanItem | null>(null);
  const [payingLoan, setPayingLoan] = useState<LoanItem | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfSpecificLoanId, setPdfSpecificLoanId] = useState<string | undefined>(undefined);

  const handleOpenPdfModal = (specificLoanId?: string) => {
    setPdfSpecificLoanId(specificLoanId);
    setIsPdfModalOpen(true);
  };

  // Sync to local storage
  const handleSaveLoan = (loanData: Partial<LoanItem>) => {
    let updatedLoans: LoanItem[];
    if (loanData.id) {
      // Editing existing
      updatedLoans = loans.map((l) => (l.id === loanData.id ? { ...l, ...loanData } as LoanItem : l));
    } else {
      // Creating new
      const newLoan: LoanItem = {
        id: `loan-${Date.now()}`,
        title: loanData.title || 'Untitled Loan',
        lender: loanData.lender || 'Bank',
        category: loanData.category || 'personal',
        principal: Number(loanData.principal) || 100000,
        interestRate: Number(loanData.interestRate) || 0,
        monthlyEmi: Number(loanData.monthlyEmi) || 5000,
        dueDay: Number(loanData.dueDay) || 5,
        totalMonths: Number(loanData.totalMonths) || 12,
        paidMonths: Number(loanData.paidMonths) || 0,
        lastPaidMonthYear: loanData.lastPaidMonthYear,
        startDate: loanData.startDate || new Date().toISOString().split('T')[0],
        accountNumber: loanData.accountNumber,
        autoDebitBank: loanData.autoDebitBank,
        notes: loanData.notes,
        isClosed: false,
        createdAt: new Date().toISOString(),
      };
      updatedLoans = [newLoan, ...loans];
    }

    setLoans(updatedLoans);
    saveLoans(updatedLoans);
    setIsAddLoanOpen(false);
    setEditingLoan(null);
    playChimeSound('pop');
  };

  const handleDeleteLoan = (loanId: string) => {
    const updated = loans.filter((l) => l.id !== loanId);
    setLoans(updated);
    saveLoans(updated);
    setSelectedLoanForDetail(null);
    playChimeSound('pop');
  };

  const handleToggleCloseLoan = (loan: LoanItem) => {
    const isNowClosed = !loan.isClosed;
    const updated = loans.map((l) =>
      l.id === loan.id
        ? {
            ...l,
            isClosed: isNowClosed,
            closedDate: isNowClosed ? new Date().toISOString().split('T')[0] : undefined,
          }
        : l
    );
    setLoans(updated);
    saveLoans(updated);
    if (selectedLoanForDetail && selectedLoanForDetail.id === loan.id) {
      setSelectedLoanForDetail({
        ...selectedLoanForDetail,
        isClosed: isNowClosed,
        closedDate: isNowClosed ? new Date().toISOString().split('T')[0] : undefined,
      });
    }
    playChimeSound('success');
  };

  const handleConfirmPayment = (data: {
    loanId: string;
    amount: number;
    paidDate: string;
    paymentMode: string;
    transactionRef: string;
    note: string;
  }) => {
    const targetLoan = loans.find((l) => l.id === data.loanId);
    if (!targetLoan) return;

    const newPaidMonths = targetLoan.paidMonths + 1;
    const isCompleted = newPaidMonths >= targetLoan.totalMonths;
    const currentMonthYear = `${new Date(data.paidDate).getFullYear()}-${String(new Date(data.paidDate).getMonth() + 1).padStart(2, '0')}`;

    // Update loan
    const updatedLoans = loans.map((l) =>
      l.id === data.loanId
        ? {
            ...l,
            paidMonths: newPaidMonths,
            lastPaidMonthYear: currentMonthYear,
            isClosed: isCompleted ? true : l.isClosed,
            closedDate: isCompleted ? data.paidDate : l.closedDate,
          }
        : l
    );
    setLoans(updatedLoans);
    saveLoans(updatedLoans);

    // Create payment ledger record
    const newPayment: PaymentRecord = {
      id: `pay-${Date.now()}`,
      loanId: targetLoan.id,
      loanTitle: targetLoan.title,
      amount: data.amount,
      paidDate: data.paidDate,
      monthYear: currentMonthYear,
      installmentNumber: newPaidMonths,
      transactionRef: data.transactionRef,
      paymentMode: data.paymentMode,
      note: data.note,
    };
    const updatedPayments = [newPayment, ...payments];
    setPayments(updatedPayments);
    savePayments(updatedPayments);

    if (selectedLoanForDetail && selectedLoanForDetail.id === targetLoan.id) {
      setSelectedLoanForDetail({
        ...selectedLoanForDetail,
        paidMonths: newPaidMonths,
        lastPaidMonthYear: currentMonthYear,
        isClosed: isCompleted ? true : selectedLoanForDetail.isClosed,
      });
    }
  };

  const handleDeletePayment = (paymentId: string) => {
    if (window.confirm('Delete this payment record from your ledger?')) {
      const targetPayment = payments.find((p) => p.id === paymentId);
      const updated = payments.filter((p) => p.id !== paymentId);
      setPayments(updated);
      savePayments(updated);

      // Decrement paidMonths on loan if applicable
      if (targetPayment) {
        const targetLoan = loans.find((l) => l.id === targetPayment.loanId);
        if (targetLoan && targetLoan.paidMonths > 0) {
          const updatedLoans = loans.map((l) =>
            l.id === targetLoan.id
              ? {
                  ...l,
                  paidMonths: Math.max(0, l.paidMonths - 1),
                  isClosed: false,
                }
              : l
          );
          setLoans(updatedLoans);
          saveLoans(updatedLoans);
        }
      }
    }
  };

  const handleUpdateSettings = (newSettings: Partial<UserSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    saveSettings(updated);
  };

  const handleReloadData = () => {
    setLoans(loadLoans());
    setPayments(loadPayments());
    setReminders(loadReminders());
    setSettings(loadSettings());
  };

  // Bulk CSV import: merge payment records, then align each loan's progress
  // to the highest imported installment (capped) and latest month.
  const handleImportPayments = (records: PaymentRecord[]) => {
    if (records.length === 0) return;
    const updatedPayments = [...records, ...payments];
    setPayments(updatedPayments);
    savePayments(updatedPayments);

    const updatedLoans = loans.map((loan) => {
      const mine = records.filter((r) => r.loanId === loan.id);
      if (mine.length === 0) return loan;
      const maxInst = Math.min(
        loan.totalMonths,
        Math.max(loan.paidMonths, ...mine.map((r) => r.installmentNumber || 0))
      );
      const latestMonth = mine.map((r) => r.monthYear).sort().pop() || loan.lastPaidMonthYear;
      const isCompleted = maxInst >= loan.totalMonths;
      return {
        ...loan,
        paidMonths: maxInst,
        lastPaidMonthYear:
          latestMonth && (!loan.lastPaidMonthYear || latestMonth >= loan.lastPaidMonthYear)
            ? latestMonth
            : loan.lastPaidMonthYear,
        isClosed: isCompleted ? true : loan.isClosed,
      };
    });
    setLoans(updatedLoans);
    saveLoans(updatedLoans);
    playChimeSound('success');
  };

  // Bulk CSV import: append parsed loans as-is (parser already assigns ids).
  const handleImportLoans = (newLoans: LoanItem[]) => {
    if (newLoans.length === 0) return;
    const updated = [...newLoans, ...loans];
    setLoans(updated);
    saveLoans(updated);
    playChimeSound('success');
  };

  const handleSaveReminder = (reminder: ReminderItem) => {    const updated = [reminder, ...reminders];
    setReminders(updated);
    saveReminders(updated);
    playChimeSound('pop');
  };

  const handleDeleteReminder = (id: string) => {
    const updated = reminders.filter((r) => r.id !== id);
    setReminders(updated);
    saveReminders(updated);
  };

  const handleToggleReminderDone = (id: string) => {
    const monthStr = currentMonthYear();
    const updated = reminders.map((r) =>
      r.id === id
        ? { ...r, doneMonthYear: r.doneMonthYear === monthStr ? undefined : monthStr }
        : r
    );
    setReminders(updated);
    saveReminders(updated);
    playChimeSound('success');
  };

  // Due soon count for navigation badge
  const dueSoonCount = useMemo(() => {
    return loans.filter((l) => {
      if (l.isClosed) return false;
      const status = calculateDueStatus(l);
      return status.status === 'overdue' || status.status === 'due_today' || status.status === 'due_soon';
    }).length;
  }, [loans]);

  const reminderCount = useMemo(() => {
    const monthStr = currentMonthYear();
    const todayStr = new Date().toISOString().split('T')[0];
    return reminders.filter((r) => r.doneMonthYear !== monthStr && r.dueDate <= todayStr).length;
  }, [reminders]);

  const handleEnableNotifications = useCallback(async () => {
    setNotifMessage('Requesting notification permission…');
    const result = await ensureNotificationPermission();
    setNotifPermission(result.status);
    if (result.granted) {
      handleUpdateSettings({ notificationsEnabled: true });
      const scheduled = await scheduleDueReminders(loans, { ...settings, notificationsEnabled: true });
      setNotifMessage(
        scheduled.scheduled > 0
          ? `Reminders on — ${scheduled.scheduled} due alert${scheduled.scheduled > 1 ? 's' : ''} scheduled.`
          : 'Reminders on — nothing due right now, alerts will fire before due dates.'
      );
      playChimeSound('success');
    } else if (!result.bridge) {
      setNotifMessage('Notification bridge missing in this build — please reinstall the latest APK from Releases.');
    } else if (result.status === 'denied') {
      setNotifMessage(SETTINGS_HINT);
    } else {
      setNotifMessage('Permission not granted yet — tap Enable again.');
    }
    setTimeout(() => setNotifMessage(null), 9000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans, settings]);

  // First-run: ask notification permission once, then schedule native reminders.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (settings.notificationsEnabled) {
        await ensureNotificationPermission();
      }
      if (!cancelled) {
        setNotifPermission(await getPermissionStatus());
        await scheduleDueReminders(loans, settings);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-schedule native reminders + web fallback alert whenever dues change.
  useEffect(() => {
    if (!settings.notificationsEnabled) return;
    void scheduleDueReminders(loans, settings);
    void getPermissionStatus().then(setNotifPermission);

    const overdueOrToday = loans.filter((l) => {
      if (l.isClosed) return false;
      const due = calculateDueStatus(l);
      return due.status === 'overdue' || due.status === 'due_today';
    });

    if (overdueOrToday.length > 0) {
      const topLoan = overdueOrToday[0];
      const due = calculateDueStatus(topLoan);
      showSystemNotification(
        `EquiNote: ${topLoan.title} is ${due.statusText}!`,
        {
          body: `Installment of ${settings.currencySymbol} ${topLoan.monthlyEmi} is pending. Open app to clear.`,
        }
      );
    }
  }, [settings.notificationsEnabled, loans, settings.currencySymbol, settings.notificationTime]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Navbar */}
      <Navbar
        settings={settings}
        loans={loans}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        onOpenSettings={() => setCurrentTab('settings')}
      />

      {/* In-App PWA Install Banner */}
      <PwaInstallBanner />

      {/* Main Tab Content Container */}
      <main className="flex-1 w-full max-w-2xl mx-auto">
        {currentTab === 'dashboard' && (
          <DashboardView
            loans={loans}
            settings={settings}
            reminders={reminders}
            notifPermission={notifPermission}
            notifMessage={notifMessage}
            onEnableNotifications={handleEnableNotifications}
            onOpenAddLoan={() => {
              setEditingLoan(null);
              setIsAddLoanOpen(true);
            }}
            onOpenPayModal={(loan) => setPayingLoan(loan)}
            onSelectLoan={(loan) => setSelectedLoanForDetail(loan)}
            onGoToLoans={() => setCurrentTab('loans')}
            onGoToReminders={() => setCurrentTab('reminders')}
            onGoToSettings={() => setCurrentTab('settings')}
            onOpenPdfExport={() => handleOpenPdfModal()}
          />
        )}

        {currentTab === 'loans' && (
          <LoansView
            loans={loans}
            settings={settings}
            onOpenAddLoan={() => {
              setEditingLoan(null);
              setIsAddLoanOpen(true);
            }}
            onSelectLoan={(loan) => setSelectedLoanForDetail(loan)}
            onOpenPayModal={(loan) => setPayingLoan(loan)}
            onOpenPdfExport={() => handleOpenPdfModal()}
            onImportLoans={handleImportLoans}
          />
        )}

        {currentTab === 'reminders' && (
          <RemindersView
            reminders={reminders}
            settings={settings}
            onSaveReminder={handleSaveReminder}
            onDeleteReminder={handleDeleteReminder}
            onToggleDone={handleToggleReminderDone}
          />
        )}

        {currentTab === 'ledger' && (
          <LedgerView
            payments={payments}
            loans={loans}
            settings={settings}
            onDeletePayment={handleDeletePayment}
            onImportPayments={handleImportPayments}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsView
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onReloadData={handleReloadData}
            onOpenNotifications={() => setIsNotificationsOpen(true)}
            onOpenPdfExport={() => handleOpenPdfModal()}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <BottomNav
        currentTab={currentTab}
        onChangeTab={(tab) => setCurrentTab(tab)}
        dueSoonCount={dueSoonCount}
        reminderCount={reminderCount}
      />

      {/* Modals & Dialogs */}
      <AddLoanModal
        isOpen={isAddLoanOpen}
        initialLoan={editingLoan}
        onClose={() => {
          setIsAddLoanOpen(false);
          setEditingLoan(null);
        }}
        onSave={handleSaveLoan}
        currencySymbol={settings.currencySymbol}
      />

      <LoanDetailModal
        loan={selectedLoanForDetail}
        settings={settings}
        payments={payments}
        onClose={() => setSelectedLoanForDetail(null)}
        onEdit={(loan) => {
          setSelectedLoanForDetail(null);
          setEditingLoan(loan);
          setIsAddLoanOpen(true);
        }}
        onDelete={handleDeleteLoan}
        onToggleClose={handleToggleCloseLoan}
        onOpenPayModal={(loan) => setPayingLoan(loan)}
        onExportPdf={(loan) => handleOpenPdfModal(loan.id)}
      />

      <PayModal
        isOpen={!!payingLoan}
        loan={payingLoan}
        settings={settings}
        onClose={() => setPayingLoan(null)}
        onConfirmPayment={handleConfirmPayment}
      />

      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        loans={loans}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
      />

      <PdfExportModal
        isOpen={isPdfModalOpen}
        onClose={() => {
          setIsPdfModalOpen(false);
          setPdfSpecificLoanId(undefined);
        }}
        loans={loans}
        payments={payments}
        settings={settings}
        defaultSpecificLoanId={pdfSpecificLoanId}
      />
    </div>
  );
}
