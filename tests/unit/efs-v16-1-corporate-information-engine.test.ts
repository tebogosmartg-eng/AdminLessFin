/**
 * V16.1 — Enterprise Corporate Information Engine regression suite.
 */
import { describe, expect, it } from 'vitest';
import { composeDocument } from '../../src/lib/financialStatements/composition';
import { emptyOverrides } from '../../src/lib/financialStatements/document/documentStore';
import {
  buildCorporateInformationNarratives,
  buildCorporateInformationPresentation,
  corporateInformationValidationReport,
  determineLevelOfAssurance,
  provideCorporateInformation,
  smartMappingSummary,
  SMART_MAPPING_REGISTRY,
} from '../../src/lib/financialStatements/corporateInformation';
import { buildCanonicalPublishPackage } from '../../src/lib/financialStatements/publication/canonicalDocumentPublish';
import {
  extractDocxPlainText,
} from '../../src/lib/financialStatements/publication/canonicalDocumentPublish';
import { prepareCanonicalDocumentView } from '../../src/lib/financialStatements/publication/canonicalDocumentView';
import {
  allRegressionScenarioIds,
  buildRegressionScenarioModel,
  produceReportingPackage,
  runRegressionSuite,
  scenarioLabel,
} from '../../src/lib/financialStatements/reportingIntelligence';

const CERTIFICATION_SCENARIOS = [
  { id: 'service_entity' as const, label: 'Private Company (Service)' },
  { id: 'investment_holding' as const, label: 'Public Company (Investment)' },
  { id: 'npo' as const, label: 'NPO' },
  { id: 'investment_holding' as const, label: 'Investment Company' },
  { id: 'dormant_entity' as const, label: 'Dormant Entity' },
  { id: 'service_entity' as const, label: 'Service Company' },
  { id: 'manufacturing_entity' as const, label: 'Manufacturing Company' },
  { id: 'retail_entity' as const, label: 'Retail Company' },
];

describe('V16.1 — Corporate Information Model', () => {
  it('assembles canonical model from enterprise sources', () => {
    const model = buildRegressionScenarioModel('service_entity');
    const corp = provideCorporateInformation(model);
    expect(corp.version).toBe('16.1');
    expect(corp.entityIdentity.registeredName.formatted).toContain('Apex');
    expect(corp.entityIdentity.registrationNumber.source).toBe('company_profile');
    expect(corp.directors.filter((d) => d.active).length).toBeGreaterThanOrEqual(2);
    expect(corp.principalBankers.filter((b) => b.active).length).toBeGreaterThanOrEqual(1);
    expect(corp.taxRegistrations.length).toBeGreaterThanOrEqual(2);
    expect(corp.modelFingerprint).toMatch(/^V16\.1/);
  });

  it('enforces smart mapping — single source per field', () => {
    const fields = SMART_MAPPING_REGISTRY.map((e) => e.field);
    expect(new Set(fields).size).toBe(fields.length);
    expect(smartMappingSummary().governance).toContain('auditor');
    expect(smartMappingSummary().engagement).toContain('preparedBy');
    expect(smartMappingSummary().approval_workflow).toContain('issueDate');
  });

  it('never includes Missing Information in publication narratives', () => {
    const model = buildRegressionScenarioModel('dormant_entity');
    const corp = provideCorporateInformation(model);
    const narratives = buildCorporateInformationNarratives(corp);
    for (const row of narratives) {
      expect(row.value.toLowerCase()).not.toContain('missing information');
      expect(row.value).not.toMatch(/\[.*\]/);
    }
  });
});

describe('V16.1 — Level of Assurance', () => {
  it('determines Independent Audit from audit engagement', () => {
    const model = buildRegressionScenarioModel('service_entity');
    expect(provideCorporateInformation(model).levelOfAssurance.value).toBe('independent_audit');
  });

  it('determines Independent Review from review engagement', () => {
    const model = buildRegressionScenarioModel('professional_practice');
    expect(provideCorporateInformation(model).levelOfAssurance.value).toBe('independent_review');
  });

  it('determines Compilation Report from compilation engagement', () => {
    const model = buildRegressionScenarioModel('npo');
    expect(provideCorporateInformation(model).levelOfAssurance.value).toBe('compilation_report');
  });

  it('determines Unaudited from internal engagement', () => {
    const model = buildRegressionScenarioModel('dormant_entity');
    expect(provideCorporateInformation(model).levelOfAssurance.value).toBe('unaudited_financial_statements');
  });

  it('derives assurance from auditor when engagement type not set', () => {
    const level = determineLevelOfAssurance({ auditor: 'Audit Co' });
    expect(level).toBe('independent_audit');
  });
});

describe('V16.1 — Director Register Integration', () => {
  it('includes only active directors for reporting period', () => {
    const model = buildRegressionScenarioModel('service_entity');
    model.entity = {
      ...model.entity,
      directors: [
        { name: 'Active Dir', appointment_date: '2020-01-01' },
        { name: 'Resigned Dir', appointment_date: '2020-01-01', resignation_date: '2025-01-01' },
        { name: 'Future Dir', appointment_date: '2027-01-01' },
      ],
    };
    const corp = provideCorporateInformation(model);
    const active = corp.directors.filter((d) => d.active);
    expect(active.map((d) => d.name)).toEqual(['Active Dir']);
  });

  it('supports multiple directors with classifications', () => {
    const model = buildRegressionScenarioModel('manufacturing_entity');
    const corp = provideCorporateInformation(model);
    expect(corp.directors.filter((d) => d.active).length).toBe(2);
    const narratives = buildCorporateInformationNarratives(corp);
    const directorsRow = narratives.find((n) => n.label === 'Directors');
    expect(directorsRow?.value).toContain('A. Director');
    expect(directorsRow?.value).toContain('B. Director');
  });
});

describe('V16.1 — Validation', () => {
  it('reports missing required fields in validation report only', () => {
    const model = buildRegressionScenarioModel('service_entity');
    model.entity = { ...model.entity, registered_name: '', registration_number: '' };
    const corp = provideCorporateInformation(model);
    const report = corporateInformationValidationReport(corp);
    expect(report.passed).toBe(false);
    expect(report.blockingIssues.length).toBeGreaterThan(0);
    const narratives = buildCorporateInformationNarratives(corp);
    expect(narratives.find((n) => n.label === 'Registered name')).toBeUndefined();
  });

  it('passes validation for fully populated certification entities', () => {
    const model = buildRegressionScenarioModel('retail_entity');
    const corp = provideCorporateInformation(model);
    expect(corp.validation.passed).toBe(true);
  });
});

describe('V16.1 — Presentation Model', () => {
  it('builds professional presentation with grouped sections', () => {
    const model = buildRegressionScenarioModel('service_entity');
    const corp = provideCorporateInformation(model);
    const presentation = buildCorporateInformationPresentation(corp);
    expect(presentation.version).toBe('16.1');
    expect(presentation.sections.length).toBeGreaterThan(3);
    expect(presentation.rows.some((r) => r.kind === 'person_list')).toBe(true);
    expect(presentation.rows.some((r) => r.kind === 'address_block' || r.kind === 'single')).toBe(true);
  });

  it('renders directors as person_list not comma-separated', () => {
    const model = buildRegressionScenarioModel('manufacturing_entity');
    const presentation = buildCorporateInformationPresentation(provideCorporateInformation(model));
    const directors = presentation.rows.find((r) => r.kind === 'person_list');
    expect(directors?.kind).toBe('person_list');
    if (directors?.kind === 'person_list') {
      expect(directors.people.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('V16.1 — Publication Contract', () => {
  it('provides single corporate information object to all renderers', () => {
    const model = buildRegressionScenarioModel('service_entity');
    const overrides = emptyOverrides();
    const view = prepareCanonicalDocumentView(model, overrides);
    expect(view.corporateInformation.version).toBe('16.1');
    expect(view.composition.corporateInformation.modelFingerprint).toBe(
      view.corporateInformation.modelFingerprint,
    );
  });

  it('includes corporate information presentation in composition', () => {
    const model = buildRegressionScenarioModel('service_entity');
    const doc = composeDocument(model, emptyOverrides());
    const corpSection = doc.phases
      .find((p) => p.id === 'front_matter')
      ?.sections.find((s) => s.kind === 'corporate_information');
    expect(corpSection?.corporatePresentation?.version).toBe('16.1');
    expect(corpSection?.corporatePresentation?.rows.length).toBeGreaterThan(5);
    const directorRow = corpSection?.corporatePresentation?.rows.find((r) => r.kind === 'person_list');
    expect(directorRow?.kind).toBe('person_list');
    if (directorRow?.kind === 'person_list') {
      expect(directorRow.people.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('maintains Preview == PDF == DOCX identity with corporate information', () => {
    const model = buildRegressionScenarioModel('manufacturing_entity');
    const overrides = emptyOverrides();
    const view = prepareCanonicalDocumentView(model, overrides);
    const publishPkg = buildCanonicalPublishPackage(model, overrides);
    const docxText = extractDocxPlainText(publishPkg.docxBytes);
    expect(docxText).toContain('Corporate Information');
    expect(docxText).toContain(model.entity?.registered_name?.split(' ')[0] || '');
    expect(view.corporateInformation.principalBankers.length).toBeGreaterThan(0);
  });
});

describe('V16.1 — Regression Certification (9 entity types)', () => {
  const uniqueScenarios = [...new Set(CERTIFICATION_SCENARIOS.map((s) => s.id))];

  for (const scenarioId of uniqueScenarios) {
    it(`generates AFS for ${scenarioLabel(scenarioId)} with corporate information`, () => {
      const model = buildRegressionScenarioModel(scenarioId);
      const overrides = emptyOverrides();
      const pkg = produceReportingPackage(model, overrides);
      const publishPkg = buildCanonicalPublishPackage(model, overrides);

      expect(pkg.corporateInformation.validation.passed).toBe(true);
      expect(pkg.corporateInformation.directors.some((d) => d.active)).toBe(true);
      expect(pkg.corporateInformation.levelOfAssurance.formatted).toBeTruthy();
      expect(publishPkg.pdfBytes.byteLength).toBeGreaterThan(1000);
      expect(publishPkg.docxBytes.byteLength).toBeGreaterThan(1000);
      expect(publishPkg.structureFingerprint).toBeTruthy();
    });
  }

  it('runs full regression suite with zero failures', () => {
    const results = runRegressionSuite();
    expect(results.length).toBe(allRegressionScenarioIds().length);
    for (const r of results) {
      expect(r.pdfBytes).toBeGreaterThan(0);
      expect(r.docxBytes).toBeGreaterThan(0);
      expect(r.orderingValid).toBe(true);
      expect(r.consistencyPassed).toBe(true);
      expect(r.corporateInformationValid).toBe(true);
    }
  });
});
