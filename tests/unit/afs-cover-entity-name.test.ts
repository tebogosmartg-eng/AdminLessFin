/**
 * The cover must be headed by the entity, not by the company's sign-up name.
 *
 * A company row is named when someone signs up, often left at the default, and
 * eight companies in this database are still called "My's Company". The name an
 * entity is registered under lives in its master data and arrives on a separate
 * request from the rest of the document.
 *
 * The document model was cached under a key that named only the company and the
 * workspace, so whichever value general information had at first render was
 * baked in — and on a cold open that value is null. The page header re-rendered
 * when the real details landed; the cover did not, and a set of statements for
 * GAMA TV (PTY) LTD printed "My's Company" on its cover and in its PDF.
 */
import { describe, it, expect } from 'vitest';
import { entityFingerprint } from '../../src/lib/financialStatements/document/useDocumentModel';
import {
  corporateDisplayFromModel,
  corporateFilenameSlug,
} from '../../src/lib/financialStatements/corporateInformation/accessors';
import { assessReadiness } from '../../src/lib/financialStatements/readiness';
import type { DocumentModel } from '../../src/lib/financialStatements/document/documentModel';
import type { EfsWorkspaceGeneralInformation } from '../../src/lib/financialStatements/api';

const GAMA = {
  registered_name: 'GAMA TV (PTY) LTD',
  trading_name: 'GAMA TV',
  registration_number: '2021 / 609119 / 07',
  reporting_framework: 'IFRS for SMEs',
  updated_at: '2026-09-18T15:50:39Z',
} as unknown as EfsWorkspaceGeneralInformation;

function model(entity: EfsWorkspaceGeneralInformation | null): DocumentModel {
  return {
    companyId: 'c1',
    // What the company row is called: the default nobody changed.
    companyName: "My's Company",
    workspaceId: 'w1',
    workspaceName: 'FY2026 Financial Statements',
    frameworkPackId: null,
    frameworkKey: 'IFRS_SME',
    frameworkLabel: 'IFRS for SMEs',
    entity,
    period: { label: 'FY2026' },
    statements: [],
    policySets: [],
    notes: [],
    crossReferences: [],
    signatures: [],
    trialBalanceCaptured: false,
  };
}

describe('the entity fingerprint the document model is keyed on', () => {
  it('changes when general information arrives', () => {
    // This is the whole defect: these two were the same key, so the model built
    // before the entity loaded was never rebuilt after it did.
    expect(entityFingerprint(null)).not.toBe(entityFingerprint(GAMA));
  });

  it('changes when the registered name is edited', () => {
    const renamed = { ...GAMA, registered_name: 'GAMA MEDIA (PTY) LTD' } as EfsWorkspaceGeneralInformation;
    expect(entityFingerprint(renamed)).not.toBe(entityFingerprint(GAMA));
  });

  it('is stable for the same entity, so the document is not rebuilt for nothing', () => {
    expect(entityFingerprint(GAMA)).toBe(entityFingerprint({ ...GAMA }));
  });
});

describe('the name on the cover', () => {
  it('is the registered name once the entity is known', () => {
    expect(corporateDisplayFromModel(model(GAMA)).registeredName).toBe('GAMA TV (PTY) LTD');
  });

  it('names the export after the entity, not the company row', () => {
    expect(corporateFilenameSlug(model(GAMA))).toContain('GAMA');
  });

  it('falls back to the company only when nothing is recorded', () => {
    expect(corporateDisplayFromModel(model(null)).registeredName).toBe("My's Company");
  });
});

describe('readiness', () => {
  it('reports the fallback rather than accepting it', () => {
    const m = model(null);
    m.statements = [
      {
        id: 'financial_position',
        kind: 'statement',
        statement_type: 'financial_position',
        title: 'Statement of Financial Position',
        populated: true,
        lines: [
          { line_code: 'sfp.total_assets', label: 'Total assets', section: 'a', amount: 10, prior_amount: 8 },
          { line_code: 'sfp.total_liabilities_and_equity', label: 'Total', section: 'a', amount: 10, prior_amount: 8 },
        ],
      },
    ] as DocumentModel['statements'];

    const issue = assessReadiness(m).issues.find((i) => i.id === 'no-entity-name');
    expect(issue).toBeDefined();
    expect(issue!.title).toContain("My's Company");
    expect(issue!.location).toEqual({ kind: 'information', id: 'information' });
  });

  it('says nothing once the entity is registered', () => {
    const m = model(GAMA);
    m.statements = [
      {
        id: 'financial_position',
        kind: 'statement',
        statement_type: 'financial_position',
        title: 'Statement of Financial Position',
        populated: true,
        lines: [
          { line_code: 'sfp.total_assets', label: 'Total assets', section: 'a', amount: 10, prior_amount: 8 },
          { line_code: 'sfp.total_liabilities_and_equity', label: 'Total', section: 'a', amount: 10, prior_amount: 8 },
        ],
      },
    ] as DocumentModel['statements'];

    expect(assessReadiness(m).issues.some((i) => i.id === 'no-entity-name')).toBe(false);
  });
});
