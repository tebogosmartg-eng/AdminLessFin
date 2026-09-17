/**
 * The statement of account, as a document.
 *
 * One model serves both sides. A customer statement and a supplier statement
 * are the same instrument read from opposite ends -- opening balance, the
 * movements in the period, closing balance -- and they differ only in wording
 * and in which way round a debit moves the balance. Writing them once means
 * the customer-facing one cannot quietly fall behind the supplier one, which
 * is how it came to have no PDF at all while the supplier side had one.
 *
 * THE DEFECT THIS FOLLOWS. Until 2026-09-16 both statements opened at 0.00
 * whatever the party owed: the edge function summed every line of their
 * journals rather than the control-account lines, and a balanced journal nets
 * to zero by construction. Every running balance and every closing balance on
 * every statement ever emailed was therefore wrong. The server now reports the
 * control-account figures, and this module's job is to not re-derive them: the
 * running balance is accumulated from the opening balance the ledger gave, and
 * `reconciles` says plainly whether the movements add up to the closing
 * balance the ledger gave.
 */
import {
  asNumber,
  asText,
  bankingFromAccount,
  companyFromMaster,
  letterheadLines,
  partyLines,
  round2,
  type DocumentBanking,
  type DocumentCompany,
  type DocumentParty,
} from '@/lib/documents/paperTheme';

export type StatementSide = 'receivable' | 'payable';

export type RawStatementLine = {
  id?: string;
  date: string;
  description?: string | null;
  invoice_number?: string | null;
  credit_note_number?: string | null;
  bill_number?: string | null;
  /** 'invoice' | 'payment' on the receivable side, 'bill' | 'payment' on the payable side. */
  type: string;
  amount: number | string;
};

export type RawStatementDocument = {
  side: StatementSide;
  party: {
    name?: string | null;
    contact_name?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
    tax_id?: string | null;
  } | null;
  dateFrom: string;
  dateTo: string;
  opening_balance?: number | null;
  closing_balance?: number | null;
  opening_balance_known?: boolean;
  statement?: RawStatementLine[] | null;
  ageing?: {
    current?: number; days_1_30?: number; days_31_60?: number;
    days_61_90?: number; days_120_plus?: number; total?: number;
  } | null;
  company?: {
    name?: string | null; logo_url?: string | null;
    address?: string | null; tax_id?: string | null;
  } | null;
  master?: {
    company_profile?: Record<string, unknown> | null;
    addresses?: Record<string, unknown> | null;
    tax_registrations?: Record<string, unknown> | null;
  } | null;
  banking?: {
    name?: string | null; bank_name?: string | null; account_number?: string | null;
    branch_code?: string | null; account_type?: string | null; currency?: string | null;
  } | null;
};

export type StatementDocumentLine = {
  date: string;
  description: string;
  reference: string;
  /** What it did to the balance: raised it, or reduced it. */
  direction: 'charge' | 'credit';
  amount: number;
  /** The balance after this line. */
  balance: number;
};

export type StatementDocumentModel = {
  side: StatementSide;
  /** The wording that differs between the two sides. */
  wording: {
    title: string;
    party: string;
    chargeColumn: string;
    creditColumn: string;
    closingLabel: string;
    settleWording: string;
  };
  company: DocumentCompany;
  party: DocumentParty;
  dateFrom: string;
  dateTo: string;
  openingBalance: number;
  closingBalance: number;
  /** False when the chart has no control account, so no balance can be derived. */
  balanceKnown: boolean;
  lines: StatementDocumentLine[];
  totalCharges: number;
  totalCredits: number;
  /** Whether opening + movements actually equals the closing balance reported. */
  reconciles: boolean;
  letterheadLines: string[];
  partyLines: string[];
  banking: DocumentBanking | null;
  ageing: {
    current: number; days_1_30: number; days_31_60: number;
    days_61_90: number; days_120_plus: number; total: number;
  } | null;
};

const WORDING: Record<StatementSide, StatementDocumentModel['wording']> = {
  receivable: {
    title: 'STATEMENT OF ACCOUNT',
    party: 'Account of',
    chargeColumn: 'Invoiced',
    // Payments and credit notes both reduce the balance, and a credit note is
    // not money received.
    creditColumn: 'Credits',
    closingLabel: 'Balance due',
    settleWording: 'Please settle the balance due using the banking details below.',
  },
  payable: {
    title: 'SUPPLIER STATEMENT',
    party: 'Supplier',
    chargeColumn: 'Billed',
    creditColumn: 'Paid',
    closingLabel: 'Balance outstanding',
    settleWording: 'This statement is of amounts owed by us to the supplier named above.',
  },
};

/** A line raises the balance when it is the document that creates the debt. */
function directionOf(side: StatementSide, type: string): 'charge' | 'credit' {
  const raises = side === 'receivable' ? 'invoice' : 'bill';
  return asText(type) === raises ? 'charge' : 'credit';
}

export function buildStatementDocument(raw: RawStatementDocument): StatementDocumentModel {
  const side = raw.side;
  const openingBalance = round2(asNumber(raw.opening_balance));

  // The running balance is accumulated here rather than trusted per row,
  // because it is the one figure a reader checks by hand.
  let running = openingBalance;
  const lines: StatementDocumentLine[] = (raw.statement ?? []).map((row) => {
    const direction = directionOf(side, row.type);
    const amount = round2(asNumber(row.amount));
    running = round2(running + (direction === 'charge' ? amount : -amount));
    return {
      date: asText(row.date),
      description:
        asText(row.description) ||
        (direction === 'charge' ? 'Charge' : asText(row.credit_note_number) ? 'Credit note' : 'Payment received'),
      reference: asText(row.invoice_number) || asText(row.credit_note_number) || asText(row.bill_number) || '-',
      direction,
      amount,
      balance: running,
    };
  });

  const totalCharges = round2(
    lines.filter((l) => l.direction === 'charge').reduce((t, l) => t + l.amount, 0),
  );
  const totalCredits = round2(
    lines.filter((l) => l.direction === 'credit').reduce((t, l) => t + l.amount, 0),
  );

  // The server states the closing balance from the control account. Where it
  // does not, the accumulated running balance stands in -- but the two are
  // compared rather than silently merged, because a statement whose lines do
  // not add up to its own total is the thing a customer will notice first.
  const reportedClosing = raw.closing_balance == null ? null : round2(asNumber(raw.closing_balance));
  const closingBalance = reportedClosing ?? running;
  const reconciles = Math.abs(running - closingBalance) < 0.005;

  const company = companyFromMaster(raw.master, raw.company);
  const partyRow = raw.party ?? {};
  const party: DocumentParty = {
    name: asText(partyRow.name) || (side === 'receivable' ? 'Customer' : 'Supplier'),
    contactName: asText(partyRow.contact_name),
    address: asText(partyRow.address),
    email: asText(partyRow.email),
    phone: asText(partyRow.phone),
    taxId: asText(partyRow.tax_id),
  };

  const a = raw.ageing;
  return {
    side,
    wording: WORDING[side],
    company,
    party,
    dateFrom: asText(raw.dateFrom),
    dateTo: asText(raw.dateTo),
    openingBalance,
    closingBalance,
    balanceKnown: raw.opening_balance_known !== false,
    lines,
    totalCharges,
    totalCredits,
    reconciles,
    letterheadLines: letterheadLines(company),
    partyLines: partyLines(party),
    // A supplier statement is not an invitation to pay us, so it carries no
    // banking panel; the customer one does.
    banking:
      side === 'receivable'
        ? bankingFromAccount(raw.banking, company.name, asText(party.name))
        : null,
    ageing: a
      ? {
          current: asNumber(a.current),
          days_1_30: asNumber(a.days_1_30),
          days_31_60: asNumber(a.days_31_60),
          days_61_90: asNumber(a.days_61_90),
          days_120_plus: asNumber(a.days_120_plus),
          total: asNumber(a.total),
        }
      : null,
  };
}

/**
 * What to call the headline figure.
 *
 * "Balance due" over a credit balance asks for money the party does not owe,
 * which is the one thing a statement must never do.
 */
export function headlineLabel(model: StatementDocumentModel): string {
  if (!model.balanceKnown) return 'Balance';
  if (model.closingBalance < 0) return model.side === 'receivable' ? 'In credit' : 'In debit';
  if (model.closingBalance === 0) return 'Nothing outstanding';
  return model.wording.closingLabel;
}

/** What the closing balance means in words, including when it is in credit. */
export function closingWording(model: StatementDocumentModel): string {
  if (!model.balanceKnown) {
    return model.side === 'receivable'
      ? 'No trade receivable control account is classified in the chart of accounts, so a balance cannot be stated.'
      : 'No trade payable control account is classified in the chart of accounts, so a balance cannot be stated.';
  }
  if (model.closingBalance === 0) return 'Nothing is outstanding on this account.';
  if (model.closingBalance < 0) {
    return model.side === 'receivable'
      ? 'This account is in credit. No payment is due.'
      : 'This supplier account is in debit.';
  }
  return model.wording.settleWording;
}
