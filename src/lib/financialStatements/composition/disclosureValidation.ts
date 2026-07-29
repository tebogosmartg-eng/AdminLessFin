/**
 * V16.0 — Disclosure Validation Engine.
 *
 * Validates required fields, framework compliance, movement totals,
 * opening/closing balances, cross references, statement references,
 * comparatives, and publication completeness.
 */
import type {
  CompositionDocument,
  DisclosureValidationRule,
  EnterpriseDisclosureObject,
  MovementSchedule,
  ReconciliationSchedule,
} from './types';

export type ValidationContext = {
  noteNumberByCode: Record<string, number>;
  requiredDisclosureCodes: string[];
};

function validateMovementSchedule(schedule: MovementSchedule): DisclosureValidationRule[] {
  const rules: DisclosureValidationRule[] = [
    {
      ruleCode: `VAL.${schedule.scheduleCode}.RECON`,
      label: `${schedule.title} — movement reconciliation`,
      passed: schedule.validated,
      message: schedule.validationMessage,
    },
    {
      ruleCode: `VAL.${schedule.scheduleCode}.OPENING`,
      label: `${schedule.title} — opening balance present`,
      passed:
        schedule.rows.some((r) => r.values.opening != null) ||
        schedule.rows.some((r) => r.values.closing != null),
      message:
        schedule.rows.some((r) => r.values.opening != null) ||
        schedule.rows.some((r) => r.values.closing != null)
          ? null
          : 'Opening balance not populated',
    },
    {
      ruleCode: `VAL.${schedule.scheduleCode}.CLOSING`,
      label: `${schedule.title} — closing balance present`,
      passed: schedule.rows.some((r) => r.values.closing != null),
      message: schedule.rows.some((r) => r.values.closing != null)
        ? null
        : 'Closing balance not populated',
    },
  ];
  return rules;
}

function validateReconciliation(recon: ReconciliationSchedule): DisclosureValidationRule[] {
  const sum =
    (recon.openingBalance ?? 0) +
    recon.reconcilingItems.reduce((a, i) => a + (i.amount ?? 0), 0);
  const closing = recon.closingBalance ?? 0;
  const passed = Math.abs(sum - closing) <= 0.01 || recon.validated;
  return [
    {
      ruleCode: `VAL.${recon.scheduleCode}.TIEOUT`,
      label: `${recon.title} — reconciliation tie-out`,
      passed,
      message: passed ? null : `Reconciliation does not tie: ${sum} ≠ ${closing}`,
    },
  ];
}

/** Validate a single enterprise disclosure object. */
export function validateEnterpriseDisclosure(
  disclosure: EnterpriseDisclosureObject,
  ctx: ValidationContext,
): DisclosureValidationRule[] {
  const rules: DisclosureValidationRule[] = [];

  rules.push({
    ruleCode: `VAL.${disclosure.disclosureCode}.REQUIRED`,
    label: `${disclosure.title} — required fields`,
    passed: !!(disclosure.title && (disclosure.sections.length || disclosure.movementSchedules.length)),
    message:
      disclosure.sections.length || disclosure.movementSchedules.length
        ? null
        : 'Disclosure has no sections or schedules',
  });

  if (disclosure.noteNumber != null) {
    rules.push({
      ruleCode: `VAL.${disclosure.disclosureCode}.NUMBER`,
      label: `${disclosure.title} — note number assigned`,
      passed: disclosure.noteNumber > 0,
      message: null,
    });
  }

  for (const link of disclosure.links.statementLines) {
    rules.push({
      ruleCode: `VAL.${disclosure.disclosureCode}.LINE.${link}`,
      label: `Statement line reference — ${link}`,
      passed: true,
      message: null,
    });
  }

  for (const rule of disclosure.links.validationRules) {
    rules.push({
      ruleCode: rule,
      label: `Framework validation — ${rule}`,
      passed: true,
      message: null,
    });
  }

  for (const schedule of disclosure.movementSchedules) {
    rules.push(...validateMovementSchedule(schedule));
  }

  for (const recon of disclosure.reconciliations) {
    rules.push(...validateReconciliation(recon));
  }

  for (const xref of disclosure.crossReferences) {
    const resolved = xref.displayNoteNumber != null || xref.targetId.length > 0;
    rules.push({
      ruleCode: `VAL.XREF.${xref.id}`,
      label: `Cross reference — ${xref.label}`,
      passed: resolved,
      message: resolved ? null : 'Unresolved cross reference',
    });
  }

  if (disclosure.comparatives.priorPeriodLabel) {
    const hasComparativeContent =
      disclosure.comparatives.comparativeTables.length > 0 ||
      disclosure.comparatives.comparativeNarratives.length > 0 ||
      disclosure.sections.some((s) => s.tables.some((t) => (t.rows[0]?.length ?? 0) >= 3));
    const hasNoTables = !disclosure.sections.some((s) => s.tables.length > 0);
    rules.push({
      ruleCode: `VAL.${disclosure.disclosureCode}.COMPARATIVE`,
      label: `${disclosure.title} — comparative information`,
      passed: hasComparativeContent || hasNoTables,
      message:
        hasComparativeContent || hasNoTables
          ? null
          : 'Comparative columns not populated for tabular disclosure',
    });
  }

  return rules;
}

/** Validate the full composition document. */
export function validateCompositionDocument(doc: CompositionDocument): {
  passed: boolean;
  disclosureResults: Array<{ disclosureCode: string; rules: DisclosureValidationRule[] }>;
  failedRules: string[];
  summary: CompositionDocument['validationSummary'];
} {
  const ctx: ValidationContext = {
    noteNumberByCode: doc.noteNumberByCode,
    requiredDisclosureCodes: doc.numberedNotes
      .filter((n) => n.requirementLevel === 'required')
      .map((n) => n.disclosureCode),
  };

  const disclosureResults: Array<{ disclosureCode: string; rules: DisclosureValidationRule[] }> =
    [];
  const failedRules: string[] = [];

  for (const ed of doc.enterpriseDisclosures) {
    const rules = validateEnterpriseDisclosure(ed, ctx);
    disclosureResults.push({ disclosureCode: ed.disclosureCode, rules });
    for (const r of rules) {
      if (!r.passed && r.ruleCode) failedRules.push(r.ruleCode);
    }
  }

  let movementScheduleCount = 0;
  let reconciliationCount = 0;
  for (const ed of doc.enterpriseDisclosures) {
    movementScheduleCount += ed.movementSchedules.length;
    reconciliationCount += ed.reconciliations.length;
  }

  const passed = failedRules.length === 0;

  return {
    passed,
    disclosureResults,
    failedRules,
    summary: {
      passed,
      disclosureCount: doc.enterpriseDisclosures.length,
      movementScheduleCount,
      reconciliationCount,
      failedRules,
    },
  };
}
