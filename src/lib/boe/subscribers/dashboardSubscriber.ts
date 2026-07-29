import { getBusinessEvent } from '../businessEvents';
import type { LifecycleId } from '../../businessLifecycles';
import type { OrchestrationEffect } from '../businessEvents';
import type { QueryInvalidationKey } from '../executionContract';
import type { BusinessEventSubscriber, SubscriberResult } from './contracts';

const LIFECYCLE_ENTITY_QUERY_KEYS: Partial<
  Record<LifecycleId, (companyId: string) => QueryInvalidationKey[]>
> = {
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

function deriveDashboardRefreshKeys(eventId: string, companyId: string): QueryInvalidationKey[] {
  const definition = getBusinessEvent(eventId);
  if (!definition) return [];

  const keys: QueryInvalidationKey[] = [];
  const seen = new Set<string>();
  const add = (key: QueryInvalidationKey) => {
    const signature = JSON.stringify(key);
    if (seen.has(signature)) return;
    seen.add(signature);
    keys.push(key);
  };

  const lifecycleKeys = LIFECYCLE_ENTITY_QUERY_KEYS[definition.lifecycleId];
  if (lifecycleKeys) lifecycleKeys(companyId).forEach(add);

  if (pipelineRequires('accounting', definition.orchestrationPipeline)) {
    add(['journal_entries', companyId]);
  }
  if (
    pipelineRequires('dashboard', definition.orchestrationPipeline) ||
    pipelineRequires('activity', definition.orchestrationPipeline)
  ) {
    add(['dashboardData']);
  }
  if (pipelineRequires('reporting', definition.orchestrationPipeline)) {
    add(['reports']);
  }

  return keys;
}

export const dashboardSubscriber: BusinessEventSubscriber = {
  subscriberId: 'dashboard',

  handles: (event) => !!getBusinessEvent(event.eventId),

  onEvent: (event): SubscriberResult => ({
    subscriberId: 'dashboard',
    handled: true,
    status: 'success',
    dashboardRefreshKeys: deriveDashboardRefreshKeys(event.eventId, event.companyId),
  }),
};
