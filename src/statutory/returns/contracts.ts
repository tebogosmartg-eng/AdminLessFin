/**
 * Statutory Returns platform contracts (V3.6.1).
 * Country-agnostic — payroll engine remains unaware of this layer.
 */

import type {
  GenerateReturnInput,
  StatutoryReturn,
  StatutoryReturnCountry,
  StatutoryReturnPackage,
  StatutoryReturnType,
  StatutoryValidationResult,
} from '../../lib/statutoryReturns/types';

export type ExportFormat = 'json' | 'csv' | 'xml';

export type StatutoryExportArtifact = {
  returnId: string;
  country: StatutoryReturnCountry;
  returnType: StatutoryReturnType;
  format: ExportFormat;
  fileName: string;
  contentType: string;
  payload: string;
  contentHash: string;
  exportedAt: string;
};

export type TransmissionProviderId = 'manual' | 'sars_efiling_stub';

export type TransmissionRequest = {
  artifact: StatutoryExportArtifact;
  providerId: TransmissionProviderId;
  actorId?: string | null;
};

export type TransmissionResult = {
  ok: boolean;
  providerId: TransmissionProviderId;
  submissionReference: string | null;
  transmittedAt: string;
  message: string;
};

export type StatutoryReturnValidator = (
  ret: StatutoryReturn,
  input?: GenerateReturnInput
) => StatutoryValidationResult;

export type StatutoryReturnExporter = (
  ret: StatutoryReturn,
  format?: ExportFormat
) => StatutoryExportArtifact;

export type StatutoryReturnTransmitter = (
  request: TransmissionRequest
) => TransmissionResult;

/** Full country return plugin — generation / validation / export / transmission isolated. */
export type StatutoryReturnPlugin = StatutoryReturnPackage & {
  validate: StatutoryReturnValidator;
  exportReturn: StatutoryReturnExporter;
  transmit: StatutoryReturnTransmitter;
  mappingsId: string;
  schemaId: string;
};

export type CountryPluginBundle = {
  countryCode: StatutoryReturnCountry;
  returns: readonly StatutoryReturnPlugin[];
  validators: readonly { id: string; validate: StatutoryReturnValidator }[];
  exporters: readonly { id: string; exportReturn: StatutoryReturnExporter }[];
  transmissionProviders: readonly {
    id: TransmissionProviderId;
    transmit: StatutoryReturnTransmitter;
  }[];
  certificates: readonly { id: string; returnType: StatutoryReturnType }[];
};

export type SubmissionLedgerEventType =
  | 'generated'
  | 'validated'
  | 'exported'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'superseded'
  | 'regeneration_blocked';

export type SubmissionLedgerEvent = {
  id: string;
  statutoryReturnId: string;
  companyId: string | null;
  eventType: SubmissionLedgerEventType;
  contentHash: string | null;
  payload: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
};

export type PipelineStage = 'generate' | 'validate' | 'export' | 'transmit';

export type StatutoryReturnPipelineResult = {
  returnRecord: StatutoryReturn;
  validation: StatutoryValidationResult;
  artifact: StatutoryExportArtifact | null;
  transmission: TransmissionResult | null;
  ledgerEvents: SubmissionLedgerEvent[];
  stagesCompleted: PipelineStage[];
};
