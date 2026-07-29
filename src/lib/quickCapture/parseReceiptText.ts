export type ReceiptExtraction = {
  provider: 'openai-gpt-4o-mini' | 'tesseract.js';
  vendor_name: string | null;
  amount: number | null;
  expense_date: string | null;
  description: string | null;
  confidence: {
    vendor_name: number;
    amount: number;
    expense_date: number;
    description: number;
  };
  notes?: string | null;
  raw_text?: string;
};

/** Parse plain OCR text into receipt fields with per-field confidence. */
export function parseReceiptText(
  text: string,
  meanConfidence01: number,
  provider: ReceiptExtraction['provider'] = 'tesseract.js'
): ReceiptExtraction {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const amountMatch = text.match(/(?:TOTAL|Total|R)\s*[R$]?\s*([0-9]+[.,][0-9]{2})/i)
    || text.match(/([0-9]+[.,][0-9]{2})/);
  const amount = amountMatch ? Number(amountMatch[1].replace(',', '.')) : null;

  const dateMatch =
    text.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/) ||
    text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})/);
  let expense_date: string | null = null;
  if (dateMatch) {
    if (dateMatch[1].length === 4) {
      expense_date = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
    } else {
      expense_date = `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`;
    }
  }

  const vendor_name = lines[0] && !/date|total|fuel|thank/i.test(lines[0]) ? lines[0] : lines.find((l) => /engen|shop|store|mart|world/i.test(l)) ?? null;
  const description = lines.find((l) => /fuel|uniform|maintenance|rent|wage/i.test(l)) ?? null;

  const base = Math.max(0, Math.min(1, meanConfidence01));
  const fieldConf = (found: boolean, boost = 0) => (found ? Math.min(1, base + boost) : Math.min(base, 0.35));

  return {
    provider,
    vendor_name,
    amount: Number.isFinite(amount as number) ? amount : null,
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
