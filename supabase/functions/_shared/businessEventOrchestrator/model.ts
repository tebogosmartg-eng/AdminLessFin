/**
 * ERP Phase 5 — Business Event Orchestrator model (shared contract).
 */

export const EVENT_TYPES = [
  'created', 'updated', 'approved', 'rejected', 'posted',
  'cancelled', 'closed', 'reversed', 'archived',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const SOURCE_MODULES = [
  'sales', 'purchasing', 'inventory', 'payroll', 'assets', 'banking',
  'crm', 'projects', 'manufacturing', 'tax', 'workflow', 'accounting',
] as const;

export type SourceModule = (typeof SOURCE_MODULES)[number];

export type BusinessEventPayload = {
  eventId?: string;
  businessEvent: string;
  eventType: EventType;
  entityType: string;
  entityId: string;
  companyId: string;
  userId?: string;
  timestamp?: string;
  version?: number;
  correlationId?: string;
  sourceModule: SourceModule;
  idempotencyKey?: string;
  accountingImpact?: boolean;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type StoredBusinessEvent = {
  id: string;
  eventId: string;
  idempotencyKey: string;
  businessEvent: string;
  eventType: EventType;
  entityType: string;
  entityId: string;
  aggregateKey: string;
  sequenceNumber: number;
  companyId: string;
  publisherId?: string;
  sourceModule: SourceModule;
  correlationId: string;
  version: number;
  payload: Record<string, unknown>;
  status: string;
  accountingImpact: boolean;
  publishedAt: string;
  completedAt?: string;
  retryCount: number;
};

export type SubscriberDefinition = {
  subscriberId: string;
  name: string;
  enabled: boolean;
  priority: number;
  handlesModules: string[];
  handlesEventTypes: string[];
  handlesAccountingImpact: boolean | null;
};

export type DeliveryResult = {
  subscriberId: string;
  status: 'success' | 'failed' | 'skipped' | 'dead_letter';
  durationMs: number;
  result?: Record<string, unknown>;
  errorMessage?: string;
};

export type OrchestrationResult = {
  event: StoredBusinessEvent;
  deliveries: DeliveryResult[];
  subscribersExecuted: string[];
  subscribersFailed: string[];
  durationMs: number;
  idempotentReplay: boolean;
};

export type EventsDashboard = {
  eventsToday: number;
  failedEvents: number;
  retries: number;
  deadLetterCount: number;
  slowestSubscribers: Array<{ subscriberId: string; name: string; avgDurationMs: number; deliveryCount: number }>;
  recentEvents: Array<{
    id: string;
    eventId: string;
    businessEvent: string;
    eventType: EventType;
    sourceModule: SourceModule;
    status: string;
    publishedAt: string;
    correlationId: string;
  }>;
  evaluatedAt: string;
};

export function buildAggregateKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

export function buildIdempotencyKey(input: BusinessEventPayload): string {
  if (input.idempotencyKey) return input.idempotencyKey;
  const ts = input.timestamp ?? new Date().toISOString();
  return `${input.sourceModule}:${input.businessEvent}:${input.eventType}:${input.entityType}:${input.entityId}:${ts}`;
}

export function buildEventId(input: BusinessEventPayload): string {
  if (input.eventId) return input.eventId;
  return `evt_${input.sourceModule}_${input.entityType}_${input.entityId}_${input.eventType}_${Date.now()}`;
}

export function subscriberHandlesEvent(
  subscriber: SubscriberDefinition,
  event: Pick<StoredBusinessEvent, 'sourceModule' | 'eventType' | 'accountingImpact'>,
): boolean {
  if (!subscriber.enabled) return false;

  if (subscriber.handlesAccountingImpact === true && !event.accountingImpact) {
    return false;
  }

  if (subscriber.handlesModules.length > 0 && !subscriber.handlesModules.includes(event.sourceModule)) {
    return false;
  }

  if (subscriber.handlesEventTypes.length > 0 && !subscriber.handlesEventTypes.includes(event.eventType)) {
    return false;
  }

  return true;
}

export const ACCOUNTING_EVENT_MAP: Record<string, string> = {
  'sales.invoice.posted': 'sales_invoice',
  'sales.payment.received': 'customer_receipt',
  'purchasing.invoice.posted': 'supplier_invoice',
  'purchasing.payment.posted': 'supplier_payment',
  'banking.deposit.posted': 'bank_deposit',
  'banking.withdrawal.posted': 'bank_withdrawal',
  'inventory.purchase.posted': 'inventory_purchase',
  'inventory.sale.posted': 'inventory_sale',
  'inventory.adjustment.posted': 'inventory_adjustment',
  'payroll.run.posted': 'payroll_run',
  'payroll.payment.posted': 'payroll_payment',
  'assets.depreciation.posted': 'depreciation',
  'assets.acquisition.posted': 'asset_acquisition',
  'assets.disposal.posted': 'asset_disposal',
  'tax.vat_return.posted': 'vat_return',
};

export function resolveAccountingBusinessEvent(
  event: Pick<StoredBusinessEvent, 'businessEvent' | 'sourceModule' | 'eventType' | 'payload'>,
): string | null {
  const fromPayload = event.payload?.accounting_business_event;
  if (typeof fromPayload === 'string' && fromPayload) return fromPayload;

  const key = `${event.sourceModule}.${event.businessEvent}.${event.eventType}`;
  if (ACCOUNTING_EVENT_MAP[key]) return ACCOUNTING_EVENT_MAP[key];

  if (event.eventType === 'posted' && !event.businessEvent.includes('.')) {
    return event.businessEvent;
  }

  return null;
}
