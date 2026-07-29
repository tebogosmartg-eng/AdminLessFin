/**
 * EAM V16.4 deployment forensics — acquisition POST only (read-only probe).
 */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const file of ['.env']) {
    try {
      for (const line of readFileSync(join(process.cwd(), file), 'utf8').split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq < 1) continue;
        const k = t.slice(0, eq).trim();
        let v = t.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        env[k] = v;
      }
    } catch {
      /* */
    }
  }
  return env;
}

const OUT = join(process.cwd(), 'docs', 'eam-v164', 'forensics');
mkdirSync(OUT, { recursive: true });

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const email = env.E2E_EMAIL;
const password = env.E2E_PASSWORD;

const report: Record<string, unknown> = { at: new Date().toISOString() };

async function main() {
  if (!url || !anonKey || !email || !password) {
    report.error = 'Missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL, or E2E_PASSWORD';
    writeFileSync(join(OUT, 'acquisition-post-forensics.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const sb = createClient(url, anonKey);
  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email, password });
  if (authErr || !auth.session) {
    report.auth = { ok: false, error: authErr?.message };
    writeFileSync(join(OUT, 'acquisition-post-forensics.json'), JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.auth = { ok: true, userId: auth.user.id };
  const token = auth.session.access_token;

  const { data: members } = await sb.from('company_users').select('company_id, role').limit(1);
  const companyId = members?.[0]?.company_id;
  report.companyId = companyId;

  const { data: accts, error: acctErr } = await sb.functions.invoke('chart-of-accounts', {
    body: { method: 'GET', company_id: companyId },
  });
  const accounts = (accts as { id: string; type: string; name: string }[]) || [];
  const assetAcct =
    accounts.find((a) => a.type === 'Asset' && /fixed|ppe|equipment/i.test(a.name))?.id ||
    accounts.find((a) => a.type === 'Asset')?.id;
  const paymentAcct =
    accounts.find((a) => a.type === 'Asset' && /bank|cash/i.test(a.name))?.id ||
    accounts.find((a) => a.type === 'Liability')?.id ||
    accounts.filter((a) => a.type === 'Asset').find((a) => a.id !== assetAcct)?.id;
  const expenseAcct = accounts.find((a) => a.type === 'Expense')?.id;

  const { data: cats } = await sb.functions.invoke('asset-categories', {
    body: { method: 'GET', company_id: companyId },
  });
  let categoryId = (cats as { id: string; name: string }[])?.[0]?.id;
  if (!categoryId) {
    const { data: newCat, error: catErr } = await sb.functions.invoke('asset-categories', {
      body: {
        method: 'POST',
        company_id: companyId,
        categoryData: { name: `Forensics Cat ${Date.now()}` },
      },
    });
    categoryId = (newCat as { id: string })?.id;
    report.categoryCreate = { error: catErr?.message, id: categoryId };
  }

  const certTag = `EAM-FORENSICS-${Date.now()}`;
  const assetCode = `AST-2026-F${String(Date.now()).slice(-6)}`;
  const body = {
    method: 'POST',
    company_id: companyId,
    assetData: {
      asset_code: assetCode,
      description: certTag,
      category_id: categoryId,
      purchase_date: '2026-01-20',
      purchase_cost: 25000,
      asset_account_id: assetAcct,
      payment_account_id: paymentAcct,
      depreciation_method: 'straight-line',
      useful_life_years: 5,
      residual_value: 0,
      accumulated_depreciation_account_id: assetAcct,
      depreciation_expense_account_id: expenseAcct,
    },
  };

  report.request = { ...body, assetData: { ...body.assetData, note: 'accounts', assetAcct, paymentAcct } };

  const fetchUrl = `${url.replace(/\/$/, '')}/functions/v1/fixed-assets`;
  const res = await fetch(fetchUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const rawText = await res.text();
  let parsed: unknown = rawText;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    /* keep text */
  }

  report.http = {
    status: res.status,
    statusText: res.statusText,
    headers: Object.fromEntries(res.headers.entries()),
  };
  report.responseBody = parsed;
  report.responseBodyRaw = rawText;

  const invoke = await sb.functions.invoke('fixed-assets', { body });
  report.supabaseJsInvoke = {
    errorMessage: invoke.error?.message ?? null,
    data: invoke.data,
    errorName: invoke.error?.name,
  };

  // Probe deployed methods
  for (const method of ['GET_REGISTER', 'PEEK_NEXT_ASSET_CODE', 'GET_ALL']) {
    const r = await fetch(fetchUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ method, company_id: companyId, page: 1, pageSize: 5, filters: {} }),
    });
    const t = await r.text();
    report[`probe_${method}`] = { status: r.status, body: t.slice(0, 2000) };
  }

  const localHash = createHash('sha256')
    .update(readFileSync(join(process.cwd(), 'supabase/functions/fixed-assets/index.ts'), 'utf8'))
    .digest('hex');
  report.localFixedAssetsSha256 = localHash;
  report.localFixedAssetsBytes = readFileSync(
    join(process.cwd(), 'supabase/functions/fixed-assets/index.ts'),
    'utf8',
  ).length;

  writeFileSync(join(OUT, 'acquisition-post-forensics.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  const err = { message: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined };
  writeFileSync(join(OUT, 'acquisition-post-forensics.json'), JSON.stringify({ fatal: err }, null, 2));
  console.error(err);
  process.exit(1);
});
