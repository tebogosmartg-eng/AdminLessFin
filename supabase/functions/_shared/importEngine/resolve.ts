/**
 * Reference resolution: match the names, codes and numbers in a file to the
 * company's existing records. Matching is case- and punctuation-insensitive,
 * and an ambiguous match is an explicit error — never a silent guess.
 */

import { matchKey, normNumber } from './normalize.ts';
import type {
  AccountRef,
  BankAccountRef,
  BillRef,
  PartyRef,
  ProductRef,
  ReferenceData,
  TaxRateRef,
} from './types.ts';

export type Resolution<T> =
  | { kind: 'found'; value: T }
  | { kind: 'missing' }
  | { kind: 'ambiguous'; candidates: string[] };

function buildIndex<T>(items: T[], keyOf: (item: T) => string | null): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const item of items) {
    const raw = keyOf(item);
    if (raw == null) continue;
    const key = matchKey(String(raw));
    if (!key) continue;
    const list = index.get(key);
    if (list) list.push(item);
    else index.set(key, [item]);
  }
  return index;
}

function fromIndex<T>(index: Map<string, T[]>, value: string, describe: (item: T) => string): Resolution<T> | null {
  const hits = index.get(matchKey(value));
  if (!hits || hits.length === 0) return null;
  if (hits.length === 1) return { kind: 'found', value: hits[0] };
  return { kind: 'ambiguous', candidates: hits.slice(0, 5).map(describe) };
}

export class Resolver {
  private accountsByCode: Map<string, AccountRef[]>;
  private accountsByName: Map<string, AccountRef[]>;
  private accountsByNumber: Map<string, AccountRef[]>;
  private customersByName: Map<string, PartyRef[]>;
  private customersByEmail: Map<string, PartyRef[]>;
  private vendorsByName: Map<string, PartyRef[]>;
  private vendorsByEmail: Map<string, PartyRef[]>;
  private productsBySku: Map<string, ProductRef[]>;
  private productsByName: Map<string, ProductRef[]>;
  private taxByName: Map<string, TaxRateRef[]>;
  private bankByName: Map<string, BankAccountRef[]>;
  private projectsByName: Map<string, { id: string; name: string }[]>;
  readonly refs: ReferenceData;

  constructor(refs: ReferenceData) {
    this.refs = refs;
    this.accountsByCode = buildIndex(refs.accounts, a => a.account_code);
    this.accountsByName = buildIndex(refs.accounts, a => a.name);
    this.accountsByNumber = buildIndex(refs.accounts, a =>
      a.account_number == null ? null : String(a.account_number));
    this.customersByName = buildIndex(refs.customers, c => c.name);
    this.customersByEmail = buildIndex(refs.customers, c => c.email);
    this.vendorsByName = buildIndex(refs.vendors, v => v.name);
    this.vendorsByEmail = buildIndex(refs.vendors, v => v.email);
    this.productsBySku = buildIndex(refs.products, p => p.sku);
    this.productsByName = buildIndex(refs.products, p => p.name);
    this.taxByName = buildIndex(refs.taxRates, t => t.name);
    this.bankByName = buildIndex(refs.bankAccounts, b => b.account_name);
    this.projectsByName = buildIndex(refs.projects, p => p.name);
  }

  /** Code first, then exact name, then account number. */
  account(value: string): Resolution<AccountRef> {
    const describe = (a: AccountRef) =>
      `${a.name}${a.account_code ? ` (${a.account_code})` : a.account_number != null ? ` (#${a.account_number})` : ''}`;
    return (
      fromIndex(this.accountsByCode, value, describe) ??
      fromIndex(this.accountsByName, value, describe) ??
      fromIndex(this.accountsByNumber, value, describe) ?? { kind: 'missing' }
    );
  }

  accountByRole(role: string): AccountRef | null {
    const hits = this.refs.accounts.filter(a => a.account_role === role && a.is_active);
    return hits.length === 1 ? hits[0] : hits[0] ?? null;
  }

  customer(value: string): Resolution<PartyRef> {
    const describe = (c: PartyRef) => (c.email ? `${c.name} <${c.email}>` : c.name);
    return (
      fromIndex(this.customersByName, value, describe) ??
      fromIndex(this.customersByEmail, value, describe) ?? { kind: 'missing' }
    );
  }

  vendor(value: string): Resolution<PartyRef> {
    const describe = (v: PartyRef) => (v.email ? `${v.name} <${v.email}>` : v.name);
    return (
      fromIndex(this.vendorsByName, value, describe) ??
      fromIndex(this.vendorsByEmail, value, describe) ?? { kind: 'missing' }
    );
  }

  product(value: string): Resolution<ProductRef> {
    const describe = (p: ProductRef) => (p.sku ? `${p.name} [${p.sku}]` : p.name);
    return (
      fromIndex(this.productsBySku, value, describe) ??
      fromIndex(this.productsByName, value, describe) ?? { kind: 'missing' }
    );
  }

  /** A tax rate name, or a bare percentage ("15", "15%", "0.15" is NOT accepted). */
  taxRate(value: string): Resolution<TaxRateRef> {
    const byName = fromIndex(this.taxByName, value, t => `${t.name} (${t.rate}%)`);
    if (byName) return byName;
    const numeric = normNumber(value.replace(/%\s*$/, ''));
    if (numeric == null) return { kind: 'missing' };
    const hits = this.refs.taxRates.filter(t => Math.abs(t.rate - numeric) < 0.0001);
    if (hits.length === 1) return { kind: 'found', value: hits[0] };
    if (hits.length > 1) return { kind: 'ambiguous', candidates: hits.slice(0, 5).map(t => `${t.name} (${t.rate}%)`) };
    return { kind: 'missing' };
  }

  bankAccount(value: string): Resolution<BankAccountRef> {
    return fromIndex(this.bankByName, value, b => b.account_name) ?? { kind: 'missing' };
  }

  project(value: string): Resolution<{ id: string; name: string }> {
    return fromIndex(this.projectsByName, value, p => p.name) ?? { kind: 'missing' };
  }

  invoiceByNumber(value: string): { id: string; customer_id: string; invoice_number: string } | null {
    const key = matchKey(value);
    const hit = this.refs.invoices.find(i => matchKey(i.invoice_number) === key);
    return hit ?? null;
  }

  billByNumber(value: string): BillRef | null {
    const key = matchKey(value);
    const hit = this.refs.bills.find(b => b.bill_number != null && matchKey(b.bill_number) === key);
    return hit ?? null;
  }

  /** The GL accounts of the company's bank accounts (for opening-balance routing). */
  bankLinkedAccountIds(): Set<string> {
    return new Set(
      this.refs.bankAccounts
        .map(b => b.chart_of_account_id)
        .filter((id): id is string => id != null),
    );
  }
}
