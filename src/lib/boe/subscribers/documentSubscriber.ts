import type { BusinessEventSubscriber, SubscriberResult } from './contracts';

export const documentSubscriber: BusinessEventSubscriber = {
  subscriberId: 'document',

  handles: (event) => event.documentTypes.length > 0,

  onEvent: (event): SubscriberResult => ({
    subscriberId: 'document',
    handled: event.documentTypes.length > 0,
    status: 'success',
    documentsProduced: event.documentTypes.map((documentType) => ({
      documentType,
      status: 'produced' as const,
      reference: event.entityId ? `${documentType}:${event.entityId}` : undefined,
    })),
  }),
};
