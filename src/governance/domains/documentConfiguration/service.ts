// Governance Foundation — Document Configuration service (Phase G3.1).
//
// Whether a centralized document-numbering configuration already exists
// anywhere in this codebase was NOT investigated by the G1 audit (Not
// Verified, not confirmed absent). Rather than guess at — or worse,
// silently proxy to — an implementation that may not match this shape,
// every method here throws a clear "not implemented" error. A future
// implementation phase must first verify current-state numbering behaviour
// (e.g. how invoice_number/quote_number/bill_number are actually assigned
// today) before deciding whether this service proxies an existing mechanism
// or introduces a new one.

import { assertGovernanceDomainActive } from '@/governance/featureFlags';
import type { GovernanceMutationResult } from '@/governance/types';
import {
  validateDocumentNumberingConfig,
  type DocumentNumberingConfigDomainModel,
  type DocumentType,
} from './model';

export interface DocumentConfigurationReadAPI {
  getNumberingConfig(companyId: string, documentType: DocumentType): Promise<DocumentNumberingConfigDomainModel | null>;
}

export interface DocumentConfigurationMutationAPI {
  setNumberingConfig(
    companyId: string,
    config: Partial<DocumentNumberingConfigDomainModel>
  ): Promise<GovernanceMutationResult>;
}

const NOT_IMPLEMENTED =
  'Document numbering configuration was not covered by the G1 audit — whether a ' +
  'centralized mechanism already exists is Not Verified. This method deliberately ' +
  'does not guess at or proxy an unconfirmed implementation.';

export class DocumentConfigurationService implements DocumentConfigurationReadAPI, DocumentConfigurationMutationAPI {
  async getNumberingConfig(
    _companyId: string,
    _documentType: DocumentType
  ): Promise<DocumentNumberingConfigDomainModel | null> {
    assertGovernanceDomainActive('documentConfiguration');
    throw new Error(NOT_IMPLEMENTED);
  }

  async setNumberingConfig(
    _companyId: string,
    config: Partial<DocumentNumberingConfigDomainModel>
  ): Promise<GovernanceMutationResult> {
    assertGovernanceDomainActive('documentConfiguration');
    const validation = validateDocumentNumberingConfig(config);
    if (!validation.valid) return { success: false, error: validation.errors.join(' ') };
    throw new Error(NOT_IMPLEMENTED);
  }
}

export function createDocumentConfigurationService(): DocumentConfigurationService {
  return new DocumentConfigurationService();
}
