/**
 * ERP Phase 5 — Publish helper for business modules.
 * Modules call this instead of invoking accounting logic directly.
 */

import type { PublishEventInput } from '@/governance/domains/businessEventOrchestrator/model';
import { businessEventOrchestratorService } from '@/governance/domains/businessEventOrchestrator/service';

export type ModulePublishOptions = PublishEventInput & {
  /** When true, skips orchestrator publish (legacy direct-call compatibility). */
  legacyDirectCall?: boolean;
};

/**
 * Standard publish path for ERP modules.
 * Returns orchestration result with subscriber delivery audit.
 */
export async function publishModuleBusinessEvent(
  companyId: string,
  event: ModulePublishOptions,
) {
  if (event.legacyDirectCall) {
    return {
      event: { eventId: event.eventId ?? 'legacy' },
      deliveries: [],
      subscribersExecuted: [],
      subscribersFailed: [],
      durationMs: 0,
      idempotentReplay: false,
      legacy: true,
    };
  }

  const { legacyDirectCall: _, ...publishInput } = event;
  return businessEventOrchestratorService.publish(companyId, publishInput);
}
