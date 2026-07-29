import type { BusinessEventSubscriber, SubscriberResult } from './contracts';

const CALENDAR_EVENT_IDS = new Set([
  'invoice.sent',
  'payment.received',
  'bill.payment_made',
  'payroll.processed',
]);

export const calendarSubscriber: BusinessEventSubscriber = {
  subscriberId: 'calendar',

  handles: (event) => CALENDAR_EVENT_IDS.has(event.eventId),

  onEvent: (event): SubscriberResult => ({
    subscriberId: 'calendar',
    handled: true,
    status: 'success',
    calendarHints: [
      {
        type: event.eventId,
        entityId: event.entityId,
        dueDate: typeof event.metadata?.dueDate === 'string' ? event.metadata.dueDate : undefined,
      },
    ],
  }),
};
