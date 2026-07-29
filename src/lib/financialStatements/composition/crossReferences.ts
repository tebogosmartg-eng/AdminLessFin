/**
 * V16.0 — Cross-Reference Enhancement Engine.
 *
 * Every primary statement line links to accounting policy, disclosure note,
 * movement schedule, reconciliation, validation rule, and framework section.
 * Cross references are resolved automatically — no manual links.
 */
import type { CompositionCrossReference, DisclosureLinkSet, EnterpriseDisclosureObject } from './types';

export type CrossReferenceContext = {
  noteNumberByCode: Record<string, number>;
  policyTitlesByCode: Record<string, string>;
  disclosureTitlesByCode: Record<string, string>;
};

/** Build cross-reference blocks for a disclosure from its link set. */
export function buildDisclosureCrossReferences(
  disclosure: Pick<EnterpriseDisclosureObject, 'id' | 'disclosureCode' | 'title' | 'links'>,
  ctx: CrossReferenceContext,
): CompositionCrossReference[] {
  const refs: CompositionCrossReference[] = [];

  for (const policyCode of disclosure.links.policyCodes) {
    refs.push({
      id: `xref:${disclosure.id}:pol:${policyCode}`,
      sourceId: disclosure.id,
      targetId: policyCode,
      label: `Accounting policy: ${ctx.policyTitlesByCode[policyCode] || policyCode}`,
      displayNoteNumber: null,
    });
  }

  for (const section of disclosure.links.frameworkSections) {
    refs.push({
      id: `xref:${disclosure.id}:fw:${section}`,
      sourceId: disclosure.id,
      targetId: section,
      label: `Framework reference: ${section}`,
      displayNoteNumber: null,
    });
  }

  for (const scheduleCode of disclosure.links.scheduleCodes) {
    refs.push({
      id: `xref:${disclosure.id}:sch:${scheduleCode}`,
      sourceId: disclosure.id,
      targetId: scheduleCode,
      label: `Supporting schedule: ${scheduleCode}`,
      displayNoteNumber: null,
    });
  }

  for (const stmtLine of disclosure.links.statementLines) {
    refs.push({
      id: `xref:${disclosure.id}:line:${stmtLine}`,
      sourceId: disclosure.id,
      targetId: stmtLine,
      label: `Statement line: ${stmtLine}`,
      displayNoteNumber: null,
    });
  }

  return refs;
}

/** Resolve inter-disclosure cross references (note-to-note). */
export function resolveInterDisclosureReferences(
  disclosures: EnterpriseDisclosureObject[],
  noteNumberByCode: Record<string, number>,
): CompositionCrossReference[] {
  const refs: CompositionCrossReference[] = [];
  const byCode = new Map(disclosures.map((d) => [d.disclosureCode, d]));

  for (const disclosure of disclosures) {
    for (const linkedCode of disclosure.links.statements) {
      const target = byCode.get(linkedCode);
      if (!target) continue;
      refs.push({
        id: `xref:${disclosure.id}:disc:${linkedCode}`,
        sourceId: disclosure.id,
        targetId: target.id,
        label: `See Note ${noteNumberByCode[linkedCode] || '?'}. ${target.title}`,
        displayNoteNumber: noteNumberByCode[linkedCode] ?? null,
      });
    }
  }

  return refs;
}

/** Merge line-level links into disclosure-level cross references. */
export function enrichLinksWithCrossReferences(
  links: DisclosureLinkSet,
  disclosureId: string,
  ctx: CrossReferenceContext,
): CompositionCrossReference[] {
  const refs: CompositionCrossReference[] = [];

  for (const policyCode of links.policyCodes) {
    refs.push({
      id: `xref:${disclosureId}:pol:${policyCode}`,
      sourceId: disclosureId,
      targetId: policyCode,
      label: ctx.policyTitlesByCode[policyCode] || policyCode,
      displayNoteNumber: null,
    });
  }

  for (const validationRule of links.validationRules) {
    refs.push({
      id: `xref:${disclosureId}:val:${validationRule}`,
      sourceId: disclosureId,
      targetId: validationRule,
      label: validationRule,
      displayNoteNumber: null,
    });
  }

  return refs;
}

/** Format cross-reference block as narrative text for publication. */
export function crossReferencesToNarrative(refs: CompositionCrossReference[]): string {
  if (!refs.length) return '';
  const lines = refs
    .filter((r) => r.displayNoteNumber != null)
    .map((r) => r.label);
  if (!lines.length) return '';
  return `Cross-references: ${lines.join('; ')}.`;
}
