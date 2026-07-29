/**
 * Business Operations Engine — Calendar Navigation Service
 *
 * Maps operational calendar events to lifecycle stages and deep-link routes.
 */

import type { LifecycleId } from '../businessLifecycles';

export type CalendarEventType =
  | 'invoice'
  | 'bill'
  | 'payroll'
  | 'recurring_invoice'
  | 'recurring_bill'
  | 'payroll_review'
  | 'claim_deadline'
  | 'payslip_release';

export type CalendarNavigationTarget = {
  route: string;
  lifecycleId: LifecycleId;
  stageId: string;
  label: string;
};

const CALENDAR_EVENT_MAP: Record<CalendarEventType, Omit<CalendarNavigationTarget, 'route'> & { routeBuilder: (id: string) => string }> = {
  invoice: {
    lifecycleId: 'revenue',
    stageId: 'collections',
    label: 'Invoice due',
    routeBuilder: (id) => `/invoices/${id}`,
  },
  bill: {
    lifecycleId: 'procurement',
    stageId: 'payment',
    label: 'Bill due',
    routeBuilder: (id) => `/bills?highlight=${id}`,
  },
  payroll: {
    lifecycleId: 'payroll',
    stageId: 'processing',
    label: 'Payroll pay date',
    routeBuilder: (id) => `/payroll-runs/${id}`,
  },
  payroll_review: {
    lifecycleId: 'payroll',
    stageId: 'validation',
    label: 'Payroll review',
    routeBuilder: (id) => `/payroll-runs/${id.replace(/^(review-|payroll-|payslip-)/, '')}`,
  },
  payslip_release: {
    lifecycleId: 'payroll',
    stageId: 'payslips',
    label: 'Payslip release',
    routeBuilder: (id) => `/payroll-runs/${id.replace(/^(review-|payroll-|payslip-)/, '')}`,
  },
  claim_deadline: {
    lifecycleId: 'projects',
    stageId: 'expenses',
    label: 'Expense claim deadline',
    routeBuilder: () => '/expense-claims',
  },
  recurring_invoice: {
    lifecycleId: 'revenue',
    stageId: 'invoice',
    label: 'Recurring invoice',
    routeBuilder: () => '/recurring-invoices',
  },
  recurring_bill: {
    lifecycleId: 'procurement',
    stageId: 'bill',
    label: 'Recurring bill',
    routeBuilder: () => '/recurring-bills',
  },
};

export function resolveCalendarNavigation(
  type: CalendarEventType,
  eventId: string
): CalendarNavigationTarget {
  const mapping = CALENDAR_EVENT_MAP[type];
  return {
    route: mapping.routeBuilder(eventId),
    lifecycleId: mapping.lifecycleId,
    stageId: mapping.stageId,
    label: mapping.label,
  };
}

export function navigateToCalendarEvent(
  navigate: (route: string) => void,
  type: CalendarEventType,
  eventId: string
): CalendarNavigationTarget {
  const target = resolveCalendarNavigation(type, eventId);
  navigate(target.route);
  return target;
}
