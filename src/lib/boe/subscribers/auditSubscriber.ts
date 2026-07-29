import { getBusinessEvent } from '../businessEvents';
import type { BusinessEventSubscriber, SubscriberResult } from './contracts';

export const auditSubscriber: BusinessEventSubscriber = {
  subscriberId: 'audit',

  handles: (event) => {
    const definition = getBusinessEvent(event.eventId);
    return definition?.orchestrationPipeline.includes('audit') ?? false;
  },

  onEvent: (event): SubscriberResult => ({
    subscriberId: 'audit',
    handled: true,
    status: 'success',
    auditReference: {
      referenceId: event.correlationId,
      source: 'edge_function',
      status: 'deferred',
      note: 'Audit trail is written by edge function handlers; subscriber does not verify persistence.',
    },
  }),
};
