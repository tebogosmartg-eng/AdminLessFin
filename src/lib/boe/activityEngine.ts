/**
 * Business Operations Engine — Activity Feed Service
 *
 * Normalises journal entries and audit logs into lifecycle-aware activity items.
 * No schema changes — client-side enrichment of existing data sources.
 */

import type { LifecycleId } from '../businessLifecycles';
import { inferEventFromJournalDescription, getBusinessEvent } from './businessEvents';
import type { ActivityFeedItem } from './platformServices';

export type { ActivityFeedItem };

type JournalActivity = {
  id: string;
  entry_date: string;
  description: string | null;
  created_at: string;
};

type AuditLogActivity = {
  id: string;
  action: string;
  table_name: string;
  record_id: string;
  created_at: string;
  profiles?: { full_name: string | null } | null;
};

const TABLE_LIFECYCLE_MAP: Record<string, { lifecycleId: LifecycleId; stageId: string; routePrefix: string }> = {
  invoices: { lifecycleId: 'revenue', stageId: 'invoice', routePrefix: '/invoices' },
  quotes: { lifecycleId: 'revenue', stageId: 'quote', routePrefix: '/quotes' },
  bills: { lifecycleId: 'procurement', stageId: 'bill', routePrefix: '/bills' },
  purchase_orders: { lifecycleId: 'procurement', stageId: 'purchase_order', routePrefix: '/purchase-orders' },
  payroll_runs: { lifecycleId: 'payroll', stageId: 'processing', routePrefix: '/payroll-runs' },
  journal_entries: { lifecycleId: 'accounting', stageId: 'journal', routePrefix: '/journal-entries' },
  fixed_assets: { lifecycleId: 'fixed_assets', stageId: 'capitalise', routePrefix: '/fixed-assets' },
  loans: { lifecycleId: 'loans', stageId: 'payments', routePrefix: '/loans' },
  expense_claims: { lifecycleId: 'projects', stageId: 'expenses', routePrefix: '/expense-claims' },
};

export function normalizeJournalActivity(entry: JournalActivity): ActivityFeedItem {
  const event = inferEventFromJournalDescription(entry.description ?? '');
  return {
    id: entry.id,
    eventId: event.id,
    label: event.label,
    lifecycleId: event.lifecycleId,
    stageId: event.stageId,
    timestamp: entry.created_at,
    summary: entry.description ?? event.label,
    route: '/journal-entries',
  };
}

export function normalizeAuditActivity(log: AuditLogActivity): ActivityFeedItem {
  const mapping = TABLE_LIFECYCLE_MAP[log.table_name];
  const lifecycleId = mapping?.lifecycleId ?? 'accounting';
  const stageId = mapping?.stageId ?? 'audit';
  const route = mapping ? `${mapping.routePrefix}/${log.record_id}` : '/settings';

  const eventId = `${log.table_name}.${log.action}`;
  const knownEvent = getBusinessEvent(eventId);

  return {
    id: log.id,
    eventId: knownEvent?.id ?? eventId,
    label: knownEvent?.label ?? `${log.action} ${log.table_name.replace(/_/g, ' ')}`,
    lifecycleId,
    stageId,
    timestamp: log.created_at,
    summary: knownEvent?.description ?? `${log.action} on ${log.table_name}`,
    route,
    actorName: log.profiles?.full_name ?? undefined,
  };
}

export function normalizeJournalActivities(entries: JournalActivity[]): ActivityFeedItem[] {
  return entries.map(normalizeJournalActivity);
}

export function groupActivitiesByLifecycle(items: ActivityFeedItem[]): Record<LifecycleId, ActivityFeedItem[]> {
  const grouped = {} as Record<LifecycleId, ActivityFeedItem[]>;
  for (const item of items) {
    if (!grouped[item.lifecycleId]) grouped[item.lifecycleId] = [];
    grouped[item.lifecycleId].push(item);
  }
  return grouped;
}
