import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * ESLint certification gate (V3.0.4) + CFA Architecture Governance (V3.8.3 / ADR-0003)
 *
 * - supabase/functions/** ignored: Deno edge runtime (@ts-nocheck); not part of Vite TS lint scope.
 *   Edge CFA regressions are covered by `npm run guard:cfa` + architectural tests.
 * - @typescript-eslint/no-explicit-any → warn: pre-existing platform technical debt;
 *   payroll-critical logic is covered by statutory certification + unit tests.
 * - CFA restricted syntax: blocks known parallel money-aggregation regressions in UI/lib.
 */
export default tseslint.config(
  { ignores: ["dist", "supabase/functions/**", "coverage/**", "tmp/**", "src/integrations/supabase/database.types.ts", "tailwind.config.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  /**
   * CFA consumer surfaces — forbid classic parallel aggregation selectors.
   * Authority / wrapper modules are excluded (they may implement CFA itself).
   */
  {
    files: [
      "src/pages/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
      "src/lib/revenueIntelligence.ts",
    ],
    ignores: [
      "src/lib/accounting/canonicalFinancialAggregation.ts",
      "src/lib/accounting/dashboardReconciliation.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='reduce'][callee.object.name='arBalances']",
          message:
            "CFA governance: do not reduce arBalances for money — use canonicalAggregation.receivables (ADR-0003).",
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='reduce'][callee.object.name='apBalances']",
          message:
            "CFA governance: do not reduce apBalances for money — use canonicalAggregation.payables (ADR-0003).",
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='reduce'][callee.object.name='overdueInvoices']",
          message:
            "CFA governance: do not reduce overdueInvoices for financial KPIs — use CFA fields (ADR-0003).",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/statementAggregation*",
                "**/financialAggregator*",
                "**/vatEngine*",
                "**/trialBalanceEngine*",
                "**/rebuildTrialBalance*",
              ],
              message:
                "CFA governance: parallel accounting aggregation modules are forbidden — consume CFA (ADR-0003).",
            },
          ],
        },
      ],
    },
  },
);
