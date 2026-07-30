import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { BRAND } from '../config/brand';
import { downloadCSV } from './utils';

const currency = (amount: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount);

/** AdminLess Fin brand green — matches BRAND.seo.themeColor (#047857). */
const BRAND_GREEN: [number, number, number] = [4, 120, 87];
const BRAND_GREEN_LIGHT: [number, number, number] = [236, 253, 245];
const LEFT_COL_MAX_WIDTH_MM = 92;
const UTF8_BOM = '\uFEFF';

export type PayslipItem = {
  id?: string;
  description: string;
  type: 'earning' | 'deduction' | 'employer_contribution';
  amount: number;
};

export type LeaveBalances = {
  annual?: number;
  sick?: number;
  family?: number;
};

export type PayslipDocumentData = {
  companyName: string;
  companyAddress?: string | null;
  companyTaxId?: string | null;
  companyLogoUrl?: string | null;
  employee: {
    first_name: string;
    last_name: string;
    email?: string | null;
    position?: string | null;
    department?: string | null;
    employee_number?: string | null;
    tax_number?: string | null;
    uif_number?: string | null;
    bank_name?: string | null;
    bank_account_number?: string | null;
    bank_branch_code?: string | null;
  };
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  items: PayslipItem[];
  total_earnings: number;
  total_deductions: number;
  net_pay: number;
  payment_method?: string;
  bank_reference?: string;
  leave_balances?: LeaveBalances;
  audit_reference?: string;
  payslip_id?: string;
  payroll_run_id?: string;
  tax_year?: string | null;
  rule_version?: string | null;
  calculation_version?: string | null;
  ytd?: PayslipYtdSummary | null;
};

export type PayslipYtdSummary = {
  taxable_income?: number;
  paye_paid?: number;
  gross_earnings?: number;
  net_pay?: number;
  periods_processed?: number;
};

export type BankBatchStatus = 'generated' | 'downloaded' | 'submitted' | 'paid';

export type BankBatchMetadata = {
  status: BankBatchStatus;
  format: BankFileFormat;
  generated_at?: string;
  downloaded_at?: string;
  submitted_at?: string;
  paid_at?: string;
  employee_count: number;
  total_amount: number;
  reference?: string;
};

export type BankFileFormat = 'csv' | 'eft';

export type BankPaymentRow = {
  employee_name: string;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_branch_code?: string | null;
  net_pay: number;
  /** Alias for net_pay — returned by GENERATE_BANK_BATCH. */
  payment_amount?: number;
  reference?: string;
  /** Alias for reference — returned by GENERATE_BANK_BATCH. */
  payment_reference?: string;
};

export type BankFileIntegrity = {
  record_count: number;
  total_amount: number;
  total_cents: number;
  control_hash: string;
  duplicate_keys: string[];
  verified: boolean;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type LogoImage = { dataUrl: string; format: 'PNG' | 'JPEG' | 'WEBP' };

function detectLogoFormat(url: string, mime?: string | null): LogoImage['format'] | null {
  // Only inspect the MIME / data-URL header — never the base64 payload (random bytes can contain "svg").
  const header = `${mime ?? ''} ${url.split(',', 1)[0] ?? ''}`.toLowerCase();
  if (header.includes('svg')) return null; // jsPDF cannot embed SVG via addImage
  if (header.includes('jpeg') || header.includes('jpg')) return 'JPEG';
  if (header.includes('webp')) return 'WEBP';
  if (header.includes('png') || header.startsWith('data:image/') || header.includes('data:image/')) return 'PNG';
  return 'PNG';
}

async function tryLoadLogoImage(url: string | null | undefined): Promise<LogoImage | null> {
  if (!url) return null;

  // Already a data URL — use directly (tests / offline QA / preloaded assets).
  if (url.startsWith('data:image/')) {
    if (url.startsWith('data:image/svg')) return null;
    const format = detectLogoFormat(url);
    return format ? { dataUrl: url, format } : null;
  }

  if (typeof fetch === 'undefined') return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const format = detectLogoFormat(url, blob.type);
    if (!format) return null;
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    return dataUrl ? { dataUrl, format } : null;
  } catch {
    return null;
  }
}

/** Employer logo only — never substitute AdminLess Fin for company branding. */
async function resolveCompanyLogo(companyLogoUrl?: string | null): Promise<LogoImage | null> {
  return tryLoadLogoImage(companyLogoUrl);
}

/** AdminLess Fin raster mark for the subtle "Generated by" footer (never SVG). */
async function resolveAdminLessFinLogo(): Promise<LogoImage | null> {
  return (
    (await tryLoadLogoImage(BRAND.assets.pwaIcon)) ??
    (await tryLoadLogoImage(BRAND.assets.favicon192)) ??
    (await tryLoadLogoImage(BRAND.assets.favicon32))
  );
}

/** Drawn brand mark used in the footer when no raster AdminLess logo can be embedded. */
function drawAdminLessFinMark(doc: jsPDF, x: number, y: number, sizeMm: number): void {
  // Teal-to-green brand plate with wordmark — always visible without network assets.
  doc.setFillColor(4, 120, 87);
  doc.roundedRect(x, y, sizeMm, sizeMm, 1.5, 1.5, 'F');
  doc.setFillColor(16, 185, 129);
  doc.circle(x + sizeMm * 0.72, y + sizeMm * 0.28, sizeMm * 0.18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(Math.max(6, sizeMm * 0.38));
  doc.text('AF', x + sizeMm / 2, y + sizeMm / 2 + sizeMm * 0.12, { align: 'center' });
  doc.setFont('helvetica', 'normal');
}

/** Mask account number for contexts that must not expose full account numbers. */
export function maskBankAccountNumber(account: string | null | undefined): string {
  if (!account?.trim()) return '';
  const digits = account.replace(/\s/g, '');
  if (digits.length <= 4) return '****';
  return `****${digits.slice(-4)}`;
}

export function hasPayslipPaymentDetails(
  data: Pick<PayslipDocumentData, 'payment_method' | 'bank_reference' | 'employee'>
): boolean {
  return Boolean(
    data.payment_method ||
      data.employee.bank_name ||
      data.employee.bank_account_number ||
      data.employee.bank_branch_code ||
      data.bank_reference
  );
}

export type PayslipPaymentDetails = {
  payment_method: string;
  bank_name: string;
  account_number: string;
  branch_code: string;
  payment_reference: string;
};

/** Complete payroll payment fields for employee verification (full account number). */
export function getPayslipPaymentDetails(
  data: Pick<PayslipDocumentData, 'payment_method' | 'bank_reference' | 'employee'>
): PayslipPaymentDetails {
  return {
    payment_method: data.payment_method?.trim() || 'EFT',
    bank_name: data.employee.bank_name?.trim() || '—',
    account_number: data.employee.bank_account_number?.replace(/\s/g, '') || '—',
    branch_code: data.employee.bank_branch_code?.trim() || '—',
    payment_reference: data.bank_reference?.trim() || '—',
  };
}

/** ASCII-safe payment summary for PDF/HTML — includes full account number for verification. */
export function formatPayslipPaymentLine(
  data: Pick<PayslipDocumentData, 'payment_method' | 'bank_reference' | 'employee'>
): string {
  const d = getPayslipPaymentDetails(data);
  return [
    `Payment Method: ${d.payment_method}`,
    `Bank Name: ${d.bank_name}`,
    `Account Number: ${d.account_number}`,
    `Branch Code: ${d.branch_code}`,
    `Payment Reference: ${d.payment_reference}`,
  ].join(' | ');
}

/** Normalize employee banking fields from any embed / master-record shape. */
export function extractEmployeeBankFields(source: unknown): {
  bank_name: string | null;
  bank_branch_code: string | null;
  bank_account_number: string | null;
} {
  const record =
    source && typeof source === 'object'
      ? (Array.isArray(source) ? source[0] : source) as Record<string, unknown>
      : null;

  const pick = (...keys: string[]): string | null => {
    if (!record) return null;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  };

  return {
    bank_name: pick('bank_name', 'bankName'),
    bank_branch_code: pick('bank_branch_code', 'bankBranchCode', 'branch_code', 'branchCode'),
    bank_account_number: pick('bank_account_number', 'bankAccountNumber', 'account_number', 'accountNumber'),
  };
}

/** Deterministic control hash for bank batch verification (FNV-1a 32-bit hex). */
export function computeBankControlHash(rows: BankPaymentRow[]): string {
  const payload = rows
    .map((r) => {
      const account = (r.bank_account_number ?? '').replace(/\s/g, '');
      const branch = (r.bank_branch_code ?? '').replace(/\s/g, '');
      const cents = Math.round(r.net_pay * 100);
      return `${account}|${branch}|${cents}|${r.employee_name.trim().toUpperCase()}`;
    })
    .sort()
    .join('\n');

  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

export function computeBankFileIntegrity(rows: BankPaymentRow[]): BankFileIntegrity {
  const keys = rows.map((r) => (r.bank_account_number ?? '').replace(/\s/g, ''));
  const seen = new Set<string>();
  const duplicate_keys: string[] = [];
  for (const key of keys) {
    if (!key) continue;
    if (seen.has(key)) duplicate_keys.push(key);
    seen.add(key);
  }

  const total_amount = round2(rows.reduce((s, r) => s + r.net_pay, 0));
  const total_cents = rows.reduce((s, r) => s + Math.round(r.net_pay * 100), 0);
  const control_hash = computeBankControlHash(rows);

  return {
    record_count: rows.length,
    total_amount,
    total_cents,
    control_hash,
    duplicate_keys,
    verified: duplicate_keys.length === 0 && rows.length > 0,
  };
}

export function extractPayslipCertificationFromSnapshot(
  snapshot: Record<string, unknown> | null | undefined
): Pick<PayslipDocumentData, 'tax_year' | 'rule_version' | 'calculation_version' | 'ytd'> {
  if (!snapshot) {
    return { tax_year: null, rule_version: null, calculation_version: null, ytd: null };
  }

  const rulesResult = snapshot.rules_engine_result as Record<string, unknown> | undefined;
  const ytdSource = (rulesResult?.ytd ?? snapshot.ytd) as Record<string, unknown> | undefined;

  const ytd: PayslipYtdSummary | null = ytdSource
    ? {
        taxable_income: typeof ytdSource.taxableIncome === 'number' ? ytdSource.taxableIncome : undefined,
        paye_paid: typeof ytdSource.payePaid === 'number' ? ytdSource.payePaid : undefined,
        gross_earnings: typeof ytdSource.grossEarnings === 'number' ? ytdSource.grossEarnings : undefined,
        net_pay: typeof ytdSource.netPay === 'number' ? ytdSource.netPay : undefined,
        periods_processed:
          typeof ytdSource.periodsProcessed === 'number' ? ytdSource.periodsProcessed : undefined,
      }
    : {
        taxable_income:
          typeof snapshot.taxable_earnings === 'number' ? (snapshot.taxable_earnings as number) : undefined,
        gross_earnings:
          typeof snapshot.gross_earnings === 'number' ? (snapshot.gross_earnings as number) : undefined,
        net_pay: typeof snapshot.net_pay === 'number' ? (snapshot.net_pay as number) : undefined,
      };

  return {
    tax_year: (snapshot.tax_year as string) ?? null,
    rule_version: (snapshot.rule_version as string) ?? null,
    calculation_version:
      (snapshot.calculation_version as string) ?? (snapshot.engine_version as string) ?? null,
    ytd,
  };
}

function formatPayslipCertificationBlock(data: PayslipDocumentData): string {
  const lines: string[] = [];
  if (data.tax_year) lines.push(`Tax Year: ${data.tax_year}`);
  if (data.rule_version) lines.push(`Rule Version: ${data.rule_version}`);
  if (data.calculation_version) lines.push(`Calculation Version: ${data.calculation_version}`);
  if (data.ytd) {
    const y = data.ytd;
    if (y.taxable_income != null) lines.push(`YTD Taxable: ${currency(y.taxable_income)}`);
    if (y.paye_paid != null) lines.push(`YTD PAYE: ${currency(y.paye_paid)}`);
    if (y.gross_earnings != null) lines.push(`YTD Gross: ${currency(y.gross_earnings)}`);
    if (y.net_pay != null) lines.push(`YTD Net: ${currency(y.net_pay)}`);
    if (y.periods_processed != null) lines.push(`YTD Periods: ${y.periods_processed}`);
  }
  return lines.join(' · ');
}

const EMPLOYER_KEYWORDS = ['uif employer', 'sdl', 'skills development', 'medical aid employer', 'provident employer', 'coida', 'employer contribution'];

export function classifyPayslipItems(items: PayslipItem[]) {
  const earnings = items.filter((i) => i.type === 'earning');
  const deductions = items.filter((i) => i.type === 'deduction' && !isEmployerContribution(i.description));
  const employerContributions = items.filter(
    (i) => i.type === 'employer_contribution' || (i.type === 'deduction' && isEmployerContribution(i.description))
  );
  return { earnings, deductions, employerContributions };
}

function isEmployerContribution(description: string): boolean {
  const lower = description.toLowerCase();
  return EMPLOYER_KEYWORDS.some((k) => lower.includes(k));
}

export function extractStatutoryTotals(items: PayslipItem[]) {
  const paye = items
    .filter((i) => {
      const d = i.description.toLowerCase();
      return d.includes('paye') || (d.includes('tax') && i.type === 'deduction');
    })
    .reduce((s, i) => s + i.amount, 0);
  const uif = items
    .filter((i) => i.description.toLowerCase().includes('uif'))
    .reduce((s, i) => s + i.amount, 0);
  const sdl = items
    .filter((i) => {
      const d = i.description.toLowerCase();
      return d.includes('sdl') || d.includes('skills development');
    })
    .reduce((s, i) => s + i.amount, 0);
  return { paye, uif, sdl };
}

export function computeEmployerCost(totalEarnings: number, employerContributions: PayslipItem[]): number {
  return totalEarnings + employerContributions.reduce((s, i) => s + i.amount, 0);
}

export function buildPayslipVerificationUrl(data: PayslipDocumentData): string {
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://adminless.fin';
  const params = new URLSearchParams({
    ref: data.audit_reference ?? data.payslip_id ?? 'unknown',
    run: data.payroll_run_id ?? '',
    emp: `${data.employee.first_name} ${data.employee.last_name}`,
    period: `${data.payPeriodStart}_${data.payPeriodEnd}`,
    net: String(data.net_pay),
  });
  return `${base}/payroll/verify?${params.toString()}`;
}

export function buildPayslipHtml(data: PayslipDocumentData, qrDataUrl?: string): string {
  const { earnings, deductions, employerContributions } = classifyPayslipItems(data.items);
  const statutory = extractStatutoryTotals(data.items);
  const employerCost = computeEmployerCost(data.total_earnings, employerContributions);
  const period = `${format(new Date(data.payPeriodStart), 'dd MMM yyyy')} – ${format(new Date(data.payPeriodEnd), 'dd MMM yyyy')}`;
  const auditRef = data.audit_reference ?? `PSL-${data.payslip_id?.slice(0, 8) ?? 'DRAFT'}`;

  const row = (label: string, amount: number) =>
    `<tr><td style="padding:6px 8px;">${label}</td><td style="padding:6px 8px;text-align:right;font-family:monospace;">${currency(amount)}</td></tr>`;

  const leaveSection = data.leave_balances
    ? `<h3>Leave Balances</h3>
       <table>
         ${data.leave_balances.annual != null ? row('Annual Leave', data.leave_balances.annual) : ''}
         ${data.leave_balances.sick != null ? row('Sick Leave', data.leave_balances.sick) : ''}
         ${data.leave_balances.family != null ? row('Family Responsibility', data.leave_balances.family) : ''}
       </table>`
    : '';

  const qrSection = qrDataUrl
    ? `<div style="text-align:center;margin-top:16px;"><img src="${qrDataUrl}" alt="Verification QR" width="80" height="80"/><p class="muted" style="font-size:10px;">Scan to verify payslip authenticity</p></div>`
    : '';

  const certBlock = formatPayslipCertificationBlock(data);
  const payment = hasPayslipPaymentDetails(data) ? getPayslipPaymentDetails(data) : null;
  const paymentSection = payment
    ? `<h3>Payment Information</h3>
       <table style="max-width:420px;">
         <tr><td style="padding:4px 8px;color:#666;">Payment Method</td><td style="padding:4px 8px;font-family:monospace;">${payment.payment_method}</td></tr>
         <tr><td style="padding:4px 8px;color:#666;">Bank Name</td><td style="padding:4px 8px;font-family:monospace;">${payment.bank_name}</td></tr>
         <tr><td style="padding:4px 8px;color:#666;">Account Number</td><td style="padding:4px 8px;font-family:monospace;">${payment.account_number}</td></tr>
         <tr><td style="padding:4px 8px;color:#666;">Branch Code</td><td style="padding:4px 8px;font-family:monospace;">${payment.branch_code}</td></tr>
         <tr><td style="padding:4px 8px;color:#666;">Payment Reference</td><td style="padding:4px 8px;font-family:monospace;">${payment.payment_reference}</td></tr>
       </table>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Payslip – ${data.employee.first_name} ${data.employee.last_name}</title>
<style>
  body { font-family: system-ui, sans-serif; color: #1a1a1a; margin: 0; padding: 24px; max-width: 800px; }
  h1 { font-size: 1.25rem; margin: 0 0 4px; color: #047857; }
  h3 { font-size: 0.8rem; text-transform: uppercase; color: #666; margin: 16px 0 8px; }
  .muted { color: #666; font-size: 0.875rem; white-space: pre-line; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th { text-align: left; background: #ecfdf5; padding: 8px; font-size: 0.75rem; text-transform: uppercase; color: #047857; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .net { background: #ecfdf5; padding: 12px; border-radius: 6px; font-size: 1.1rem; font-weight: bold; border-left: 4px solid #047857; }
  .statutory { background: #fafafa; padding: 12px; border-radius: 6px; margin-top: 12px; }
  .brand-bar { height: 4px; background: linear-gradient(90deg, #047857, #10b981); margin-bottom: 16px; }
  .employer-brand { display: flex; flex-direction: row; align-items: flex-start; gap: 16px; min-width: 0; }
  .employer-brand img { max-height: 48px; width: auto; flex-shrink: 0; display: block; }
  .employer-details { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  /* Place company name near the logo's vertical centre; address flows under the name. */
  .employer-brand:has(img) .employer-details { padding-top: 12px; }
  .employer-details h1 { margin: 0; line-height: 1.25; overflow-wrap: anywhere; }
  .employer-details .muted { margin: 0; }
  .employer-details .employer-tax { margin-top: 4px; }
  .generated-by { text-align:center; margin-top:36px; padding-top:12px; border-top:1px solid #e5e7eb; color:#9ca3af; font-size:10px; }
  .generated-by img { height:18px; width:18px; vertical-align:middle; margin:4px 6px; }
  @media print { body { padding: 0; } }
</style></head><body>
  <div class="brand-bar"></div>
  <div class="grid">
    <div class="employer-brand">
      ${data.companyLogoUrl ? `<img src="${data.companyLogoUrl}" alt="Company logo" />` : ''}
      <div class="employer-details">
        <h1>${data.companyName}</h1>
        ${data.companyAddress ? `<p class="muted">${data.companyAddress}</p>` : ''}
        ${data.companyTaxId ? `<p class="muted employer-tax">Tax ID: ${data.companyTaxId}</p>` : ''}
      </div>
    </div>
    <div style="text-align:right;">
      <h1>PAYSLIP</h1>
      <p class="muted">Pay Period: ${period}</p>
      <p class="muted">Pay Date: ${format(new Date(data.payDate), 'dd MMM yyyy')}</p>
      <p class="muted">Audit Ref: ${auditRef}</p>
      ${certBlock ? `<p class="muted">${certBlock}</p>` : ''}
    </div>
  </div>
  <hr/>
  <h3>Employee Details</h3>
  ${data.employee.employee_number ? `<p><strong>Employee No: ${data.employee.employee_number}</strong></p>` : ''}
  <p><strong>${data.employee.first_name} ${data.employee.last_name}</strong></p>
  ${data.employee.department ? `<p class="muted">Department: ${data.employee.department}</p>` : ''}
  ${data.employee.position ? `<p class="muted">Position: ${data.employee.position}</p>` : ''}
  ${data.employee.tax_number ? `<p class="muted">Tax No: ${data.employee.tax_number}</p>` : ''}
  ${data.employee.uif_number ? `<p class="muted">UIF No: ${data.employee.uif_number}</p>` : ''}
  <div class="grid">
    <div>
      <h3>Earnings</h3>
      <table>${earnings.map((i) => row(i.description, i.amount)).join('')}</table>
    </div>
    <div>
      <h3>Deductions</h3>
      <table>${deductions.length ? deductions.map((i) => row(i.description, i.amount)).join('') : '<tr><td colspan="2" class="muted">None</td></tr>'}</table>
    </div>
  </div>
  ${employerContributions.length ? `<h3>Employer Contributions</h3><table>${employerContributions.map((i) => row(i.description, i.amount)).join('')}</table>` : ''}
  <div class="statutory">
    <h3 style="margin-top:0">Statutory Summary</h3>
    <div class="grid">
      <p>PAYE: <strong>${currency(statutory.paye)}</strong></p>
      <p>UIF: <strong>${currency(statutory.uif)}</strong></p>
      <p>SDL: <strong>${currency(statutory.sdl)}</strong></p>
    </div>
  </div>
  ${leaveSection}
  <div class="grid" style="margin-top:16px;">
    <div>
      <p>Gross Earnings: <strong>${currency(data.total_earnings)}</strong></p>
      <p>Total Deductions: <strong>${currency(data.total_deductions)}</strong></p>
      <p>Employer Cost: <strong>${currency(employerCost)}</strong></p>
    </div>
    <div class="net">Net Salary: ${currency(data.net_pay)}</div>
  </div>
  ${paymentSection}
  ${qrSection}
  <div class="generated-by">
    <div>Generated by</div>
    <div><img src="${BRAND.assets.pwaIcon}" alt="${BRAND.product}" onerror="this.style.display='none'" /><span style="font-weight:600;color:#047857;">${BRAND.product}</span></div>
    <div style="margin-top:4px;">${auditRef}</div>
  </div>
</body></html>`;
}

export async function generatePayslipPdf(data: PayslipDocumentData): Promise<jsPDF> {
  const verificationUrl = buildPayslipVerificationUrl(data);
  let qrDataUrl: string | undefined;
  try {
    qrDataUrl = await QRCode.toDataURL(verificationUrl, { width: 80, margin: 1 });
  } catch {
    // QR is optional
  }

  const logo = await resolveCompanyLogo(data.companyLogoUrl);
  const brandLogo = await resolveAdminLessFinLogo();

  const { earnings, deductions, employerContributions } = classifyPayslipItems(data.items);
  const statutory = extractStatutoryTotals(data.items);
  const employerCost = computeEmployerCost(data.total_earnings, employerContributions);
  const auditRef = data.audit_reference ?? `PSL-${data.payslip_id?.slice(0, 8) ?? 'DRAFT'}`;
  const period = `${format(new Date(data.payPeriodStart), 'dd MMM yyyy')} - ${format(new Date(data.payPeriodEnd), 'dd MMM yyyy')}`;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const leftX = 14;
  // jspdf-autotable margin.right is distance FROM the right page edge, not an absolute X.
  const rightMargin = 14;
  const midGap = 4;
  const halfRightMargin = pageWidth / 2 + midGap; // used as right margin for left-column table
  const halfLeftMargin = pageWidth / 2 + midGap; // used as left margin for right-column table

  doc.setFillColor(...BRAND_GREEN);
  doc.rect(0, 0, pageWidth, 6, 'F');

  // Fixed logo column (size must not change) + company-details column beside it.
  const LOGO_SIZE_MM = 16;
  const LOGO_TOP_MM = 8;
  const LOGO_TEXT_GAP_MM = 6;
  const NAME_LINE_HEIGHT_MM = 6;
  const ADDR_LINE_HEIGHT_MM = 4.2;
  const NAME_TO_ADDRESS_GAP_MM = 5;
  const ADDRESS_TO_TAX_GAP_MM = 3.5;

  let logoDrawn = false;
  // Company logo only — AdminLess Fin branding belongs in the footer, never as a company substitute.
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, leftX, LOGO_TOP_MM, LOGO_SIZE_MM, LOGO_SIZE_MM);
      logoDrawn = true;
    } catch {
      logoDrawn = false;
    }
  }

  const textX = logoDrawn ? leftX + LOGO_SIZE_MM + LOGO_TEXT_GAP_MM : leftX;
  const companyTextMaxWidth = Math.max(40, LEFT_COL_MAX_WIDTH_MM - (textX - leftX));

  doc.setFontSize(16);
  const nameLines: string[] = doc.splitTextToSize(data.companyName, companyTextMaxWidth);
  doc.setFontSize(9);
  const addressLines: string[] = data.companyAddress
    ? doc.splitTextToSize(data.companyAddress, companyTextMaxWidth)
    : [];
  const taxLabel = data.companyTaxId ? `Tax ID: ${data.companyTaxId}` : null;
  const taxLines: string[] = taxLabel ? doc.splitTextToSize(taxLabel, companyTextMaxWidth) : [];

  // Vertically centre the company-name block on the logo; address/tax flow under the name.
  const logoCenterY = LOGO_TOP_MM + LOGO_SIZE_MM / 2;
  const logoBottom = logoDrawn ? LOGO_TOP_MM + LOGO_SIZE_MM : LOGO_TOP_MM;
  const nameBlockH = nameLines.length * NAME_LINE_HEIGHT_MM;
  let cursorY = logoDrawn
    ? logoCenterY - nameBlockH / 2 + NAME_LINE_HEIGHT_MM * 0.75
    : 14;

  doc.setFontSize(16);
  doc.setTextColor(...BRAND_GREEN);
  doc.text(nameLines, textX, cursorY);
  cursorY += nameLines.length * NAME_LINE_HEIGHT_MM;

  // Only company name / address / tax wrap — never table headers / labels / amounts.
  doc.setFontSize(9);
  doc.setTextColor(100);
  if (addressLines.length) {
    cursorY += NAME_TO_ADDRESS_GAP_MM;
    doc.text(addressLines, textX, cursorY);
    cursorY += addressLines.length * ADDR_LINE_HEIGHT_MM;
  }
  if (taxLines.length) {
    cursorY += addressLines.length ? ADDRESS_TO_TAX_GAP_MM : NAME_TO_ADDRESS_GAP_MM;
    doc.text(taxLines, textX, cursorY);
    cursorY += taxLines.length * ADDR_LINE_HEIGHT_MM;
  }

  const leftY = Math.max(cursorY, logoBottom);

  const rightX = pageWidth - rightMargin;
  doc.setFontSize(14);
  doc.setTextColor(...BRAND_GREEN);
  doc.text('PAYSLIP', rightX, 14, { align: 'right' });
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(`Period: ${period}`, rightX, 22, { align: 'right' });
  doc.text(`Pay Date: ${format(new Date(data.payDate), 'dd MMM yyyy')}`, rightX, 27, { align: 'right' });
  doc.text(`Audit Ref: ${auditRef}`, rightX, 32, { align: 'right' });

  const certBlock = formatPayslipCertificationBlock(data);
  let rightBottomY = 32;
  if (certBlock) {
    // Pre-split once; do not also pass maxWidth (would re-wrap).
    const certLines = doc.splitTextToSize(certBlock, 90);
    doc.text(certLines, rightX, 37, { align: 'right' });
    rightBottomY = 37 + certLines.length * 4.2;
  }

  let y = Math.max(leftY, rightBottomY) + 8;
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text('Employee Details', leftX, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.employee.first_name} ${data.employee.last_name}`, leftX, y);
  doc.setFont('helvetica', 'normal');
  y += 5;
  if (data.employee.employee_number) { doc.text(`Employee No: ${data.employee.employee_number}`, leftX, y); y += 5; }
  if (data.employee.department) { doc.text(`Department: ${data.employee.department}`, leftX, y); y += 5; }
  if (data.employee.tax_number) { doc.text(`Tax No: ${data.employee.tax_number}`, leftX, y); y += 5; }

  const tableCommon = {
    theme: 'striped' as const,
    headStyles: {
      fillColor: BRAND_GREEN,
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: 'bold' as const,
      // Keep headers on a single line — never character-wrap.
      overflow: 'ellipsize' as const,
    },
    styles: {
      fontSize: 9,
      cellPadding: 2,
      overflow: 'linebreak' as const,
      minCellWidth: 22,
    },
    columnStyles: {
      0: { cellWidth: 'auto' as const },
      1: { cellWidth: 28, halign: 'right' as const, overflow: 'ellipsize' as const },
    },
  };

  autoTable(doc, {
    startY: y + 2,
    head: [['Earnings', 'Amount']],
    body: earnings.map((i) => [i.description, currency(i.amount)]),
    ...tableCommon,
    margin: { left: leftX, right: halfRightMargin },
  });

  const earningsEndY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;

  autoTable(doc, {
    startY: y + 2,
    head: [['Deductions', 'Amount']],
    body: deductions.length
      ? deductions.map((i) => [i.description, currency(i.amount)])
      : [['None', currency(0)]],
    ...tableCommon,
    // CRITICAL: right margin must be edge inset (14), never absolute X (pageWidth - 14).
    margin: { left: halfLeftMargin, right: rightMargin },
  });

  let nextY = Math.max(
    earningsEndY,
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20
  ) + 6;

  if (employerContributions.length) {
    autoTable(doc, {
      startY: nextY,
      head: [['Employer Contributions', 'Amount']],
      body: employerContributions.map((i) => [i.description, currency(i.amount)]),
      theme: 'striped',
      headStyles: {
        fillColor: [100, 100, 100],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      styles: { fontSize: 9, cellPadding: 2, minCellWidth: 18 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 32, halign: 'right', overflow: 'ellipsize' },
      },
      margin: { left: leftX, right: rightMargin },
    });
    nextY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 20;
    nextY += 6;
  }

  autoTable(doc, {
    startY: nextY,
    head: [['Statutory', 'Amount']],
    body: [
      ['PAYE', currency(statutory.paye)],
      ['UIF', currency(statutory.uif)],
      ['SDL', currency(statutory.sdl)],
    ],
    theme: 'plain',
    headStyles: {
      fillColor: BRAND_GREEN_LIGHT,
      textColor: BRAND_GREEN,
      fontStyle: 'bold',
    },
    styles: { fontSize: 9, cellPadding: 2, minCellWidth: 18 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 32, halign: 'right', overflow: 'ellipsize' },
    },
    margin: { left: leftX, right: rightMargin },
  });
  nextY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 20;
  nextY += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(`Gross Earnings: ${currency(data.total_earnings)}`, leftX, nextY);
  doc.text(`Total Deductions: ${currency(data.total_deductions)}`, leftX, nextY + 6);
  doc.text(`Employer Cost: ${currency(employerCost)}`, leftX, nextY + 12);

  doc.setFillColor(...BRAND_GREEN_LIGHT);
  doc.roundedRect(pageWidth - 80, nextY - 4, 66, 18, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...BRAND_GREEN);
  doc.text(`Net Pay: ${currency(data.net_pay)}`, pageWidth - 47, nextY + 8, { align: 'center' });
  doc.setTextColor(0);

  if (hasPayslipPaymentDetails(data)) {
    const payment = getPayslipPaymentDetails(data);
    const paymentY = nextY + 22;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text('Payment Information', leftX, paymentY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60);
    const paymentRows: Array<[string, string]> = [
      ['Payment Method', payment.payment_method],
      ['Bank Name', payment.bank_name],
      ['Account Number', payment.account_number],
      ['Branch Code', payment.branch_code],
      ['Payment Reference', payment.payment_reference],
    ];
    let py = paymentY + 5;
    const labelWidth = 36;
    for (const [label, value] of paymentRows) {
      doc.setTextColor(120);
      doc.text(label, leftX, py);
      doc.setTextColor(40);
      doc.text(value, leftX + labelWidth, py);
      py += 4.2;
    }
  }

  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', pageWidth - 30, nextY + 20, 20, 20);
    doc.setFontSize(7);
    doc.setTextColor(100);
    doc.text('Verify', pageWidth - 20, nextY + 43, { align: 'center' });
  }

  // Subtle "Generated by AdminLess Fin" footer — software attribution only.
  const footerY = 278;
  doc.setDrawColor(230);
  doc.setLineWidth(0.2);
  doc.line(leftX, footerY - 4, pageWidth - rightMargin, footerY - 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text('Generated by', pageWidth / 2, footerY, { align: 'center' });

  const markSize = 6;
  const markX = pageWidth / 2 - 22;
  const markY = footerY + 2;
  let brandMarkDrawn = false;
  if (brandLogo) {
    try {
      doc.addImage(brandLogo.dataUrl, brandLogo.format, markX, markY, markSize, markSize);
      brandMarkDrawn = true;
    } catch {
      brandMarkDrawn = false;
    }
  }
  if (!brandMarkDrawn) {
    drawAdminLessFinMark(doc, markX, markY, markSize);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...BRAND_GREEN);
  doc.text(BRAND.product, pageWidth / 2 + 4, markY + 4.2, { align: 'left' });

  return doc;
}

export async function downloadPayslipPdf(data: PayslipDocumentData, filename: string) {
  const doc = await generatePayslipPdf(data);
  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

export function openPrintDocument(html: string, title = 'Document') {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.document.title = title;
  win.focus();
  setTimeout(() => win.print(), 300);
}

export async function downloadHtmlAsPdf(data: PayslipDocumentData, filename: string) {
  await downloadPayslipPdf(data, filename);
}

export type PayrollRegisterRow = {
  employee_number?: string;
  employee: string;
  department: string;
  gross_pay: number;
  deductions: number;
  paye?: number;
  uif?: number;
  sdl?: number;
  employer_contributions: number;
  net_salary: number;
  cost_to_company?: number;
  status: string;
};

export function downloadPayrollRegister(
  rows: PayrollRegisterRow[],
  runLabel: string,
  formatType: 'csv' | 'excel' = 'csv'
) {
  const data = rows.map((r) => ({
    'Employee Number': r.employee_number ?? '',
    Employee: r.employee,
    Department: r.department,
    'Gross Pay': r.gross_pay.toFixed(2),
    Deductions: r.deductions.toFixed(2),
    PAYE: (r.paye ?? 0).toFixed(2),
    UIF: (r.uif ?? 0).toFixed(2),
    SDL: (r.sdl ?? 0).toFixed(2),
    'Employer Contributions': r.employer_contributions.toFixed(2),
    'Net Salary': r.net_salary.toFixed(2),
    'Cost to Company': (r.cost_to_company ?? r.gross_pay + r.employer_contributions).toFixed(2),
    Status: r.status,
  }));
  const ext = formatType === 'excel' ? 'csv' : 'csv';
  downloadCSV(data, `payroll-register-${runLabel}.${ext}`);
}

export type PayrollRunSummaryReport = {
  employees_paid: number;
  total_gross: number;
  total_net: number;
  total_paye: number;
  total_uif: number;
  total_sdl?: number;
  total_pension: number;
  employer_contributions: number;
  payroll_cost: number;
  variance_previous: number | null;
  variance_budget: number | null;
  pay_period: string;
};

export function downloadPayrollSummaryReport(summary: PayrollRunSummaryReport, runLabel: string) {
  const data = [
    { Metric: 'Pay Period', Value: summary.pay_period },
    { Metric: 'Employees Paid', Value: String(summary.employees_paid) },
    { Metric: 'Total Gross', Value: summary.total_gross.toFixed(2) },
    { Metric: 'Total Net', Value: summary.total_net.toFixed(2) },
    { Metric: 'Total PAYE', Value: summary.total_paye.toFixed(2) },
    { Metric: 'Total UIF', Value: summary.total_uif.toFixed(2) },
    { Metric: 'Total SDL', Value: (summary.total_sdl ?? 0).toFixed(2) },
    { Metric: 'Total Pension', Value: summary.total_pension.toFixed(2) },
    { Metric: 'Employer Contributions', Value: summary.employer_contributions.toFixed(2) },
    { Metric: 'Payroll Cost', Value: summary.payroll_cost.toFixed(2) },
    { Metric: 'Variance vs Previous', Value: summary.variance_previous?.toFixed(2) ?? 'N/A' },
    { Metric: 'Variance vs Budget', Value: summary.variance_budget?.toFixed(2) ?? 'N/A' },
  ];
  downloadCSV(data, `payroll-summary-${runLabel}.csv`);
}

export function mapEmployeeToBankPaymentRow(input: {
  employee_name: string;
  net_pay: number;
  reference?: string;
  employee?: unknown;
  bank_name?: string | null;
  bank_branch_code?: string | null;
  bank_account_number?: string | null;
}): BankPaymentRow {
  const fromEmployee = extractEmployeeBankFields(input.employee);
  return {
    employee_name: input.employee_name,
    bank_name: fromEmployee.bank_name ?? (input.bank_name?.trim() || null),
    bank_branch_code: fromEmployee.bank_branch_code ?? (input.bank_branch_code?.trim() || null),
    bank_account_number: fromEmployee.bank_account_number ?? (input.bank_account_number?.trim() || null),
    net_pay: input.net_pay,
    reference: input.reference,
  };
}

export function buildBankPaymentFileContent(
  rows: BankPaymentRow[],
  runLabel: string,
  payDate: string,
  format: BankFileFormat = 'csv'
): string {
  const integrity = computeBankFileIntegrity(rows);
  const dateStamp = payDate.replace(/-/g, '');

  if (format === 'eft') {
    const header = `H|EFT|ADMINLESS|PAYROLL|${dateStamp}|${rows.length}|${integrity.control_hash}`;
    const lines = rows.map((r, idx) => {
      const account = (r.bank_account_number ?? '').replace(/\s/g, '');
      const branch = (r.bank_branch_code ?? '').replace(/\s/g, '');
      const amount = Math.round(r.net_pay * 100).toString().padStart(12, '0');
      const name = r.employee_name.slice(0, 30).toUpperCase();
      const ref = (r.reference ?? `PAY-${runLabel}`).slice(0, 20);
      return `D|${String(idx + 1).padStart(4, '0')}|${account}|${branch}|${amount}|${name}|${ref}|${dateStamp}`;
    });
    const trailer = `T|${rows.length}|${integrity.total_cents.toString().padStart(14, '0')}|${integrity.control_hash}`;
    return [header, ...lines, trailer].join('\n');
  }

  const header = 'Employee Name,Bank Name,Branch Code,Account Number,Amount,Reference,Payment Date';
  const lines = rows.map((r) =>
    [
      `"${r.employee_name}"`,
      `"${r.bank_name ?? ''}"`,
      `"${r.bank_branch_code ?? ''}"`,
      `"${r.bank_account_number ?? ''}"`,
      r.net_pay.toFixed(2),
      `"${r.reference ?? `PAY-${runLabel}`}"`,
      payDate,
    ].join(',')
  );
  const footer = [
    `# CONTROL: records=${integrity.record_count}`,
    `# CONTROL: total=${integrity.total_amount.toFixed(2)}`,
    `# CONTROL: hash=${integrity.control_hash}`,
    `# CONTROL: verified=${integrity.verified}`,
  ];
  return [header, ...lines, ...footer].join('\n');
}

export function downloadBankPaymentFile(
  rows: BankPaymentRow[],
  runLabel: string,
  payDate: string,
  format: BankFileFormat = 'csv'
) {
  const content = buildBankPaymentFileContent(rows, runLabel, payDate, format);
  const ext = format === 'eft' ? 'eft' : 'csv';
  const blob = new Blob([UTF8_BOM + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bank-payment-${runLabel}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildRegisterHtml(
  companyName: string,
  runLabel: string,
  rows: PayrollRegisterRow[],
  totals: {
    gross: number;
    deductions: number;
    paye: number;
    uif: number;
    sdl: number;
    employer: number;
    net: number;
    cost: number;
  }
): string {
  const header = `<tr><th>Emp. No.</th><th>Employee</th><th>Dept</th><th>Gross</th><th>Deductions</th><th>PAYE</th><th>UIF</th><th>SDL</th><th>Employer</th><th>Net</th><th>CTC</th><th>Status</th></tr>`;
  const body = rows
    .map(
      (r) =>
        `<tr><td>${r.employee_number ?? ''}</td><td>${r.employee}</td><td>${r.department}</td><td style="text-align:right">${currency(r.gross_pay)}</td><td style="text-align:right">${currency(r.deductions)}</td><td style="text-align:right">${currency(r.paye ?? 0)}</td><td style="text-align:right">${currency(r.uif ?? 0)}</td><td style="text-align:right">${currency(r.sdl ?? 0)}</td><td style="text-align:right">${currency(r.employer_contributions)}</td><td style="text-align:right">${currency(r.net_salary)}</td><td style="text-align:right">${currency(r.cost_to_company ?? r.gross_pay + r.employer_contributions)}</td><td>${r.status}</td></tr>`
    )
    .join('');
  return `<!DOCTYPE html><html><head><title>Payroll Register</title>
<style>body{font-family:system-ui,sans-serif;padding:24px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:6px}th{background:#0f4c81;color:#fff}</style></head>
<body><h1>${companyName}</h1><h2>Payroll Register — ${runLabel}</h2>
<table><thead>${header}</thead><tbody>${body}</tbody>
<tfoot><tr><td colspan="3"><strong>Totals</strong></td><td style="text-align:right"><strong>${currency(totals.gross)}</strong></td><td style="text-align:right"><strong>${currency(totals.deductions)}</strong></td><td style="text-align:right"><strong>${currency(totals.paye)}</strong></td><td style="text-align:right"><strong>${currency(totals.uif)}</strong></td><td style="text-align:right"><strong>${currency(totals.sdl)}</strong></td><td style="text-align:right"><strong>${currency(totals.employer)}</strong></td><td style="text-align:right"><strong>${currency(totals.net)}</strong></td><td style="text-align:right"><strong>${currency(totals.cost)}</strong></td><td></td></tr></tfoot>
</table></body></html>`;
}

export const BANK_BATCH_STATUS_LABELS: Record<BankBatchStatus, string> = {
  generated: 'Generated',
  downloaded: 'Downloaded',
  submitted: 'Submitted to Bank',
  paid: 'Paid',
};

export function nextBankBatchStatus(current: BankBatchStatus | undefined): BankBatchStatus | null {
  const flow: BankBatchStatus[] = ['generated', 'downloaded', 'submitted', 'paid'];
  if (!current) return 'generated';
  const idx = flow.indexOf(current);
  return idx < flow.length - 1 ? flow[idx + 1] : null;
}
