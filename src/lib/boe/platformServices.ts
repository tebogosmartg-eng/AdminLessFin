/**
 * Business Operations Engine — Shared Platform Services
 *
 * Service contracts consumed by all lifecycles. Implementations are distributed
 * across existing edge functions and UI modules — this file is the contract layer.
 */

import type { LifecycleId } from '../businessLifecycles';
import type { BusinessEventContext, PlatformServiceId } from './orchestration';
import type { BusinessEventDefinition } from './businessEvents';

export type PlatformServiceStatus = 'active' | 'partial' | 'planned';

export type PlatformServiceDefinition = {
  id: PlatformServiceId;
  label: string;
  description: string;
  status: PlatformServiceStatus;
  implementation: string;
  consumers: LifecycleId[];
};

export const PLATFORM_SERVICES: Record<PlatformServiceId, PlatformServiceDefinition> = {
  workflow: {
    id: 'workflow',
    label: 'Workflow Service',
    description: 'Lifecycle stage resolution and next-action guidance',
    status: 'active',
    implementation: 'src/lib/boe/nextActionEngine.ts, src/lib/*Workflow.ts',
    consumers: ['revenue', 'procurement', 'payroll', 'accounting', 'financial_close'],
  },
  business_event: {
    id: 'business_event',
    label: 'Business Event Service',
    description: 'Event registry and orchestration metadata',
    status: 'active',
    implementation: 'src/lib/boe/businessEvents.ts',
    consumers: ['revenue', 'procurement', 'payroll', 'accounting', 'fixed_assets', 'loans', 'projects', 'tax', 'financial_close'],
  },
  approval: {
    id: 'approval',
    label: 'Approval Service',
    description: 'Approval gates for payroll, quotes, expense claims',
    status: 'partial',
    implementation: 'PayrollRunDetail, expense-claims edge function',
    consumers: ['payroll', 'procurement', 'projects'],
  },
  document: {
    id: 'document',
    label: 'Document Service',
    description: 'Quote, invoice, payslip, register, bank file generation',
    status: 'active',
    implementation: 'src/lib/payrollDocuments.ts, print/email dialogs',
    consumers: ['revenue', 'procurement', 'payroll', 'accounting', 'fixed_assets', 'projects'],
  },
  notification: {
    id: 'notification',
    label: 'Notification Service',
    description: 'Email and in-app notifications',
    status: 'partial',
    implementation: 'send-* edge functions, NotificationBell',
    consumers: ['revenue', 'procurement', 'payroll'],
  },
  activity: {
    id: 'activity',
    label: 'Activity Feed Service',
    description: 'Global business event activity stream',
    status: 'active',
    implementation: 'src/lib/boe/activityEngine.ts, dashboard-data',
    consumers: ['revenue', 'procurement', 'payroll', 'accounting', 'fixed_assets'],
  },
  calendar: {
    id: 'calendar',
    label: 'Calendar Service',
    description: 'Operational calendar with lifecycle deep links',
    status: 'active',
    implementation: 'calendar-events edge function, src/lib/boe/calendarNavigation.ts',
    consumers: ['revenue', 'procurement', 'payroll', 'tax', 'financial_close'],
  },
  timeline: {
    id: 'timeline',
    label: 'Timeline Service',
    description: 'Chronological lifecycle event history per entity',
    status: 'partial',
    implementation: 'PayrollTimeline, payroll_audit_events',
    consumers: ['payroll'],
  },
  search: {
    id: 'search',
    label: 'Search Service',
    description: 'Global entity search across lifecycles',
    status: 'active',
    implementation: 'global-search edge function, CommandMenu',
    consumers: ['revenue', 'procurement', 'payroll', 'accounting', 'fixed_assets', 'loans', 'projects'],
  },
  audit: {
    id: 'audit',
    label: 'Audit Service',
    description: 'Immutable change log and compliance trail',
    status: 'active',
    implementation: 'audit_logs table, settings edge function, AuditLogViewer',
    consumers: ['revenue', 'procurement', 'payroll', 'accounting', 'financial_close'],
  },
  reporting: {
    id: 'reporting',
    label: 'Reporting Service',
    description: 'Financial and operational reports',
    status: 'active',
    implementation: 'reports edge function, financial statement pages',
    consumers: ['revenue', 'procurement', 'payroll', 'accounting', 'projects', 'tax'],
  },
  dashboard: {
    id: 'dashboard',
    label: 'Dashboard Service',
    description: 'Operations command centre with lifecycle-grouped actions',
    status: 'active',
    implementation: 'dashboard-data edge function, OperationsActionPanel',
    consumers: ['revenue', 'procurement', 'payroll', 'accounting', 'projects'],
  },
  ai: {
    id: 'ai',
    label: 'AI Service',
    description: 'Advisory insights — never posts transactions',
    status: 'partial',
    implementation: 'PayrollAiInsights, DashboardInsights, ai-copilot edge function',
    consumers: ['payroll', 'revenue', 'procurement'],
  },
  permission: {
    id: 'permission',
    label: 'Permission Service',
    description: 'Role-based access per company',
    status: 'active',
    implementation: 'AuthContext, AdminRoute, edge function membership checks',
    consumers: ['revenue', 'procurement', 'payroll', 'accounting', 'fixed_assets', 'loans', 'projects', 'tax', 'financial_close'],
  },
  history: {
    id: 'history',
    label: 'History Service',
    description: 'Entity and customer/vendor transaction history',
    status: 'active',
    implementation: 'CustomerDetail, VendorDetail, payroll runs',
    consumers: ['revenue', 'procurement', 'payroll', 'loans', 'fixed_assets'],
  },
};

export type ServiceConsumerMatrix = {
  lifecycleId: LifecycleId;
  services: Partial<Record<PlatformServiceId, PlatformServiceStatus>>;
};

export function buildLifecycleServiceMatrix(): ServiceConsumerMatrix[] {
  const lifecycles: LifecycleId[] = [
    'revenue', 'procurement', 'payroll', 'accounting', 'fixed_assets',
    'loans', 'projects', 'tax', 'financial_close',
  ];

  return lifecycles.map((lifecycleId) => {
    const services: Partial<Record<PlatformServiceId, PlatformServiceStatus>> = {};
    for (const svc of Object.values(PLATFORM_SERVICES)) {
      if (svc.consumers.includes(lifecycleId)) {
        services[svc.id] = svc.status;
      }
    }
    return { lifecycleId, services };
  });
}

export type ActivityFeedItem = {
  id: string;
  eventId: string;
  label: string;
  lifecycleId: LifecycleId;
  stageId: string;
  timestamp: string;
  summary: string;
  route?: string;
  actorName?: string;
};

export type NextAction = {
  label: string;
  description: string;
  route?: string;
  eventId?: string;
  lifecycleId: LifecycleId;
  stageId: string;
};

export interface IWorkflowService {
  resolveStage(lifecycleId: LifecycleId, entityState: unknown): string;
  getNextAction(lifecycleId: LifecycleId, entityState: unknown): NextAction | null;
}

export interface IActivityService {
  normalizeJournalEntries(entries: unknown[]): ActivityFeedItem[];
  normalizeAuditLogs(logs: unknown[]): ActivityFeedItem[];
}

export interface ICalendarService {
  resolveNavigation(event: { type: string; id: string }): { route: string; lifecycleId: LifecycleId; stageId: string };
}

export interface IDocumentService {
  getDocumentsForEvent(event: BusinessEventDefinition): string[];
}

export type BusinessOperationsEngine = {
  events: typeof import('./businessEvents').BUSINESS_EVENTS;
  services: typeof PLATFORM_SERVICES;
  context: BusinessEventContext | null;
};
