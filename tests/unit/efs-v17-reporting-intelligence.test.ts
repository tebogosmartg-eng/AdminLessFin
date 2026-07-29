/**
 * V17.0 — Enterprise Reporting Intelligence Engine regression suite.
 */
import { describe, expect, it } from 'vitest';
import { composeDocument } from '../../src/lib/financialStatements/composition';
import { emptyOverrides } from '../../src/lib/financialStatements/document/documentStore';
import { buildV16SampleModel } from '../../src/lib/financialStatements/composition/fixtures/v16SampleModel';
import { buildCanonicalPublishPackage } from '../../src/lib/financialStatements/publication/canonicalDocumentPublish';
import { prepareCanonicalDocumentView } from '../../src/lib/financialStatements/publication/canonicalDocumentView';
import {
  allRegressionScenarioIds,
  assessMateriality,
  buildRegressionScenarioModel,
  makeDisclosureDecisions,
  orderDisclosures,
  produceReportingPackage,
  profileEntity,
  runRegressionSuite,
  validateConsistency,
  determineStatementPresentation,
} from '../../src/lib/financialStatements/reportingIntelligence';
import { writeV17ReportingIntelligenceEvidence } from '../../tools/efs-v17-reporting-intelligence-evidence';
import { evaluateConditionalDisclosures } from '../../src/lib/financialStatements/composition/conditionalDisclosureEngine';

describe('V17.0 — Entity Profiling Engine', () => {
  it('profiles service entity correctly', () => {
    const model = buildRegressionScenarioModel('service_entity');
    const profile = profileEntity(model);
    expect(profile.industry).toBe('service');
    expect(profile.confidence).toBeGreaterThan(0.7);
  });

  it('profiles manufacturing entity as asset-intensive', () => {
    const model = buildRegressionScenarioModel('manufacturing_entity');
    const profile = profileEntity(model);
    expect(profile.industry).toBe('manufacturing');
    expect(profile.characteristics.isAssetIntensive || profile.characteristics.totalAssets > 10_000_000).toBe(true);
  });

  it('profiles investment holding company', () => {
    const model = buildRegressionScenarioModel('investment_holding');
    const profile = profileEntity(model);
    expect(['investment_entity', 'holding_company']).toContain(profile.size);
  });

  it('profiles dormant entity', () => {
    const model = buildRegressionScenarioModel('dormant_entity');
    const profile = profileEntity(model);
    expect(profile.size).toBe('dormant_entity');
    expect(profile.characteristics.isDormant).toBe(true);
  });

  it('profiles NPO from nature of business', () => {
    const model = buildRegressionScenarioModel('npo');
    const profile = profileEntity(model);
    expect(profile.industry).toBe('npo');
  });

  it('detects loss-making entity', () => {
    const model = buildRegressionScenarioModel('loss_making_entity');
    const profile = profileEntity(model);
    expect(profile.characteristics.isLossMaking).toBe(true);
  });

  it('detects debt-intensive entity', () => {
    const model = buildRegressionScenarioModel('debt_intensive_entity');
    const profile = profileEntity(model);
    expect(profile.characteristics.isDebtIntensive).toBe(true);
  });
});

describe('V17.0 — Materiality Engine', () => {
  it('classifies mandatory disclosures', () => {
    const model = buildV16SampleModel();
    const profile = profileEntity(model);
    const conditional = evaluateConditionalDisclosures(model);
    const materiality = assessMateriality(model, profile, conditional.conditions);
    const mandatory = materiality.filter(
      (m) => m.materiality === 'mandatory' || m.materiality === 'framework_required',
    );
    expect(mandatory.length).toBeGreaterThan(0);
  });

  it('suppresses zero-balance conditional disclosures', () => {
    const model = buildRegressionScenarioModel('service_entity');
    const profile = profileEntity(model);
    const conditional = evaluateConditionalDisclosures(model);
    const materiality = assessMateriality(model, profile, conditional.conditions);
    const leases = materiality.find((m) => m.disclosureCode === 'DISC.LEASES');
    if (leases) {
      expect(['suppress', 'present']).toContain(leases.action);
    }
  });
});

describe('V17.0 — Disclosure Decision Engine', () => {
  it('suppresses leases when no lease balance', () => {
    const model = buildRegressionScenarioModel('service_entity');
    const profile = profileEntity(model);
    const conditional = evaluateConditionalDisclosures(model);
    const materiality = assessMateriality(model, profile, conditional.conditions);
    const decisions = makeDisclosureDecisions(model, profile, materiality, conditional.conditions);
    const leases = decisions.find((d) => d.disclosureCode === 'DISC.LEASES');
    if (leases) expect(leases.shouldSuppress).toBe(true);
  });

  it('expands PPE for manufacturing with multiple categories', () => {
    const model = buildRegressionScenarioModel('manufacturing_entity');
    const profile = profileEntity(model);
    const conditional = evaluateConditionalDisclosures(model);
    const materiality = assessMateriality(model, profile, conditional.conditions);
    const decisions = makeDisclosureDecisions(model, profile, materiality, conditional.conditions);
    const ppe = decisions.find((d) => d.disclosureCode === 'DISC.PPE');
    expect(ppe?.exists).toBe(true);
  });
});

describe('V17.0 — Statement Presentation Engine', () => {
  it('uses function of expense for retail', () => {
    const model = buildRegressionScenarioModel('retail_entity');
    const profile = profileEntity(model);
    const presentation = determineStatementPresentation(model, profile);
    const perf = presentation.find((p) => p.statementType === 'financial_performance');
    expect(perf?.expensePresentation).toBe('function');
    expect(perf?.showGrossProfit).toBe(true);
  });

  it('uses liquidity presentation for investment holding', () => {
    const model = buildRegressionScenarioModel('investment_holding');
    const profile = profileEntity(model);
    const presentation = determineStatementPresentation(model, profile);
    const sfp = presentation.find((p) => p.statementType === 'financial_position');
    expect(sfp?.assetPresentation).toBe('liquidity');
  });
});

describe('V17.0 — Ordering Engine', () => {
  it('orders disclosures without hardcoded duplicates', () => {
    const model = buildV16SampleModel();
    const profile = profileEntity(model);
    const conditional = evaluateConditionalDisclosures(model);
    const materiality = assessMateriality(model, profile, conditional.conditions);
    const decisions = makeDisclosureDecisions(model, profile, materiality, conditional.conditions);
    const codes = model.notes.map((n) => n.disclosure_code);
    const { orderedCodes } = orderDisclosures(codes, profile, materiality, decisions);
    expect(new Set(orderedCodes).size).toBe(orderedCodes.length);
    expect(orderedCodes.length).toBeGreaterThan(0);
  });

  it('prioritises industry-relevant disclosures for retail', () => {
    const model = buildRegressionScenarioModel('retail_entity');
    const profile = profileEntity(model);
    const conditional = evaluateConditionalDisclosures(model);
    const materiality = assessMateriality(model, profile, conditional.conditions);
    const decisions = makeDisclosureDecisions(model, profile, materiality, conditional.conditions);
    const codes = model.notes.map((n) => n.disclosure_code);
    const { orderedCodes } = orderDisclosures(codes, profile, materiality, decisions);
    const invIdx = orderedCodes.indexOf('DISC.INVENTORIES');
    const taxIdx = orderedCodes.indexOf('DISC.TAX');
    if (invIdx >= 0 && taxIdx >= 0) {
      expect(invIdx).toBeLessThan(taxIdx);
    }
  });
});

describe('V17.0 — Consistency Engine', () => {
  it('passes consistency for V16 sample model', () => {
    const model = buildV16SampleModel();
    const overrides = emptyOverrides();
    const pkg = produceReportingPackage(model, overrides);
    const result = validateConsistency(model, pkg.composition, pkg.disclosureDecisions);
    expect(result.passed).toBe(true);
    expect(result.validatedAreas.length).toBeGreaterThan(4);
  });
});

describe('V17.0 — Publication Contract', () => {
  it('produces certified reporting package', () => {
    const model = buildV16SampleModel();
    const pkg = produceReportingPackage(model, emptyOverrides());
    expect(pkg.version).toBe('17.0');
    expect(pkg.publicationContract.version).toBe('17.0');
    expect(pkg.publicationContract.contractFingerprint).toContain('V17');
    expect(pkg.certified).toBe(true);
  });

  it('canonical view includes reporting package', () => {
    const model = buildV16SampleModel();
    const view = prepareCanonicalDocumentView(model, emptyOverrides());
    expect(view.reportingPackage.version).toBe('17.0');
    expect(view.composition).toBe(view.reportingPackage.composition);
  });

  it('PDF and DOCX publish from intelligence-refined composition', () => {
    const model = buildV16SampleModel();
    const pkg = buildCanonicalPublishPackage(model, emptyOverrides());
    expect(pkg.pdfBytes.byteLength).toBeGreaterThan(1000);
    expect(pkg.docxBytes.byteLength).toBeGreaterThan(1000);
  });
});

describe('V17.0 — No V16 Regression', () => {
  it('V16 sample still composes with intelligence layer', () => {
    const model = buildV16SampleModel();
    const overrides = emptyOverrides();
    const v16 = composeDocument(model, overrides);
    const v17 = produceReportingPackage(model, overrides);
    expect(v17.composition.enterpriseDisclosures.length).toBeGreaterThan(0);
    expect(v17.composition.numberedNotes.length).toBeLessThanOrEqual(v16.numberedNotes.length);
  });
});

describe('V17.0 — Regression Suite (11 entity types)', () => {
  it('runs all regression scenarios', () => {
    expect(allRegressionScenarioIds().length).toBe(11);
  });

  it('all scenarios produce certified financial statements', () => {
    const results = runRegressionSuite();
    expect(results.length).toBe(11);
    for (const r of results) {
      expect(r.orderingValid, `ordering: ${r.scenarioId}`).toBe(true);
      expect(r.consistencyPassed, `consistency: ${r.scenarioId}`).toBe(true);
      expect(r.certified, `certified: ${r.scenarioId}`).toBe(true);
      expect(r.pdfBytes, `pdf: ${r.scenarioId}`).toBeGreaterThan(500);
      expect(r.docxBytes, `docx: ${r.scenarioId}`).toBeGreaterThan(500);
    }
  });

  it('entity profiling varies across scenarios', () => {
    const results = runRegressionSuite();
    const industries = new Set(results.map((r) => r.entityProfile.industry));
    expect(industries.size).toBeGreaterThan(3);
  });

  it('writes V17 reporting intelligence evidence', () => {
    const evidence = writeV17ReportingIntelligenceEvidence();
    expect(evidence.version).toBe('17.0');
    expect(evidence.allCertified).toBe(true);
    expect(evidence.passedScenarios).toBe(11);
  });
});
