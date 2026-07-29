import { transmitStatutoryExport } from '../../../../returns/transmissionFramework';
import type { TransmissionRequest, TransmissionResult } from '../../../../returns/contracts';

export function transmitEmp501(request: TransmissionRequest): TransmissionResult {
  return transmitStatutoryExport(request);
}
