/**
 * Business Operations Engine — Completed Business Event (P0.5)
 *
 * A Business Event is a fact: something that has already happened.
 * Distinct from the event registry definitions in businessEvents.ts.
 */

import type { LifecycleId } from '../../businessLifecycles';

export const COMPLETED_EVENT_VERSION = '1.0';

export interface BusinessEvent {
  eventId: string;
  eventName: string;
  eventVersion: string;
  occurredAt: string;
  companyId: string;
  actorId?: string;
  lifecycleId: LifecycleId;
  lifecycleStageId: string;
  entityType?: string;
  entityId?: string;
  accountingImpact: boolean;
  documentTypes: string[];
  metadata?: Record<string, unknown>;
  /** Links outcome to originating command */
  commandId: string;
  correlationId: string;
}
