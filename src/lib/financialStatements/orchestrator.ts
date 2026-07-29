/**
 * V6.6.1 Auto-Orchestration Layer (client-side)
 *
 * Chains existing certified financial-statements APIs in their required order.
 * Resume-safe: each step inspects current state before acting.
 * Progress labels use accounting language — never engine terminology.
 */

import {
  invokeFinancialStatements,
  type EfsEngagementGeneralInformation,
  type EfsFrameworkPack,
  type EfsPeriod,
  type EfsWorkspaceListItem,
} from './api';
import { accountingPoliciesService } from '@/governance/domains/accountingPolicies/service';

export type OrchestratorStepId =
  | 'setup'
  | 'capture_tb'
  | 'prepare_statements'
  | 'prepare_notes'
  | 'validate'
  | 'setup_review';

export type OrchestratorStep = {
  id: OrchestratorStepId;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  detail?: string;
};

export type OrchestratorProgress = {
  steps: OrchestratorStep[];
  currentStepId: OrchestratorStepId | null;
  workspaceId: string | null;
  error?: string;
};

export type OrchestratorInput = {
  companyId: string;
  frameworkPackId: string;
  frameworkLabel?: string;
  generalInformation: EfsEngagementGeneralInformation;
  /**
   * G3.6D — period identity MUST come from Enterprise Financial Calendar.
   * financial_year_id is required for new engagements (one engagement per calendar year).
   */
  period?: {
    financial_year_id: string;
    period_key: string;
    label: string;
    start_date: string;
    end_date: string;
  };
  /** Re-run against an existing workspace (resume) */
  workspaceId?: string;
  onProgress?: (progress: OrchestratorProgress) => void;
};

export type OrchestratorResult = {
  workspaceId: string;
  periodId: string;
  progress: OrchestratorProgress;
};

function initialSteps(): OrchestratorStep[] {
  return [
    { id: 'setup', label: 'Setting up engagement', status: 'pending' },
    { id: 'capture_tb', label: 'Capturing trial balance', status: 'pending' },
    { id: 'prepare_statements', label: 'Preparing statements', status: 'pending' },
    { id: 'prepare_notes', label: 'Preparing notes and disclosures', status: 'pending' },
    { id: 'validate', label: 'Checking your financial statements', status: 'pending' },
    { id: 'setup_review', label: 'Setting up review', status: 'pending' },
  ];
}

function emit(
  steps: OrchestratorStep[],
  currentStepId: OrchestratorStepId | null,
  workspaceId: string | null,
  onProgress?: (p: OrchestratorProgress) => void,
  error?: string,
) {
  onProgress?.({ steps: steps.map((s) => ({ ...s })), currentStepId, workspaceId, error });
}

function mark(
  steps: OrchestratorStep[],
  id: OrchestratorStepId,
  status: OrchestratorStep['status'],
  detail?: string,
) {
  const step = steps.find((s) => s.id === id);
  if (step) {
    step.status = status;
    if (detail !== undefined) step.detail = detail;
  }
}

export async function generateAnnualFinancialStatements(
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  const steps = initialSteps();
  const { companyId, onProgress } = input;
  let workspaceId: string | null = input.workspaceId || null;
  let periodId = '';

  try {
    // ── Step: Setting up engagement ──────────────────────────────────────────
    mark(steps, 'setup', 'running');
    emit(steps, 'setup', workspaceId, onProgress);

    await invokeFinancialStatements(companyId, 'ENSURE_REPORTING_ENTITY');

    if (workspaceId) {
      const ws = await invokeFinancialStatements<{
        id: string;
        reporting_period_id: string;
        efs_reporting_periods?: { id: string };
      }>(companyId, 'GET_WORKSPACE', { workspace_id: workspaceId });
      periodId = ws.efs_reporting_periods?.id || ws.reporting_period_id;
    } else {
      // G3.6D — bind to Enterprise Financial Calendar year only (never invent years).
      const periodInput = input.period;
      if (!periodInput?.financial_year_id) {
        throw new Error(
          'A Financial Calendar year is required. Annual Financial Statements consume Financial Years from the Enterprise Financial Calendar.',
        );
      }

      const existingWorkspaces = await invokeFinancialStatements<EfsWorkspaceListItem[]>(
        companyId,
        'LIST_WORKSPACES',
      );
      const duplicate = existingWorkspaces.find((ws) => {
        const p = ws.efs_reporting_periods;
        if (!p) return false;
        return (
          p.period_key === periodInput.period_key ||
          (p.start_date === periodInput.start_date && p.end_date === periodInput.end_date)
        );
      });
      if (duplicate) {
        throw new Error(
          `An Annual Financial Statements engagement already exists for ${periodInput.label}. Open the existing engagement instead.`,
        );
      }

      const periods = await invokeFinancialStatements<EfsPeriod[]>(companyId, 'LIST_PERIODS');
      let period = periods.find(
        (p) =>
          p.period_key === periodInput.period_key ||
          (p.start_date === periodInput.start_date && p.end_date === periodInput.end_date),
      );
      if (!period) {
        // Create EFS period as a consumer projection of the calendar year — dates/labels from master only.
        period = await invokeFinancialStatements<EfsPeriod>(companyId, 'CREATE_PERIOD', {
          period: {
            financial_year_id: periodInput.financial_year_id,
            period_key: periodInput.period_key,
            label: periodInput.label,
            start_date: periodInput.start_date,
            end_date: periodInput.end_date,
            status: 'open_for_reporting',
          },
        });
      }
      periodId = period.id;

      const ensured = await invokeFinancialStatements<{
        workspace: EfsWorkspaceListItem;
        created: boolean;
      }>(companyId, 'ENSURE_WORKSPACE_FOR_FINANCIAL_YEAR', {
        financial_year_id: periodInput.financial_year_id,
        framework_pack_id: input.frameworkPackId,
      });
      workspaceId = ensured.workspace.id;
    }

    await invokeFinancialStatements(companyId, 'UPSERT_ENGAGEMENT_GENERAL_INFORMATION', {
      workspace_id: workspaceId,
      general_information: {
        ...input.generalInformation,
        reporting_framework:
          input.generalInformation.reporting_framework || input.frameworkLabel || null,
      },
    });

    mark(steps, 'setup', 'done');
    emit(steps, 'setup', workspaceId, onProgress);

    // ── Step: Capturing trial balance (snapshot draft → extract → certify) ───
    mark(steps, 'capture_tb', 'running');
    emit(steps, 'capture_tb', workspaceId, onProgress);

    const dash = await invokeFinancialStatements<{
      snapshot: {
        id: string;
        status: string;
        currentVersion: {
          id: string;
          status: string;
          content_hash: string | null;
        } | null;
      } | null;
      statementPreparationEnabled: boolean;
      framework: { id: string } | null;
    }>(companyId, 'GET_WORKSPACE_DASHBOARD', { workspace_id: workspaceId });

    let versionId = dash.snapshot?.currentVersion?.id;
    let versionStatus = dash.snapshot?.currentVersion?.status;

    if (!versionId || versionStatus === 'frozen' || versionStatus === 'publication_bound') {
      const draft = await invokeFinancialStatements<{ version: { id: string; status: string } }>(
        companyId,
        'CREATE_SNAPSHOT_DRAFT',
        {
          workspace_id: workspaceId,
          force_successor:
            versionStatus === 'frozen' || versionStatus === 'publication_bound' ? true : undefined,
        },
      );
      versionId = draft.version.id;
      versionStatus = draft.version.status || 'draft';
    }

    if (versionStatus === 'draft' || versionStatus === 'created') {
      // Extract if not yet sealed (certify requires sealed facts)
      const versionDetail = await invokeFinancialStatements<{
        id: string;
        status: string;
        efs_fact_snapshots?: { id: string } | Array<{ id: string }> | null;
      }>(companyId, 'GET_SNAPSHOT_VERSION', { snapshot_version_id: versionId });

      const facts = versionDetail.efs_fact_snapshots;
      const hasFact = Array.isArray(facts) ? facts.length > 0 : !!facts;
      if (!hasFact) {
        await invokeFinancialStatements(companyId, 'EXTRACT_FACT_SNAPSHOT', {
          snapshot_version_id: versionId,
          workspace_id: workspaceId,
        });
      }

      await invokeFinancialStatements(companyId, 'CERTIFY_SNAPSHOT_VERSION', {
        snapshot_version_id: versionId,
      });
      versionStatus = 'certified';
    }

    mark(steps, 'capture_tb', 'done');
    emit(steps, 'capture_tb', workspaceId, onProgress);

    // ── Step: Preparing statements ───────────────────────────────────────────
    mark(steps, 'prepare_statements', 'running');
    emit(steps, 'prepare_statements', workspaceId, onProgress);

    const existingStatements = await invokeFinancialStatements<{
      statements: unknown[];
    }>(companyId, 'GET_STATEMENTS', { workspace_id: workspaceId });

    if (!existingStatements.statements?.length) {
      await invokeFinancialStatements(companyId, 'GENERATE_STATEMENTS', {
        workspace_id: workspaceId,
        snapshot_version_id: versionId,
      });
    }

    mark(steps, 'prepare_statements', 'done');
    emit(steps, 'prepare_statements', workspaceId, onProgress);

    // ── Step: Preparing notes and disclosures ────────────────────────────────
    mark(steps, 'prepare_notes', 'running');
    emit(steps, 'prepare_notes', workspaceId, onProgress);

    const frameworkPackId =
      input.frameworkPackId ||
      dash.framework?.id ||
      (
        await invokeFinancialStatements<EfsFrameworkPack[]>(companyId, 'LIST_FRAMEWORK_PACKS')
      )[0]?.id;

    if (frameworkPackId) {
      await invokeFinancialStatements(companyId, 'ASSEMBLE_DISCLOSURES_FROM_FRAMEWORK', {
        workspace_id: workspaceId,
        framework_pack_id: frameworkPackId,
      });

      // Phase G3.4 — Accounting Policy Sets resolve through Governance.
      const policySets = await accountingPoliciesService.listAccountingPolicySetsRaw(
        companyId,
        workspaceId,
      );
      if (!policySets?.length) {
        await accountingPoliciesService.createAccountingPolicySet(
          companyId,
          workspaceId,
          frameworkPackId,
          'Accounting Policies',
        );
      }
    }

    mark(steps, 'prepare_notes', 'done');
    emit(steps, 'prepare_notes', workspaceId, onProgress);

    // ── Step: Checking your financial statements ─────────────────────────────
    mark(steps, 'validate', 'running');
    emit(steps, 'validate', workspaceId, onProgress);

    await invokeFinancialStatements(companyId, 'RUN_VALIDATION', {
      workspace_id: workspaceId,
      framework_pack_id: frameworkPackId || undefined,
      run_type: 'full',
    });

    mark(steps, 'validate', 'done');
    emit(steps, 'validate', workspaceId, onProgress);

    // ── Step: Setting up review ──────────────────────────────────────────────
    mark(steps, 'setup_review', 'running');
    emit(steps, 'setup_review', workspaceId, onProgress);

    await invokeFinancialStatements(companyId, 'GET_OR_CREATE_PACK_REVIEW', {
      workspace_id: workspaceId,
    });

    mark(steps, 'setup_review', 'done');
    emit(steps, null, workspaceId, onProgress);

    return {
      workspaceId: workspaceId!,
      periodId,
      progress: { steps, currentStepId: null, workspaceId },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const running = steps.find((s) => s.status === 'running');
    if (running) {
      running.status = 'error';
      running.detail = message;
    }
    emit(steps, running?.id || null, workspaceId, onProgress, message);
    throw err;
  }
}
