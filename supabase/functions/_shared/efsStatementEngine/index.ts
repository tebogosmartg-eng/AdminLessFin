/**
 * EFS V6.4.1 — Statement Engine package exports
 */
// @ts-nocheck
export { adaptFinancialFacts } from "./financialFactsAdapter.ts";
export { buildTypeMap, classifyFactsToTaxonomy, mapAccountToLineCode } from "./frameworkMapping.ts";
export { runStatementEngine } from "./statementEngine.ts";
