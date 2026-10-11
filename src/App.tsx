import { useState, useEffect, useCallback, useMemo } from 'react';
import Navbar from './components/Navbar';
import BottomNav, { TabType } from './components/BottomNav';
import PwaInstallBanner from './components/PwaInstallBanner';
import DashboardView from './components/DashboardView';
import LoansView from './components/LoansView';
import SimulatorView from './components/SimulatorView';
import LedgerView from './components/LedgerView';
import SettingsView from './components/SettingsView';
import AddLoanModal from './components/AddLoanModal';
import LoanDetailModal from './components/LoanDetailModal';
import PayModal from './components/PayModal';
import NotificationsModal from './components/NotificationsModal';

import { LoanItem, PaymentRecord, UserSettings } from './types';
import { 
  loadLoans, saveLoans, 
  loadPayments, savePayments, 
  loadSettings, saveSettings, 
  calculateDueStatus 
} from './utils/storage';
import { showSystemNotification, playChimeSound } from './utils/notifications';

export default function App() {
  const [loans, setLoans] = useState<LoanItem[]>(() => loadLoans());
  const [payments, setPayments] = useState<PaymentRecord[]>(() => loadPayments());
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');

  // Modals state
  const [isAddLoanOpen, setIsAddLoanOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<LoanItem | null>(null);
  const [selectedLoanForDetail, setSelectedLoanForDetail] = useState<LoanItem | null>(null);
  const [payingLoan, setPayingLoan] = useState<LoanItem | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [simulatorPreselectedLoan, setSimulatorPreselectedLoan] = useState<LoanItem | null>(null);

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
    setSettings(loadSettings());
  };

  // Due soon count for navigation badge
  const dueSoonCount = useMemo(() => {
    return loans.filter((l) => {
      if (l.isClosed) return false;
      const status = calculateDueStatus(l);
      return status.status === 'overdue' || status.status === 'due_today' || status.status === 'due_soon';
    }).length;
  }, [loans]);

  // Check for upcoming dues on launch and dispatch notification if enabled
  useEffect(() => {
    if (!settings.notificationsEnabled) return;

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
  }, [settings.notificationsEnabled, loans, settings.currencySymbol]);

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
            onOpenAddLoan={() => {
              setEditingLoan(null);
              setIsAddLoanOpen(true);
            }}
            onOpenPayModal={(loan) => setPayingLoan(loan)}
            onSelectLoan={(loan) => setSelectedLoanForDetail(loan)}
            onGoToLoans={() => setCurrentTab('loans')}
            onGoToSimulators={() => {
              setSimulatorPreselectedLoan(null);
              setCurrentTab('simulators');
            }}
            onGoToSettings={() => setCurrentTab('settings')}
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
          />
        )}

        {currentTab === 'simulators' && (
          <SimulatorView
            loans={loans}
            settings={settings}
            preselectedLoan={simulatorPreselectedLoan}
          />
        )}

        {currentTab === 'ledger' && (
          <LedgerView
            payments={payments}
            loans={loans}
            settings={settings}
            onDeletePayment={handleDeletePayment}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsView
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onReloadData={handleReloadData}
            onOpenNotifications={() => setIsNotificationsOpen(true)}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <BottomNav
        currentTab={currentTab}
        onChangeTab={(tab) => setCurrentTab(tab)}
        dueSoonCount={dueSoonCount}
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
        onPrepaySimulate={(loan) => {
          setSimulatorPreselectedLoan(loan);
          setCurrentTab('simulators');
        }}
        onOpenPayModal={(loan) => setPayingLoan(loan)}
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
    </div>
  );
}
