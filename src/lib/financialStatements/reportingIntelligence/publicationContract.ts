/**
 * V17.0 — Publication Contract.
 *
 * Identical reporting object consumed by PDF, DOCX, Preview, HTML, and XBRL renderers.
 * Renderers MUST NOT make reporting decisions.
 */
import type { CompositionDocument } from '../composition/types';
import type { DisclosureConditionMap } from '../framework/knowledgeRepository/types';
import type {
  ConsistencyResult,
  DisclosureDecision,
  EntityProfile,
  MaterialityAssessment,
  PublicationContract,
  StatementPresentationDecision,
} from './types';

function buildContractFingerprint(parts: {
  entityProfile: EntityProfile;
  orderedCodes: string[];
  decisions: DisclosureDecision[];
  compositionFingerprint: string;
  certified: boolean;
}): string {
  const lines: string[] = ['V17'];
  lines.push(`PROFILE|${parts.entityProfile.size}|${parts.entityProfile.industry}`);
  lines.push(`ORDER|${parts.orderedCodes.join(',')}`);
  lines.push(
    `DEC|${parts.decisions
      .filter((d) => d.exists)
      .map((d) => `${d.disclosureCode}:${d.action}`)
      .join(',')}`,
  );
  lines.push(`COMP|${parts.compositionFingerprint}`);
  lines.push(`CERT|${parts.certified ? 1 : 0}`);
  return lines.join('\n');
}

/** Build the publication contract from intelligence outputs. */
export function buildPublicationContract(input: {
  entityProfile: EntityProfile;
  materiality: MaterialityAssessment[];
  disclosureDecisions: DisclosureDecision[];
  statementPresentation: StatementPresentationDecision[];
  orderedDisclosureCodes: string[];
  conditions: DisclosureConditionMap;
  composition: CompositionDocument;
  consistency: ConsistencyResult;
}): PublicationContract {
  const materialitySummary = {
    mandatory: input.materiality.filter((m) => m.materiality === 'mandatory').length,
    conditional: input.materiality.filter((m) => m.materiality === 'conditional').length,
    material: input.materiality.filter((m) => m.materiality === 'material').length,
    immaterial: input.materiality.filter((m) => m.materiality === 'immaterial').length,
    suppressed: input.disclosureDecisions.filter((d) => d.shouldSuppress).length,
    expanded: input.disclosureDecisions.filter((d) => d.shouldExpand).length,
  };

  const certified = input.consistency.passed;

  const contractFingerprint = buildContractFingerprint({
    entityProfile: input.entityProfile,
    orderedCodes: input.orderedDisclosureCodes,
    decisions: input.disclosureDecisions,
    compositionFingerprint: input.composition.compositionFingerprint,
    certified,
  });

  return {
    version: '17.0',
    entityProfile: input.entityProfile,
    disclosureDecisions: input.disclosureDecisions,
    statementPresentation: input.statementPresentation,
    orderedDisclosureCodes: input.orderedDisclosureCodes,
    materialitySummary,
    conditions: input.conditions,
    composition: input.composition,
    corporateInformation: input.composition.corporateInformation,
    certified,
    consistency: input.consistency,
    contractFingerprint,
  };
}

/** Assert that a renderer input conforms to the publication contract. */
export function assertRendererContract(contract: PublicationContract): void {
  if (!contract.certified) {
    const errors = contract.consistency.issues.filter((i) => i.severity === 'error');
    throw new Error(
      `Publication blocked: reporting package failed certification (${errors.map((e) => e.rule).join(', ')})`,
    );
  }
}
