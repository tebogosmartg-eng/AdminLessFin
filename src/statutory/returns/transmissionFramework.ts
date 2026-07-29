/**
 * Transmission framework — isolated from export (V3.6.1).
 * Live SARS eFiling is not enabled; providers are pluggable stubs.
 */

import type { TransmissionProviderId, TransmissionRequest, TransmissionResult } from './contracts';

export function transmitManual(request: TransmissionRequest): TransmissionResult {
  const ref = `MANUAL-${request.artifact.returnId.slice(0, 8)}-${Date.now()}`;
  return {
    ok: true,
    providerId: 'manual',
    submissionReference: ref,
    transmittedAt: new Date().toISOString(),
    message: 'Manual transmission recorded. Operator must complete authority portal filing.',
  };
}

export function transmitSarsEfilingStub(request: TransmissionRequest): TransmissionResult {
  return {
    ok: false,
    providerId: 'sars_efiling_stub',
    submissionReference: null,
    transmittedAt: new Date().toISOString(),
    message:
      `SARS eFiling provider is registered but not live-enabled (artifact ${request.artifact.fileName}). ` +
      'Enable in a dedicated filing sprint.',
  };
}

const providers: Record<TransmissionProviderId, (req: TransmissionRequest) => TransmissionResult> = {
  manual: transmitManual,
  sars_efiling_stub: transmitSarsEfilingStub,
};

export function transmitStatutoryExport(request: TransmissionRequest): TransmissionResult {
  const fn = providers[request.providerId];
  if (!fn) {
    return {
      ok: false,
      providerId: request.providerId,
      submissionReference: null,
      transmittedAt: new Date().toISOString(),
      message: `Unknown transmission provider: ${request.providerId}`,
    };
  }
  return fn(request);
}

export function listTransmissionProviders(): TransmissionProviderId[] {
  return Object.keys(providers) as TransmissionProviderId[];
}
