import type { BusinessEventSubscriber, SubscriberResult } from './contracts';

const AI_EVENT_IDS = new Set([
  'quote.approved',
  'payroll.approved',
  'invoice.created',
  'bill.created',
]);

export const aiSubscriber: BusinessEventSubscriber = {
  subscriberId: 'ai',

  handles: (event) => AI_EVENT_IDS.has(event.eventId),

  onEvent: (event): SubscriberResult => ({
    subscriberId: 'ai',
    handled: true,
    status: 'success',
    aiContextHints: {
      eventId: event.eventId,
      lifecycleId: event.lifecycleId,
      stageId: event.lifecycleStageId,
      entityType: event.entityType,
      entityId: event.entityId,
      advisoryOnly: true,
    },
  }),
};
