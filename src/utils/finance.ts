/**
 * Financial calculation engine for EMIs and Loans
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

/**
 * Inverse amortization: back-calculate the original principal from a known
 * EMI, rate and tenure. Used when a bulk-upload CSV has EMI but no principal.
 */
export function calculatePrincipalFromEmi(emi: number, annualRatePct: number, months: number): number {
  if (!Number.isFinite(emi) || emi <= 0 || !Number.isFinite(months) || months <= 0) return 0;
  if (!Number.isFinite(annualRatePct) || annualRatePct <= 0) {
    return Math.round(emi * months);
  }
  const r = annualRatePct / (12 * 100);
  const factor = Math.pow(1 + r, months);
  return Math.round((emi * (factor - 1)) / (r * factor));
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
