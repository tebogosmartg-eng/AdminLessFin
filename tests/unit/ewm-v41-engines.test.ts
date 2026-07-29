/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { calculateHours, calculateLabourCost, calculateBillableValue, assertMutableStatus } from '../../src/lib/work/time';
import { utilisationPercent, capacityRemaining, isOverallocated, isIdle } from '../../src/lib/work/capacity';
import { forecastCostAtCompletion, forecastMargin, budgetBurnPct, isBudgetAtRisk } from '../../src/lib/work/costing';
import { costCategoryForResourceType, assertNotPayrollPath, isPayrollEligibleResourceType } from '../../src/lib/work/resource';
import { buildPayrollInputFact } from '../../src/lib/work/payrollAdapter';
import { toTimesheetProjection } from '../../src/lib/work/billing';
import { sessionHours, nextSessionStatus } from '../../src/lib/work/clocking';
import { buildAttentionQueue } from '../../src/lib/work/analytics';

describe('EWM time engine', () => {
  it('derives hours from start/finish minus breaks', () => {
    expect(
      calculateHours({
        startAt: '2026-07-13T08:00:00Z',
        finishAt: '2026-07-13T17:00:00Z',
        breakMinutes: 60,
      }),
    ).toBe(8);
  });

  it('computes labour and billable value', () => {
    expect(calculateLabourCost(8, 100)).toBe(800);
    expect(calculateBillableValue(8, 250, true)).toBe(2000);
    expect(calculateBillableValue(8, 250, false)).toBe(0);
  });

  it('blocks mutation of locked statuses', () => {
    expect(() => assertMutableStatus('locked')).toThrow(/immutable/);
  });
});

describe('EWM capacity', () => {
  it('computes utilisation and remaining', () => {
    expect(utilisationPercent(40, 20)).toBe(50);
    expect(capacityRemaining(40, 25)).toBe(15);
    expect(isOverallocated(40, 45)).toBe(true);
    expect(isIdle(40, 5)).toBe(true);
  });
});

describe('EWM costing', () => {
  it('forecasts cost and margin', () => {
    expect(forecastCostAtCompletion({ burn: 1000, remainingHours: 10, blendedRate: 100 })).toBe(2000);
    expect(forecastMargin({ contractValue: 5000, forecastCost: 2000 })).toEqual({ profit: 3000, marginPct: 60 });
    expect(budgetBurnPct(1000, 850)).toBe(85);
    expect(isBudgetAtRisk(1000, 1100)).toBe(true);
  });
});

describe('EWM resource registry', () => {
  it('maps types and forbids subcontractor payroll', () => {
    expect(costCategoryForResourceType('subcontractor')).toBe('subcontractor');
    expect(isPayrollEligibleResourceType('subcontractor')).toBe(false);
    expect(() => assertNotPayrollPath('subcontractor')).toThrow(/never generate payroll/);
  });
});

describe('EWM payroll adapter', () => {
  it('excludes subcontractors and marks temp as wage_input', () => {
    const excluded = buildPayrollInputFact({
      companyId: 'c1',
      employeeId: 'e1',
      resourceTypeId: 'subcontractor',
      timeEntryId: 't1',
      entryDate: '2026-07-13',
      hours: 8,
    });
    expect(excluded?.status).toBe('excluded');

    const temp = buildPayrollInputFact({
      companyId: 'c1',
      employeeId: 'e1',
      resourceTypeId: 'temporary_labour',
      timeEntryId: 't2',
      entryDate: '2026-07-13',
      hours: 8,
    });
    expect(temp?.status).toBe('ready');
    expect(temp?.wage_input).toBe(true);
  });
});

describe('EWM billing bridge', () => {
  it('projects to timesheet shape', () => {
    const row = toTimesheetProjection({
      companyId: 'c1',
      legacyProjectId: 'p1',
      userId: 'u1',
      entryDate: '2026-07-13',
      hours: 4,
      timeEntryId: 'te1',
    });
    expect(row.project_id).toBe('p1');
    expect(row.is_billed).toBe(false);
  });
});

describe('EWM clocking', () => {
  it('calculates session hours and status transitions', () => {
    expect(
      sessionHours({
        clockedInAt: '2026-07-13T08:00:00Z',
        clockedOutAt: '2026-07-13T12:00:00Z',
        breakMinutes: 30,
      }),
    ).toBe(3.5);
    expect(nextSessionStatus('open', 'break_start')).toBe('on_break');
    expect(nextSessionStatus('on_break', 'break_end')).toBe('open');
    expect(nextSessionStatus('open', 'clock_out')).toBe('closed');
  });
});

describe('EWM executive intelligence', () => {
  it('orders attention by severity', () => {
    const items = buildAttentionQueue({
      budgetRisks: [{ id: 'p1', name: 'Alpha', burnPct: 110 }],
      deadlineRisks: [{ id: 'p1', name: 'Alpha milestone', dueDate: '2026-07-20', daysRemaining: 3 }],
      idleResources: [],
      overallocations: [],
      pendingApprovals: 2,
      outstandingSupplierInvoices: [],
      unbilledCompleted: [],
      cashFlowRisks: [],
    });
    expect(items[0].severity).toBe('critical');
    expect(items.some((i) => i.type === 'pending_payroll_approvals')).toBe(true);
  });
});
