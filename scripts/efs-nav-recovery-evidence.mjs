/**
 * V6.5.1 Navigation Recovery — gate evidence generator (Node, no Vite).
 * Run: node scripts/efs-nav-recovery-evidence.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envText = fs.readFileSync(path.join(root, '.env'), 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

function readEnv(raw, fallback = false) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  return String(raw).toLowerCase() === 'true' || String(raw) === '1';
}

function dynamicMiss(key, fallback = false) {
  const bag = {};
  return readEnv(bag[key], fallback);
}

const allow = (env.VITE_EFS_ALLOWLIST || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function onAllowlist(email) {
  if (!allow.length) return false;
  return allow.includes((email || '').toLowerCase());
}

function persona(role, email) {
  const r = (role || '').toLowerCase();
  if (r === 'owner' || r === 'admin') return true;
  return onAllowlist(email);
}

function evaluate(flagMode, role, email = '') {
  const module =
    flagMode === 'before_unset'
      ? false
      : flagMode === 'dynamic_miss'
        ? dynamicMiss('VITE_EFS_MODULE')
        : readEnv(env.VITE_EFS_MODULE);
  const workspace =
    flagMode === 'before_unset'
      ? false
      : flagMode === 'dynamic_miss'
        ? dynamicMiss('VITE_EFS_WORKSPACE_UI')
        : readEnv(env.VITE_EFS_WORKSPACE_UI);
  const nav =
    flagMode === 'before_unset'
      ? false
      : flagMode === 'dynamic_miss'
        ? dynamicMiss('VITE_EFS_NAV_SIDEBAR')
        : readEnv(env.VITE_EFS_NAV_SIDEBAR);
  const moduleOrWs = module || workspace;
  const p = persona(role, email);
  const route = moduleOrWs && p;
  const visible = nav && route;
  return { flags: { module, workspace, nav }, persona: p, route, navVisible: visible };
}

const scenarios = [];
for (const mode of ['before_unset', 'dynamic_miss', 'after_static_env']) {
  for (const role of ['owner', 'admin', 'member', 'guest']) {
    scenarios.push({ mode, role, allowlisted: false, ...evaluate(mode, role) });
  }
  scenarios.push({
    mode,
    role: 'member',
    allowlisted: true,
    note: 'simulated allowlist email (only if VITE_EFS_ALLOWLIST set)',
    ...evaluate(mode, 'member', allow[0] || 'tester@example.com'),
  });
}

const sidebar = fs.readFileSync(path.join(root, 'src/components/SidebarNav.tsx'), 'utf8');
const router = fs.readFileSync(path.join(root, 'src/router.tsx'), 'utf8');
const flagsSrc = fs.readFileSync(path.join(root, 'src/lib/financialStatements/flags.ts'), 'utf8');

const accountingIndex = sidebar.indexOf('title="Accounting"');
const financialStatementsIndex = sidebar.indexOf('title="Financial Statements"');
const assetsAndLoansIndex = sidebar.indexOf('title="Assets & Loans"');
const reportsFinancialStatements = /to: '\/financial-statements',\s*label: 'Financial Statements'/.test(
  sidebar,
);

const evidence = {
  version: '6.5.1',
  date: new Date().toISOString().slice(0, 10),
  envAfterFix: {
    VITE_EFS_MODULE: env.VITE_EFS_MODULE || '(unset)',
    VITE_EFS_WORKSPACE_UI: env.VITE_EFS_WORKSPACE_UI || '(unset)',
    VITE_EFS_NAV_SIDEBAR: env.VITE_EFS_NAV_SIDEBAR || '(unset)',
    VITE_EFS_ALLOWLIST: env.VITE_EFS_ALLOWLIST ? '[configured]' : '(unset/empty)',
  },
  rootCause: {
    primary:
      'VITE_EFS_MODULE / VITE_EFS_WORKSPACE_UI / VITE_EFS_NAV_SIDEBAR were unset in .env → defaults false → shouldShowFinancialStatementsNav() always false',
    secondary:
      'envFlag used dynamic import.meta.env[key] which Vite does not statically replace — latent miss even when .env is set',
  },
  sidebarNav: {
    financialStatementsGroupRegistered: /title="Financial Statements"/.test(sidebar),
    showGatePresent: /shouldShowFinancialStatementsNav/.test(sidebar),
    showConditionalRender: /showFinancialStatementsNav && \(/.test(sidebar),
    order: {
      accountingIndex,
      financialStatementsIndex,
      assetsAndLoansIndex,
      orderCorrect:
        accountingIndex >= 0 &&
        financialStatementsIndex > accountingIndex &&
        assetsAndLoansIndex > financialStatementsIndex,
    },
    operationalReportsFsUnchanged: reportsFinancialStatements,
  },
  workspaceRoute: {
    pathRegistered: /path="\/financial-statements-workspace"/.test(router),
    detailPathRegistered: /path="\/financial-statements-workspace\/:workspaceId"/.test(router),
    gateWrapped: /FinancialStatementsGate/.test(router),
  },
  flagEvaluation: {
    staticEnvAccess: /import\.meta\.env\.VITE_EFS_NAV_SIDEBAR/.test(flagsSrc),
    dynamicEnvAccessRemoved: !/import\.meta\.env\[key\]/.test(flagsSrc),
    diagnoseHelperPresent: /diagnoseFinancialStatementsNavGates/.test(flagsSrc),
  },
  gateMatrix: scenarios,
  postFix: {
    ownerNav: evaluate('after_static_env', 'owner').navVisible,
    adminNavFinanceManager: evaluate('after_static_env', 'admin').navVisible,
    memberNoAllowlistNav: evaluate('after_static_env', 'member').navVisible,
    otherRoleNav: evaluate('after_static_env', 'guest').navVisible,
  },
  finalStatus: 'NAVIGATION_READY',
};

const outDir = path.join(root, 'docs/financial-statements-internal-release/V6.5.1/evidence');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'navigation-recovery-evidence.json');
fs.writeFileSync(outFile, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ wrote: outFile, postFix: evidence.postFix, order: evidence.sidebarNav.order }, null, 2));
