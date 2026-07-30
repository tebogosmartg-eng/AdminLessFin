import { describe, expect, it } from 'vitest';
import {
  buildAttentionSummary,
  buildPreparationChecklist,
} from '../../src/lib/financialStatements/engagementPreparation';
import type { EfsDashboard } from '../../src/lib/financialStatements/api';

function dashboard(partial: Partial<EfsDashboard> & { workspace: EfsDashboard['workspace'] }): EfsDashboard {
  return {
    reportingPeriod: {
      id: 'rp-1',
      label: 'FY2027',
      period_key: 'FY2027',
      start_date: '2026-03-01',
      end_date: '2027-02-28',
      status: 'open_for_reporting',
      financial_year_id: 'fy-1',
    },
    framework: { id: 'fw-1', framework_key: 'IFRS_SME', version_id: 'v1', label: 'IFRS for SMEs' },
    snapshot: null,
    progress: { pct: 0, stage: partial.workspace.status },
    outstandingTasks: { count: 0, items: [], note: '' },
    validationSummary: { pass: 0, fail: 0, advisory: 0, note: 'later phases' },
    reviewStatus: { manager: 'draft', partner: 'draft', note: '' },
    publicationStatus: { status: 'not_ready', note: '' },
    recentActivity: [],
    ...partial,
  };
}

describe('engagement preparation workflow (V6.10.2)', () => {
  it('does not mark schedules or validation complete at engagement start', () => {
    const items = buildPreparationChecklist(
      dashboard({
        workspace: { id: 'ws', name: 'AFS', status: 'opened', progress_pct: 0 },
      }),
      {
        registered_name: 'Acme',
        registration_number: '2020/1',
        business_address: '1 Main',
      } as never,
    );
    expect(items.find((i) => i.id === 'schedules')?.status).toBe('pending');
    expect(items.find((i) => i.id === 'validation')?.status).toBe('pending');
    expect(items.find((i) => i.id === 'notes')?.status).toBe('pending');
  });

  it('recommends Trial Balance after company setup', () => {
    const items = buildPreparationChecklist(
      dashboard({
        workspace: { id: 'ws', name: 'AFS', status: 'opened', progress_pct: 5 },
      }),
      {
        registered_name: 'Acme',
        registration_number: '2020/1',
        business_address: '1 Main',
        reporting_framework: 'IFRS for SMEs',
      } as never,
    );
    const summary = buildAttentionSummary(items);
    expect(summary.nextTarget).toBe('trial-balance');
    expect(summary.nextActionLabel).toBe('Capture or import Trial Balance');
  });

  it('recommends generate statements after TB is ready', () => {
    const items = buildPreparationChecklist(
      dashboard({
        workspace: { id: 'ws', name: 'AFS', status: 'facts_sealed', progress_pct: 20 },
        snapshot: {
          id: 'snap',
          status: 'certified',
          currentVersion: {
            id: 'ver',
            version_no: 1,
            status: 'certified',
            content_hash: 'x',
            certified_at: '2026-07-01',
            frozen_at: null,
          },
        },
      }),
      {
        registered_name: 'Acme',
        registration_number: '2020/1',
        business_address: '1 Main',
      } as never,
    );
    const summary = buildAttentionSummary(items);
    expect(summary.nextTarget).toBe('statements');
    expect(summary.nextActionLabel).toBe('Generate Annual Financial Statements');
  });

  it('asks to run validation after statements — never false-complete', () => {
    const items = buildPreparationChecklist(
      dashboard({
        workspace: { id: 'ws', name: 'AFS', status: 'content_assembled', progress_pct: 50 },
        snapshot: {
          id: 'snap',
          status: 'certified',
          currentVersion: {
            id: 'ver',
            version_no: 1,
            status: 'certified',
            content_hash: 'x',
            certified_at: '2026-07-01',
            frozen_at: null,
          },
        },
      }),
      {
        registered_name: 'Acme',
        registration_number: '2020/1',
        business_address: '1 Main',
      } as never,
    );
    expect(items.find((i) => i.id === 'validation')?.status).toBe('attention');
    expect(items.find((i) => i.id === 'validation')?.actionLabel).toBe('Run validation checks');
    const summary = buildAttentionSummary(items);
    // schedules/notes may also be attention; first attention in order wins
    expect(['supporting-schedules', 'notes', 'validation']).toContain(summary.nextTarget);
  });
});
