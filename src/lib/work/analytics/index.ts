/** Analytics / Executive Intelligence — deterministic attention rules (no AI). */

export type AttentionItem = {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  ewmProjectId?: string;
};

export function buildAttentionQueue(input: {
  budgetRisks: Array<{ id: string; name: string; burnPct: number }>;
  deadlineRisks: Array<{ id: string; name: string; dueDate: string; daysRemaining: number }>;
  idleResources: Array<{ id: string; name: string }>;
  overallocations: Array<{ id: string; name: string; utilisationPct: number }>;
  pendingApprovals: number;
  outstandingSupplierInvoices: Array<{ id: string; name: string; amount: number }>;
  unbilledCompleted: Array<{ id: string; name: string; amount: number }>;
  cashFlowRisks: Array<{ id: string; name: string; outstanding: number }>;
}): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const p of input.budgetRisks) {
    items.push({
      id: `budget-${p.id}`,
      type: 'budget_risk',
      severity: p.burnPct >= 100 ? 'critical' : 'warning',
      title: `Budget risk: ${p.name}`,
      detail: `Operational burn at ${p.burnPct.toFixed(1)}% of budget.`,
      ewmProjectId: p.id,
    });
  }

  for (const p of input.deadlineRisks) {
    items.push({
      id: `deadline-${p.id}`,
      type: 'deadline_risk',
      severity: p.daysRemaining < 0 ? 'critical' : p.daysRemaining <= 7 ? 'warning' : 'info',
      title: `Deadline: ${p.name}`,
      detail: p.daysRemaining < 0
        ? `Overdue by ${Math.abs(p.daysRemaining)} day(s).`
        : `Due in ${p.daysRemaining} day(s) (${p.dueDate}).`,
      ewmProjectId: p.id,
    });
  }

  for (const r of input.idleResources) {
    items.push({
      id: `idle-${r.id}`,
      type: 'idle_resource',
      severity: 'info',
      title: `Idle resource: ${r.name}`,
      detail: 'Available capacity with low actual hours.',
    });
  }

  for (const r of input.overallocations) {
    items.push({
      id: `overload-${r.id}`,
      type: 'overallocation',
      severity: r.utilisationPct >= 120 ? 'critical' : 'warning',
      title: `Overallocated: ${r.name}`,
      detail: `Utilisation ${r.utilisationPct.toFixed(0)}%.`,
    });
  }

  if (input.pendingApprovals > 0) {
    items.push({
      id: 'pending-approvals',
      type: 'pending_payroll_approvals',
      severity: 'warning',
      title: 'Pending time approvals',
      detail: `${input.pendingApprovals} time entr${input.pendingApprovals === 1 ? 'y' : 'ies'} awaiting approval.`,
    });
  }

  for (const inv of input.outstandingSupplierInvoices) {
    items.push({
      id: `ap-${inv.id}`,
      type: 'outstanding_supplier',
      severity: 'warning',
      title: `Outstanding supplier: ${inv.name}`,
      detail: `Open AP ${inv.amount.toFixed(2)}.`,
      ewmProjectId: inv.id,
    });
  }

  for (const u of input.unbilledCompleted) {
    items.push({
      id: `unbilled-${u.id}`,
      type: 'unbilled_completed',
      severity: 'warning',
      title: `Unbilled work: ${u.name}`,
      detail: `Unbilled value ${u.amount.toFixed(2)}.`,
      ewmProjectId: u.id,
    });
  }

  for (const c of input.cashFlowRisks) {
    items.push({
      id: `cash-${c.id}`,
      type: 'cash_flow_risk',
      severity: 'critical',
      title: `Cash collection: ${c.name}`,
      detail: `Outstanding debtors ${c.outstanding.toFixed(2)}.`,
      ewmProjectId: c.id,
    });
  }

  const order = { critical: 0, warning: 1, info: 2 };
  return items.sort((a, b) => order[a.severity] - order[b.severity]);
}
