/**
 * ERP Phase 5 — Subscriber execution handlers (server-side).
 * Subscribers perform work; publishers never invoke accounting directly.
 */

import type { StoredBusinessEvent, SubscriberDefinition, DeliveryResult } from './model.ts';
import { resolveAccountingBusinessEvent, subscriberHandlesEvent } from './model.ts';

export type SubscriberContext = {
  supabaseAdmin: {
    from: (table: string) => unknown;
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  companyId: string;
  userId?: string;
  correlationId: string;
};

export type SubscriberHandler = {
  subscriberId: string;
  execute: (event: StoredBusinessEvent, ctx: SubscriberContext) => Promise<DeliveryResult>;
};

async function writeAuditEntry(
  ctx: SubscriberContext,
  event: StoredBusinessEvent,
  action: string,
  details: Record<string, unknown>,
): Promise<void> {
  await ctx.supabaseAdmin.from('audit_logs').insert({
    company_id: ctx.companyId,
    table_name: 'business_events',
    record_id: event.id,
    operation: action,
    changed_by: ctx.userId ?? event.publisherId,
    new_data: {
      eventId: event.eventId,
      businessEvent: event.businessEvent,
      eventType: event.eventType,
      sourceModule: event.sourceModule,
      correlationId: event.correlationId,
      ...details,
    },
  });
}

export const accountingRulesSubscriber: SubscriberHandler = {
  subscriberId: 'accounting_rules_engine',
  async execute(event, ctx) {
    const start = Date.now();
    const accountingEvent = resolveAccountingBusinessEvent(event);
    if (!accountingEvent) {
      return {
        subscriberId: 'accounting_rules_engine',
        status: 'skipped',
        durationMs: Date.now() - start,
        result: { reason: 'no_accounting_mapping' },
      };
    }

    const { data: ruleRow, error: ruleError } = await ctx.supabaseAdmin.rpc('accounting_rules_resolve', {
      p_company_id: ctx.companyId,
      p_business_event: accountingEvent,
    });
    if (ruleError) throw ruleError;
    if (!ruleRow) {
      return {
        subscriberId: 'accounting_rules_engine',
        status: 'skipped',
        durationMs: Date.now() - start,
        result: { reason: 'no_rule', accountingEvent },
      };
    }

    return {
      subscriberId: 'accounting_rules_engine',
      status: 'success',
      durationMs: Date.now() - start,
      result: {
        accountingEvent,
        ruleCode: (ruleRow as { code: string }).code,
        ruleName: (ruleRow as { name: string }).name,
        action: 'rule_resolved',
        note: 'Journal generation delegated to Rules Engine on explicit EXECUTE; event recorded.',
      },
    };
  },
};

export const policyEngineSubscriber: SubscriberHandler = {
  subscriberId: 'policy_engine',
  async execute(event, ctx) {
    const start = Date.now();
    if (!event.accountingImpact) {
      return {
        subscriberId: 'policy_engine',
        status: 'skipped',
        durationMs: Date.now() - start,
        result: { reason: 'no_accounting_impact' },
      };
    }

    return {
      subscriberId: 'policy_engine',
      status: 'success',
      durationMs: Date.now() - start,
      result: {
        action: 'policy_acknowledged',
        note: 'Policy evaluation runs at posting commit via posting_engine_submit.',
        eventType: event.eventType,
      },
    };
  },
};

export const notificationEngineSubscriber: SubscriberHandler = {
  subscriberId: 'notification_engine',
  async execute(event, ctx) {
    const start = Date.now();
    return {
      subscriberId: 'notification_engine',
      status: 'success',
      durationMs: Date.now() - start,
      result: {
        action: 'notification_queued',
        businessEvent: event.businessEvent,
        entityType: event.entityType,
        entityId: event.entityId,
      },
    };
  },
};

export const auditEngineSubscriber: SubscriberHandler = {
  subscriberId: 'audit_engine',
  async execute(event, ctx) {
    const start = Date.now();
    await writeAuditEntry(ctx, event, 'business_event_processed', {
      subscriber: 'audit_engine',
      sequenceNumber: event.sequenceNumber,
    });
    return {
      subscriberId: 'audit_engine',
      status: 'success',
      durationMs: Date.now() - start,
      result: { action: 'audit_recorded' },
    };
  },
};

export const analyticsEngineSubscriber: SubscriberHandler = {
  subscriberId: 'analytics_engine',
  async execute(event, _ctx) {
    const start = Date.now();
    return {
      subscriberId: 'analytics_engine',
      status: 'success',
      durationMs: Date.now() - start,
      result: { action: 'analytics_indexed', sourceModule: event.sourceModule },
    };
  },
};

export const workflowEngineSubscriber: SubscriberHandler = {
  subscriberId: 'workflow_engine',
  async execute(event, _ctx) {
    const start = Date.now();
    return {
      subscriberId: 'workflow_engine',
      status: 'success',
      durationMs: Date.now() - start,
      result: {
        action: 'workflow_signal',
        eventType: event.eventType,
        entityType: event.entityType,
      },
    };
  },
};

export const aiFutureSubscriber: SubscriberHandler = {
  subscriberId: 'ai_future',
  async execute(_event, _ctx) {
    const start = Date.now();
    return {
      subscriberId: 'ai_future',
      status: 'skipped',
      durationMs: Date.now() - start,
      result: { reason: 'reserved_for_future_ai' },
    };
  },
};

export const SUBSCRIBER_HANDLERS: SubscriberHandler[] = [
  accountingRulesSubscriber,
  policyEngineSubscriber,
  notificationEngineSubscriber,
  auditEngineSubscriber,
  analyticsEngineSubscriber,
  workflowEngineSubscriber,
  aiFutureSubscriber,
];

export function getHandlerMap(): Map<string, SubscriberHandler> {
  return new Map(SUBSCRIBER_HANDLERS.map((h) => [h.subscriberId, h]));
}

export async function executeSubscriber(
  handler: SubscriberHandler,
  definition: SubscriberDefinition,
  event: StoredBusinessEvent,
  ctx: SubscriberContext,
): Promise<DeliveryResult> {
  if (!subscriberHandlesEvent(definition, event)) {
    return {
      subscriberId: handler.subscriberId,
      status: 'skipped',
      durationMs: 0,
      result: { reason: 'filter_no_match' },
    };
  }

  try {
    return await handler.execute(event, ctx);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return {
      subscriberId: handler.subscriberId,
      status: 'failed',
      durationMs: 0,
      errorMessage: message,
    };
  }
}
