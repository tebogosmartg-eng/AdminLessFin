/**
 * EFS V6.4.1 — Framework Mapping
 * Maps sealed account facts → taxonomy lines. Presentation only — never invents balances.
 */
// @ts-nocheck

export function buildTypeMap(defaultTypeMaps) {
  const map = new Map();
  for (const row of defaultTypeMaps || []) {
    map.set(row.account_type, row.taxonomy_line_code);
  }
  return map;
}

export function mapAccountToLineCode(account, typeMap, tenantOverrides = []) {
  const override = (tenantOverrides || []).find(
    (m) =>
      (m.source_account_id && m.source_account_id === account.id) ||
      (m.source_account_type && m.source_account_type === account.type),
  );
  if (override) return override.taxonomy_line_code;
  return typeMap.get(account.type) || null;
}

/**
 * Classify sealed facts into taxonomy buckets without changing amounts.
 */
export function classifyFactsToTaxonomy(facts, taxonomyLines, typeMap, tenantOverrides = []) {
  const linesByCode = new Map((taxonomyLines || []).map((l) => [l.line_code, l]));
  const buckets = new Map();

  const ensure = (code) => {
    if (!buckets.has(code)) {
      const def = linesByCode.get(code);
      buckets.set(code, {
        line_code: code,
        label: def?.label || code,
        statement_type: def?.statement_type,
        section: def?.section,
        sort_order: def?.sort_order ?? 999,
        is_total: !!def?.is_total,
        amount_basis: def?.amount_basis || "balance",
        amount: 0,
        accounts: [],
      });
    }
    return buckets.get(code);
  };

  for (const acc of facts.balances_as_of) {
    const code = mapAccountToLineCode(acc, typeMap, tenantOverrides);
    if (!code || !linesByCode.has(code)) continue;
    if (linesByCode.get(code).amount_basis !== "balance") continue;
    const b = ensure(code);
    b.amount += Number(acc.balance || 0);
    b.accounts.push({ id: acc.id, name: acc.name, type: acc.type, amount: Number(acc.balance || 0) });
  }

  for (const acc of facts.period_activity) {
    const code = mapAccountToLineCode(acc, typeMap, tenantOverrides);
    if (!code || !linesByCode.has(code)) continue;
    if (linesByCode.get(code).amount_basis !== "activity") continue;
    const b = ensure(code);
    const amt = Number(acc.period_activity ?? acc.activity ?? 0);
    b.amount += amt;
    b.accounts.push({ id: acc.id, name: acc.name, type: acc.type, amount: amt });
  }

  // Cash flow sections from sealed cash_flow facts (framework-neutral section keys)
  const cfSectionToCode = {
    Operating: "cf.operating",
    Investing: "cf.investing",
    Financing: "cf.financing",
  };
  for (const cf of facts.cash_flow) {
    const code = cfSectionToCode[cf.section];
    if (!code || !linesByCode.has(code)) continue;
    const b = ensure(code);
    b.amount += Number(cf.amount || 0);
    b.accounts.push({ id: null, name: cf.category, type: cf.section, amount: Number(cf.amount || 0) });
  }

  return buckets;
}
