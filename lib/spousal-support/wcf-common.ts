import { calculateBothINDIs, type SolverParty } from "./indi";
import { solveSpousalSupport } from "./solver";
import { calculateWCFDuration } from "./duration";
import type { SSAGRange, SSAGDuration } from "@/types/spousal-support";

/**
 * Shared scaffolding for all With-Child-Support variants.
 *
 * Each variant computes:
 *   1. Child support amount (variant-specific — sole, set-off, or split-net)
 *   2. Section 7 shares (proportional to income)
 *   3. Two SolverParty profiles describing payor/recipient of SS
 *   4. Solves for SS at 40/43/46% INDI target
 *
 * This module runs step 4 and assembles the final output. The variants
 * handle steps 1–3 and call `runWCFSolver`.
 */

export const WCF_TARGETS = { low: 0.40, mid: 0.43, high: 0.46 } as const;

export interface WCFSolverOutput {
  monthlyAmount: SSAGRange;
  duration: SSAGDuration;
  ssPayorINDIMonthly: SSAGRange;
  ssRecipientINDIMonthly: SSAGRange;
  recipientSharePercent: SSAGRange;
  anyAtUpperBound: boolean;
}

/**
 * Runs the INDI solver at all three target levels and produces the output
 * shape common to every WCF variant. `maxAnnual` enforces the SSAG floor
 * (self-support reserve for the payor).
 *
 * When `manualSSAnnual` is provided (solver bypass), the solver is skipped
 * entirely. The three range values collapse to the caller-supplied amount
 * and the INDI breakdown reflects the resulting share.
 */
export function runWCFSolver(
  ssPayor: SolverParty,
  ssRecipient: SolverParty,
  yearsOfRelationship: number,
  ssRecipientAge: number,
  youngestChildAge: number | null,
  maxAnnual?: number,
  targets: { low: number; mid: number; high: number } = WCF_TARGETS,
  manualSSAnnual?: number,
  section7TotalMonthly: number = 0,
): WCFSolverOutput {
  const duration = calculateWCFDuration(
    yearsOfRelationship,
    ssRecipientAge,
    youngestChildAge,
  );

  if (manualSSAnnual !== undefined) {
    const bd = calculateBothINDIs(ssPayor, ssRecipient, manualSSAnnual, section7TotalMonthly);
    const monthly = manualSSAnnual / 12;
    const payorMonthly = bd.ssPayorINDI / 12;
    const recipientMonthly = bd.ssRecipientINDI / 12;
    const sharePercent = bd.recipientShare * 100;
    return {
      monthlyAmount: { low: monthly, mid: monthly, high: monthly },
      duration,
      ssPayorINDIMonthly: { low: payorMonthly, mid: payorMonthly, high: payorMonthly },
      ssRecipientINDIMonthly: {
        low: recipientMonthly,
        mid: recipientMonthly,
        high: recipientMonthly,
      },
      recipientSharePercent: { low: sharePercent, mid: sharePercent, high: sharePercent },
      anyAtUpperBound: false,
    };
  }

  const solvedLow = solveSpousalSupport(ssPayor, ssRecipient, targets.low, maxAnnual, section7TotalMonthly);
  const solvedMid = solveSpousalSupport(ssPayor, ssRecipient, targets.mid, maxAnnual, section7TotalMonthly);
  const solvedHigh = solveSpousalSupport(ssPayor, ssRecipient, targets.high, maxAnnual, section7TotalMonthly);

  const lowBreakdown = calculateBothINDIs(ssPayor, ssRecipient, solvedLow.spousalSupportAnnual, section7TotalMonthly);
  const midBreakdown = calculateBothINDIs(ssPayor, ssRecipient, solvedMid.spousalSupportAnnual, section7TotalMonthly);
  const highBreakdown = calculateBothINDIs(ssPayor, ssRecipient, solvedHigh.spousalSupportAnnual, section7TotalMonthly);

  return {
    monthlyAmount: {
      low: solvedLow.spousalSupportAnnual / 12,
      mid: solvedMid.spousalSupportAnnual / 12,
      high: solvedHigh.spousalSupportAnnual / 12,
    },
    duration,
    ssPayorINDIMonthly: {
      low: lowBreakdown.ssPayorINDI / 12,
      mid: midBreakdown.ssPayorINDI / 12,
      high: highBreakdown.ssPayorINDI / 12,
    },
    ssRecipientINDIMonthly: {
      low: lowBreakdown.ssRecipientINDI / 12,
      mid: midBreakdown.ssRecipientINDI / 12,
      high: highBreakdown.ssRecipientINDI / 12,
    },
    recipientSharePercent: {
      low: lowBreakdown.recipientShare * 100,
      mid: midBreakdown.recipientShare * 100,
      high: highBreakdown.recipientShare * 100,
    },
    anyAtUpperBound:
      solvedLow.atUpperBound || solvedMid.atUpperBound || solvedHigh.atUpperBound,
  };
}
