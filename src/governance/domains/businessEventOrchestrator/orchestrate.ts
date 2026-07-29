/**
 * Governance — Business Event Orchestrator pure logic (mirrors server shared code).
 */

import type { EventType, SourceModule } from './model';

export function buildAggregateKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

export function buildIdempotencyKey(input: {
  idempotencyKey?: string;
  sourceModule: SourceModule;
  businessEvent: string;
  eventType: EventType;
  entityType: string;
  entityId: string;
  timestamp?: string;
}): string {
  if (input.idempotencyKey) return input.idempotencyKey;
  const ts = input.timestamp ?? new Date().toISOString();
  return `${input.sourceModule}:${input.businessEvent}:${input.eventType}:${input.entityType}:${input.entityId}:${ts}`;
}

export function buildEventId(input: {
  eventId?: string;
  sourceModule: SourceModule;
  entityType: string;
  entityId: string;
  eventType: EventType;
}): string {
  if (input.eventId) return input.eventId;
  return `evt_${input.sourceModule}_${input.entityType}_${input.entityId}_${input.eventType}_${Date.now()}`;
}

export type SubscriberDefinition = {
  subscriberId: string;
  name: string;
  enabled: boolean;
  priority: number;
  handlesModules: string[];
  handlesEventTypes: string[];
  handlesAccountingImpact: boolean | null;
};

export function subscriberHandlesEvent(
  subscriber: SubscriberDefinition,
  event: { sourceModule: SourceModule; eventType: EventType; accountingImpact: boolean },
): boolean {
  if (!subscriber.enabled) return false;
  if (subscriber.handlesAccountingImpact === true && !event.accountingImpact) return false;
  if (subscriber.handlesModules.length > 0 && !subscriber.handlesModules.includes(event.sourceModule)) return false;
  if (subscriber.handlesEventTypes.length > 0 && !subscriber.handlesEventTypes.includes(event.eventType)) return false;
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

export function resolveAccountingBusinessEvent(event: {
  businessEvent: string;
  sourceModule: SourceModule;
  eventType: EventType;
  payload?: Record<string, unknown>;
}): string | null {
  const fromPayload = event.payload?.accounting_business_event;
  if (typeof fromPayload === 'string' && fromPayload) return fromPayload;

  const key = `${event.sourceModule}.${event.businessEvent}.${event.eventType}`;
  if (ACCOUNTING_EVENT_MAP[key]) return ACCOUNTING_EVENT_MAP[key];

  if (event.eventType === 'posted' && !event.businessEvent.includes('.')) {
    return event.businessEvent;
  }

  return null;
}

export type DeliveryResult = {
  subscriberId: string;
  status: 'success' | 'failed' | 'skipped' | 'dead_letter';
  durationMs: number;
};

export function resolveEventStatus(
  deliveries: DeliveryResult[],
): 'completed' | 'partial' | 'failed' {
  const actionable = deliveries.filter((d) => d.status !== 'skipped');
  if (actionable.length === 0) return 'completed';
  const failures = actionable.filter((d) => d.status === 'failed' || d.status === 'dead_letter');
  if (failures.length === 0) return 'completed';
  if (failures.length === actionable.length) return 'failed';
  return 'partial';
}

export function sortSubscribersByPriority(subscribers: SubscriberDefinition[]): SubscriberDefinition[] {
  return [...subscribers].sort((a, b) => a.priority - b.priority);
}
