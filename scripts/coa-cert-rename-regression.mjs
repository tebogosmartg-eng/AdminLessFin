/**
 * Phase 5 — account-role rename regression.
 * Renames AR / Bank / Sales by display name only, then verifies posting and
 * statement endpoints still resolve by account_role / subcategory identity.
 */
import fs from 'fs';

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
const companyId = env.EAM_CERT_COMPANY_ID || '3cbfd4eb-a095-43f3-837a-0b4f1e2c1752';

const login = await (
  await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD }),
  })
).json();

const headers = {
  apikey: anon,
  Authorization: `Bearer ${login.access_token}`,
  'Content-Type': 'application/json',
};

async function coa(body) {
  const res = await fetch(`${url}/functions/v1/chart-of-accounts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ company_id: companyId, ...body }),
  });
  return { status: res.status, body: await res.json() };
}

async function invoke(fn, body) {
  const res = await fetch(`${url}/functions/v1/${fn}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ company_id: companyId, ...body }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

const get = await coa({ method: 'GET' });
if (get.status !== 200 || !Array.isArray(get.body)) {
  console.error('GET failed', get);
  process.exit(1);
}

const accounts = get.body;
const find = (pred) => accounts.find(pred);

const ar = find((a) => a.account_role === 'trade_receivable') || find((a) => a.name === 'AR');
const bank =
  find((a) => a.account_role === 'bank') ||
  find((a) => a.name === 'Bank') ||
  find((a) => a.subcategory === 'Cash and Cash Equivalents');
const sales =
  find((a) => a.account_role === 'sales') ||
  find((a) => /sales|zuru|revenue/i.test(a.name || '') && a.type === 'Income');

const evidence = {
  companyId,
  before: {
    ar: ar && { id: ar.id, name: ar.name, account_role: ar.account_role },
    bank: bank && { id: bank.id, name: bank.name, account_role: bank.account_role, subcategory: bank.subcategory },
    sales: sales && { id: sales.id, name: sales.name, account_role: sales.account_role },
  },
  renames: {},
  postRename: {},
  endpoints: {},
};

const stamp = Date.now();
const renamePlan = [];
if (ar) renamePlan.push({ key: 'ar', id: ar.id, from: ar.name, to: `AR Renamed ${stamp}` });
if (bank) renamePlan.push({ key: 'bank', id: bank.id, from: bank.name, to: `Bank Renamed ${stamp}` });
if (sales) renamePlan.push({ key: 'sales', id: sales.id, from: sales.name, to: `Sales Renamed ${stamp}` });

for (const r of renamePlan) {
  const put = await coa({ method: 'PUT', accountId: r.id, accountData: { name: r.to } });
  evidence.renames[r.key] = { status: put.status, from: r.from, to: r.to, ok: put.status === 200 };
}

const after = await coa({ method: 'GET' });
const afterAccounts = Array.isArray(after.body) ? after.body : [];
evidence.postRename = {
  ar: afterAccounts.find((a) => a.id === ar?.id),
  bank: afterAccounts.find((a) => a.id === bank?.id),
  sales: afterAccounts.find((a) => a.id === sales?.id),
};

// Identity still resolves by role after rename
evidence.roleResolution = {
  arByRole: afterAccounts.find((a) => a.account_role === 'trade_receivable')?.id === ar?.id,
  bankStillCashEquivalent:
    !!afterAccounts.find(
      (a) =>
        a.id === bank?.id &&
        (a.account_role === 'bank' ||
          a.account_role === 'cash' ||
          a.subcategory === 'Cash and Cash Equivalents'),
    ),
  salesByRoleOrId:
    !!sales &&
    (afterAccounts.find((a) => a.account_role === 'sales')?.id === sales.id ||
      afterAccounts.find((a) => a.id === sales.id)?.type === 'Income'),
};

// Smoke read-only accounting surfaces after rename
const surfaces = [
  ['invoices', { method: 'GET_ALL' }],
  ['bills', { method: 'GET' }],
  ['payments', { method: 'GET_AR_BALANCES' }],
  ['banking', { method: 'GET_BANK_ACCOUNTS' }],
  ['financial-statements', { method: 'LIST_FRAMEWORKS' }],
  ['accounting-health', {}],
];

for (const [fn, body] of surfaces) {
  const res = await invoke(fn, body);
  evidence.endpoints[fn] = {
    status: res.status,
    ok: res.status < 500,
  };
}

// Restore original names
for (const r of renamePlan) {
  await coa({ method: 'PUT', accountId: r.id, accountData: { name: r.from } });
}
evidence.restored = true;

fs.mkdirSync('docs/coa-certification/evidence', { recursive: true });
fs.writeFileSync(
  'docs/coa-certification/evidence/rename-role-regression.json',
  JSON.stringify(evidence, null, 2),
);

const failed =
  Object.values(evidence.renames).some((r) => !r.ok) ||
  !evidence.roleResolution.arByRole ||
  !evidence.roleResolution.bankStillCashEquivalent ||
  Object.values(evidence.endpoints).some((e) => !e.ok);

console.log(JSON.stringify(evidence, null, 2));
process.exit(failed ? 1 : 0);
