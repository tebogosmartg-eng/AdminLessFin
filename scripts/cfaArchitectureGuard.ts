/**
 * CFA Architecture Guard — static regression gate for AdminLess Fin.
 *
 * Detects duplicate / parallel monetary aggregation outside the Canonical
 * Financial Aggregation (CFA) engine. Does not modify accounting math.
 *
 * Run: npm run guard:cfa
 * Exit 1 on any violation.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

type Violation = { file: string; rule: string; detail: string };

/** Paths that may implement or wrap CFA (sole money authorities). */
const CFA_AUTHORITY_GLOBS = [
  'src/lib/accounting/canonicalFinancialAggregation.ts',
  'supabase/functions/_shared/canonicalFinancialAggregation.ts',
  'src/lib/accounting/dashboardReconciliation.ts',
  'supabase/functions/_shared/accountingEngineTotals.ts',
  'supabase/functions/_shared/loadCanonicalAggregation.ts',
  'supabase/functions/_shared/efsStatementEngine/statementEngine.ts',
  'supabase/functions/_shared/efsStatementEngine/financialFactsAdapter.ts',
];

/** Paths excluded from content scanning (generated, domain ops, tests of guard itself). */
const IGNORE_PREFIXES = [
  'node_modules/',
  'dist/',
  'coverage/',
  'tmp/',
  '.git/',
  'src/integrations/supabase/database.types.ts',
  'src/lib/statutoryPayrollEngine/',
  'src/lib/payrollRulesEngine/',
  'src/lib/payrollDocuments.ts',
  'src/lib/payrollJournal.ts',
  'src/lib/payrollReports.ts',
  'src/lib/payrollMatrixEngine.ts',
  'src/lib/payrollIntelligence.ts', // cash via optional CFA arg; payroll domain estimates
  'src/governance/',
  'supabase/functions/_shared/statutoryPayrollEngine/',
  'supabase/functions/_shared/payrollRulesEngine/',
  'supabase/functions/payroll/',
  'supabase/functions/journal-entries/', // posting gateway — frozen, not CFA consumer surface
];

const IGNORE_SUFFIXES = ['.test.ts', '.test.tsx', '.spec.ts', '.md', '.json', '.yml', '.yaml'];

/** Consumer surfaces that must never reintroduce parallel money math. */
const RESTRICTED_PREFIXES = [
  'src/pages/',
  'src/components/',
  'src/lib/revenueIntelligence.ts',
  'supabase/functions/reports/',
  'supabase/functions/dashboard-data/',
  'supabase/functions/projects/',
  'supabase/functions/accounting/',
];

/**
 * Forbidden content patterns inside restricted zones.
 * Each rule targets a known regression class from V3.8.1 / V3.8.2.
 */
const CONTENT_RULES: { id: string; re: RegExp; message: string }[] = [
  {
    id: 'no-ar-balance-reduce',
    re: /\barBalances\s*\.\s*reduce\b/,
    message: 'Do not reduce arBalances for monetary totals — use CFA receivables.',
  },
  {
    id: 'no-ap-balance-reduce',
    re: /\bapBalances\s*\.\s*reduce\b/,
    message: 'Do not reduce apBalances for monetary totals — use CFA payables.',
  },
  {
    id: 'no-overdue-invoice-money-reduce',
    re: /\boverdueInvoices\s*\.\s*reduce\s*\([^)]*\.total/,
    message: 'Do not sum overdue invoice totals for financial KPIs — use CFA.',
  },
  {
    id: 'no-tax-schedule-reduce',
    re: /\.(taxCollected|taxPaid)\b[\s\S]{0,80}\.reduce\b|\.reduce\b[\s\S]{0,80}\.(taxCollected|taxPaid)\b/,
    message: 'Do not reduce taxCollected/taxPaid — use CFA vatPayable/vatReceivable/vatNet.',
  },
  {
    id: 'no-parallel-vat-loop',
    re: /account_role\s*===\s*['"]output_vat['"][\s\S]{0,200}(?:\+=|reduce)/,
    message: 'Do not implement parallel VAT balance loops — use CFA or sumVatGlBalances wrapper.',
  },
  {
    id: 'no-project-je-pl',
    re: /journal_entry_items[\s\S]{0,400}accountType\s*===\s*['"]Income['"][\s\S]{0,200}totalRevenue/,
    message: 'Do not aggregate project P&L from journal_entry_items — use company CFA.',
  },
  {
    id: 'no-get-monthly-summary-money',
    re: /\.rpc\(\s*['"]get_monthly_summary['"]/,
    message:
      'get_monthly_summary is a parallel KPI engine — derive charts from CFA partitions instead.',
  },
  {
    id: 'no-get-top-expenses-money',
    re: /\.rpc\(\s*['"]get_top_expenses['"]/,
    message: 'get_top_expenses is a parallel KPI engine — use CFA expense partitions.',
  },
  {
    id: 'no-new-aggregation-service-import',
    re: /from\s+['"][^'"]*(?:statementAggregation|financialAggregator|parallelPl|vatEngine|tbReconstruction)[^'"]*['"]/,
    message: 'Forbidden accounting aggregation service import — consume CFA only.',
  },
];

/** Filename patterns that must not appear outside CFA authority paths. */
const FORBIDDEN_FILENAME_RES = [
  /(?:^|\/)(?!canonicalFinancialAggregation)(?:financialAggregation|statementAggregation|plAggregation|vatAggregation|balanceSheetAggregation)\.ts$/i,
  /(?:^|\/)(?:rebuildTrialBalance|reconstructTrialBalance|trialBalanceEngine)\.ts$/i,
];

function toPosix(p: string) {
  return p.split(path.sep).join('/');
}

function isIgnored(rel: string) {
  const r = toPosix(rel);
  if (IGNORE_PREFIXES.some((p) => r === p || r.startsWith(p))) return true;
  if (IGNORE_SUFFIXES.some((s) => r.endsWith(s))) return true;
  return false;
}

function isCfaAuthority(rel: string) {
  const r = toPosix(rel);
  return CFA_AUTHORITY_GLOBS.some((g) => r === g || r.endsWith(g));
}

function isRestricted(rel: string) {
  const r = toPosix(rel);
  return RESTRICTED_PREFIXES.some((p) => r === p || r.startsWith(p));
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = toPosix(path.relative(ROOT, full));
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'coverage', '.git', 'tmp'].includes(entry.name)) continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

function scan(): Violation[] {
  const violations: Violation[] = [];
  const files = [
    ...walk(path.join(ROOT, 'src')),
    ...walk(path.join(ROOT, 'supabase', 'functions')),
    ...walk(path.join(ROOT, 'scripts')),
  ];

  for (const rel of files) {
    if (isIgnored(rel)) continue;

    for (const fre of FORBIDDEN_FILENAME_RES) {
      if (fre.test(rel) && !isCfaAuthority(rel)) {
        violations.push({
          file: rel,
          rule: 'forbidden-aggregator-filename',
          detail: `Filename suggests a parallel accounting aggregator (${fre}). Use CFA.`,
        });
      }
    }

    if (!isRestricted(rel) || isCfaAuthority(rel)) continue;

    // dashboard-data may still *fetch* monthly/top RPCs but must not use them for money.
    // Flag only if assigned into money fields without overwrite — simpler: allow fetch in
    // dashboard-data if file also contains buildStatementTotals / CFA markers.
    let text: string;
    try {
      text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    } catch {
      continue;
    }

    for (const rule of CONTENT_RULES) {
      if (
        (rule.id === 'no-get-monthly-summary-money' || rule.id === 'no-get-top-expenses-money') &&
        rel.includes('dashboard-data/')
      ) {
        // Dead fetches still present historically — only fail if CFA totals are absent.
        if (
          text.includes('buildStatementTotals') ||
          text.includes('canonicalAggregation') ||
          text.includes('buildCanonicalFinancialAggregation')
        ) {
          continue;
        }
      }
      if (rule.re.test(text)) {
        violations.push({ file: rel, rule: rule.id, detail: rule.message });
      }
    }
  }

  return violations;
}

function main() {
  const violations = scan();
  if (violations.length === 0) {
    console.log('CFA Architecture Guard: PASS (0 violations)');
    console.log('Canonical Financial Aggregation remains sole monetary authority.');
    process.exit(0);
  }
  console.error('CFA Architecture Guard: FAIL');
  console.error(`Found ${violations.length} violation(s):\n`);
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    ${v.detail}\n`);
  }
  console.error('See docs/architecture/CFA_ARCHITECTURE_GOVERNANCE.md');
  process.exit(1);
}

main();
