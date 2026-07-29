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
const email = env.E2E_EMAIL;
const password = env.E2E_PASSWORD;
const spaceman = env.EAM_CERT_COMPANY_ID || '3cbfd4eb-a095-43f3-837a-0b4f1e2c1752';

const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const loginBody = await login.json();
if (!login.ok) {
  console.error(JSON.stringify({ ok: false, stage: 'login', status: login.status, body: loginBody }, null, 2));
  process.exit(1);
}

const token = loginBody.access_token;
const headers = {
  apikey: anon,
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

const memberships = await fetch(
  `${url}/rest/v1/company_users?select=company_id,role,companies(id,name)&user_id=eq.${loginBody.user.id}`,
  { headers },
);
const mem = await memberships.json();

async function coa(company_id, body) {
  const res = await fetch(`${url}/functions/v1/chart-of-accounts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ company_id, ...body }),
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

function errMsg(body) {
  if (!body || typeof body !== 'object') return body;
  return body.businessMessage || body.message || body.technicalMessage || body.error || body;
}

const evidence = {
  login: true,
  userId: loginBody.user.id,
  memberships: mem,
  endpoints: {},
  systemAccountApi: {},
  roleAssign: {},
};

const get = await coa(spaceman, { method: 'GET' });
evidence.endpoints.GET = {
  status: get.status,
  count: Array.isArray(get.body) ? get.body.length : null,
  hasRoleMeta:
    Array.isArray(get.body) &&
    get.body.some((a) => 'account_role' in a && 'system_account' in a),
};

const templates = await coa(spaceman, { method: 'LIST_TEMPLATES' });
evidence.endpoints.LIST_TEMPLATES = {
  status: templates.status,
  count: Array.isArray(templates.body) ? templates.body.length : null,
};

const stamp = Date.now();
const post = await coa(spaceman, {
  method: 'POST',
  accountData: {
    name: `COA CERT TMP ${stamp}`,
    type: 'Expense',
    account_number: 999000 + (stamp % 1000),
    normal_balance: 'debit',
  },
});
evidence.endpoints.POST = { status: post.status, id: post.body?.id, name: post.body?.name };
const tmpId = post.body?.id;

if (tmpId) {
  const put = await coa(spaceman, {
    method: 'PUT',
    accountId: tmpId,
    accountData: { name: `COA CERT TMP ${stamp} RENAMED`, description: 'cert' },
  });
  evidence.endpoints.PUT = { status: put.status, name: put.body?.name };

  const rolePut = await coa(spaceman, {
    method: 'PUT',
    accountId: tmpId,
    accountData: { account_role: 'rounding' },
  });
  evidence.roleAssign.rounding = {
    status: rolePut.status,
    account_role: rolePut.body?.account_role,
    error: rolePut.status >= 400 ? errMsg(rolePut.body) : undefined,
  };

  const bankPut = await coa(spaceman, {
    method: 'PUT',
    accountId: tmpId,
    accountData: { account_role: 'bank' },
  });
  evidence.roleAssign.bank = {
    status: bankPut.status,
    account_role: bankPut.body?.account_role,
    error: bankPut.status >= 400 ? errMsg(bankPut.body) : undefined,
  };

  const salesPut = await coa(spaceman, {
    method: 'PUT',
    accountId: tmpId,
    accountData: { account_role: 'sales' },
  });
  evidence.roleAssign.sales = {
    status: salesPut.status,
    account_role: salesPut.body?.account_role,
    error: salesPut.status >= 400 ? errMsg(salesPut.body) : undefined,
  };

  const del = await coa(spaceman, { method: 'DELETE', accountId: tmpId });
  evidence.endpoints.DELETE = { status: del.status, ok: del.status < 400 };
}

const sysRes = await fetch(
  `${url}/rest/v1/chart_of_accounts?select=id,name,company_id,type,account_role,system_account,control_account,account_code,is_active&system_account=eq.true&limit=5`,
  { headers },
);
const sysAccounts = await sysRes.json();
evidence.systemAccountsVisible = Array.isArray(sysAccounts) ? sysAccounts : [];

const sys = Array.isArray(sysAccounts) && sysAccounts[0];
if (sys) {
  const delSys = await coa(sys.company_id, { method: 'DELETE', accountId: sys.id });
  evidence.systemAccountApi.deleteBlocked = {
    status: delSys.status,
    body: errMsg(delSys.body),
  };

  const typeChange = await coa(sys.company_id, {
    method: 'PUT',
    accountId: sys.id,
    accountData: { type: 'Liability' },
  });
  evidence.systemAccountApi.typeBlocked = {
    status: typeChange.status,
    body: errMsg(typeChange.body),
  };

  const roleChange = await coa(sys.company_id, {
    method: 'PUT',
    accountId: sys.id,
    accountData: { account_role: 'suspense' },
  });
  evidence.systemAccountApi.roleBlocked = {
    status: roleChange.status,
    body: errMsg(roleChange.body),
  };

  const controlChange = await coa(sys.company_id, {
    method: 'PUT',
    accountId: sys.id,
    accountData: { control_account: true },
  });
  evidence.systemAccountApi.controlBlocked = {
    status: controlChange.status,
    body: errMsg(controlChange.body),
  };

  const rename = await coa(sys.company_id, {
    method: 'PUT',
    accountId: sys.id,
    accountData: { name: `${sys.name} [API-CERT]` },
  });
  evidence.systemAccountApi.renameAllowed = { status: rename.status, name: rename.body?.name };
  if (rename.status < 400) {
    await coa(sys.company_id, { method: 'PUT', accountId: sys.id, accountData: { name: sys.name } });
  }

  const deactivate = await coa(sys.company_id, {
    method: 'PUT',
    accountId: sys.id,
    accountData: { is_active: false },
  });
  evidence.systemAccountApi.deactivateAllowed = {
    status: deactivate.status,
    is_active: deactivate.body?.is_active,
  };
  if (deactivate.status < 400) {
    await coa(sys.company_id, {
      method: 'PUT',
      accountId: sys.id,
      accountData: { is_active: true },
    });
  }
} else {
  evidence.systemAccountApi.note =
    'No system_account visible to E2E user via RLS; DB trigger certified separately.';
}

const gen = await coa(spaceman, { method: 'GENERATE', templateKey: 'standard-ifrs-sme-za' });
evidence.endpoints.GENERATE = {
  status: gen.status,
  body: errMsg(gen.body),
};

fs.mkdirSync('docs/coa-certification/evidence', { recursive: true });
fs.writeFileSync(
  'docs/coa-certification/evidence/api-endpoint-smoke.json',
  JSON.stringify(evidence, null, 2),
);
console.log(JSON.stringify(evidence, null, 2));
