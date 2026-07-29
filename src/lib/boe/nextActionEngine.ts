/**
 * Business Operations Engine — Unified Next Action Engine
 *
 * Consolidates lifecycle-specific next-action logic. Pages consume this
 * service rather than embedding workflow decisions.
 */

import type { LifecycleId } from '../businessLifecycles';
import { BUSINESS_LIFECYCLES } from '../businessLifecycles';
import type { NextAction } from './platformServices';
import {
  quoteNextAction,
  invoiceNextAction,
  type QuoteWorkflowState,
  type InvoiceWorkflowState,
} from '../revenueWorkflow';
import { purchaseOrderNextAction, type PurchaseOrderWorkflowState } from '../procurementWorkflow';
import { resolveCurrentWorkflowStep, PAYROLL_WORKFLOW_STEPS } from '../payrollWorkflow';

export type EntityContext =
  | { lifecycleId: 'revenue'; entityType: 'quote'; state: QuoteWorkflowState }
  | { lifecycleId: 'revenue'; entityType: 'invoice'; state: InvoiceWorkflowState }
  | { lifecycleId: 'procurement'; entityType: 'purchase_order'; state: PurchaseOrderWorkflowState }
  | { lifecycleId: 'payroll'; entityType: 'payroll_run'; state: { status: string; approved_at?: string | null; output_metadata?: Record<string, unknown> | null }; payslipCount: number };

function stageLabel(lifecycleId: LifecycleId, stageId: string): string {
  const stage = BUSINESS_LIFECYCLES[lifecycleId].stages.find((s) => s.id === stageId);
  return stage?.label ?? stageId;
}

export function resolveNextAction(ctx: EntityContext): NextAction | null {
  switch (ctx.lifecycleId) {
    case 'revenue': {
      if (ctx.entityType === 'quote') {
        const action = quoteNextAction(ctx.state);
        if (!action) return null;
        return {
          label: action.label,
          description: action.description,
          route: action.route,
          lifecycleId: 'revenue',
          stageId: action.action === 'invoice' ? 'invoice' : action.action === 'send' ? 'approval' : 'approval',
        };
      }
      if (ctx.entityType === 'invoice') {
        const action = invoiceNextAction(ctx.state);
        if (!action) return null;
        const stageMap: Record<string, string> = {
          send: 'collections',
          payment: 'payment',
          reconcile: 'reconciliation',
        };
        return {
          label: action.label,
          description: action.description,
          route: action.route,
          lifecycleId: 'revenue',
          stageId: action.action ? stageMap[action.action] ?? 'invoice' : 'invoice',
        };
      }
      break;
    }
    case 'procurement': {
      if (ctx.entityType === 'purchase_order') {
        const action = purchaseOrderNextAction(ctx.state);
        if (!action) return null;
        return {
          label: action.label,
          description: action.description,
          route: action.route,
          lifecycleId: 'procurement',
          stageId: action.action === 'bill' ? 'bill' : action.action === 'payment' ? 'payment' : 'approval',
        };
      }
      break;
    }
    case 'payroll': {
      const step = resolveCurrentWorkflowStep(ctx.state, ctx.payslipCount);
      const stepDef = PAYROLL_WORKFLOW_STEPS.find((s) => s.id === step);
      if (!stepDef || step === 'archive') return null;

      const payrollActions: Record<string, NextAction> = {
        validate: {
          label: 'Generate payslips',
          description: stepDef.description,
          lifecycleId: 'payroll',
          stageId: 'validation',
        },
        review: {
          label: 'Review and approve',
          description: stepDef.description,
          lifecycleId: 'payroll',
          stageId: 'approval',
        },
        process: {
          label: 'Process payroll',
          description: stepDef.description,
          lifecycleId: 'payroll',
          stageId: 'processing',
        },
        outputs: {
          label: 'Download outputs',
          description: stepDef.description,
          lifecycleId: 'payroll',
          stageId: 'register',
        },
        bank_file: {
          label: 'Generate bank payment file',
          description: stepDef.description,
          lifecycleId: 'payroll',
          stageId: 'bank_file',
        },
        distribute: {
          label: 'Distribute payslips',
          description: stepDef.description,
          lifecycleId: 'payroll',
          stageId: 'payslips',
        },
      };

      return payrollActions[step] ?? null;
    }
  }
  return null;
}

export function formatNextActionStage(action: NextAction): string {
  return `${BUSINESS_LIFECYCLES[action.lifecycleId].label} · ${stageLabel(action.lifecycleId, action.stageId)}`;
}
