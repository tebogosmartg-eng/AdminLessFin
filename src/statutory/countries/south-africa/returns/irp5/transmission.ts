import { transmitStatutoryExport } from '../../../../returns/transmissionFramework';
import type { TransmissionRequest, TransmissionResult } from '../../../../returns/contracts';

export function transmitIrp5(request: TransmissionRequest): TransmissionResult {
  return transmitStatutoryExport(request);
}
