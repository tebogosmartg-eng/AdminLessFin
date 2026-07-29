/**
 * Reference Command — Create Invoice (P0.5)
 *
 * Canonical command implementation pattern for future workflow migrations.
 */

import type { CompanyRole } from '../executionContract';
import type { BusinessCommand } from '../commandTypes';
import { BUSINESS_COMMAND_VERSION } from '../commandTypes';

export const CREATE_INVOICE_COMMAND_ID = 'invoice.create';

export type CreateInvoiceCommandPayload = {
  invoiceNumber: string;
  customerId: string;
  timesheetIds: string[];
};

export function buildCreateInvoiceCommand(params: {
  companyId: string;
  userId: string;
  userRole: CompanyRole;
  payload: CreateInvoiceCommandPayload;
  metadata?: Record<string, unknown>;
  executor: () => Promise<void>;
  resolveEntityId?: (result: void) => string | undefined;
}): BusinessCommand<CreateInvoiceCommandPayload, void> {
  return {
    commandId: CREATE_INVOICE_COMMAND_ID,
    commandName: 'Create Invoice',
    commandVersion: BUSINESS_COMMAND_VERSION,
    timestamp: new Date().toISOString(),
    companyId: params.companyId,
    userId: params.userId,
    userRole: params.userRole,
    payload: params.payload,
    outcomeEventId: 'invoice.created',
    entityType: 'invoice',
    metadata: {
      ...params.metadata,
      invoice_number: params.payload.invoiceNumber,
      customer_id: params.payload.customerId,
      entityLabel: params.payload.invoiceNumber,
    },
    executor: params.executor,
    resolveEntityId: params.resolveEntityId,
  };
}
