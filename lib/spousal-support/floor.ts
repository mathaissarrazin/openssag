/**
 * SSAG floor rules — 2026.
 *
 * The SSAG uses a $20,000 gross annual payor income as a floor below which
 * spousal support is "not generally payable" (exceptions exist). Between
 * $20,000 and $30,000, ability-to-pay and work-incentive concerns may
 * warrant going below the formula ranges.
 *
 * The floor does NOT act as a hard cap — the formula still computes the
 * range; the calculator layer surfaces a warning when the payor is at or
 * below the floor so the user/court can apply discretion.
 *
 * Source: SSAG 2008 Chapter 11 (Ceilings and Floors); SSAG Revised User's
 * Guide (2016) commentary on low-income payor cases.
 */

export const SELF_SUPPORT_RESERVE_BC_2026 = 20_000;
