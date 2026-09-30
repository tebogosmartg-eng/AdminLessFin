/**
 * Default note ordering for presentation metadata (V14.2 / V18).
 * Lower sortOrder appears earlier in the notes section.
 *
 * The sequence is the one a professionally published set reads in: general
 * information first, then the statement of financial position top to bottom
 * (assets, equity, liabilities), then the statement of comprehensive income,
 * then the supporting notes (tax, cash flow), and the narrative notes at the
 * end. Includes the disclosure engine's codes as well as the framework's, so
 * both kinds of note file into one sequence.
 */
export const DEFAULT_NOTE_ORDER: Record<string, number> = {
  'DISC.TRANSITION': 5,
  'DISC.GENERAL': 10,
  'DISC.BASIS': 20,
  'DISC.POLICIES': 30,
  'DISC.JUDGEMENTS': 40,
  'DISC.POLICYCHANGES': 45,
  'DISC.CONSOLIDATION': 50,
  // ── Statement of financial position: assets ──────────────────────────────
  'DISC.PPE': 100,
  'DISC.INTANGIBLES': 110,
  'DISC.INVPROP': 120,
  'DISC.BUSCOMB': 130,
  'DISC.HERITAGE': 135,
  'DISC.BIOLOGICAL': 140,
  'DISC.ASSOCIATES': 150,
  'DISC.JOINTVENTURES': 155,
  'DISC.DEFERREDTAX': 170,
  'DISC.INVENTORIES': 200,
  'DISC.RECEIVABLES': 210,
  'DISC.CASH': 220,
  'DISC.CASHEQUIV': 220,
  // ── Equity and liabilities ────────────────────────────────────────────────
  'DISC.SHARECAPITAL': 300,
  'DISC.EQUITY': 300,
  'DISC.CAPITAL': 310,
  'DISC.BORROWINGS': 320,
  'DISC.LEASES': 330,
  'DISC.PAYABLES': 340,
  'DISC.PROVISIONS': 350,
  'DISC.FININST': 380,
  'DISC.FOREX': 390,
  // ── Statement of comprehensive income ────────────────────────────────────
  'DISC.REVENUE': 400,
  'DISC.REVENUE_NONEXCHANGE': 400,
  'DISC.REVENUE_EXCHANGE': 405,
  'DISC.GRANTS': 410,
  'DISC.OTHERINCOME': 420,
  'DISC.COSTOFSALES': 430,
  'DISC.OPERATINGEXPENSES': 440,
  'DISC.EMPLOYEE': 450,
  'DISC.SBP': 455,
  'DISC.IMPAIRMENT': 460,
  'DISC.BORROWINGCOST': 470,
  'DISC.FINANCECOSTS': 480,
  'DISC.DISCONTINUED': 480,
  'DISC.TAX': 500,
  'DISC.HYPERINFLATION': 530,
  // ── Supporting and narrative notes ────────────────────────────────────────
  'DISC.CASHFLOW': 700,
  'DISC.COMMITMENTS': 800,
  'DISC.CONTINGENT': 810,
  'DISC.RELATED': 820,
  'DISC.BUDGET': 870,
  'DISC.COMPARATIVES': 880,
  'DISC.GOINGCONCERN': 900,
  'DISC.EVENTS': 950,
};

export function noteSortOrder(code: string): number {
  return DEFAULT_NOTE_ORDER[code] ?? 5000;
}
