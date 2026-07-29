/**
 * Business Operations Engine — Execution Contract (P0)
 *
 * Permanent orchestration entry point for business mutations.
 * Coordinates workflow resolution and platform-service signals;
 * business logic remains in existing edge functions.
 */

import type { LifecycleId } from '../businessLifecycles';
import {
  getBusinessEvent,
  type BusinessEventDefinition,
  type OrchestrationEffect,
} from './businessEvents';
import type { BusinessEventContext, OrchestrationResult, PlatformServiceId } from './orchestration';
import { describeOrchestration } from './orchestration';
import { ORCHESTRATION_STAGES } from './orchestration';

/** Contract version — bump when envelope shape changes. */
export const BUSINESS_EVENT_VERSION = '1.0';

export type CompanyRole = 'owner' | 'admin' | 'member';

export type BusinessEventEnvelope = {
  eventId: string;
  eventName: string;
  eventVersion: string;
  timestamp: string;
  companyId: string;
  userId?: string;
  lifecycleId: LifecycleId;
  lifecycleStageId: string;
  entityType?: string;
  entityId?: string;
  accountingImpact: boolean;
  documentTypes: string[];
  notificationTargets: string[];
  dashboardRefreshRequired: boolean;
  activityRequired: boolean;
  auditRequired: boolean;
  metadata?: Record<string, unknown>;
};

export type WorkflowResolution = {
  lifecycleId: LifecycleId;
  stageId: string;
  category: BusinessEventDefinition['category'];
  orchestrationPipeline: OrchestrationEffect[];
  suggestedNextEvents: string[];
};

export type PlatformServiceSignal = {
  serviceId: PlatformServiceId;
  action: 'refresh' | 'record' | 'notify';
  status: 'signaled' | 'deferred';
  note: string;
};

export type QueryInvalidationKey = readonly unknown[];

export type BusinessOperationRequest<T> = {
  eventId: string;
  companyId: string;
  userId?: string;
  userRole?: CompanyRole;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  notificationTargets?: string[];
  executor: () => Promise<T>;
};

export type BusinessOperationResult<T> = {
  data: T;
  envelope: BusinessEventEnvelope;
  context: BusinessEventContext;
  workflow: WorkflowResolution;
  orchestration: OrchestrationResult;
  platformServiceSignals: PlatformServiceSignal[];
  invalidationKeys: QueryInvalidationKey[];
};

const EFFECT_SERVICE_MAP: Record<OrchestrationEffect, PlatformServiceId> = Object.fromEntries(
  ORCHESTRATION_STAGES.map((stage) => [stage.effect, stage.service]),
) as Record<OrchestrationEffect, PlatformServiceId>;

const EFFECT_SERVICE_ACTION: Record<OrchestrationEffect, PlatformServiceSignal['action']> = {
  workflow: 'refresh',
  validation: 'record',
  approval: 'record',
  accounting: 'record',
  document: 'record',
  notification: 'notify',
  activity: 'record',
  calendar: 'refresh',
  ai_insight: 'refresh',
  reporting: 'refresh',
  dashboard: 'refresh',
  audit: 'record',
};

const LIFECYCLE_ENTITY_QUERY_KEYS: Partial<Record<LifecycleId, (companyId: string) => QueryInvalidationKey[]>> = {
  revenue: (companyId) => [['invoices', companyId], ['revenue_workspace', companyId]],
  procurement: (companyId) => [['bills', companyId], ['purchases_workspace', companyId]],
  payroll: (companyId) => [['payroll_runs', companyId], ['payroll_workspace', companyId]],
  accounting: (companyId) => [['journal_entries', companyId]],
  fixed_assets: (companyId) => [['fixed_assets', companyId]],
  loans: (companyId) => [['loans', companyId]],
  projects: (companyId) => [['projects', companyId]],
};

function pipelineRequires(effect: OrchestrationEffect, pipeline: OrchestrationEffect[]): boolean {
  return pipeline.includes(effect);
}

export function buildBusinessEventEnvelope(
  event: BusinessEventDefinition,
  input: Pick<
    BusinessOperationRequest<unknown>,
    'companyId' | 'userId' | 'entityType' | 'entityId' | 'metadata' | 'notificationTargets'
  >,
): BusinessEventEnvelope {
  const pipeline = event.orchestrationPipeline;
  return {
    eventId: event.id,
    eventName: event.label,
    eventVersion: BUSINESS_EVENT_VERSION,
    timestamp: new Date().toISOString(),
    companyId: input.companyId,
    userId: input.userId,
    lifecycleId: event.lifecycleId,
    lifecycleStageId: event.stageId,
    entityType: input.entityType,
    entityId: input.entityId,
    accountingImpact: event.accountingImpact,
    documentTypes: [...event.documentsProduced],
    notificationTargets: input.notificationTargets ?? [],
    dashboardRefreshRequired: pipelineRequires('dashboard', pipeline),
    activityRequired: pipelineRequires('activity', pipeline),
    auditRequired: pipelineRequires('audit', pipeline),
    metadata: input.metadata,
  };
}

export function validateBusinessEventEnvelope(envelope: BusinessEventEnvelope): void {
  if (!envelope.eventId) throw new Error('Business event envelope requires eventId.');
  if (!envelope.companyId) throw new Error('Business event envelope requires companyId.');
  if (!envelope.timestamp) throw new Error('Business event envelope requires timestamp.');
  if (!envelope.lifecycleId) throw new Error('Business event envelope requires lifecycleId.');
  if (!envelope.lifecycleStageId) throw new Error('Business event envelope requires lifecycleStageId.');
}

export function checkEventPermissions(
  event: BusinessEventDefinition,
  userRole?: CompanyRole,
): void {
  if (!userRole) return;
  if (!event.permissions.includes(userRole)) {
    throw new Error(`Insufficient permissions for ${event.label}.`);
  }
}

export function resolveWorkflow(event: BusinessEventDefinition): WorkflowResolution {
  return {
    lifecycleId: event.lifecycleId,
    stageId: event.stageId,
    category: event.category,
    orchestrationPipeline: [...event.orchestrationPipeline],
    suggestedNextEvents: [...event.suggestedNextEvents],
  };
}

function deriveInvalidationKeys(
  event: BusinessEventDefinition,
  companyId: string,
): QueryInvalidationKey[] {
  const keys: QueryInvalidationKey[] = [];
  const seen = new Set<string>();

  const add = (key: QueryInvalidationKey) => {
    const signature = JSON.stringify(key);
    if (seen.has(signature)) return;
    seen.add(signature);
    keys.push(key);
  };

  const lifecycleKeys = LIFECYCLE_ENTITY_QUERY_KEYS[event.lifecycleId];
  if (lifecycleKeys) lifecycleKeys(companyId).forEach(add);

  if (pipelineRequires('accounting', event.orchestrationPipeline)) {
    add(['journal_entries', companyId]);
  }
  if (pipelineRequires('dashboard', event.orchestrationPipeline)) {
    add(['dashboardData']);
  }
  if (pipelineRequires('activity', event.orchestrationPipeline)) {
    add(['dashboardData']);
  }
  if (pipelineRequires('reporting', event.orchestrationPipeline)) {
    add(['reports']);
  }

  return keys;
}

function buildPlatformServiceSignals(
  event: BusinessEventDefinition,
  envelope: BusinessEventEnvelope,
): PlatformServiceSignal[] {
  return event.orchestrationPipeline.map((effect) => {
    const serviceId = EFFECT_SERVICE_MAP[effect];
    const action = EFFECT_SERVICE_ACTION[effect];
    const deferred =
      effect === 'notification' && envelope.notificationTargets.length === 0;

    return {
      serviceId,
      action,
      status: deferred ? 'deferred' : 'signaled',
      note: deferred
        ? 'No notification targets supplied; edge function or UI handles delivery.'
        : `Coordinated via ${event.id} pipeline stage "${effect}".`,
    };
  });
}

function buildEventContext(
  envelope: BusinessEventEnvelope,
  event: BusinessEventDefinition,
): BusinessEventContext {
  return {
    eventId: envelope.eventId,
    lifecycleId: envelope.lifecycleId,
    stageId: envelope.lifecycleStageId,
    entityType: envelope.entityType,
    entityId: envelope.entityId,
    entityLabel: typeof envelope.metadata?.entityLabel === 'string' ? envelope.metadata.entityLabel : undefined,
    actorId: envelope.userId,
    companyId: envelope.companyId,
    metadata: envelope.metadata,
  };
}

/**
 * BOE Coordinator — mandatory entry point for business mutations.
 * Invokes the supplied executor (existing edge function call) unchanged.
 */
export async function executeBusinessOperation<T>(
  request: BusinessOperationRequest<T>,
): Promise<BusinessOperationResult<T>> {
  const event = getBusinessEvent(request.eventId);
  if (!event) {
    throw new Error(`Unknown business event: ${request.eventId}`);
  }

  const envelope = buildBusinessEventEnvelope(event, request);
  validateBusinessEventEnvelope(envelope);
  checkEventPermissions(event, request.userRole);

  const workflow = resolveWorkflow(event);

  const data = await request.executor();

  const context = buildEventContext(envelope, event);
  const orchestration =
    describeOrchestration(request.eventId, request.companyId) ?? {
      context,
      completedStages: workflow.orchestrationPipeline,
      nextSuggestedAction: workflow.suggestedNextEvents[0],
      documentsGenerated: envelope.documentTypes,
      activitySummary: envelope.eventName,
    };

  const platformServiceSignals = buildPlatformServiceSignals(event, envelope);
  const invalidationKeys = deriveInvalidationKeys(event, request.companyId);

  return {
    data,
    envelope,
    context,
    workflow,
    orchestration,
    platformServiceSignals,
    invalidationKeys,
  };
}
