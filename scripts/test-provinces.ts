import { calculateNetIncome } from "../lib/tax/net-income";

function runScenario(label: string, input: Parameters<typeof calculateNetIncome>[0]) {
  const provinces = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "SK", "YT"] as const;
  console.log(`\n${"═".repeat(50)}`);
  console.log(`SCENARIO: ${label}`);
  console.log("═".repeat(50));
  for (const province of provinces) {
    const r = calculateNetIncome({ ...input, province });
    console.log(`\n=== ${province} ===`);
    console.log(`Taxable income:   $${Math.round(r.taxableIncome).toLocaleString("en-CA")}`);
    console.log(`Federal tax:      $${Math.round(r.federalTax).toLocaleString("en-CA")}`);
    console.log(`Provincial tax:   $${Math.round(r.provincialTax).toLocaleString("en-CA")}`);
    console.log(`CPP:              $${Math.round(r.cpp).toLocaleString("en-CA")}`);
    console.log(`EI:               $${Math.round(r.ei).toLocaleString("en-CA")}`);
    console.log(`CCB:              $${Math.round(r.ccb).toLocaleString("en-CA")}`);
    console.log(`GST credit:       $${Math.round(r.gstCredit).toLocaleString("en-CA")}`);
    console.log(`Net income:       $${Math.round(r.netIncome).toLocaleString("en-CA")}`);
  }
}

runScenario("High income — multiple income types, 1 child under 6", {
  grossIncome: 95_000,
  selfEmploymentIncome: 20_000,
  pensionIncome: 12_000,
  eligibleDividends: 5_000,
  nonEligibleDividends: 3_000,
  otherIncome: 2_000,
  rrspWithdrawals: 8_000,
  capitalGainsActual: 10_000,
  childrenUnder6InCare: 1,
  children6to17InCare: 0,
  claimEligibleDependant: true,
  isCoupled: false,
});

runScenario("Low income — employment only, single, no kids", {
  grossIncome: 30_000,
  isCoupled: false,
  childrenUnder6InCare: 0,
  children6to17InCare: 0,
  claimEligibleDependant: false,
});

runScenario("CCB — mid income, 2 children (1 under 6, 1 aged 6-17), single parent", {
  grossIncome: 55_000,
  isCoupled: false,
  childrenUnder6InCare: 1,
  children6to17InCare: 1,
  claimEligibleDependant: true,
});

runScenario("Coupled — mid income, no kids", {
  grossIncome: 75_000,
  isCoupled: true,
  childrenUnder6InCare: 0,
  children6to17InCare: 0,
  claimEligibleDependant: false,
});
