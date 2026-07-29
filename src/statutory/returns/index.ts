/**
 * Statutory returns platform index (V3.6.1)
 */

export type {
  CountryPluginBundle,
  StatutoryReturnPlugin,
  StatutoryExportArtifact,
  TransmissionResult,
  TransmissionRequest,
  SubmissionLedgerEvent,
  StatutoryReturnPipelineResult,
  ExportFormat,
  TransmissionProviderId,
} from './contracts';

export {
  hashStatutoryReturn,
  freezeStatutoryReturn,
  isReturnSubmitted,
  assertCanRegenerate,
  appendSubmissionLedgerEvent,
  listSubmissionLedgerEvents,
  clearSubmissionLedgerForTests,
  markReturnSubmitted,
} from './ledger';

export { exportStatutoryReturn } from './exportFramework';
export { transmitStatutoryExport, listTransmissionProviders } from './transmissionFramework';
export { runStatutoryReturnPipeline } from './pipeline';
