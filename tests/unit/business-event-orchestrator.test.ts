import { describe, expect, it } from 'vitest';
import {
  buildAggregateKey,
  buildEventId,
  buildIdempotencyKey,
  resolveAccountingBusinessEvent,
  resolveEventStatus,
  sortSubscribersByPriority,
  subscriberHandlesEvent,
} from '../../src/governance/domains/businessEventOrchestrator/orchestrate';

describe('Business Event Orchestrator', () => {
  it('builds aggregate key from entity type and id', () => {
    expect(buildAggregateKey('invoice', 'inv-001')).toBe('invoice:inv-001');
  });

  it('builds deterministic idempotency key when not provided', () => {
    const key = buildIdempotencyKey({
      sourceModule: 'sales',
      businessEvent: 'invoice',
      eventType: 'posted',
      entityType: 'invoice',
      entityId: 'inv-001',
      timestamp: '2026-07-27T10:00:00.000Z',
    });
    expect(key).toBe('sales:invoice:posted:invoice:inv-001:2026-07-27T10:00:00.000Z');
  });

  it('preserves explicit idempotency key', () => {
    expect(buildIdempotencyKey({
      idempotencyKey: 'custom-key',
      sourceModule: 'sales',
      businessEvent: 'invoice',
      eventType: 'posted',
      entityType: 'invoice',
      entityId: 'inv-001',
    })).toBe('custom-key');
  });

  it('builds event id when not provided', () => {
    const id = buildEventId({
      sourceModule: 'payroll',
      entityType: 'run',
      entityId: 'run-42',
      eventType: 'approved',
    });
    expect(id).toMatch(/^evt_payroll_run_run-42_approved_/);
  });

  it('resolves accounting business event from payload override', () => {
    const mapped = resolveAccountingBusinessEvent({
      businessEvent: 'invoice',
      sourceModule: 'sales',
      eventType: 'posted',
      payload: { accounting_business_event: 'sales_invoice' },
    });
    expect(mapped).toBe('sales_invoice');
  });

  it('resolves accounting business event from module map', () => {
    const mapped = resolveAccountingBusinessEvent({
      businessEvent: 'invoice',
      sourceModule: 'sales',
      eventType: 'posted',
    });
    expect(mapped).toBe('sales_invoice');
  });

  it('resolves direct posted business event name', () => {
    const mapped = resolveAccountingBusinessEvent({
      businessEvent: 'payroll_run',
      sourceModule: 'payroll',
      eventType: 'posted',
    });
    expect(mapped).toBe('payroll_run');
  });

  it('filters subscribers by accounting impact', () => {
    const rulesSubscriber = {
      subscriberId: 'accounting_rules_engine',
      name: 'Rules',
      enabled: true,
      priority: 10,
      handlesModules: [],
      handlesEventTypes: ['posted'],
      handlesAccountingImpact: true,
    };

    expect(subscriberHandlesEvent(rulesSubscriber, {
      sourceModule: 'sales',
      eventType: 'posted',
      accountingImpact: true,
    })).toBe(true);

    expect(subscriberHandlesEvent(rulesSubscriber, {
      sourceModule: 'sales',
      eventType: 'posted',
      accountingImpact: false,
    })).toBe(false);
  });

  it('sorts subscribers by priority ascending', () => {
    const sorted = sortSubscribersByPriority([
      { subscriberId: 'b', name: 'B', enabled: true, priority: 50, handlesModules: [], handlesEventTypes: [], handlesAccountingImpact: null },
      { subscriberId: 'a', name: 'A', enabled: true, priority: 10, handlesModules: [], handlesEventTypes: [], handlesAccountingImpact: null },
    ]);
    expect(sorted.map((s) => s.subscriberId)).toEqual(['a', 'b']);
  });

  it('resolves event status from delivery results', () => {
    expect(resolveEventStatus([
      { subscriberId: 'audit', status: 'success', durationMs: 5 },
      { subscriberId: 'notify', status: 'skipped', durationMs: 0 },
    ])).toBe('completed');

    expect(resolveEventStatus([
      { subscriberId: 'audit', status: 'success', durationMs: 5 },
      { subscriberId: 'rules', status: 'failed', durationMs: 10 },
    ])).toBe('partial');

    expect(resolveEventStatus([
      { subscriberId: 'rules', status: 'failed', durationMs: 10 },
    ])).toBe('failed');
  });
});
