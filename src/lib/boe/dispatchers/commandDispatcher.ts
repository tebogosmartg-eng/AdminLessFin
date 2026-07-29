/**
 * Business Operations Engine — Command Dispatcher (P0.5)
 *
 * Coordinates user commands through the P0 execution contract,
 * then publishes completed business events to subscribers.
 *
 * Guarantees: every command returns SUCCESS or FAILURE — never partial/undefined.
 */

import { getBusinessEvent } from '../businessEvents';
import type { BusinessCommand, BusinessCommandResult } from '../commandTypes';
import { BUSINESS_COMMAND_VERSION } from '../commandTypes';
import { COMPLETED_EVENT_VERSION, type BusinessEvent } from '../events/businessEvent';
import { executeBusinessOperation, type BusinessOperationResult } from '../executionContract';
import { dispatchBusinessEvent } from './eventDispatcher';
import type { SubscriberResult } from '../subscribers/contracts';
import {
  createCorrelationId,
  PlatformError,
  type PlatformErrorEnvelope,
} from '../../platform/platformError';
import { emitCommandLog } from '../../platform/observability';

function createCommandCorrelationId(command: BusinessCommand): string {
  return `${command.commandId}:${command.timestamp}:${command.companyId}`;
}

export function validateBusinessCommand(command: BusinessCommand): void {
  if (!command.commandId) throw new Error('Business command requires commandId.');
  if (!command.commandName) throw new Error('Business command requires commandName.');
  if (!command.companyId) throw new Error('Business command requires companyId.');
  if (!command.outcomeEventId) throw new Error('Business command requires outcomeEventId.');
  if (!command.executor) throw new Error('Business command requires executor.');
  if (command.commandVersion !== BUSINESS_COMMAND_VERSION) {
    throw new Error(`Unsupported command version: ${command.commandVersion}`);
  }

  const outcomeEvent = getBusinessEvent(command.outcomeEventId);
  if (!outcomeEvent) {
    throw new Error(`Unknown outcome event: ${command.outcomeEventId}`);
  }
}

function buildCompletedBusinessEvent(
  command: BusinessCommand,
  operation: BusinessOperationResult<unknown>,
  entityId?: string,
): BusinessEvent {
  const correlationId = createCommandCorrelationId(command);
  return {
    eventId: operation.envelope.eventId,
    eventName: operation.envelope.eventName,
    eventVersion: COMPLETED_EVENT_VERSION,
    occurredAt: new Date().toISOString(),
    companyId: operation.envelope.companyId,
    actorId: operation.envelope.userId,
    lifecycleId: operation.envelope.lifecycleId,
    lifecycleStageId: operation.envelope.lifecycleStageId,
    entityType: command.entityType ?? operation.envelope.entityType,
    entityId: entityId ?? command.entityId ?? operation.envelope.entityId,
    accountingImpact: operation.envelope.accountingImpact,
    documentTypes: [...operation.envelope.documentTypes],
    metadata: {
      ...operation.envelope.metadata,
      commandId: command.commandId,
      correlationId,
    },
    commandId: command.commandId,
    correlationId,
  };
}

function mergeSubscriberResults(results: SubscriberResult[]): Pick<
  BusinessCommandResult,
  | 'dashboardRefreshKeys'
  | 'activityEntries'
  | 'notificationsTriggered'
  | 'documentsProduced'
  | 'auditReference'
> {
  const dashboardRefreshKeys: BusinessCommandResult['dashboardRefreshKeys'] = [];
  const activityEntries: BusinessCommandResult['activityEntries'] = [];
  const notificationsTriggered: BusinessCommandResult['notificationsTriggered'] = [];
  const documentsProduced: string[] = [];
  let auditReference: BusinessCommandResult['auditReference'];

  const seenKeys = new Set<string>();

  for (const result of results) {
    if (result.status === 'failed') continue;

    for (const key of result.dashboardRefreshKeys ?? []) {
      const signature = JSON.stringify(key);
      if (!seenKeys.has(signature)) {
        seenKeys.add(signature);
        dashboardRefreshKeys.push(key);
      }
    }

    if (result.activityEntries) activityEntries.push(...result.activityEntries);
    if (result.notificationsTriggered) notificationsTriggered.push(...result.notificationsTriggered);

    for (const doc of result.documentsProduced ?? []) {
      if (!documentsProduced.includes(doc.documentType)) {
        documentsProduced.push(doc.documentType);
      }
    }

    if (result.auditReference) auditReference = result.auditReference;
  }

  return {
    dashboardRefreshKeys,
    activityEntries,
    notificationsTriggered,
    documentsProduced,
    auditReference,
  };
}

function buildFailureResult<TResult = unknown>(
  command: BusinessCommand,
  envelope: PlatformErrorEnvelope,
  partial?: {
    subscribersExecuted?: string[];
    subscribersFailed?: string[];
    subscriberWarnings?: string[];
  },
): BusinessCommandResult<TResult> {
  return {
    success: false,
    status: 'failure',
    error: envelope,
    documentsProduced: [],
    notificationsTriggered: [],
    dashboardRefreshKeys: [],
    activityEntries: [],
    correlationId: envelope.correlationId,
    subscribersExecuted: partial?.subscribersExecuted ?? [],
    subscribersFailed: partial?.subscribersFailed ?? [],
    subscriberWarnings: partial?.subscriberWarnings ?? [],
  };
}

/**
 * Command Dispatcher — coordinates commands via P0, then dispatches completed events.
 * Returns explicit SUCCESS or FAILURE — never throws for business failures.
 */
export async function dispatchBusinessCommand<TPayload, TResult>(
  command: BusinessCommand<TPayload, TResult>,
): Promise<BusinessCommandResult<TResult>> {
  const correlationId = createCommandCorrelationId(command);
  const startedAt = performance.now();

  emitCommandLog({
    phase: 'started',
    commandId: command.commandId,
    commandName: command.commandName,
    correlationId,
    companyId: command.companyId,
    userId: command.userId,
    entityId: command.entityId,
    entityType: command.entityType,
    timestamp: new Date().toISOString(),
  });

  try {
    validateBusinessCommand(command);

    emitCommandLog({
      phase: 'validated',
      commandId: command.commandId,
      commandName: command.commandName,
      correlationId,
      companyId: command.companyId,
      userId: command.userId,
      entityId: command.entityId,
      entityType: command.entityType,
      timestamp: new Date().toISOString(),
    });

    emitCommandLog({
      phase: 'executing',
      commandId: command.commandId,
      commandName: command.commandName,
      correlationId,
      companyId: command.companyId,
      userId: command.userId,
      entityId: command.entityId,
      entityType: command.entityType,
      timestamp: new Date().toISOString(),
    });

    const operation = await executeBusinessOperation({
      eventId: command.outcomeEventId,
      companyId: command.companyId,
      userId: command.userId,
      userRole: command.userRole,
      entityType: command.entityType,
      entityId: command.entityId,
      metadata: command.metadata,
      notificationTargets: command.notificationTargets,
      executor: command.executor,
    });

    const entityId =
      command.entityId ??
      (command.resolveEntityId && operation.data !== undefined
        ? command.resolveEntityId(operation.data)
        : undefined);

    const event = buildCompletedBusinessEvent(command, operation, entityId);
    const dispatchResult = await dispatchBusinessEvent(event);
    const merged = mergeSubscriberResults(dispatchResult.subscriberResults);

    const dashboardRefreshKeys =
      merged.dashboardRefreshKeys.length > 0
        ? merged.dashboardRefreshKeys
        : operation.invalidationKeys;

    const durationMs = Math.round(performance.now() - startedAt);

    emitCommandLog({
      phase: 'succeeded',
      commandId: command.commandId,
      commandName: command.commandName,
      correlationId,
      companyId: command.companyId,
      userId: command.userId,
      entityId,
      entityType: command.entityType,
      durationMs,
      subscribersExecuted: dispatchResult.subscribersExecuted,
      subscribersFailed: dispatchResult.subscribersFailed,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      status: 'success',
      error: null,
      entityId,
      entityType: command.entityType,
      event,
      nextRecommendedAction: operation.orchestration.nextSuggestedAction,
      documentsProduced:
        merged.documentsProduced.length > 0
          ? merged.documentsProduced
          : operation.envelope.documentTypes,
      notificationsTriggered: merged.notificationsTriggered,
      dashboardRefreshKeys,
      activityEntries: merged.activityEntries,
      auditReference: merged.auditReference,
      data: operation.data,
      operation,
      correlationId,
      subscribersExecuted: dispatchResult.subscribersExecuted,
      subscribersFailed: dispatchResult.subscribersFailed,
      subscriberWarnings: dispatchResult.subscriberWarnings,
    };
  } catch (cause) {
    const platformError = PlatformError.fromUnknown(cause, {
      correlationId,
      commandId: command.commandId,
      companyId: command.companyId,
      entityId: command.entityId,
      businessMessage:
        cause instanceof Error && cause.message
          ? cause.message
          : undefined,
    });

    const durationMs = Math.round(performance.now() - startedAt);

    emitCommandLog({
      phase: 'failed',
      commandId: command.commandId,
      commandName: command.commandName,
      correlationId,
      companyId: command.companyId,
      userId: command.userId,
      entityId: command.entityId,
      entityType: command.entityType,
      durationMs,
      error: platformError.envelope,
      timestamp: new Date().toISOString(),
    });

    return buildFailureResult<TResult>(command, platformError.envelope);
  }
}

/**
 * Strict variant — throws PlatformError on failure for callers that prefer exceptions.
 */
export async function dispatchBusinessCommandOrThrow<TPayload, TResult>(
  command: BusinessCommand<TPayload, TResult>,
): Promise<BusinessCommandResult<TResult>> {
  const result = await dispatchBusinessCommand(command);
  if (!result.success || result.error) {
    throw new PlatformError(result.error!);
  }
  return result;
}
