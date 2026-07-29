/**
 * Business Operations Engine — Command Types (P0.5)
 *
 * Commands represent user intent (requested work).
 * Events represent completed business outcomes (see events/businessEvent.ts).
 */

import type { CompanyRole } from './executionContract';
import type { BusinessEvent } from './events/businessEvent';
import type { BusinessOperationResult, QueryInvalidationKey } from './executionContract';
import type { PlatformErrorEnvelope } from '../platform/platformError';

export const BUSINESS_COMMAND_VERSION = '1.0';

export type ActivityEntry = {
  id: string;
  eventId: string;
  label: string;
  lifecycleId: string;
  stageId: string;
  timestamp: string;
  summary: string;
  route?: string;
  actorId?: string;
};

export type NotificationSignal = {
  channel: 'email' | 'in_app';
  target?: string;
  status: 'triggered' | 'deferred' | 'skipped';
  reason?: string;
};

export type DocumentSignal = {
  documentType: string;
  status: 'produced' | 'pending';
  reference?: string;
};

export type AuditReference = {
  referenceId: string;
  source: 'edge_function' | 'coordinator';
  status: 'recorded' | 'deferred';
  note: string;
};

export interface BusinessCommand<TPayload = unknown, TResult = unknown> {
  commandId: string;
  commandName: string;
  commandVersion: string;
  timestamp: string;
  companyId: string;
  userId?: string;
  userRole?: CompanyRole;
  payload: TPayload;
  /** Registry event emitted on successful completion */
  outcomeEventId: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  notificationTargets?: string[];
  executor: () => Promise<TResult>;
  /** Optional hook to extract entity ID from executor result */
  resolveEntityId?: (result: TResult) => string | undefined;
}

export interface BusinessCommandResult<TData = unknown> {
  success: boolean;
  status: 'success' | 'failure';
  error: PlatformErrorEnvelope | null;
  entityId?: string;
  entityType?: string;
  event?: BusinessEvent;
  nextRecommendedAction?: string;
  documentsProduced: string[];
  notificationsTriggered: NotificationSignal[];
  dashboardRefreshKeys: QueryInvalidationKey[];
  activityEntries: ActivityEntry[];
  auditReference?: AuditReference;
  data?: TData;
  correlationId: string;
  subscribersExecuted: string[];
  subscribersFailed: string[];
  subscriberWarnings: string[];
  /** Preserved P0 operation result for backward compatibility */
  operation?: BusinessOperationResult<TData>;
}
