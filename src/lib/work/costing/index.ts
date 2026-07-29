/** Operational costing — facts only; never posts journals or payroll. */

export function forecastCostAtCompletion(params: {
  burn: number;
  remainingHours: number;
  blendedRate: number;
}): number {
  return round2(params.burn + Math.max(0, params.remainingHours) * Math.max(0, params.blendedRate));
}

export function forecastMargin(params: {
  contractValue: number;
  forecastCost: number;
}): { profit: number; marginPct: number } {
  const profit = round2(params.contractValue - params.forecastCost);
  const marginPct = params.contractValue > 0 ? round2((profit / params.contractValue) * 100) : 0;
  return { profit, marginPct };
}

export function budgetBurnPct(budget: number, burn: number): number {
  if (budget <= 0) return burn > 0 ? 100 : 0;
  return round2((burn / budget) * 100);
}

export function isBudgetAtRisk(budget: number, forecastCost: number, thresholdPct = 100): boolean {
  if (budget <= 0) return false;
  return forecastCost > budget * (thresholdPct / 100);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
