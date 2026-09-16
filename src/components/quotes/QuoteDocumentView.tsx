/**
 * The quotation as the customer will see it, on screen.
 *
 * Built from the same document model as the PDF so the two cannot drift, and
 * fixed to the paper palette for the same reason the invoice is: this previews
 * a piece of paper, not the app.
 */
import { CompanyLogo } from '@/components/brand';
import { PAPER, day, money, qty, bankingUnavailableMessage } from '@/lib/documents/paperTheme';
import { validityWording, type QuoteDocumentModel } from '@/lib/quotes/quoteDocument';
import { Landmark } from 'lucide-react';

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

export default function QuoteDocumentView({ model }: { model: QuoteDocumentModel }) {
  const showTax = model.taxLines.length > 0;
  const lapsed = model.isExpired || model.isDeclined;
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
        lapsed ? 'opacity-70' : ''
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
          <p className="text-3xl font-bold tracking-tight">QUOTATION</p>
          <p className="text-sm opacity-90">{model.number}</p>
        </div>
      </header>

      <div className="space-y-7 px-8 py-7">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-base font-semibold">{model.company.name}</p>
            <div className="mt-1 space-y-0.5 text-sm" style={{ color: PAPER.muted }}>
              {model.letterheadLines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
          <dl className="space-y-1.5 text-sm">
            <Row label="Quotation date" value={day(model.quoteDate)} />
            <Row label="Valid until" value={model.expiryDate ? day(model.expiryDate) : 'No expiry'} />
            <Row label="Status" value={model.statusLabel} />
            {model.isExpired && (
              <p className="text-right text-sm font-bold" style={{ color: PAPER.alarm }}>
                {model.isDraft ? 'The expiry date has already passed' : 'These prices are no longer held'}
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
              Prepared for
            </h2>
            <p className="mt-2 text-base font-semibold">{model.customer.name}</p>
            <div className="mt-1 space-y-0.5 text-sm" style={{ color: PAPER.muted }}>
              {model.customerLines.length === 0 ? (
                <p>No address or contact details are on file for this customer.</p>
              ) : (
                model.customerLines.map((line, i) => <p key={i}>{line}</p>)
              )}
            </div>
          </section>

          <section
            className="rounded-lg p-5"
            style={{ background: lapsed ? PAPER.muted : PAPER.brandBright, color: PAPER.paper }}
          >
            <h2 className="text-xs font-bold uppercase tracking-wider">Quotation total</h2>
            <p className="mt-2 text-3xl font-bold tabular-nums">{money(model.total)}</p>
            <p className="mt-2 text-sm opacity-90">{validityWording(model)}</p>
          </section>
        </div>

        {model.scope && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: PAPER.muted }}>
              Scope
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">{model.scope}</p>
          </section>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-sm">
            <thead>
              <tr
                className="text-left text-xs uppercase tracking-wider"
                style={{ background: PAPER.brand, color: PAPER.paper }}
              >
                <th className="px-4 py-3 font-bold">Description</th>
                <th className="px-4 py-3 text-right font-bold">Qty</th>
                <th className="px-4 py-3 text-right font-bold">Unit price</th>
                {showTax && <th className="px-4 py-3 text-right font-bold">VAT</th>}
                <th className="px-4 py-3 text-right font-bold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {model.lines.length === 0 && (
                <tr style={{ borderBottom: `1px solid ${PAPER.hairline}` }}>
                  <td className="px-4 py-3" colSpan={showTax ? 5 : 4} style={{ color: PAPER.muted }}>
                    No items quoted yet
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
                  <td className="px-4 py-3 text-right tabular-nums">{qty(line.quantity)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(line.unitPrice)}</td>
                  {showTax && (
                    <td className="px-4 py-3 text-right tabular-nums">
                      {line.taxAmount ? money(line.taxAmount) : '-'}
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
                  Please quote {model.number} as the reference on any deposit.
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
            </dl>
            <div
              className="mt-3 flex items-baseline justify-between rounded-md px-4 py-3"
              style={{ background: PAPER.brand, color: PAPER.paper }}
            >
              <span className="font-bold">Total</span>
              <span className="text-lg font-bold tabular-nums">{money(model.total)}</span>
            </div>
            {!showTax && model.company.vatNumber && (
              <p className="mt-2 text-xs" style={{ color: PAPER.muted }}>
                No VAT has been quoted on these items.
              </p>
            )}
          </section>
        </div>

        {model.terms && (
          <section style={{ borderTop: `1px solid ${PAPER.hairline}`, paddingTop: '1.25rem' }}>
            <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: PAPER.muted }}>
              Terms and conditions
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">{model.terms}</p>
          </section>
        )}

        {!model.isAccepted && !model.isDeclined && !model.isExpired && (
          <section
            className="rounded-lg p-5"
            style={{ background: PAPER.tint, border: `1px solid ${PAPER.brand}` }}
          >
            <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: PAPER.brand }}>
              Acceptance
            </h2>
            <p className="mt-2 text-sm">
              By signing below {model.customer.name} accepts this quotation and the terms above, and
              authorises {model.company.name} to proceed with the work described.
            </p>
            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              {['Signature', 'Name and capacity', 'Date'].map((label) => (
                <div key={label}>
                  <div style={{ borderTop: `1px solid ${PAPER.muted}` }} />
                  <p className="mt-1 text-xs" style={{ color: PAPER.muted }}>
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer
          className="flex flex-wrap items-center justify-between gap-2 pt-4 text-xs"
          style={{ borderTop: `1px solid ${PAPER.hairline}`, color: PAPER.muted }}
        >
          <span>{identity}</span>
          <span>Quotation {model.number}</span>
        </footer>
      </div>
    </article>
  );
}
