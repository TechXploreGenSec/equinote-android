import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LoanItem, PaymentRecord, UserSettings } from '../types';
import { calculateRemainingBalance, calculateTotalInterest } from './finance';
import { calculateDueStatus } from './storage';
import { CATEGORIES } from './categories';

export interface PdfExportOptions {
  includeClosedLoans?: boolean;
  includePaymentHistory?: boolean;
  specificLoanId?: string;
  customNotes?: string;
  orientation?: 'landscape' | 'portrait';
}

/**
 * Format currency safely for jsPDF Helvetica font.
 * Replaces Unicode ₹ (U+20B9) with standard ASCII 'Rs. ' to avoid corrupted rendering or missing text.
 */
export function formatPdfCurrency(amount: number, symbol: string = '₹'): string {
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(Math.round(amount || 0));

  if (symbol === '₹') {
    return `Rs. ${formatted}`;
  }
  if (symbol === '$') {
    const western = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
    }).format(Math.round(amount || 0));
    return `$${western}`;
  }
  if (symbol === '€') {
    return `EUR ${formatted}`;
  }
  if (symbol === '£') {
    return `GBP ${formatted}`;
  }
  return `${symbol} ${formatted}`;
}

export function generatePortfolioPdf(
  loans: LoanItem[],
  payments: PaymentRecord[],
  settings: UserSettings,
  options: PdfExportOptions = {}
): jsPDF {
  const orientation = options.orientation || 'portrait';
  
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182mm in portrait, 269mm in landscape

  const primaryColor: [number, number, number] = [15, 23, 42]; // Slate 900
  const emeraldColor: [number, number, number] = [16, 185, 129]; // Emerald 500
  const grayColor: [number, number, number] = [100, 116, 139]; // Slate 500
  const lightBg: [number, number, number] = [248, 250, 252]; // Slate 50

  const activeLoans = loans.filter((l) => !l.isClosed);
  const closedLoans = loans.filter((l) => l.isClosed);

  let targetLoans = loans;
  if (options.specificLoanId) {
    targetLoans = loans.filter((l) => l.id === options.specificLoanId);
  } else if (!options.includeClosedLoans) {
    targetLoans = activeLoans;
  }

  const totalOutstanding = activeLoans.reduce((sum, l) => {
    return sum + calculateRemainingBalance(l.principal, l.interestRate, l.totalMonths, l.paidMonths);
  }, 0);

  const totalMonthlyCommitment = activeLoans.reduce((sum, l) => sum + l.monthlyEmi, 0);

  const dtiRatio = settings.monthlyIncome > 0
    ? Math.round((totalMonthlyCommitment / settings.monthlyIncome) * 100)
    : 0;

  const generatedDateStr = new Date().toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // 1. HEADER BANNER (Compact & Executive)
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 20, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('EQUINOTE - EMI & LOAN STATEMENT', margin, 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Personal Debt Portfolio & Repayment Audit Dossier', margin, 15.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(52, 211, 153);
  doc.text('CONFIDENTIAL STATEMENT', pageWidth - margin, 9.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Generated: ${generatedDateStr}`, pageWidth - margin, 15, { align: 'right' });

  let yPos = 25;

  // 2. ACCOUNT HOLDER PARTICULARS STRIP
  doc.setFillColor(...lightBg);
  doc.roundedRect(margin, yPos, contentWidth, 12, 1.5, 1.5, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, yPos, contentWidth, 12, 1.5, 1.5, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...grayColor);

  const col1X = margin + 4;
  const col2X = margin + contentWidth * 0.35;
  const col3X = margin + contentWidth * 0.70;

  doc.text('ACCOUNT HOLDER', col1X, yPos + 4.5);
  doc.text('NET MONTHLY SALARY', col2X, yPos + 4.5);
  doc.text('PORTFOLIO STATUS', col3X, yPos + 4.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...primaryColor);
  doc.text(settings.userName || 'Account Lead', col1X, yPos + 9.5);
  doc.text(formatPdfCurrency(settings.monthlyIncome, settings.currencySymbol), col2X, yPos + 9.5);
  doc.text(
    options.specificLoanId
      ? 'Single Loan Dossier'
      : `${activeLoans.length} Active Loans (${closedLoans.length} Settled)`,
    col3X,
    yPos + 9.5
  );

  yPos += 16;

  // 3. EXECUTIVE METRICS SUMMARY CARDS
  if (!options.specificLoanId) {
    const cardWidth = (contentWidth - 6) / 3;
    const cardHeight = 14;

    // Card 1: Outstanding Balance
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, yPos, cardWidth, cardHeight, 1.5, 1.5, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, yPos, cardWidth, cardHeight, 1.5, 1.5, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...grayColor);
    doc.text('TOTAL OUTSTANDING BALANCE', margin + 3.5, yPos + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...primaryColor);
    doc.text(formatPdfCurrency(totalOutstanding, settings.currencySymbol), margin + 3.5, yPos + 10.5);

    // Card 2: Monthly EMI Outflow
    const card2X = margin + cardWidth + 3;
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(card2X, yPos, cardWidth, cardHeight, 1.5, 1.5, 'F');
    doc.roundedRect(card2X, yPos, cardWidth, cardHeight, 1.5, 1.5, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...grayColor);
    doc.text('TOTAL MONTHLY EMI BURDEN', card2X + 3.5, yPos + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(16, 185, 129);
    doc.text(formatPdfCurrency(totalMonthlyCommitment, settings.currencySymbol), card2X + 3.5, yPos + 10.5);

    // Card 3: Debt-To-Income
    const card3X = card2X + cardWidth + 3;
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(card3X, yPos, cardWidth, cardHeight, 1.5, 1.5, 'F');
    doc.roundedRect(card3X, yPos, cardWidth, cardHeight, 1.5, 1.5, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...grayColor);
    doc.text('DEBT-TO-INCOME (DTI) RATIO', card3X + 3.5, yPos + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(dtiRatio <= 35 ? 16 : 225, dtiRatio <= 35 ? 185 : 29, dtiRatio <= 35 ? 129 : 72);
    doc.text(`${dtiRatio}% of Income`, card3X + 3.5, yPos + 10.5);

    yPos += 18;
  }

  // 4. MAIN LOANS TABLE HEADER
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...primaryColor);
  doc.text(
    options.specificLoanId ? 'LOAN SPECIFICATIONS & SCHEDULE' : 'ACTIVE LOAN & EMI SCHEDULE BREAKDOWN',
    margin,
    yPos
  );

  yPos += 2;

  // Build clean rows for portrait layout (combining details so NO column wraps vertically)
  const portraitTableRows = targetLoans.map((loan, idx) => {
    const bal = calculateRemainingBalance(loan.principal, loan.interestRate, loan.totalMonths, loan.paidMonths);
    const cat = CATEGORIES[loan.category]?.label || loan.category;
    const rateText = loan.interestRate > 0 ? `${loan.interestRate}% p.a.` : '0% No-cost';
    const dueInfo = calculateDueStatus(loan);

    // Rich multi-line content
    const loanTitleAndBank = loan.autoDebitBank || loan.accountNumber
      ? `${loan.title}\n${loan.lender} · Mandate: ${loan.autoDebitBank || loan.accountNumber}`
      : `${loan.title}\n${loan.lender}`;

    const tenureAndDue = `${loan.paidMonths}/${loan.totalMonths} mos\nDue ${loan.dueDay}th of mo`;
    const balanceAndRate = loan.isClosed ? `Settled` : `${formatPdfCurrency(bal, settings.currencySymbol)}\nRate: ${rateText}`;

    return [
      (idx + 1).toString(),
      loanTitleAndBank,
      cat,
      formatPdfCurrency(loan.monthlyEmi, settings.currencySymbol),
      tenureAndDue,
      balanceAndRate,
    ];
  });

  // Strict column widths summing to contentWidth (182mm)
  // 8 + 54 + 24 + 28 + 28 + 40 = 182mm
  const isLandscape = orientation === 'landscape';

  const colWidths = isLandscape
    ? {
        0: { cellWidth: 10, halign: 'center' as const },
        1: { cellWidth: 80, fontStyle: 'bold' as const },
        2: { cellWidth: 40 },
        3: { cellWidth: 38, halign: 'right' as const, fontStyle: 'bold' as const, textColor: [16, 185, 129] as [number, number, number] },
        4: { cellWidth: 45, halign: 'center' as const },
        5: { cellWidth: 56, halign: 'right' as const, fontStyle: 'bold' as const },
      }
    : {
        0: { cellWidth: 8, halign: 'center' as const },
        1: { cellWidth: 54, fontStyle: 'bold' as const },
        2: { cellWidth: 24 },
        3: { cellWidth: 28, halign: 'right' as const, fontStyle: 'bold' as const, textColor: [16, 185, 129] as [number, number, number] },
        4: { cellWidth: 28, halign: 'center' as const },
        5: { cellWidth: 40, halign: 'right' as const, fontStyle: 'bold' as const },
      };

  autoTable(doc, {
    startY: yPos,
    margin: { left: margin, right: margin },
    tableWidth: contentWidth,
    head: [[
      '#',
      'Loan Details & Bank Mandate',
      'Category',
      'Monthly EMI',
      'Tenure & Due Day',
      'Outstanding Balance',
    ]],
    body: portraitTableRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 2,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'left',
      minCellHeight: 7,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: colWidths,
  });

  // @ts-expect-error autoTable adds lastAutoTable to doc
  yPos = doc.lastAutoTable.finalY + 7;

  // 5. IF SINGLE LOAN DOSSIER: SHOW AGREEMENT TERMS & NOTES
  if (options.specificLoanId && targetLoans.length > 0) {
    const single = targetLoans[0];
    const totalInt = calculateTotalInterest(single.principal, single.interestRate, single.totalMonths);

    if (yPos + 32 > pageHeight - margin) {
      doc.addPage();
      yPos = 16;
    }

    doc.setFillColor(...lightBg);
    doc.roundedRect(margin, yPos, contentWidth, 26, 1.5, 1.5, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, yPos, contentWidth, 26, 1.5, 1.5, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...primaryColor);
    doc.text('AGREEMENT PARTICULARS & PRECLOSURE TERMS', margin + 3.5, yPos + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...grayColor);
    doc.text(`Original Principal: ${formatPdfCurrency(single.principal, settings.currencySymbol)}`, margin + 3.5, yPos + 10);
    doc.text(`Total Lifetime Interest: ${formatPdfCurrency(totalInt, settings.currencySymbol)}`, margin + 3.5, yPos + 15);
    doc.text(`Agreement / Loan A/C #: ${single.accountNumber || 'N/A'}`, margin + 3.5, yPos + 20);

    const rightColX = margin + contentWidth * 0.50;
    doc.text(`Start Date: ${single.startDate || 'N/A'}`, rightColX, yPos + 10);
    doc.text('Preclosure Terms & Remarks:', rightColX, yPos + 15);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(71, 85, 105);
    const splitNotes = doc.splitTextToSize(single.notes || 'No preclosure remarks added.', contentWidth * 0.46);
    doc.text(splitNotes, rightColX, yPos + 20);

    yPos += 30;
  }

  // 6. PAYMENT HISTORY LEDGER TABLE (IF INCLUDED)
  if (options.includePaymentHistory && payments.length > 0) {
    let targetPayments = payments;
    if (options.specificLoanId) {
      targetPayments = payments.filter((p) => p.loanId === options.specificLoanId);
    }

    if (targetPayments.length > 0) {
      if (yPos + 28 > pageHeight - margin) {
        doc.addPage();
        yPos = 16;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...primaryColor);
      doc.text('PAYMENT AUDIT LEDGER', margin, yPos);

      yPos += 2;

      // 6-column clean payment ledger
      // 8 + 22 + 52 + 22 + 32 + 46 = 182mm
      const payRows = targetPayments.slice(0, 30).map((p, idx) => {
        const loanTitleAndMode = `${p.loanTitle}\nMode: ${p.paymentMode || 'Auto-Debit'}`;
        const refAndNote = p.note
          ? `${p.transactionRef || '-'}\n${p.note}`
          : `${p.transactionRef || '-'}`;

        return [
          (idx + 1).toString(),
          p.paidDate,
          loanTitleAndMode,
          `Inst #${p.installmentNumber}`,
          formatPdfCurrency(p.amount, settings.currencySymbol),
          refAndNote,
        ];
      });

      const payColWidths = isLandscape
        ? {
            0: { cellWidth: 10, halign: 'center' as const },
            1: { cellWidth: 32 },
            2: { cellWidth: 76, fontStyle: 'bold' as const },
            3: { cellWidth: 32, halign: 'center' as const },
            4: { cellWidth: 45, halign: 'right' as const, fontStyle: 'bold' as const, textColor: [16, 185, 129] as [number, number, number] },
            5: { cellWidth: 74 },
          }
        : {
            0: { cellWidth: 8, halign: 'center' as const },
            1: { cellWidth: 22 },
            2: { cellWidth: 50, fontStyle: 'bold' as const },
            3: { cellWidth: 22, halign: 'center' as const },
            4: { cellWidth: 32, halign: 'right' as const, fontStyle: 'bold' as const, textColor: [16, 185, 129] as [number, number, number] },
            5: { cellWidth: 48 },
          };

      autoTable(doc, {
        startY: yPos,
        margin: { left: margin, right: margin },
        tableWidth: contentWidth,
        head: [[
          '#',
          'Date',
          'Loan Title & Mode',
          'Installment',
          'Paid Amount',
          'Reference ID & Remarks',
        ]],
        body: payRows,
        theme: 'striped',
        styles: {
          font: 'helvetica',
          fontSize: 7.5,
          cellPadding: 2,
          overflow: 'linebreak',
          valign: 'middle',
        },
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontSize: 7.5,
          fontStyle: 'bold',
          minCellHeight: 7,
        },
        columnStyles: payColWidths,
      });

      // @ts-expect-error autoTable adds lastAutoTable to doc
      yPos = doc.lastAutoTable.finalY + 6;
    }
  }

  // 7. BORROWER AUDIT & CLOSURE NOTICE (Compact 14mm)
  if (yPos + 18 > pageHeight - margin) {
    doc.addPage();
    yPos = 16;
  }

  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin, yPos, contentWidth, 14, 1.5, 1.5, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, yPos, contentWidth, 14, 1.5, 1.5, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...primaryColor);
  doc.text('BORROWER AUDIT & CLOSURE NOTICE:', margin + 3.5, yPos + 3.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(71, 85, 105);
  doc.text('1. Obtain formal No Objection Certificate (NOC) / No Dues Certificate within 30 days of loan completion.', margin + 3.5, yPos + 7);
  doc.text('2. Retrieve original property / vehicle collateral title papers. For vehicle loans, file RTO Form 35 for hypothecation removal.', margin + 3.5, yPos + 10.5);

  // 8. ACCURATE FOOTER WITH REAL PAGE COUNT
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 7, pageWidth - margin, pageHeight - 7);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Generated offline via EquiNote · Private Client Financial Statement', margin, pageHeight - 3.5);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 3.5, { align: 'right' });
  }

  return doc;
}
