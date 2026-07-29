import type { ReportDefinitionInput } from '../../registry/reportDefinition';
import { isReportRegistered, registerReport } from '../../registry/reportRegistry';
import { buildAttentionQueue } from '../../../lib/work/analytics';
import { budgetBurnPct, forecastCostAtCompletion, forecastMargin } from '../../../lib/work/costing';

const PORTFOLIO_HEALTH: ReportDefinitionInput = {
  id: 'work.analytical.portfolio_health',
  name: 'EWM Portfolio Health',
  module: 'work',
  category: 'analytical',
  description: 'Operational portfolio health composed from EWM cost and capacity facts (not GL recalculation).',
  supportedFilters: [
    { id: 'start', label: 'Period start', type: 'date_range' },
    { id: 'end', label: 'Period end', type: 'date_range' },
  ],
  supportedExports: ['csv', 'excel', 'json'],
  permissions: { permissions: ['work.reports.read'] },
  enabled: true,
  tags: ['ewm', 'portfolio', 'operations'],
  generator: (ctx) => {
    const projects = ((ctx.source as any)?.projects) || [];
    const rows = projects.map((p: any) => {
      const burn = Number(p.burn || 0);
      const budget = Number(p.budget || 0);
      const remainingHours = Number(p.remainingHours || 0);
      const blendedRate = Number(p.blendedRate || 0);
      const forecastCost = forecastCostAtCompletion({ burn, remainingHours, blendedRate });
      const { profit, marginPct } = forecastMargin({
        contractValue: Number(p.contractValue || 0),
        forecastCost,
      });
      return {
        project: p.name,
        status: p.status,
        contract_value: Number(p.contractValue || 0),
        burn,
        budget_burn_pct: budgetBurnPct(budget, burn),
        forecast_cost: forecastCost,
        forecast_profit: profit,
        forecast_margin_pct: marginPct,
      };
    });
    return {
      reportId: 'work.analytical.portfolio_health',
      generatedAt: new Date().toISOString(),
      title: 'EWM Portfolio Health',
      rows,
      meta: { domain: 'work', authority: 'operational_facts' },
    };
  },
};

const ATTENTION_QUEUE: ReportDefinitionInput = {
  id: 'work.operational.attention_queue',
  name: 'EWM Executive Attention Queue',
  module: 'work',
  category: 'operational',
  description: 'Deterministic executive intelligence queue (no AI).',
  supportedFilters: [],
  supportedExports: ['csv', 'json'],
  permissions: { permissions: ['work.reports.read'] },
  enabled: true,
  tags: ['ewm', 'alerts'],
  generator: (ctx) => {
    const input = (ctx.source as any)?.attention || {
      budgetRisks: [],
      deadlineRisks: [],
      idleResources: [],
      overallocations: [],
      pendingApprovals: 0,
      outstandingSupplierInvoices: [],
      unbilledCompleted: [],
      cashFlowRisks: [],
    };
    const items = buildAttentionQueue(input);
    return {
      reportId: 'work.operational.attention_queue',
      generatedAt: new Date().toISOString(),
      title: 'EWM Executive Attention Queue',
      rows: items.map((i) => ({
        id: i.id,
        type: i.type,
        severity: i.severity,
        title: i.title,
        detail: i.detail,
        ewm_project_id: i.ewmProjectId || '',
      })),
      meta: { domain: 'work', ai: false },
    };
  },
};

const PROJECT_ECONOMICS: ReportDefinitionInput = {
  id: 'work.management.project_economics',
  name: 'EWM Project Economics',
  module: 'work',
  category: 'management',
  description: 'Contract / burn / forecast composition for project command centres.',
  supportedFilters: [{ id: 'project', label: 'EWM Project', type: 'string' }],
  supportedExports: ['csv', 'excel', 'pdf', 'json'],
  permissions: { permissions: ['work.reports.read'] },
  enabled: true,
  tags: ['ewm', 'profitability'],
  generator: (ctx) => {
    const economics = (ctx.source as any)?.economics || [];
    return {
      reportId: 'work.management.project_economics',
      generatedAt: new Date().toISOString(),
      title: 'EWM Project Economics',
      rows: economics,
      meta: { domain: 'work', gl_authority: 'accounting', op_authority: 'ewm' },
    };
  },
};

export function registerWorkReports(): string[] {
  const ids: string[] = [];
  for (const def of [PORTFOLIO_HEALTH, ATTENTION_QUEUE, PROJECT_ECONOMICS]) {
    if (isReportRegistered(def.id)) continue;
    registerReport(def);
    ids.push(def.id);
  }
  return ids;
}
