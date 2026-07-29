import Tesseract from 'tesseract.js';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL?.replaceAll('"', '') || 'https://zaulhnpohrgqqodvzhxp.supabase.co';
const anon = process.env.VITE_SUPABASE_ANON_KEY?.replaceAll('"', '');
const email = process.env.E2E_EMAIL?.replaceAll('"', '');
const password = process.env.E2E_PASSWORD?.replaceAll('"', '');
const companyId = process.env.EAM_CERT_COMPANY_ID?.replaceAll('"', '') || '3cbfd4eb-a095-43f3-837a-0b4f1e2c1752';

function parseReceiptText(text, meanConfidence01) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const amountMatch =
    text.match(/(?:TOTAL|Total|R)\s*[R$]?\s*([0-9]+[.,][0-9]{2})/i) ||
    text.match(/([0-9]+[.,][0-9]{2})/);
  const amount = amountMatch ? Number(amountMatch[1].replace(',', '.')) : null;
  const dateMatch =
    text.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/) ||
    text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})/);
  let expense_date = null;
  if (dateMatch) {
    if (dateMatch[1].length === 4) {
      expense_date = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
    } else {
      expense_date = `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`;
    }
  }
  const vendor_name =
    lines[0] && !/date|total|fuel|thank/i.test(lines[0])
      ? lines[0]
      : lines.find((l) => /engen|shop|store|mart|world/i.test(l)) ?? null;
  const description = lines.find((l) => /fuel|uniform|maintenance|rent|wage/i.test(l)) ?? null;
  const base = Math.max(0, Math.min(1, meanConfidence01));
  const fieldConf = (found, boost = 0) => (found ? Math.min(1, base + boost) : Math.min(base, 0.35));
  return {
    provider: 'tesseract.js',
    vendor_name,
    amount: Number.isFinite(amount) ? amount : null,
    expense_date,
    description,
    confidence: {
      vendor_name: fieldConf(!!vendor_name, 0.05),
      amount: fieldConf(amount != null, 0.1),
      expense_date: fieldConf(!!expense_date, 0.05),
      description: fieldConf(!!description),
    },
    raw_text: text,
  };
}

async function ocrFile(path, label) {
  const result = await Tesseract.recognize(path, 'eng');
  const mean = (result.data.confidence ?? 0) / 100;
  const parsed = parseReceiptText(result.data.text || '', mean);
  console.log(`\n=== OCR ${label} (tesseract.js; OpenAI key not on project secrets) ===`);
  console.log('raw_text:', JSON.stringify(result.data.text));
  console.log('mean_confidence:', mean);
  console.log('parsed:', JSON.stringify(parsed, null, 2));
  const low = Object.entries(parsed.confidence).filter(([, v]) => v < 0.6).map(([k]) => k);
  console.log('low_confidence_fields:', low);
}

async function main() {
  await ocrFile('scripts/tmp-receipt-clear.jpg', 'CLEAR');
  await ocrFile('scripts/tmp-receipt-blurry.jpg', 'BLURRY');

  const supabase = createClient(url, anon);
  await supabase.auth.signInWithPassword({ email, password });
  const { data: suggest } = await supabase.functions.invoke('quick-capture-expense', {
    body: { method: 'SUGGEST_CATEGORY', company_id: companyId, vendor_name: 'Engen' },
  });
  console.log('\n=== SUGGEST Engen (from seeded history) ===');
  console.log(JSON.stringify(suggest, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
