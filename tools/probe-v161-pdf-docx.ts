import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { emptyOverrides } from '../src/lib/financialStatements/document/documentStore';
import { buildCanonicalPublishPackage, extractDocxPlainText } from '../src/lib/financialStatements/publication/canonicalDocumentPublish';

function loadEnv() {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[t.slice(0, eq).trim()] = v;
  }
}

async function main() {
  loadEnv();
  (import.meta as unknown as { env: Record<string, unknown> }).env = {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
    MODE: 'development',
    DEV: true,
    PROD: false,
    SSR: false,
  };
  const url = process.env.VITE_SUPABASE_URL!;
  const anon = process.env.VITE_SUPABASE_ANON_KEY!;
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const s = await client.auth.signInWithPassword({
    email: process.env.E2E_EMAIL!,
    password: process.env.E2E_PASSWORD!,
  });
  const token = s.data.session!.access_token;
  const companyId = '3cbfd4eb-a095-43f3-837a-0b4f1e2c1752';
  const ws = '66a7ad84-2eaf-4b9e-8423-89019ba3c6b3';
  const r = await fetch(`${url}/functions/v1/financial-statements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      method: 'GET_WORKSPACE_GENERAL_INFORMATION',
      company_id: companyId,
      workspace_id: ws,
    }),
  });
  const gi = await r.json();
  const model = {
    companyId,
    workspaceId: ws,
    workspaceName: gi.registered_name || '',
    frameworkPackId: null,
    frameworkKey: null,
    frameworkLabel: gi.reporting_framework || 'IFRS for SMEs',
    entity: gi,
    period: { label: gi.financial_year_end },
    statements: [],
    policySets: [],
    notes: [],
    crossReferences: [],
    signatures: [],
    trialBalanceCaptured: false,
  };
  const pkg = buildCanonicalPublishPackage(model, emptyOverrides());
  const docx = extractDocxPlainText(pkg.docxBytes);
  const pdf = Buffer.from(pkg.pdfBytes).toString('latin1');
  const checks = [
    'A118',
    'Hammanskraal',
    '07175212566',
    'Choppa Moatshe',
    '2025/521566/08',
    '4013356565',
    'Tebogo Matlala',
    'Corporate Information',
  ];
  for (const c of checks) {
    console.log(c, docx.includes(c) ? 'DOCX' : '-', pdf.includes(c) ? 'PDF' : '-');
  }
}

main().catch(console.error);
