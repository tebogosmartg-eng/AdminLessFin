/**
 * V6.5.2 live validation against deployed financial-statements edge function.
 * Run: node scripts/efs-edge-live-validation.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envText = fs.readFileSync(path.join(root, '.env'), 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}

const base = `${env.VITE_SUPABASE_URL}/functions/v1/financial-statements`;
const anon = env.VITE_SUPABASE_ANON_KEY;

async function probe(name, init) {
  const started = Date.now();
  try {
    const res = await fetch(base, init);
    const headers = {};
    for (const k of [
      'access-control-allow-origin',
      'access-control-allow-headers',
      'access-control-allow-methods',
      'access-control-max-age',
      'content-type',
      'x-correlation-id',
      'x-platform-version',
      'x-function-name',
      'sb-error-code',
    ]) {
      const v = res.headers.get(k);
      if (v) headers[k] = v;
    }
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    return {
      name,
      ok: res.ok,
      status: res.status,
      elapsedMs: Date.now() - started,
      cors: {
        allowOrigin: headers['access-control-allow-origin'] || null,
        allowHeaders: headers['access-control-allow-headers'] || null,
        allowMethods: headers['access-control-allow-methods'] || null,
        maxAge: headers['access-control-max-age'] || null,
        complete:
          !!headers['access-control-allow-origin'] &&
          !!headers['access-control-allow-headers'] &&
          !!headers['access-control-allow-methods'],
      },
      headers,
      bodyPreview:
        parsed == null
          ? String(text).slice(0, 400)
          : typeof parsed === 'object'
            ? {
                message: parsed.message || parsed.error || parsed.platformError?.message || null,
                code: parsed.code || parsed.platformError?.code || null,
                keys: Object.keys(parsed).slice(0, 12),
              }
            : String(parsed).slice(0, 400),
    };
  } catch (e) {
    return {
      name,
      ok: false,
      status: null,
      elapsedMs: Date.now() - started,
      networkError: e instanceof Error ? e.message : String(e),
    };
  }
}

const results = [];

results.push(
  await probe('OPTIONS_preflight', {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:8080',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers':
        'authorization,apikey,content-type,x-client-info',
    },
  }),
);

results.push(
  await probe('POST_missing_jwt', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:8080',
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ method: 'LIST_WORKSPACES', company_id: '00000000-0000-0000-0000-000000000001' }),
  }),
);

results.push(
  await probe('POST_unauthenticated_anon_bearer', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:8080',
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ method: 'LIST_WORKSPACES', company_id: '00000000-0000-0000-0000-000000000001' }),
  }),
);

results.push(
  await probe('POST_malformed_json', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:8080',
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'Content-Type': 'application/json',
    },
    body: '{not-json',
  }),
);

results.push(
  await probe('POST_unknown_method', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:8080',
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      method: 'DOES_NOT_EXIST',
      company_id: '00000000-0000-0000-0000-000000000001',
    }),
  }),
);

results.push(
  await probe('POST_missing_company', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:8080',
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ method: 'LIST_WORKSPACES' }),
  }),
);

const outDir = path.join(
  root,
  'docs/financial-statements-internal-release/V6.5.2/evidence',
);
fs.mkdirSync(outDir, { recursive: true });

const evidence = {
  version: '6.5.2',
  date: new Date().toISOString(),
  project_ref: 'zaulhnpohrgqqodvzhxp',
  endpoint: base,
  probes: results,
  summary: {
    optionsHttp200: results.find((r) => r.name === 'OPTIONS_preflight')?.status === 200,
    optionsCorsComplete: results.find((r) => r.name === 'OPTIONS_preflight')?.cors?.complete === true,
    allProbesHaveCors: results.every((r) => r.cors?.allowOrigin || r.networkError),
    functionReachable: results.some((r) => r.status && r.status !== 404),
  },
};

fs.writeFileSync(
  path.join(outDir, 'edge-live-validation.json'),
  JSON.stringify(evidence, null, 2),
);
console.log(JSON.stringify(evidence.summary, null, 2));
for (const r of results) {
  console.log(
    `${r.name}: status=${r.status} cors=${r.cors?.complete} err=${r.networkError || ''}`,
  );
}
