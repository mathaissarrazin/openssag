import type { SSAGDuration } from "../../types/spousal-support";

/**
 * WOCF duration rules under the SSAG (2016 Revised User's Guide):
 *
 * - Fixed-term: 0.5 to 1 year per year of relationship (minimum 0.5 years).
 * - Indefinite (subject to review) if **any** of:
 *   - Relationship lasted 20 or more years.
 *   - Rule of 65: recipient age at separation + years of relationship ≥ 65,
 *     provided the relationship lasted at least 5 years.
 */
export function calculateWOCFDuration(
  yearsOfRelationship: number,
  recipientAgeAtSeparation: number,
): SSAGDuration {
  if (yearsOfRelationship >= 20) {
    return {
      type: "indefinite",
      reason: `Relationship lasted ${yearsOfRelationship.toFixed(1)} years (≥ 20) — duration is indefinite (subject to review).`,
    };
  }

  const ruleOf65Sum = recipientAgeAtSeparation + yearsOfRelationship;
  if (yearsOfRelationship >= 5 && ruleOf65Sum >= 65) {
    return {
      type: "indefinite",
      reason: `Rule of 65: recipient age ${recipientAgeAtSeparation} + ${yearsOfRelationship.toFixed(1)} years of relationship = ${ruleOf65Sum.toFixed(1)} (≥ 65) — duration is indefinite (subject to review).`,
    };
  }

  const low = Math.max(0.5, yearsOfRelationship * 0.5);
  const mid = Math.max(0.5, yearsOfRelationship * 0.75);
  const high = Math.max(0.5, yearsOfRelationship * 1.0);

  return { type: "fixed", range: { low, mid, high } };
}

/**
 * WCF duration rules under the SSAG (Chapter 8 of the Revised User's Guide).
 *
 * Two tests, take the LONGER of the two at each end of the range:
 *
 * Test 1 — Length of Marriage (same as WOCF):
 *   Low  = 0.5 × years
 *   High = 1.0 × years
 *
 * Test 2 — Age of Children (unique to WCF):
 *   Low  = years until youngest child starts full-time school (age 5 in BC)
 *   High = years until youngest child finishes high school (~age 18)
 *
 * Indefinite triggers (from WOCF) still apply:
 *   - 20+ year marriage → indefinite
 *   - Rule of 65 → indefinite
 *
 * For shorter marriages with young children, the age-of-children test
 * typically dominates and produces generous durations. The SSAG User's
 * Guide emphasizes that most initial WCF orders should be "indefinite
 * (duration not specified)" — the fixed ranges are guidance only.
 */
export function calculateWCFDuration(
  yearsOfRelationship: number,
  recipientAgeAtSeparation: number,
  youngestChildAge: number | null,
): SSAGDuration {
  if (yearsOfRelationship >= 20) {
    return {
      type: "indefinite",
      reason: `Relationship lasted ${yearsOfRelationship.toFixed(1)} years (≥ 20) — duration is indefinite (subject to review).`,
    };
  }

  const ruleOf65Sum = recipientAgeAtSeparation + yearsOfRelationship;
  if (yearsOfRelationship >= 5 && ruleOf65Sum >= 65) {
    return {
      type: "indefinite",
      reason: `Rule of 65: recipient age ${recipientAgeAtSeparation} + ${yearsOfRelationship.toFixed(1)} years of relationship = ${ruleOf65Sum.toFixed(1)} (≥ 65) — duration is indefinite (subject to review).`,
    };
  }

  // Test 1: Length of Marriage
  const marriageLow = yearsOfRelationship * 0.5;
  const marriageHigh = yearsOfRelationship * 1.0;

  // Test 2: Age of Children (BC: full-day kindergarten at age 5, HS grad at 18)
  const SCHOOL_START_AGE = 5;
  const HIGH_SCHOOL_GRAD_AGE = 18;
  const ageLow =
    youngestChildAge === null ? 0 : Math.max(0, SCHOOL_START_AGE - youngestChildAge);
  const ageHigh =
    youngestChildAge === null ? 0 : Math.max(0, HIGH_SCHOOL_GRAD_AGE - youngestChildAge);

  // Take the longer of the two tests at each end
  const low = Math.max(0.5, marriageLow, ageLow);
  const high = Math.max(0.5, marriageHigh, ageHigh);
  const mid = (low + high) / 2;

  return { type: "fixed", range: { low, mid, high } };
}
