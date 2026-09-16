/**
 * The look of a document that leaves the company.
 *
 * Invoices and quotations are the same piece of stationery with different
 * words on it, so they share one palette, one set of formatters and one
 * masthead rather than two that drift apart. Anything a customer receives
 * should be recognisably from the same company.
 *
 * The palette is fixed, not themed. A document is a preview of paper: showing
 * an operator a dark invoice their customer will never receive is worse than
 * ignoring the theme. Both halves below are the SAME colours -- RGB triples for
 * jsPDF, hex for CSS -- derived from the emerald design tokens in globals.css:
 *
 *   --primary  hsl(163 94% 24%)  emerald-700 — the masthead, rules, totals bar
 *   --accent   hsl(160 84% 39%)  emerald-500 — the headline figure panel
 */

export type RGB = [number, number, number];

export const PAPER_RGB = {
  brand: [4, 119, 86] as RGB,
  brandBright: [16, 183, 127] as RGB,
  /** emerald-50, for panel fills that must stay readable under black text. */
  tint: [236, 250, 244] as RGB,
  ink: [26, 24, 22] as RGB,
  muted: [118, 113, 107] as RGB,
  hairline: [226, 222, 216] as RGB,
  zebra: [250, 249, 247] as RGB,
  panel: [252, 251, 249] as RGB,
  paper: [255, 255, 255] as RGB,
  alarm: [178, 44, 44] as RGB,
} as const;

export const PAPER = {
  brand: '#047756',
  brandBright: '#10b77f',
  tint: '#ecfaf4',
  ink: '#1a1816',
  muted: '#76716b',
  hairline: '#e2ded8',
  zebra: '#faf9f7',
  panel: '#fcfbf9',
  paper: '#ffffff',
  alarm: '#b22c2c',
} as const;

export const PAPER_MARGIN = 42;
export const PAPER_BAND_HEIGHT = 108;

/**
 * "R 1 234,56" with ordinary spaces.
 *
 * Intl's en-ZA groups with a non-breaking space, which jsPDF's built-in WinAnsi
 * fonts render as a hollow box. Both renderers use this one so the screen and
 * the file show the same string, not two conventions.
 */
export function money(n: number): string {
  const v = Number(n) || 0;
  const sign = v < 0 ? '-' : '';
  const [whole, cents] = Math.abs(v).toFixed(2).split('.');
  return `${sign}R ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${cents}`;
}

/** A quantity, without the trailing zeros that make a whole number look priced. */
export function qty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4)));
}

export function day(iso: string): string {
  if (!iso) return '-';
  const parsed = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return Number.isNaN(parsed.getTime())
    ? iso
    : parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Today as a local YYYY-MM-DD, so a document's date logic is testable. */
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Whole days between two ISO days, or null when `from` is not before `to`.
 * Taken against a caller-supplied "today" so a document is reproducible rather
 * than dependent on when it happens to be rendered.
 */
export function daysBetween(from: string, to: string): number | null {
  if (!from || !to || from >= to) return null;
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** "Invoice_INV-00042.pdf" — safe on every filesystem the browser may save to. */
export function documentFileName(kind: string, reference: string): string {
  const stem = String(reference).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return `${kind}_${stem || 'document'}.pdf`;
}

/** PostgREST returns a to-one embed as an object and a to-many as an array. */
export function relatedOne<T>(value: T | T[] | null | undefined): T | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export const asText = (v: unknown): string => (v == null ? '' : String(v).trim());

export const asNumber = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** The company letterhead, as the lines that are actually present. */
export function letterheadLines(company: {
  address?: string;
  registrationNumber?: string;
  vatNumber?: string;
  email?: string;
  phone?: string;
  website?: string;
}): string[] {
  return [
    ...(company.address ? company.address.split(/\r?\n/) : []),
    company.registrationNumber ? `Reg. no. ${company.registrationNumber}` : '',
    company.vatNumber ? `VAT no. ${company.vatNumber}` : '',
    company.email ?? '',
    company.phone ?? '',
    company.website ?? '',
  ]
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * The customer block, as the lines that are actually present.
 * An empty result is meaningful: the document says the details are not on
 * file rather than printing an empty box that reads as a rendering fault.
 */
export function partyLines(party: {
  contactName?: string;
  address?: string;
  email?: string;
  phone?: string;
  taxId?: string;
}): string[] {
  return [
    party.contactName ? `Attn: ${party.contactName}` : '',
    ...(party.address ? party.address.split(/\r?\n/) : []),
    party.email ?? '',
    party.phone ?? '',
    party.taxId ? `VAT no. ${party.taxId}` : '',
  ]
    .map((l) => l.trim())
    .filter(Boolean);
}

export type DocumentCompany = {
  name: string;
  address: string;
  email: string;
  phone: string;
  website: string;
  registrationNumber: string;
  vatNumber: string;
  taxId: string;
  logoUrl: string | null;
};

export type DocumentParty = {
  name: string;
  contactName: string;
  address: string;
  email: string;
  phone: string;
  taxId: string;
};

export type DocumentBanking = {
  accountName: string;
  bankName: string | null;
  accountNumber: string | null;
  branchCode: string | null;
  accountType: string | null;
  currency: string | null;
  /** What the customer should quote on the transfer so the receipt can be matched. */
  reference: string;
  /** True when the account exists but nobody has captured the number to pay into. */
  incomplete: boolean;
};

/** Company identity from master data, falling back to the companies row. */
export function companyFromMaster(
  master: {
    company_profile?: Record<string, unknown> | null;
    addresses?: Record<string, unknown> | null;
    tax_registrations?: Record<string, unknown> | null;
  } | null | undefined,
  row: { name?: string | null; address?: string | null; tax_id?: string | null; logo_url?: string | null } | null | undefined,
): DocumentCompany {
  const profile = master?.company_profile ?? {};
  const addresses = master?.addresses ?? {};
  const tax = master?.tax_registrations ?? {};
  return {
    name:
      asText(profile.registered_name) ||
      asText(profile.trading_name) ||
      asText(row?.name) ||
      'Your Company',
    address:
      asText(addresses.business_address) ||
      asText(addresses.registered_office) ||
      asText(addresses.physical_address) ||
      asText(addresses.postal_address) ||
      asText(row?.address),
    email: asText(addresses.email),
    phone: asText(addresses.telephone),
    website: asText(addresses.website),
    registrationNumber: asText(profile.registration_number),
    vatNumber: asText(tax.vat_number),
    taxId: asText(tax.income_tax_number) || asText(row?.tax_id),
    logoUrl: asText(row?.logo_url) || null,
  };
}

/** The account a customer is asked to pay into, or null when none is nominated. */
export function bankingFromAccount(
  bank: {
    name?: string | null;
    bank_name?: string | null;
    account_number?: string | null;
    branch_code?: string | null;
    account_type?: string | null;
    currency?: string | null;
  } | null | undefined,
  companyName: string,
  reference: string,
): DocumentBanking | null {
  if (!bank) return null;
  return {
    accountName: asText(bank.name) || companyName,
    bankName: asText(bank.bank_name) || null,
    accountNumber: asText(bank.account_number) || null,
    branchCode: asText(bank.branch_code) || null,
    accountType: asText(bank.account_type) || null,
    currency: asText(bank.currency) || null,
    reference,
    incomplete: !asText(bank.account_number) || !asText(bank.bank_name),
  };
}

/** What the banking panel says when there is nothing to print. */
export function bankingUnavailableMessage(banking: DocumentBanking | null): string {
  return banking
    ? 'This company has a default bank account but its bank name and account number have not been captured, so they cannot be printed. Add them under Banking to have them appear on every document.'
    : 'No default bank account has been nominated, so there are no banking details to print. Set one under Banking to have them appear on every document.';
}
