/**
 * Business Operations Engine — Orchestration Pipeline
 *
 * Defines the permanent execution model. Edge functions remain the executors;
 * this module describes the logical pipeline every business process follows.
 */

import type { OrchestrationEffect } from './businessEvents';
import { getBusinessEvent } from './businessEvents';

export const ORCHESTRATION_PIPELINE: OrchestrationEffect[] = [
  'workflow',
  'validation',
  'approval',
  'accounting',
  'document',
  'notification',
  'activity',
  'calendar',
  'ai_insight',
  'reporting',
  'dashboard',
  'audit',
];

export type OrchestrationStage = {
  effect: OrchestrationEffect;
  label: string;
  description: string;
  /** Which platform service owns this stage */
  service: PlatformServiceId;
};

export type PlatformServiceId =
  | 'workflow'
  | 'business_event'
  | 'approval'
  | 'document'
  | 'notification'
  | 'activity'
  | 'calendar'
  | 'timeline'
  | 'search'
  | 'audit'
  | 'reporting'
  | 'dashboard'
  | 'ai'
  | 'permission'
  | 'history';

export const ORCHESTRATION_STAGES: OrchestrationStage[] = [
  { effect: 'workflow', label: 'Workflow', description: 'Route event through lifecycle stage', service: 'workflow' },
  { effect: 'validation', label: 'Validation', description: 'Validate business rules and data', service: 'business_event' },
  { effect: 'approval', label: 'Approval', description: 'Check approval requirements', service: 'approval' },
  { effect: 'accounting', label: 'Accounting', description: 'Post to journal engine (source of truth)', service: 'business_event' },
  { effect: 'document', label: 'Documents', description: 'Generate business documents', service: 'document' },
  { effect: 'notification', label: 'Notifications', description: 'Notify stakeholders', service: 'notification' },
  { effect: 'activity', label: 'Activity', description: 'Record in global activity feed', service: 'activity' },
  { effect: 'calendar', label: 'Calendar', description: 'Surface operational deadlines', service: 'calendar' },
  { effect: 'ai_insight', label: 'AI Insights', description: 'Generate advisory insights (read-only)', service: 'ai' },
  { effect: 'reporting', label: 'Reporting', description: 'Update reports and analytics', service: 'reporting' },
  { effect: 'dashboard', label: 'Dashboard', description: 'Refresh operations command centre', service: 'dashboard' },
  { effect: 'audit', label: 'Audit', description: 'Write immutable audit entry', service: 'audit' },
];

export type BusinessEventContext = {
  eventId: string;
  lifecycleId: string;
  stageId: string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  actorId?: string;
  companyId: string;
  metadata?: Record<string, unknown>;
};

/**
 * Describes orchestration result without executing side effects.
 * Future: edge functions emit this shape after processing.
 */
export type OrchestrationResult = {
  context: BusinessEventContext;
  completedStages: OrchestrationEffect[];
  nextSuggestedAction?: string;
  documentsGenerated: string[];
  activitySummary: string;
};

export function describeOrchestration(eventId: string, companyId: string): OrchestrationResult | null {
  const event = getBusinessEvent(eventId);
  if (!event) return null;

  return {
    context: {
      eventId,
      lifecycleId: event.lifecycleId,
      stageId: event.stageId,
      companyId,
    },
    completedStages: event.orchestrationPipeline,
    nextSuggestedAction: event.suggestedNextEvents[0],
    documentsGenerated: event.documentsProduced,
    activitySummary: event.label,
  };
}
