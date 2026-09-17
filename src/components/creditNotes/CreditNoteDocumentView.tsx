/**
 * The credit note as the customer will see it, on screen.
 *
 * Built from the same document model as the PDF so the two cannot drift, and
 * fixed to the paper palette for the same reason every other document is: this
 * previews a piece of paper, not the app.
 */
import { CompanyLogo } from '@/components/brand';
import { PAPER, day, money, qty } from '@/lib/documents/paperTheme';
import {
  creditNoteSettlementWording,
  type CreditNoteDocumentModel,
} from '@/lib/creditNotes/creditNoteDocument';
import { AlertTriangle, ReceiptText } from 'lucide-react';

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

export default function CreditNoteDocumentView({ model }: { model: CreditNoteDocumentModel }) {
  const identity = [
    model.company.name,
    model.company.registrationNumber ? `Reg. no. ${model.company.registrationNumber}` : '',
    model.company.vatNumber ? `VAT no. ${model.company.vatNumber}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ');
  const columns = 2 + (model.showsQuantities ? 2 : 0) + (model.showsTax ? 1 : 0);

  return (
    <article
      className={`relative overflow-hidden rounded-xl shadow-sm ring-1 print:rounded-none print:shadow-none ${
        model.isVoid ? 'opacity-70' : ''
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
          <p className="text-3xl font-bold tracking-tight">CREDIT NOTE</p>
          <p className="text-sm opacity-90">{model.number}</p>
        </div>
      </header>

      <div className="space-y-7 px-5 py-7 sm:px-8">
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
            <Row label="Credit note date" value={day(model.date)} />
            {model.originalInvoice && <Row label="Credits invoice" value={model.originalInvoice.number} />}
            {model.originalInvoice?.date && <Row label="Invoice date" value={day(model.originalInvoice.date)} />}
            <Row label="Status" value={model.statusLabel} />
            {model.isVoid && model.voidedAt && <Row label="Voided on" value={day(model.voidedAt)} />}
          </dl>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <section
            className="rounded-lg p-5"
            style={{ background: PAPER.tint, border: `1px solid ${PAPER.hairline}` }}
          >
            <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: PAPER.brand }}>
              Credit to
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
            style={{ background: model.isVoid ? PAPER.muted : PAPER.brandBright, color: PAPER.paper }}
          >
            <h2 className="text-xs font-bold uppercase tracking-wider">
              {model.isVoid ? 'Credit note void' : 'Total credit'}
            </h2>
            <p className="mt-2 text-3xl font-bold tabular-nums">{money(model.total)}</p>
            <div className="mt-2 space-y-0.5 text-sm opacity-90">
              <p>
                {model.isVoid
                  ? 'Cancelled. This credit no longer applies.'
                  : model.taxTotal > 0
                    ? `Including ${money(model.taxTotal)} VAT`
                    : 'No VAT on this credit'}
              </p>
              {!model.isVoid && (
                <p>
                  {model.remaining > 0
                    ? `${money(model.remaining)} held on account`
                    : model.applications.length === 1
                      ? `Applied against ${model.applications[0].invoiceNumber}`
                      : 'Applied in full'}
                </p>
              )}
            </div>
          </section>
        </div>

        <section
          className="rounded-lg p-5"
          style={{ background: PAPER.panel, border: `1px solid ${PAPER.hairline}` }}
        >
          <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: PAPER.brand }}>
            Reason for credit
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">{model.reason || 'No reason recorded.'}</p>
        </section>

        <div className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${PAPER.hairline}` }}>
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr
                className="text-left text-xs uppercase tracking-wider"
                style={{ background: PAPER.brand, color: PAPER.paper }}
              >
                <th className="px-4 py-3 font-bold">Description</th>
                {model.showsQuantities && <th className="px-4 py-3 text-right font-bold">Qty</th>}
                {model.showsQuantities && <th className="px-4 py-3 text-right font-bold">Unit price</th>}
                {model.showsTax && <th className="px-4 py-3 text-right font-bold">VAT</th>}
                <th className="px-4 py-3 text-right font-bold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {model.lines.length === 0 && (
                <tr style={{ borderBottom: `1px solid ${PAPER.hairline}` }}>
                  <td className="px-4 py-3" colSpan={columns} style={{ color: PAPER.muted }}>
                    No lines recorded on this credit note
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
                  {model.showsQuantities && <td className="px-4 py-3 text-right tabular-nums">{qty(line.quantity)}</td>}
                  {model.showsQuantities && (
                    <td className="px-4 py-3 text-right tabular-nums">{money(line.unitPrice)}</td>
                  )}
                  {model.showsTax && (
                    <td className="px-4 py-3 text-right tabular-nums">{line.tax > 0 ? money(line.tax) : '-'}</td>
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
              <ReceiptText className="h-3.5 w-3.5" /> Applied to
            </h2>
            <dl className="mt-3 space-y-1 text-sm">
              {model.applications.length === 0 ? (
                <p style={{ color: PAPER.muted }}>
                  {model.isVoid ? 'Nothing. This credit note is void.' : 'Not yet applied to an invoice.'}
                </p>
              ) : (
                model.applications.map((a, i) => (
                  <div key={i} className="flex items-baseline gap-3">
                    <dt className="font-semibold">{a.invoiceNumber}</dt>
                    <dd className="flex-1" style={{ color: PAPER.muted }}>
                      {a.invoiceDate ? day(a.invoiceDate) : ''}
                    </dd>
                    <dd className="font-semibold tabular-nums">{money(a.amount)}</dd>
                  </div>
                ))
              )}
              <div
                className="flex items-baseline justify-between pt-2 font-bold"
                style={{ borderTop: `1px solid ${PAPER.hairline}` }}
              >
                <dt>Held on account</dt>
                <dd className="tabular-nums">{money(model.remaining)}</dd>
              </div>
            </dl>
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
              style={{ background: model.isVoid ? PAPER.muted : PAPER.brand, color: PAPER.paper }}
            >
              <span className="font-bold">Total credit</span>
              <span className="text-lg font-bold tabular-nums">{money(model.total)}</span>
            </div>
            {!model.linesReconcile && (
              <p className="mt-2 flex gap-1.5 text-xs font-bold" style={{ color: PAPER.alarm }}>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                The lines above do not add up to the total. The total is the amount credited per the ledger.
              </p>
            )}
          </section>
        </div>

        <p
          className="rounded-lg px-5 py-4 text-sm font-semibold"
          style={{
            background: PAPER.tint,
            border: `1px solid ${model.isVoid ? PAPER.alarm : PAPER.brand}`,
            color: model.isVoid ? PAPER.alarm : PAPER.ink,
          }}
        >
          {creditNoteSettlementWording(model)}
        </p>

        <footer
          className="flex flex-wrap items-center justify-between gap-2 pt-4 text-xs"
          style={{ borderTop: `1px solid ${PAPER.hairline}`, color: PAPER.muted }}
        >
          <span>{identity}</span>
          <span>Credit note {model.number}</span>
        </footer>
      </div>

      {model.isVoid && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center select-none"
        >
          <span
            className="-rotate-[32deg] text-8xl font-bold tracking-widest"
            style={{ color: PAPER.alarm, opacity: 0.12 }}
          >
            VOID
          </span>
        </div>
      )}
    </article>
  );
}
