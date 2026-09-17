/**
 * The invoice as the customer will see it, on screen.
 *
 * Built from the same document model as the PDF so the two cannot drift: what
 * is reviewed here is what gets sent.
 *
 * It does NOT follow the app's light/dark theme, which is deliberate. This is a
 * preview of a piece of paper, and the paper is white with the AdminLess
 * emerald on it whatever the reviewer has their screen set to. Rendering it in
 * dark mode would show the operator a document their customer will never
 * receive. The palette below is therefore fixed, and is the same one
 * invoicePdf.ts draws with -- both derive from the emerald design tokens in
 * globals.css.
 */
import { CompanyLogo } from '@/components/brand';
import { PAPER, day, money, qty, bankingUnavailableMessage } from '@/lib/documents/paperTheme';
import { daysOverdue, settlementProgress, type InvoiceDocumentModel } from '@/lib/invoices/invoiceDocument';
import { AlertTriangle, Landmark } from 'lucide-react';

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <dt style={{ color: PAPER.muted }}>{label}</dt>
      <dd className={`tabular-nums ${bold ? 'font-bold' : 'font-semibold'}`} style={{ color: PAPER.ink }}>
        {value}
      </dd>
    </div>
  );
}

export default function InvoiceDocumentView({
  model,
  today,
}: {
  model: InvoiceDocumentModel;
  today?: string;
}) {
  const settled = model.settled;
  const overdueBy = model.isOverdue
    ? daysOverdue(model.dueDate, today ?? new Date().toISOString().slice(0, 10))
    : null;
  const showUnits = model.lines.some((l) => l.quantity != null);
  const identity = [
    model.company.name,
    model.company.registrationNumber ? `Reg. no. ${model.company.registrationNumber}` : '',
    model.company.vatNumber ? `VAT no. ${model.company.vatNumber}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <article
      className={`overflow-hidden rounded-xl shadow-sm ring-1 print:rounded-none print:shadow-none ${
        model.isVoid ? 'opacity-60' : ''
      }`}
      style={{
        background: PAPER.paper,
        color: PAPER.ink,
        // @ts-expect-error -- CSS custom property, not a typed React style key
        '--tw-ring-color': PAPER.hairline,
        colorScheme: 'light',
        printColorAdjust: 'exact',
        WebkitPrintColorAdjust: 'exact',
      }}
    >
      <header
        className="flex flex-wrap items-center justify-between gap-6 px-8 py-7"
        style={{
          background: PAPER.brand,
          color: PAPER.paper,
          borderBottom: `4px solid ${PAPER.brandBright}`,
        }}
      >
        <div className="rounded-lg px-5 py-3" style={{ background: PAPER.paper }}>
          <CompanyLogo src={model.company.logoUrl} className="h-16 w-auto max-w-[200px]" />
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tracking-tight">INVOICE</p>
          <p className="text-sm opacity-90">{model.number}</p>
        </div>
      </header>

      <div className="space-y-7 px-8 py-7">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-base font-semibold">{model.company.name}</p>
            <div className="mt-1 space-y-0.5 text-sm" style={{ color: PAPER.muted }}>
              {model.fromLines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
          <dl className="space-y-1.5 text-sm">
            <Row label="Invoice date" value={day(model.invoiceDate)} />
            <Row label="Due date" value={day(model.dueDate)} />
            {model.customer.paymentTerms != null && (
              <Row label="Payment terms" value={`${model.customer.paymentTerms} days`} />
            )}
            <Row label="Status" value={model.statusLabel} />
            {overdueBy != null && overdueBy > 0 && (
              <p className="text-right text-sm font-bold" style={{ color: PAPER.alarm }}>
                {overdueBy} day{overdueBy === 1 ? '' : 's'} overdue
              </p>
            )}
          </dl>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <section
            className="rounded-lg p-5"
            style={{ background: PAPER.tint, border: `1px solid ${PAPER.hairline}` }}
          >
            <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: PAPER.brand }}>
              Bill to
            </h2>
            <p className="mt-2 text-base font-semibold">{model.customer.name}</p>
            <div className="mt-1 space-y-0.5 text-sm" style={{ color: PAPER.muted }}>
              {model.billToLines.length === 0 ? (
                <p>No address or contact details are on file for this customer.</p>
              ) : (
                model.billToLines.map((line, i) => <p key={i}>{line}</p>)
              )}
            </div>
          </section>

          <section
            className="rounded-lg p-5"
            style={{ background: settled ? PAPER.brand : PAPER.brandBright, color: PAPER.paper }}
          >
            <h2 className="text-xs font-bold uppercase tracking-wider">
              {settled ? model.settledLabel : 'Amount due'}
            </h2>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {money(settled ? model.total : model.amountDue)}
            </p>
            {settled ? (
              <p className="mt-2 text-sm opacity-90">No payment is due on this invoice.</p>
            ) : (
              <div className="mt-2 space-y-0.5 text-sm opacity-90">
                <p>Due {day(model.dueDate)}</p>
                {settlementProgress(model) && <p>{settlementProgress(model)}</p>}
              </div>
            )}
          </section>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] border-collapse text-sm">
            <thead>
              <tr
                className="text-left text-xs uppercase tracking-wider"
                style={{ background: PAPER.brand, color: PAPER.paper }}
              >
                <th className="px-4 py-3 font-bold">Description</th>
                {showUnits && <th className="px-4 py-3 text-right font-bold">Qty</th>}
                {showUnits && <th className="px-4 py-3 text-right font-bold">Unit price</th>}
                <th className="px-4 py-3 text-right font-bold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {model.lines.length === 0 && (
                <tr style={{ borderBottom: `1px solid ${PAPER.hairline}` }}>
                  <td className="px-4 py-3" colSpan={showUnits ? 4 : 2} style={{ color: PAPER.muted }}>
                    No lines recorded on this invoice
                  </td>
                </tr>
              )}
              {model.lines.map((line, i) => (
                <tr
                  key={i}
                  style={{
                    borderBottom: `1px solid ${PAPER.hairline}`,
                    background: i % 2 === 0 ? PAPER.zebra : PAPER.paper,
                  }}
                >
                  <td className="px-4 py-3">{line.description}</td>
                  {showUnits && (
                    <td className="px-4 py-3 text-right tabular-nums">
                      {line.quantity == null ? '' : qty(line.quantity)}
                    </td>
                  )}
                  {showUnits && (
                    <td className="px-4 py-3 text-right tabular-nums">
                      {line.unitPrice == null ? '' : money(line.unitPrice)}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{money(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-6 md:grid-cols-[1fr_auto]">
          <section
            className="rounded-lg p-5"
            style={{ background: PAPER.panel, border: `1px solid ${PAPER.hairline}` }}
          >
            <h2
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
              style={{ color: PAPER.brand }}
            >
              <Landmark className="h-3.5 w-3.5" /> Banking details
            </h2>
            {model.banking && !model.banking.incomplete ? (
              <>
                <dl className="mt-3 space-y-1 text-sm">
                  {[
                    ['Account name', model.banking.accountName],
                    ['Bank', model.banking.bankName ?? '-'],
                    ['Account number', model.banking.accountNumber ?? '-'],
                    ...(model.banking.branchCode ? [['Branch code', model.banking.branchCode]] : []),
                    ['Reference', model.banking.reference],
                  ].map(([label, value]) => (
                    <div key={label} className="flex gap-3">
                      <dt className="w-32 shrink-0" style={{ color: PAPER.muted }}>
                        {label}
                      </dt>
                      <dd className="font-semibold tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs" style={{ color: PAPER.muted }}>
                  Please quote {model.banking.reference} as the payment reference.
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm" style={{ color: PAPER.muted }}>
                {bankingUnavailableMessage(model.banking)}
              </p>
            )}
          </section>

          <section className="md:w-72">
            <dl className="space-y-1.5 text-sm">
              <Row label="Subtotal" value={money(model.subtotal)} />
              {model.taxLines.map((tax, i) => (
                <Row key={i} label={tax.label} value={money(tax.amount)} />
              ))}
              <div style={{ borderTop: `1px solid ${PAPER.hairline}`, paddingTop: '0.375rem' }}>
                <Row label="Total" value={money(model.total)} bold />
              </div>
              {model.amountPaid > 0 && <Row label="Received" value={`-${money(model.amountPaid)}`} />}
              {model.creditNotes.map((credit, i) => (
                <Row key={i} label={`Credit note ${credit.number}`} value={`-${money(credit.amount)}`} />
              ))}
            </dl>
            <div
              className="mt-3 flex items-baseline justify-between rounded-md px-4 py-3"
              style={{ background: PAPER.brand, color: PAPER.paper }}
            >
              <span className="font-bold">{settled ? model.settledLabel : 'Balance due'}</span>
              <span className="text-lg font-bold tabular-nums">{money(settled ? 0 : model.amountDue)}</span>
            </div>
            {!model.linesReconcile && (
              <p className="mt-2 flex gap-1.5 text-xs font-bold" style={{ color: PAPER.alarm }}>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                The lines above do not add up to the total. The total is the amount receivable per the
                ledger.
              </p>
            )}
          </section>
        </div>

        {model.notes && (
          <section style={{ borderTop: `1px solid ${PAPER.hairline}`, paddingTop: '1.25rem' }}>
            <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: PAPER.muted }}>
              Notes
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">{model.notes}</p>
          </section>
        )}

        <footer
          className="flex flex-wrap items-center justify-between gap-2 pt-4 text-xs"
          style={{ borderTop: `1px solid ${PAPER.hairline}`, color: PAPER.muted }}
        >
          <span>{identity}</span>
          <span>Invoice {model.number}</span>
        </footer>
      </div>
    </article>
  );
}
