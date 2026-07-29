/**
 * ERP Phase 5 — Business Event Orchestrator core logic.
 */

import type {
  BusinessEventPayload,
  DeliveryResult,
  OrchestrationResult,
  StoredBusinessEvent,
  SubscriberDefinition,
  EventsDashboard,
} from './model.ts';
import {
  buildAggregateKey,
  buildEventId,
  buildIdempotencyKey,
} from './model.ts';
import { executeSubscriber, getHandlerMap } from './subscribers.ts';

const MAX_RETRIES = 3;

export function mapRowToEvent(row: Record<string, unknown>): StoredBusinessEvent {
  return {
    id: row.id as string,
    eventId: row.event_id as string,
    idempotencyKey: row.idempotency_key as string,
    businessEvent: row.business_event as string,
    eventType: row.event_type as StoredBusinessEvent['eventType'],
    entityType: row.entity_type as string,
    entityId: row.entity_id as string,
    aggregateKey: row.aggregate_key as string,
    sequenceNumber: Number(row.sequence_number),
    companyId: row.company_id as string,
    publisherId: row.publisher_id as string | undefined,
    sourceModule: row.source_module as StoredBusinessEvent['sourceModule'],
    correlationId: row.correlation_id as string,
    version: Number(row.version),
    payload: (row.payload as Record<string, unknown>) ?? {},
    status: row.status as string,
    accountingImpact: Boolean(row.accounting_impact),
    publishedAt: row.published_at as string,
    completedAt: row.completed_at as string | undefined,
    retryCount: Number(row.retry_count ?? 0),
  };
}

export function normalizePublishInput(input: BusinessEventPayload): Required<
  Pick<BusinessEventPayload, 'eventId' | 'idempotencyKey' | 'correlationId' | 'version' | 'timestamp'>
> & BusinessEventPayload {
  return {
    ...input,
    eventId: buildEventId(input),
    idempotencyKey: buildIdempotencyKey(input),
    correlationId: input.correlationId ?? `corr_${input.sourceModule}_${Date.now()}`,
    version: input.version ?? 1,
    timestamp: input.timestamp ?? new Date().toISOString(),
    payload: input.payload ?? {},
    accountingImpact: input.accountingImpact ?? false,
  };
}

export async function dispatchEventToSubscribers(
  event: StoredBusinessEvent,
  definitions: SubscriberDefinition[],
  ctx: {
    supabaseAdmin: {
      from: (table: string) => {
        insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
        update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: unknown }> };
      };
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    };
    companyId: string;
    userId?: string;
    correlationId: string;
  },
): Promise<{ deliveries: DeliveryResult[]; subscribersExecuted: string[]; subscribersFailed: string[] }> {
  const handlers = getHandlerMap();
  const sorted = [...definitions].sort((a, b) => a.priority - b.priority);
  const deliveries: DeliveryResult[] = [];
  const subscribersExecuted: string[] = [];
  const subscribersFailed: string[] = [];

  for (const definition of sorted) {
    const handler = handlers.get(definition.subscriberId);
    if (!handler) continue;

    const startedAt = new Date().toISOString();
    const delivery = await executeSubscriber(handler, definition, event, ctx);
    deliveries.push(delivery);

    const deliveryStatus = delivery.status === 'failed' && event.retryCount >= MAX_RETRIES - 1
      ? 'dead_letter'
      : delivery.status;

    await ctx.supabaseAdmin.from('business_event_deliveries').insert({
      event_record_id: event.id,
      company_id: ctx.companyId,
      subscriber_id: definition.subscriberId,
      status: deliveryStatus,
      result: delivery.result ?? {},
      error_message: delivery.errorMessage ?? null,
      duration_ms: delivery.durationMs,
      retry_count: event.retryCount,
      correlation_id: ctx.correlationId,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    });

    if (delivery.status === 'success') {
      subscribersExecuted.push(definition.subscriberId);
    } else if (delivery.status === 'failed') {
      subscribersFailed.push(definition.subscriberId);

      if (event.retryCount >= MAX_RETRIES - 1) {
        await ctx.supabaseAdmin.from('business_event_dead_letter').insert({
          delivery_id: null,
          event_record_id: event.id,
          company_id: ctx.companyId,
          subscriber_id: definition.subscriberId,
          reason: delivery.errorMessage ?? 'max_retries_exceeded',
          payload: { event: event.eventId, correlationId: event.correlationId },
        });
      }
    }
  }

  return { deliveries, subscribersExecuted, subscribersFailed };
}

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

export function buildDashboard(
  eventsToday: number,
  failedEvents: number,
  retries: number,
  deadLetterCount: number,
  slowestSubscribers: EventsDashboard['slowestSubscribers'],
  recentEvents: EventsDashboard['recentEvents'],
): EventsDashboard {
  return {
    eventsToday,
    failedEvents,
    retries,
    deadLetterCount,
    slowestSubscribers,
    recentEvents,
    evaluatedAt: new Date().toISOString(),
  };
}

export type PublishDeps = {
  findExisting: (companyId: string, idempotencyKey: string) => Promise<StoredBusinessEvent | null>;
  nextSequence: (companyId: string, aggregateKey: string) => Promise<number>;
  insertEvent: (row: Record<string, unknown>) => Promise<StoredBusinessEvent>;
  updateEventStatus: (eventId: string, status: string, completedAt: string) => Promise<void>;
  loadSubscribers: () => Promise<SubscriberDefinition[]>;
  dispatch: (
    event: StoredBusinessEvent,
    definitions: SubscriberDefinition[],
  ) => Promise<{ deliveries: DeliveryResult[]; subscribersExecuted: string[]; subscribersFailed: string[] }>;
};

export async function publishBusinessEvent(
  rawInput: BusinessEventPayload,
  deps: PublishDeps,
): Promise<OrchestrationResult> {
  const started = Date.now();
  const input = normalizePublishInput(rawInput);

  const existing = await deps.findExisting(input.companyId, input.idempotencyKey);
  if (existing) {
    return {
      event: existing,
      deliveries: [],
      subscribersExecuted: [],
      subscribersFailed: [],
      durationMs: Date.now() - started,
      idempotentReplay: true,
    };
  }

  const aggregateKey = buildAggregateKey(input.entityType, input.entityId);
  const sequenceNumber = await deps.nextSequence(input.companyId, aggregateKey);

  const event = await deps.insertEvent({
    event_id: input.eventId,
    idempotency_key: input.idempotencyKey,
    business_event: input.businessEvent,
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId,
    aggregate_key: aggregateKey,
    sequence_number: sequenceNumber,
    company_id: input.companyId,
    publisher_id: input.userId ?? null,
    source_module: input.sourceModule,
    correlation_id: input.correlationId,
    version: input.version,
    payload: input.payload ?? {},
    status: 'processing',
    accounting_impact: input.accountingImpact ?? false,
    published_at: input.timestamp,
    metadata: input.metadata ?? {},
  });

  const definitions = await deps.loadSubscribers();
  const { deliveries, subscribersExecuted, subscribersFailed } = await deps.dispatch(event, definitions);
  const finalStatus = resolveEventStatus(deliveries);
  const completedAt = new Date().toISOString();

  await deps.updateEventStatus(event.id, finalStatus, completedAt);

  return {
    event: { ...event, status: finalStatus, completedAt },
    deliveries,
    subscribersExecuted,
    subscribersFailed,
    durationMs: Date.now() - started,
    idempotentReplay: false,
  };
}
