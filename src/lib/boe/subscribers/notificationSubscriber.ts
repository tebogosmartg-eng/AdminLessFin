import type { BusinessEventSubscriber, SubscriberResult } from './contracts';

export const notificationSubscriber: BusinessEventSubscriber = {
  subscriberId: 'notification',

  handles: (event) => {
    const targets = event.metadata?.notificationTargets;
    return Array.isArray(targets) && targets.length > 0;
  },

  onEvent: (event): SubscriberResult => {
    const targets = (event.metadata?.notificationTargets as string[] | undefined) ?? [];

    return {
      subscriberId: 'notification',
      handled: targets.length > 0,
      status: 'success',
      notificationsTriggered: targets.map((target) => ({
        channel: 'email' as const,
        target,
        status: 'deferred' as const,
        reason: 'Delivery remains in existing send-* edge functions.',
      })),
    };
  },
};
