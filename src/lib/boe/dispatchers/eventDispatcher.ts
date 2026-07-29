/**
 * Business Operations Engine — Event Dispatcher (P0.5)
 *
 * Dispatches completed business events to registered subscribers.
 * Subscribers are independent and UI-agnostic.
 * Subscriber failures are isolated — they never abort successful business operations.
 */

import type { BusinessEvent } from '../events/businessEvent';
import type { SubscriberResult } from '../subscribers/contracts';
import { getSubscribers } from '../subscribers/registry';
import { createCorrelationId } from '../../platform/platformError';

export type EventDispatchResult = {
  event: BusinessEvent;
  subscriberResults: SubscriberResult[];
  subscribersExecuted: string[];
  subscribersFailed: string[];
  subscriberWarnings: string[];
};

export async function dispatchBusinessEvent(event: BusinessEvent): Promise<EventDispatchResult> {
  const subscribers = getSubscribers();
  const subscriberResults: SubscriberResult[] = [];
  const subscribersExecuted: string[] = [];
  const subscribersFailed: string[] = [];
  const subscriberWarnings: string[] = [];

  for (const subscriber of subscribers) {
    if (!subscriber.handles(event)) {
      subscriberResults.push({
        subscriberId: subscriber.subscriberId,
        handled: false,
        status: 'skipped',
      });
      continue;
    }

    try {
      const result = await subscriber.onEvent(event);
      subscriberResults.push({
        ...result,
        subscriberId: subscriber.subscriberId,
        handled: true,
        status: result.status ?? 'success',
      });
      subscribersExecuted.push(subscriber.subscriberId);
    } catch (cause) {
      const correlationId = createCorrelationId('sub');
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error(`[BOE:subscriber-failed] ${subscriber.subscriberId}`, { correlationId, message, cause });

      subscriberResults.push({
        subscriberId: subscriber.subscriberId,
        handled: true,
        status: 'failed',
        error: { message, correlationId },
      });
      subscribersFailed.push(subscriber.subscriberId);
      subscriberWarnings.push(`${subscriber.subscriberId}: ${message} (${correlationId})`);
    }
  }

  return {
    event,
    subscriberResults,
    subscribersExecuted,
    subscribersFailed,
    subscriberWarnings,
  };
}
