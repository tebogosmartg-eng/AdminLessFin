/**
 * V16.1 — Corporate Information Validation Engine.
 *
 * Publication fails validation when required information is missing.
 * Missing information appears only in validation reports — never in AFS output.
 */
import type {
  CorporateInformationModel,
  CorporateInformationValidationIssue,
  CorporateInformationValidationResult,
  EntityIdentity,
  EngagementInformation,
} from './types';

function checkField(
  path: string,
  field: { value: unknown; metadata: string; source: string; formatted: string | null },
  issues: CorporateInformationValidationIssue[],
): void {
  const empty =
    field.value == null ||
    (typeof field.value === 'string' && !field.value.trim()) ||
    (Array.isArray(field.value) && field.value.length === 0);

  if (field.metadata === 'required' && empty) {
    issues.push({
      field: path,
      metadata: 'required',
      source: field.source as CorporateInformationValidationIssue['source'],
      message: `Required corporate information field "${path}" is missing`,
      blocking: true,
    });
  } else if (field.metadata === 'conditional' && empty) {
    issues.push({
      field: path,
      metadata: 'conditional',
      source: field.source as CorporateInformationValidationIssue['source'],
      message: `Conditional corporate information field "${path}" is not populated`,
      blocking: false,
    });
  } else if (field.metadata === 'optional' && empty) {
    issues.push({
      field: path,
      metadata: 'optional',
      source: field.source as CorporateInformationValidationIssue['source'],
      message: `Optional corporate information field "${path}" is not populated`,
      blocking: false,
    });
  }
}

function validateEntityIdentity(
  identity: EntityIdentity,
  issues: CorporateInformationValidationIssue[],
): void {
  checkField('entityIdentity.registeredName', identity.registeredName, issues);
  checkField('entityIdentity.registrationNumber', identity.registrationNumber, issues);
  checkField('entityIdentity.tradingName', identity.tradingName, issues);
  checkField('entityIdentity.natureOfBusiness', identity.natureOfBusiness, issues);
  checkField('entityIdentity.countryOfIncorporation', identity.countryOfIncorporation, issues);
  checkField('entityIdentity.reportingFramework', identity.reportingFramework, issues);
  checkField('entityIdentity.entityType', identity.entityType, issues);
}

function validateEngagement(
  engagement: EngagementInformation,
  issues: CorporateInformationValidationIssue[],
): void {
  checkField('engagement.reportingPeriod', engagement.reportingPeriod, issues);
  checkField('engagement.comparativePeriod', engagement.comparativePeriod, issues);
  checkField('engagement.reportingCurrency', engagement.reportingCurrency, issues);
  checkField('engagement.functionalCurrency', engagement.functionalCurrency, issues);
  checkField('engagement.preparedBy', engagement.preparedBy, issues);
  checkField('engagement.reviewedBy', engagement.reviewedBy, issues);
  checkField('engagement.partner', engagement.partner, issues);
  checkField('engagement.approvalDate', engagement.approvalDate, issues);
  checkField('engagement.authorisationDate', engagement.authorisationDate, issues);
  checkField('engagement.issueDate', engagement.issueDate, issues);
}

export function validateCorporateInformation(
  model: CorporateInformationModel,
): CorporateInformationValidationResult {
  const issues: CorporateInformationValidationIssue[] = [];

  validateEntityIdentity(model.entityIdentity, issues);
  validateEngagement(model.engagement, issues);
  checkField('levelOfAssurance', model.levelOfAssurance, issues);

  if (model.directors.length === 0) {
    issues.push({
      field: 'directors',
      metadata: 'required',
      source: 'director_register',
      message: 'Director register has no entries — populate before publication',
      blocking: false,
    });
  } else if (!model.directors.some((d) => d.active)) {
    issues.push({
      field: 'directors',
      metadata: 'required',
      source: 'director_register',
      message: 'No active directors for the reporting period',
      blocking: true,
    });
  }

  const requiredMissing = issues.filter((i) => i.blocking).length;
  const optionalMissing = issues.filter((i) => !i.blocking).length;

  return {
    passed: requiredMissing === 0,
    issues,
    requiredMissing,
    optionalMissing,
  };
}

/** Validation report for dashboards — includes all issues with field metadata. */
export function corporateInformationValidationReport(
  model: CorporateInformationModel,
): {
  passed: boolean;
  blockingIssues: CorporateInformationValidationIssue[];
  advisoryIssues: CorporateInformationValidationIssue[];
  summary: string;
} {
  const validation = model.validation;
  const blockingIssues = validation.issues.filter((i) => i.blocking);
  const advisoryIssues = validation.issues.filter((i) => !i.blocking);
  return {
    passed: validation.passed,
    blockingIssues,
    advisoryIssues,
    summary: validation.passed
      ? 'All required corporate information is present'
      : `${blockingIssues.length} required field(s) missing — publication blocked`,
  };
}
