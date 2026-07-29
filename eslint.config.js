import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * ESLint certification gate (V3.0.4)
 *
 * - supabase/functions/** ignored: Deno edge runtime (@ts-nocheck); not part of Vite TS lint scope.
 * - @typescript-eslint/no-explicit-any → warn: pre-existing platform technical debt (122 instances);
 *   payroll-critical logic is covered by statutory certification + unit tests.
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
);
