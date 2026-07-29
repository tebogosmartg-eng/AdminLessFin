/**
 * Governance — Business Event Orchestrator model (ERP Phase 5).
 * Mirrors supabase/functions/_shared/businessEventOrchestrator/model.ts
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

export type PublishEventInput = {
  eventId?: string;
  businessEvent: string;
  eventType: EventType;
  entityType: string;
  entityId: string;
  sourceModule: SourceModule;
  idempotencyKey?: string;
  accountingImpact?: boolean;
  correlationId?: string;
  version?: number;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type OrchestrationResult = {
  event: Record<string, unknown>;
  deliveries: Array<{
    subscriberId: string;
    status: string;
    durationMs: number;
    result?: Record<string, unknown>;
    errorMessage?: string;
  }>;
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

export {
  buildAggregateKey,
  buildIdempotencyKey,
  buildEventId,
  subscriberHandlesEvent,
  resolveAccountingBusinessEvent,
  ACCOUNTING_EVENT_MAP,
} from './orchestrate';
