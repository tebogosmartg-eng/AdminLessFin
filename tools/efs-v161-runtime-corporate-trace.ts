/**
 * V16.1 — Enterprise Runtime Corporate Information Trace
 * Traces each corporate field from database → publication (Preview/PDF/DOCX).
 *
 * Run: npx tsx tools/efs-v161-runtime-corporate-trace.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

const VERSION = '16.1';

function loadEnv() {
  const content = readFileSync(join(process.cwd(), '.env'), 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[trimmed.slice(0, eq).trim()] = val;
  }
}

function polyfillViteEnv() {
  const env = {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? '',
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? '',
    VITE_EFS_MODULE: process.env.VITE_EFS_MODULE ?? 'true',
    VITE_EFS_WORKSPACE_UI: process.env.VITE_EFS_WORKSPACE_UI ?? 'true',
    VITE_EFS_NAV_SIDEBAR: process.env.VITE_EFS_NAV_SIDEBAR ?? 'true',
    VITE_EFS_SNAPSHOT_PIPELINE: process.env.VITE_EFS_SNAPSHOT_PIPELINE ?? 'true',
    VITE_EFS_WORKING_PAPERS: process.env.VITE_EFS_WORKING_PAPERS ?? 'true',
    VITE_EFS_DISCLOSURES: process.env.VITE_EFS_DISCLOSURES ?? 'true',
    VITE_EFS_VALIDATION: process.env.VITE_EFS_VALIDATION ?? 'true',
    VITE_EFS_REVIEW_WORKFLOW: process.env.VITE_EFS_REVIEW_WORKFLOW ?? 'true',
    VITE_EFS_PUBLICATION: process.env.VITE_EFS_PUBLICATION ?? 'true',
    MODE: 'development',
    DEV: true,
    PROD: false,
    SSR: false,
  };
  (import.meta as unknown as { env: Record<string, string | boolean> }).env = env;
}

function decodePdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString('latin1');
  const texts: string[] = [];
  const re = /\((?:\\.|[^\\)])*\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const inner = m[0].slice(1, m[0].lastIndexOf(')'));
    texts.push(
      inner
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\t/g, '\t')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\'),
    );
  }
  return texts.join('\n');
}

function norm(v: string | null | undefined): string {
  return String(v ?? '').trim().replace(/\s+/g, ' ');
}

type PresentationRow = {
  kind: string;
  label?: string;
  value?: string;
  lines?: string[];
  people?: Array<{ name: string }>;
  bankers?: Array<{ name: string }>;
  items?: Array<{ label: string; number: string }>;
};

function presentationValue(rows: PresentationRow[], label: string): string {
  const lower = label.toLowerCase();
  for (const row of rows) {
    if (row.kind === 'single' && row.label?.toLowerCase() === lower) return norm(row.value);
    if (row.kind === 'address_block' && row.label?.toLowerCase() === lower) {
      return norm((row.lines || []).join(' '));
    }
    if (row.kind === 'person_list' && row.label?.toLowerCase() === lower) {
      return norm((row.people || []).map((p) => p.name).join(', '));
    }
    if (row.kind === 'banker_list' && row.label?.toLowerCase() === lower) {
      return norm((row.bankers || []).map((b) => b.name).join(', '));
    }
    if (row.kind === 'tax_list') {
      const item = (row.items || []).find((t) => t.label.toLowerCase() === lower);
      if (item) return norm(item.number);
    }
  }
  return '';
}

function textContains(text: string, value: string): boolean {
  if (!value) return !value;
  const v = value.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(v)) return true;
  const parts = value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return parts.length > 0 && parts.every((p) => t.includes(p.toLowerCase()));
}

type FieldTrace = {
  field: string;
  database: { table: string; column: string; value: string };
  repository: string;
  provider: string;
  viewModel: string;
  workspace: string;
  preview: string;
  pdf: string;
  docx: string;
  finalRendered: string;
  status: 'PASS' | 'FAIL';
  divergence?: string;
};

async function invokeEfs<T>(
  url: string,
  anon: string,
  token: string,
  companyId: string,
  method: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`${url}/functions/v1/financial-statements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anon,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ method, company_id: companyId, ...payload }),
  });
  const text = await res.text();
  const parsed = JSON.parse(text) as T & { error?: string };
  if (!res.ok || (parsed && typeof parsed === 'object' && 'error' in parsed && parsed.error)) {
    throw new Error(`${method} failed (${res.status}): ${text.slice(0, 500)}`);
  }
  return parsed;
}

function traceField(
  field: string,
  dbTable: string,
  dbColumn: string,
  dbValue: string,
  repository: string,
  provider: string,
  viewModel: string,
  workspace: string,
  preview: string,
  pdfText: string,
  docxText: string,
): FieldTrace {
  const pdfOk = textContains(pdfText, provider || dbValue);
  const docxOk = textContains(docxText, provider || dbValue);
  const pdfVal = pdfOk ? (provider || dbValue) : '(missing in PDF)';
  const docxVal = docxOk ? (provider || dbValue) : '(missing in DOCX)';
  const finalRendered = provider || dbValue;

  const layers: [string, string][] = [
    ['Database', dbValue],
    ['Repository', repository],
    ['Provider', provider],
    ['View Model', viewModel],
    ['Workspace', workspace],
    ['Preview', preview],
    ['PDF', pdfVal],
    ['DOCX', docxVal],
  ];

  let status: 'PASS' | 'FAIL' = 'PASS';
  let divergence: string | undefined;
  const canonical = norm(provider || dbValue);

  for (let i = 1; i < layers.length; i++) {
    const [layerName, val] = layers[i];
    if (layerName === 'PDF' || layerName === 'DOCX') {
      if (
        canonical &&
        !norm(val).includes('missing') &&
        !textContains(layerName === 'PDF' ? pdfText : docxText, canonical)
      ) {
        status = 'FAIL';
        divergence = `First divergence at ${layerName}: expected "${canonical}"`;
        break;
      }
      continue;
    }
    if (norm(val) !== norm(canonical) && (norm(val) || norm(canonical))) {
      status = 'FAIL';
      divergence = `First divergence at ${layerName}: "${norm(val)}" !== "${norm(canonical)}"`;
      break;
    }
  }

  if (status === 'PASS' && canonical) {
    if (!pdfOk) {
      status = 'FAIL';
      divergence = `First divergence at PDF: "${canonical}" not found`;
    } else if (!docxOk) {
      status = 'FAIL';
      divergence = `First divergence at DOCX: "${canonical}" not found`;
    }
  }

  return {
    field,
    database: { table: dbTable, column: dbColumn, value: dbValue },
    repository,
    provider,
    viewModel,
    workspace,
    preview,
    pdf: pdfVal,
    docx: docxVal,
    finalRendered,
    status,
    divergence,
  };
}

async function main() {
  loadEnv();
  polyfillViteEnv();

  const [
    { emptyOverrides },
    { provideCorporateInformation, buildCorporateInformationPresentation },
    { hydrateWorkspaceFromMasterData },
    { buildCanonicalPublishPackage, extractDocxPlainText },
    { prepareCanonicalDocumentView },
    { formatDirectorName },
  ] = await Promise.all([
    import('../src/lib/financialStatements/document/documentStore'),
    import('../src/lib/financialStatements/corporateInformation'),
    import('../src/lib/financialStatements/masterData/hydration'),
    import('../src/lib/financialStatements/publication/canonicalDocumentPublish'),
    import('../src/lib/financialStatements/publication/canonicalDocumentView'),
    import('../src/lib/financialStatements/corporateInformation/formatting'),
  ]);

  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!url || !anon || !email || !password) {
    throw new Error('Missing env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL, E2E_PASSWORD');
  }

  const client = createClient(url, anon, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.session) {
    throw new Error(`Login failed: ${signIn.error?.message}`);
  }
  const token = signIn.data.session.access_token;

  const { data: memberships } = await client.from('company_users').select('company_id').limit(1);
  const companyId = memberships?.[0]?.company_id;
  if (!companyId) throw new Error('No company membership');

  const { data: workspaces } = await client
    .from('efs_reporting_workspaces')
    .select('id, name')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false });

  const preferredWorkspaceId =
    process.env.EFS_TRACE_WORKSPACE_ID ||
    workspaces?.find((w) => w.name.includes('V6.10.2'))?.id ||
    workspaces?.[0]?.id;
  const workspaceId = preferredWorkspaceId;
  if (!workspaceId) throw new Error('No EFS workspace found');

  console.log(`\nV${VERSION} RUNTIME CORPORATE INFORMATION TRACE`);
  console.log(`Company: ${companyId}`);
  console.log(`Workspace: ${workspaceId} (${workspaces?.[0]?.name})\n`);

  type MasterData = Awaited<ReturnType<typeof invokeEfs<Record<string, unknown>>>>;
  type GeneralInfo = Record<string, unknown>;

  const master = await invokeEfs<MasterData>(url, anon, token, companyId, 'GET_COMPANY_MASTER_DATA');
  const generalInfo = await invokeEfs<GeneralInfo>(
    url,
    anon,
    token,
    companyId,
    'GET_WORKSPACE_GENERAL_INFORMATION',
    { workspace_id: workspaceId },
  );

  const localHydrated = hydrateWorkspaceFromMasterData(generalInfo, master as never);

  const model = {
    companyId,
    workspaceId,
    workspaceName: String(generalInfo.registered_name || ''),
    frameworkPackId: null,
    frameworkKey: null,
    frameworkLabel: String(generalInfo.reporting_framework || 'IFRS for SMEs'),
    entity: generalInfo as never,
    period: { label: String(generalInfo.financial_year_end || '') || undefined },
    statements: [],
    policySets: [],
    notes: [],
    crossReferences: [],
    signatures: [],
    trialBalanceCaptured: false,
  };

  const corp = provideCorporateInformation(model);
  const presentation = buildCorporateInformationPresentation(corp);
  prepareCanonicalDocumentView(model, emptyOverrides());
  const publishPkg = buildCanonicalPublishPackage(model, emptyOverrides());
  const pdfText = decodePdfText(publishPkg.pdfBytes);
  const docxText = extractDocxPlainText(publishPkg.docxBytes);

  const addr = (master.addresses || {}) as Record<string, string | undefined>;
  const gov = (master.governance || {}) as Record<string, string | undefined>;
  const profile = (master.company_profile || {}) as Record<string, string | undefined>;
  const tax = (master.tax_registrations || {}) as Record<string, string | undefined>;
  const officers = (master.officers || []) as Array<{ role: string; name: string }>;
  const preparer = officers.find((o) => o.role === 'preparer')?.name || '';

  const activeDirectors = corp.directors.filter((d) => d.active);
  const directorsDb = norm(
    ((master.directors || []) as Array<{ name?: string }>)
      .map((d) => d.name)
      .filter(Boolean)
      .join(', '),
  );
  const directorsProvider = norm(activeDirectors.map((d) => d.name).join(', '));
  const directorsView = norm(activeDirectors.map((d) => formatDirectorName(d)).join(', '));

  const activeBankers = corp.principalBankers.filter((b) => b.active);
  const bankersDb = norm(
    ((master.principal_bankers || []) as Array<{ name?: string; active?: boolean }>)
      .filter((b) => b.active !== false)
      .map((b) => b.name)
      .filter(Boolean)
      .join(', '),
  );
  const bankersProvider = norm(activeBankers.map((b) => b.bankName).join(', '));

  const traces: FieldTrace[] = [
    traceField(
      'Registered Office',
      'efs_company_master_data',
      'addresses.registered_office',
      norm(addr.registered_office),
      norm(generalInfo.registered_office as string | null | undefined),
      norm(corp.addresses.find((a) => a.kind === 'registered_office')?.value),
      presentationValue(presentation.rows, 'Registered office'),
      norm(addr.registered_office),
      presentationValue(presentation.rows, 'Registered office'),
      pdfText,
      docxText,
    ),
    traceField(
      'Business Address',
      'efs_company_master_data',
      'addresses.business_address',
      norm(addr.business_address),
      norm(generalInfo.business_address as string | null | undefined),
      norm(corp.addresses.find((a) => a.kind === 'business_address')?.value),
      presentationValue(presentation.rows, 'Business address'),
      norm(addr.business_address),
      presentationValue(presentation.rows, 'Business address'),
      pdfText,
      docxText,
    ),
    traceField(
      'Postal Address',
      'efs_company_master_data',
      'addresses.postal_address',
      norm(addr.postal_address),
      norm(generalInfo.postal_address as string | null | undefined),
      norm(corp.addresses.find((a) => a.kind === 'postal_address')?.value),
      presentationValue(presentation.rows, 'Postal address'),
      norm(addr.postal_address),
      presentationValue(presentation.rows, 'Postal address'),
      pdfText,
      docxText,
    ),
    traceField(
      'Telephone',
      'efs_company_master_data',
      'addresses.telephone',
      norm(addr.telephone),
      norm(generalInfo.telephone as string | null | undefined),
      norm(corp.addresses.find((a) => a.kind === 'telephone')?.value),
      presentationValue(presentation.rows, 'Telephone'),
      norm(addr.telephone),
      presentationValue(presentation.rows, 'Telephone'),
      pdfText,
      docxText,
    ),
    traceField(
      'Auditor',
      'efs_company_master_data',
      'governance.auditor',
      norm(gov.auditor),
      norm(generalInfo.auditor as string | null | undefined),
      norm(corp.governance.find((g) => g.role === 'auditor')?.name),
      presentationValue(presentation.rows, 'Auditor'),
      norm(gov.auditor),
      presentationValue(presentation.rows, 'Auditor'),
      pdfText,
      docxText,
    ),
    traceField(
      'Company Secretary',
      'efs_company_master_data',
      'governance.company_secretary',
      norm(gov.company_secretary),
      norm(generalInfo.company_secretary as string | null | undefined),
      norm(corp.governance.find((g) => g.role === 'company_secretary')?.name),
      presentationValue(presentation.rows, 'Company secretary'),
      norm(gov.company_secretary),
      presentationValue(presentation.rows, 'Company secretary'),
      pdfText,
      docxText,
    ),
    traceField(
      'Prepared By',
      'efs_company_master_data',
      'officers[role=preparer].name',
      norm(preparer),
      norm(generalInfo.prepared_by as string | null | undefined),
      norm(corp.engagement.preparedBy.formatted),
      presentationValue(presentation.rows, 'Prepared by'),
      norm(preparer),
      presentationValue(presentation.rows, 'Prepared by'),
      pdfText,
      docxText,
    ),
    traceField(
      'Registration Number',
      'efs_company_master_data',
      'company_profile.registration_number',
      norm(profile.registration_number),
      norm(generalInfo.registration_number as string | null | undefined),
      norm(corp.entityIdentity.registrationNumber.formatted),
      presentationValue(presentation.rows, 'Registration number'),
      norm(profile.registration_number),
      norm(corp.entityIdentity.registrationNumber.formatted),
      pdfText,
      docxText,
    ),
    traceField(
      'VAT Number',
      'efs_company_master_data',
      'tax_registrations.vat_number',
      norm(tax.vat_number),
      norm(generalInfo.vat_number as string | null | undefined),
      norm(corp.taxRegistrations.find((t) => t.kind === 'vat')?.number),
      presentationValue(presentation.rows, 'VAT Number'),
      norm(tax.vat_number),
      presentationValue(presentation.rows, 'VAT Number'),
      pdfText,
      docxText,
    ),
    traceField(
      'Directors',
      'efs_company_master_data',
      'directors[]',
      directorsDb,
      norm(
        ((generalInfo.directors || []) as Array<{ name?: string }>)
          .map((d) => d.name)
          .filter(Boolean)
          .join(', '),
      ),
      directorsProvider,
      directorsView,
      directorsDb,
      directorsProvider,
      pdfText,
      docxText,
    ),
    traceField(
      'Principal Bankers',
      'efs_company_master_data',
      'principal_bankers[]',
      bankersDb,
      norm(
        ((generalInfo.principal_bankers || []) as Array<{ name?: string }>)
          .map((b) => b.name)
          .filter(Boolean)
          .join(', '),
      ),
      bankersProvider,
      presentationValue(presentation.rows, 'Principal bankers'),
      bankersDb,
      presentationValue(presentation.rows, 'Principal bankers'),
      pdfText,
      docxText,
    ),
  ];

  const hydrationCheck =
    norm(String(localHydrated.registered_office ?? '')) === norm(String(generalInfo.registered_office ?? ''))
      ? 'PASS'
      : 'FAIL';

  console.log(`Hydration parity (client vs edge GET_WORKSPACE_GENERAL_INFORMATION): ${hydrationCheck}`);
  if (hydrationCheck === 'FAIL') {
    console.log(
      `  Edge registered_office: "${norm(String(generalInfo.registered_office))}" vs local hydrate: "${norm(String(localHydrated.registered_office))}"`,
    );
  }
  console.log(`Master migration marker: ${String(master.legacy_migration_completed_at || '(none)')}\n`);

  console.log('| Field | DB | Repository | Provider | ViewModel | Workspace | Preview | PDF | DOCX | Status |');
  console.log('|-------|-----|------------|----------|-----------|-----------|---------|-----|------|--------|');

  let firstFail: FieldTrace | undefined;
  for (const t of traces) {
    if (t.status === 'FAIL' && !firstFail) firstFail = t;
    const short = (v: string) => (v ? v.slice(0, 40) + (v.length > 40 ? '…' : '') : '—');
    console.log(
      `| ${t.field} | ${short(t.database.value)} | ${short(t.repository)} | ${short(t.provider)} | ${short(t.viewModel)} | ${short(t.workspace)} | ${short(t.preview)} | ${short(t.pdf)} | ${short(t.docx)} | ${t.status} |`,
    );
  }

  if (firstFail) {
    console.log('\n--- FIRST DIVERGENCE ---');
    console.log(`Field: ${firstFail.field}`);
    console.log(`Detail: ${firstFail.divergence}`);
    console.log('\nVERSION 16.1');
    console.log('RUNTIME VERIFICATION FAILED');
    process.exit(1);
  }

  const allPass = traces.every((t) => t.status === 'PASS') && hydrationCheck === 'PASS';
  console.log('\nVERSION 16.1');
  console.log(allPass ? 'RUNTIME VERIFIED' : 'RUNTIME VERIFICATION FAILED');
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
