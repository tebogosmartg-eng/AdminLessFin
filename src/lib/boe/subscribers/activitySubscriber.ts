import type { BusinessEventSubscriber, SubscriberResult } from './contracts';

export const activitySubscriber: BusinessEventSubscriber = {
  subscriberId: 'activity',

  handles: (event) => event.lifecycleId !== undefined,

  onEvent: (event): SubscriberResult => {
    const route =
      event.entityType === 'invoice' && event.entityId
        ? `/invoices/${event.entityId}`
        : event.entityType === 'invoice'
          ? '/invoices'
          : undefined;

    return {
      subscriberId: 'activity',
      handled: true,
      status: 'success',
      activityEntries: [
        {
          id: `${event.correlationId}:activity`,
          eventId: event.eventId,
          label: event.eventName,
          lifecycleId: event.lifecycleId,
          stageId: event.lifecycleStageId,
          timestamp: event.occurredAt,
          summary:
            typeof event.metadata?.entityLabel === 'string'
              ? event.metadata.entityLabel
              : event.eventName,
          route,
          actorId: event.actorId,
        },
      ],
    };
  },
};
