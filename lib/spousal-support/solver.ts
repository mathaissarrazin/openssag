import { calculateBothINDIs, type SolverParty } from "./indi";

export interface SolverResult {
  /** Annual spousal support amount that produces the target split */
  spousalSupportAnnual: number;
  /** True if the result hit the upper bound without reaching target */
  atUpperBound: boolean;
}

/**
 * Binary-search for the annual spousal support amount that causes the
 * recipient's INDI share to equal `targetRecipientShare`.
 *
 * Iterates recomputing both INDIs until convergence within $1. `maxAnnual`
 * caps the upper bound (used to enforce SSAG floor rules — the payor must
 * retain the self-support reserve).
 */
export function solveSpousalSupport(
  ssPayor: SolverParty,
  ssRecipient: SolverParty,
  targetRecipientShare: number,
  maxAnnual?: number,
  section7TotalMonthly: number = 0,
): SolverResult {
  // If SS=0 already puts recipient at or above target, no SS needed
  const zero = calculateBothINDIs(ssPayor, ssRecipient, 0, section7TotalMonthly);
  if (zero.recipientShare >= targetRecipientShare) {
    return { spousalSupportAnnual: 0, atUpperBound: false };
  }

  // Upper bound: floor-protection cap (if provided) OR 50% of SS payor's gross
  const defaultHigh = Math.max(1000, ssPayor.grossIncome * 0.5);
  let low = 0;
  let high = maxAnnual !== undefined ? Math.min(defaultHigh, maxAnnual) : defaultHigh;

  if (high <= 0) {
    // Floor leaves no room for SS at all
    return { spousalSupportAnnual: 0, atUpperBound: true };
  }

  const max = calculateBothINDIs(ssPayor, ssRecipient, high, section7TotalMonthly);
  if (max.recipientShare < targetRecipientShare) {
    return { spousalSupportAnnual: high, atUpperBound: true };
  }

  // Binary search to $1 tolerance
  for (let i = 0; i < 50; i++) {
    if (high - low < 1) break;
    const mid = (low + high) / 2;
    const result = calculateBothINDIs(ssPayor, ssRecipient, mid, section7TotalMonthly);
    if (result.recipientShare >= targetRecipientShare) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return {
    spousalSupportAnnual: (low + high) / 2,
    atUpperBound: false,
  };
}
