/**
 * The purchase order as a document.
 *
 * A purchase order is the one document in this set that goes OUT to a supplier
 * as an instruction rather than to a customer as a claim, and that changes what
 * it has to carry. It is not asking to be paid, so it has no banking panel; it
 * is asking for goods, so it must say where to deliver them and by when, and it
 * must give the supplier a reference to quote back on their invoice.
 *
 * Unlike the invoice and the quotation, nothing here was captured and dropped:
 * purchase_order_items stores its own description, quantity and unit cost, and
 * no tax is collected on a purchase order at all. That last point is stated on
 * the document rather than left to be inferred, because a supplier reading a
 * total needs to know whether VAT is expected on top of it.
 */
import {
  asNumber,
  asText,
  companyFromMaster,
  letterheadLines,
  partyLines,
  relatedOne,
  round2,
  type DocumentCompany,
  type DocumentParty,
} from '@/lib/documents/paperTheme';

export type RawPurchaseOrderItem = {
  id?: string;
  description?: string | null;
  quantity?: number | string | null;
  unit_cost?: number | string | null;
  projects?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

export type RawPurchaseOrderDocument = {
  purchase_order: {
    id: string;
    po_number: string;
    po_date: string;
    delivery_date?: string | null;
    status: string;
    notes?: string | null;
    vendors?: {
      name?: string | null; contact_name?: string | null; address?: string | null;
      email?: string | null; phone?: string | null; tax_id?: string | null;
    } | null;
    purchase_order_items?: RawPurchaseOrderItem[] | null;
  };
  company?: {
    name?: string | null; logo_url?: string | null;
    address?: string | null; tax_id?: string | null;
  } | null;
  master?: {
    company_profile?: Record<string, unknown> | null;
    addresses?: Record<string, unknown> | null;
    tax_registrations?: Record<string, unknown> | null;
  } | null;
};

export type PurchaseOrderDocumentLine = {
  description: string;
  quantity: number;
  unitCost: number;
  amount: number;
  project: string;
};

export type PurchaseOrderDocumentModel = {
  purchaseOrderId: string;
  number: string;
  orderDate: string;
  deliveryDate: string;
  status: string;
  statusLabel: string;
  isCancelled: boolean;
  isDraft: boolean;
  company: DocumentCompany;
  supplier: DocumentParty;
  lines: PurchaseOrderDocumentLine[];
  total: number;
  letterheadLines: string[];
  supplierLines: string[];
  /** Where the goods go. The company's own business address. */
  deliverTo: string[];
  notes: string;
  /** True when at least one line has a quantity other than one. */
  showsQuantities: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft — not yet issued',
  sent: 'Issued',
  approved: 'Approved',
  received: 'Received in full',
  partially_received: 'Partly received',
  billed: 'Billed',
  cancelled: 'Cancelled',
};

export function buildPurchaseOrderDocument(
  raw: RawPurchaseOrderDocument,
): PurchaseOrderDocumentModel {
  const po = raw.purchase_order;
  const company = companyFromMaster(raw.master, raw.company);

  const lines: PurchaseOrderDocumentLine[] = (po.purchase_order_items ?? []).map((item) => {
    const quantity = asNumber(item.quantity);
    const unitCost = asNumber(item.unit_cost);
    return {
      description: asText(item.description) || 'Goods or services ordered',
      quantity,
      unitCost,
      amount: round2(quantity * unitCost),
      project: asText(relatedOne(item.projects)?.name),
    };
  });

  const vendorRow = po.vendors ?? {};
  const supplier: DocumentParty = {
    name: asText(vendorRow.name) || 'Supplier',
    contactName: asText(vendorRow.contact_name),
    address: asText(vendorRow.address),
    email: asText(vendorRow.email),
    phone: asText(vendorRow.phone),
    taxId: asText(vendorRow.tax_id),
  };

  const status = asText(po.status);

  return {
    purchaseOrderId: asText(po.id),
    number: asText(po.po_number),
    orderDate: asText(po.po_date),
    deliveryDate: asText(po.delivery_date),
    status,
    statusLabel: STATUS_LABELS[status] ?? status,
    isCancelled: status === 'cancelled',
    isDraft: status === 'draft',
    company,
    supplier,
    lines,
    total: round2(lines.reduce((t, l) => t + l.amount, 0)),
    letterheadLines: letterheadLines(company),
    supplierLines: partyLines(supplier),
    // The ordering company's own address is where the goods go. Printing it
    // under its own heading rather than leaving it in the letterhead is what
    // makes it an instruction rather than a return address.
    deliverTo: [
      company.name,
      ...(company.address ? company.address.split(/\r?\n/) : []),
      company.phone ? `Tel ${company.phone}` : '',
    ].map((l) => l.trim()).filter(Boolean),
    notes: asText(po.notes),
    showsQuantities: lines.some((l) => l.quantity !== 1),
  };
}

/** The line a supplier needs to read before invoicing against this order. */
export function purchaseOrderInstruction(model: PurchaseOrderDocumentModel): string {
  if (model.isCancelled) {
    return `This purchase order has been cancelled. Do not supply against it, and do not invoice it.`;
  }
  if (model.isDraft) {
    return `This purchase order is a draft and has not been issued. It is not an instruction to supply.`;
  }
  const by = model.deliveryDate ? ` by ${model.deliveryDate}` : '';
  return `Please supply the items above${by} and quote ${model.number} on your invoice and delivery note.`;
}
