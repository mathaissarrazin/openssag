import type { ChildEntry, CustodialArrangement } from "@/types/spousal-support";

/** Compute a child's current age (as whole years) given a birthdate. */
export function computeAge(birthdateISO: string, asOf: Date): number {
  const bd = new Date(birthdateISO);
  if (isNaN(bd.getTime())) return 0;
  let age = asOf.getFullYear() - bd.getFullYear();
  const monthDiff = asOf.getMonth() - bd.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < bd.getDate())) {
    age--;
  }
  return Math.max(0, age);
}

/**
 * Filter to children who are still dependent for support / CCB purposes.
 * Scope: children under 18. Over-18 children may still be dependent (in
 * full-time school or disabled) but are outside the scope of this filter
 * and would require manual handling.
 */
export function filterDependent(children: ChildEntry[], asOf: Date): ChildEntry[] {
  return children.filter((c) => {
    const age = computeAge(c.birthdate, asOf);
    return age >= 0 && age < 18;
  });
}

/**
 * CCB benefit year start (July 1) containing `asOf`. Benefit years run
 * July 1 – June 30. E.g., asOf 2026-04-20 → 2025-07-01.
 */
function ccbBenefitYearStart(asOf: Date): Date {
  const y = asOf.getFullYear();
  const m = asOf.getMonth(); // 0-indexed; 6 = July
  const startYear = m >= 6 ? y : y - 1;
  return new Date(startYear, 6, 1);
}

/**
 * Count children in each CCB age band. Returns fractional counts that
 * reflect mid-benefit-year age-6 transitions. Per ITA s.122.61(1), CCB
 * is computed monthly with the dependant's age tested "at the beginning
 * of the month"; a child whose 6th birthday falls inside the benefit
 * year containing `asOf` contributes to both brackets weighted by the
 * number of months in each (e.g., a child turning 6 on 2026-01-01 during
 * benefit year 2025-07 → 2026-06 contributes 0.5 under-6 + 0.5 aged 6–17).
 */
export function bucketByAge(children: ChildEntry[], asOf: Date) {
  const byStart = ccbBenefitYearStart(asOf);
  let childrenUnder6 = 0;
  let children6to17 = 0;
  for (const c of children) {
    const bd = new Date(c.birthdate);
    if (isNaN(bd.getTime())) continue;
    const ageNow = computeAge(c.birthdate, asOf);
    if (ageNow < 0 || ageNow > 17) continue;
    const sixthBirthday = new Date(bd.getFullYear() + 6, bd.getMonth(), bd.getDate());
    let u6Months = 0;
    for (let i = 0; i < 12; i++) {
      const monthStart = new Date(byStart.getFullYear(), byStart.getMonth() + i, 1);
      if (monthStart < sixthBirthday) u6Months++;
    }
    childrenUnder6 += u6Months / 12;
    children6to17 += (12 - u6Months) / 12;
  }
  return { childrenUnder6, children6to17 };
}

/**
 * Derive the SSAG custodial arrangement from per-child residence entries.
 * Returns { arrangement } on success, or { error } if the inputs mix
 * incompatible residence types.
 */
export function deriveCustodialArrangement(
  children: ChildEntry[],
): { arrangement?: CustodialArrangement; error?: string } {
  if (children.length === 0) return { error: "At least one child is required." };

  const hasShared = children.some((c) => c.residence === "shared");
  const hasSpouse1 = children.some((c) => c.residence === "spouse1");
  const hasSpouse2 = children.some((c) => c.residence === "spouse2");

  if (hasShared && (hasSpouse1 || hasSpouse2)) {
    return {
      error:
        "You've marked some children as shared and others as primarily with one parent. Select a single approach for all children (all shared, or each child living primarily with one parent).",
    };
  }

  if (hasShared) return { arrangement: "shared" };
  if (hasSpouse1 && hasSpouse2) return { arrangement: "split" };
  if (hasSpouse1) return { arrangement: "spouse1-primary" };
  return { arrangement: "spouse2-primary" };
}

/** For split-custody arrangements, bucket children by parent + age. */
export function splitBucketsByParent(children: ChildEntry[], asOf: Date) {
  const spouse1Kids = children.filter((c) => c.residence === "spouse1");
  const spouse2Kids = children.filter((c) => c.residence === "spouse2");
  return {
    spouse1: bucketByAge(spouse1Kids, asOf),
    spouse2: bucketByAge(spouse2Kids, asOf),
  };
}

/** Age of the youngest dependent child, or null if none. */
export function getYoungestAge(children: ChildEntry[], asOf: Date): number | null {
  if (children.length === 0) return null;
  let minAge = Infinity;
  for (const c of children) {
    const age = computeAge(c.birthdate, asOf);
    if (age < minAge) minAge = age;
  }
  return minAge === Infinity ? null : minAge;
}
