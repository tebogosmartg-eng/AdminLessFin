/**
 * Business Operations Engine — Subscriber Registry (P0.5)
 */

import type { BusinessEventSubscriber } from './contracts';
import { activitySubscriber } from './activitySubscriber';
import { aiSubscriber } from './aiSubscriber';
import { auditSubscriber } from './auditSubscriber';
import { calendarSubscriber } from './calendarSubscriber';
import { dashboardSubscriber } from './dashboardSubscriber';
import { documentSubscriber } from './documentSubscriber';
import { notificationSubscriber } from './notificationSubscriber';

const DEFAULT_SUBSCRIBERS: BusinessEventSubscriber[] = [
  activitySubscriber,
  dashboardSubscriber,
  notificationSubscriber,
  documentSubscriber,
  auditSubscriber,
  calendarSubscriber,
  aiSubscriber,
];

let registeredSubscribers: BusinessEventSubscriber[] = [...DEFAULT_SUBSCRIBERS];

export function getSubscribers(): readonly BusinessEventSubscriber[] {
  return registeredSubscribers;
}

export function registerSubscriber(subscriber: BusinessEventSubscriber): void {
  if (registeredSubscribers.some((s) => s.subscriberId === subscriber.subscriberId)) {
    throw new Error(`Subscriber already registered: ${subscriber.subscriberId}`);
  }
  registeredSubscribers = [...registeredSubscribers, subscriber];
}

export function resetSubscribers(): void {
  registeredSubscribers = [...DEFAULT_SUBSCRIBERS];
}

export function getSubscriberById(subscriberId: string): BusinessEventSubscriber | undefined {
  return registeredSubscribers.find((s) => s.subscriberId === subscriberId);
}
