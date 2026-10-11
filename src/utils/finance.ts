/**
 * Financial calculation engine for EMIs, Loans, and Prepayment Analysis
 */

export function calculateEmi(principal: number, annualRatePct: number, months: number): number {
  if (months <= 0) return 0;
  if (annualRatePct <= 0) {
    return Math.round((principal / months) * 100) / 100;
  }
  const monthlyRate = annualRatePct / (12 * 100);
  const factor = Math.pow(1 + monthlyRate, months);
  const emi = (principal * monthlyRate * factor) / (factor - 1);
  return Math.round(emi);
}

export function calculateRemainingBalance(
  principal: number,
  annualRatePct: number,
  totalMonths: number,
  paidMonths: number
): number {
  if (paidMonths >= totalMonths) return 0;
  if (paidMonths <= 0) return principal;

  if (annualRatePct <= 0) {
    const rem = principal * (1 - paidMonths / totalMonths);
    return Math.max(0, Math.round(rem));
  }

  const r = annualRatePct / (12 * 100);
  const totalFactor = Math.pow(1 + r, totalMonths);
  const paidFactor = Math.pow(1 + r, paidMonths);
  const balance = (principal * (totalFactor - paidFactor)) / (totalFactor - 1);
  return Math.max(0, Math.round(balance));
}

export function calculateTotalInterest(
  principal: number,
  annualRatePct: number,
  months: number
): number {
  if (annualRatePct <= 0 || months <= 0) return 0;
  const emi = calculateEmi(principal, annualRatePct, months);
  const totalPayment = emi * months;
  return Math.max(0, Math.round(totalPayment - principal));
}

export interface PrepaymentImpact {
  currentRemainingMonths: number;
  currentRemainingBalance: number;
  currentRemainingInterest: number;
  // Option 1: Reduce Tenure
  newTenureMonths: number;
  monthsSaved: number;
  interestSavedTenure: number;
  // Option 2: Reduce EMI
  newMonthlyEmi: number;
  monthlyEmiReduction: number;
  interestSavedEmi: number;
}

export function simulatePrepayment(
  principal: number,
  annualRatePct: number,
  totalMonths: number,
  paidMonths: number,
  currentEmi: number,
  lumpSumPrepayment: number
): PrepaymentImpact {
  const currentBalance = calculateRemainingBalance(principal, annualRatePct, totalMonths, paidMonths);
  const remainingMonths = Math.max(0, totalMonths - paidMonths);
  
  // Remaining interest with current plan
  const r = annualRatePct > 0 ? annualRatePct / (12 * 100) : 0;
  let currentRemInterest = 0;
  if (r > 0 && remainingMonths > 0) {
    currentRemInterest = Math.max(0, Math.round(currentEmi * remainingMonths - currentBalance));
  }

  const effectiveBalanceAfterPrepayment = Math.max(0, currentBalance - lumpSumPrepayment);

  if (effectiveBalanceAfterPrepayment === 0) {
    return {
      currentRemainingMonths: remainingMonths,
      currentRemainingBalance: currentBalance,
      currentRemainingInterest: currentRemInterest,
      newTenureMonths: 0,
      monthsSaved: remainingMonths,
      interestSavedTenure: currentRemInterest,
      newMonthlyEmi: 0,
      monthlyEmiReduction: currentEmi,
      interestSavedEmi: currentRemInterest,
    };
  }

  // Option 1: Keep same EMI, find new tenure
  let newTenure = remainingMonths;
  let interestSavedTenure = 0;
  if (r > 0) {
    // formula: n = - log(1 - (P * r / EMI)) / log(1 + r)
    const ratio = (effectiveBalanceAfterPrepayment * r) / currentEmi;
    if (ratio < 1) {
      newTenure = Math.ceil(-Math.log(1 - ratio) / Math.log(1 + r));
      const totalNewPayment = newTenure * currentEmi;
      const newInterest = Math.max(0, totalNewPayment - effectiveBalanceAfterPrepayment);
      interestSavedTenure = Math.max(0, currentRemInterest - newInterest);
    }
  } else {
    newTenure = Math.ceil(effectiveBalanceAfterPrepayment / currentEmi);
  }

  const monthsSaved = Math.max(0, remainingMonths - newTenure);

  // Option 2: Keep tenure same, compute new EMI
  let newMonthlyEmi = currentEmi;
  let interestSavedEmi = 0;
  if (remainingMonths > 0) {
    if (r > 0) {
      const factor = Math.pow(1 + r, remainingMonths);
      newMonthlyEmi = Math.round((effectiveBalanceAfterPrepayment * r * factor) / (factor - 1));
      const newInterest = Math.max(0, newMonthlyEmi * remainingMonths - effectiveBalanceAfterPrepayment);
      interestSavedEmi = Math.max(0, currentRemInterest - newInterest);
    } else {
      newMonthlyEmi = Math.round(effectiveBalanceAfterPrepayment / remainingMonths);
    }
  }

  const monthlyEmiReduction = Math.max(0, currentEmi - newMonthlyEmi);

  return {
    currentRemainingMonths: remainingMonths,
    currentRemainingBalance: currentBalance,
    currentRemainingInterest: currentRemInterest,
    newTenureMonths: newTenure,
    monthsSaved,
    interestSavedTenure: Math.round(interestSavedTenure),
    newMonthlyEmi,
    monthlyEmiReduction,
    interestSavedEmi: Math.round(interestSavedEmi),
  };
}

export function formatCurrency(amount: number, symbol: string = '₹'): string {
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(Math.round(amount || 0));

  if (symbol === '$' || symbol === '£' || symbol === '€') {
    // western style commas
    const western = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
    }).format(Math.round(amount || 0));
    return `${symbol}${western}`;
  }
  return `${symbol} ${formatted}`;
}
