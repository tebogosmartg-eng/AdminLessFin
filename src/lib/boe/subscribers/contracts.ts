/**
 * Business Operations Engine — Subscriber Contract (P0.5)
 *
 * Subscribers react to completed business events.
 * They must not depend on React, UI, or edge function internals.
 */

import type { BusinessEvent } from '../events/businessEvent';
import type {
  ActivityEntry,
  AuditReference,
  DocumentSignal,
  NotificationSignal,
} from '../commandTypes';
import type { QueryInvalidationKey } from '../executionContract';

export type SubscriberResult = {
  subscriberId: string;
  handled: boolean;
  status: 'success' | 'skipped' | 'failed';
  error?: {
    message: string;
    correlationId: string;
  };
  dashboardRefreshKeys?: QueryInvalidationKey[];
  activityEntries?: ActivityEntry[];
  notificationsTriggered?: NotificationSignal[];
  documentsProduced?: DocumentSignal[];
  auditReference?: AuditReference;
  calendarHints?: Array<{ type: string; entityId?: string; dueDate?: string }>;
  aiContextHints?: Record<string, unknown>;
};

export interface BusinessEventSubscriber {
  subscriberId: string;
  /** Return true when this subscriber should process the event */
  handles: (event: BusinessEvent) => boolean;
  onEvent: (event: BusinessEvent) => Promise<SubscriberResult> | SubscriberResult;
}
