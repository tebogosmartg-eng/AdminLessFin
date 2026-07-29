/**
 * V17.0 — Consistency Engine.
 *
 * Validates consistency between statements, policies, notes, schedules,
 * cross references, comparatives, and publication contract.
 */
import type { CompositionDocument } from '../composition/types';
import type { DocumentModel } from '../document/documentModel';
import type { ConsistencyIssue, ConsistencyResult, DisclosureDecision } from './types';

function validateStatementNoteCrossRefs(
  composition: CompositionDocument,
  issues: ConsistencyIssue[],
): void {
  const noteNumbers = new Set(Object.values(composition.noteNumberByCode));

  for (const phase of composition.phases) {
    if (phase.id !== 'primary_statements') continue;
    for (const section of phase.sections) {
      for (const line of section.statement?.lines || []) {
        if (line.noteRef != null && typeof line.noteRef === 'number') {
          if (!noteNumbers.has(line.noteRef)) {
            issues.push({
              rule: 'CROSS_REF_STATEMENT_NOTE',
              severity: 'error',
              message: `Statement line ${line.lineCode} references note ${line.noteRef} which does not exist`,
              location: line.lineCode,
            });
          }
        }
      }
    }
  }
}

function validateDisclosureActivation(
  composition: CompositionDocument,
  decisions: DisclosureDecision[],
  issues: ConsistencyIssue[],
): void {
  const suppressed = new Set(
    decisions.filter((d) => d.shouldSuppress).map((d) => d.disclosureCode),
  );
  const activated = new Set(composition.conditionalActivation.activated);

  for (const code of suppressed) {
    if (activated.has(code)) {
      issues.push({
        rule: 'DISCLOSURE_SUPPRESSION_CONFLICT',
        severity: 'error',
        message: `Disclosure ${code} is suppressed by intelligence but still activated`,
        location: code,
      });
    }
  }
}

function validatePolicyNoteSeparation(composition: CompositionDocument, issues: ConsistencyIssue[]): void {
  const policyCodes = new Set(composition.accountingPolicies.map((p) => p.policyCode));
  for (const note of composition.numberedNotes) {
    if (policyCodes.has(note.disclosureCode)) {
      issues.push({
        rule: 'POLICY_NOTE_DUPLICATION',
        severity: 'error',
        message: `Disclosure ${note.disclosureCode} duplicates an accounting policy`,
        location: note.disclosureCode,
      });
    }
  }
}

function validateComparatives(model: DocumentModel, issues: ConsistencyIssue[]): void {
  if (!model.period?.comparative_label) return;
  for (const stmt of model.statements) {
    const hasPrior = (stmt.lines || []).some(
      (l) => (l as { prior_amount?: number }).prior_amount != null,
    );
    if (stmt.populated && !hasPrior) {
      issues.push({
        rule: 'COMPARATIVE_MISSING',
        severity: 'warning',
        message: `Statement ${stmt.statement_type} lacks comparative amounts`,
        location: stmt.statement_type,
      });
    }
  }
}

function validateMovementSchedules(composition: CompositionDocument, issues: ConsistencyIssue[]): void {
  for (const ed of composition.enterpriseDisclosures) {
    if (ed.archetype === 'movement_schedule' && ed.movementSchedules.length === 0) {
      issues.push({
        rule: 'MOVEMENT_SCHEDULE_MISSING',
        severity: 'warning',
        message: `Disclosure ${ed.disclosureCode} archetype is movement_schedule but has no schedules`,
        location: ed.disclosureCode,
      });
    }
  }
}

function validateTotalsBalance(model: DocumentModel, issues: ConsistencyIssue[]): void {
  const sfp = model.statements.find((s) => s.statement_type === 'financial_position');
  if (!sfp) return;

  const totalAssets = sfp.lines?.find((l) => l.line_code === 'sfp.total_assets')?.amount;
  const totalEqLiab = sfp.lines?.find(
    (l) => l.line_code === 'sfp.total_liabilities_and_equity',
  )?.amount;

  if (
    totalAssets != null &&
    totalEqLiab != null &&
    Math.abs(Number(totalAssets) - Number(totalEqLiab)) > 0.01
  ) {
    issues.push({
      rule: 'SFP_BALANCE_MISMATCH',
      severity: 'error',
      message: `Statement of financial position does not balance: assets ${totalAssets} vs equity+liabilities ${totalEqLiab}`,
      location: 'financial_position',
    });
  }
}

/** Validate reporting consistency across all document areas. */
export function validateConsistency(
  model: DocumentModel,
  composition: CompositionDocument,
  decisions: DisclosureDecision[],
): ConsistencyResult {
  const issues: ConsistencyIssue[] = [];
  const validatedAreas: string[] = [];

  validateStatementNoteCrossRefs(composition, issues);
  validatedAreas.push('cross_references');

  validateDisclosureActivation(composition, decisions, issues);
  validatedAreas.push('disclosure_activation');

  validatePolicyNoteSeparation(composition, issues);
  validatedAreas.push('policies');

  validateComparatives(model, issues);
  validatedAreas.push('comparatives');

  validateMovementSchedules(composition, issues);
  validatedAreas.push('movement_schedules');

  validateTotalsBalance(model, issues);
  validatedAreas.push('statements');

  if (!composition.validationSummary.passed) {
    for (const rule of composition.validationSummary.failedRules) {
      issues.push({
        rule: `COMPOSITION_${rule}`,
        severity: 'error',
        message: `Composition validation failed: ${rule}`,
      });
    }
  }
  validatedAreas.push('composition_validation');

  const errors = issues.filter((i) => i.severity === 'error');
  return {
    passed: errors.length === 0,
    issues,
    validatedAreas,
  };
}
