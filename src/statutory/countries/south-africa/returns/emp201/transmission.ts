/**
 * EMP201 transmission — isolated from export (V3.6.1).
 */

import { transmitStatutoryExport } from '../../../../returns/transmissionFramework';
import type { TransmissionRequest, TransmissionResult } from '../../../../returns/contracts';

export function transmitEmp201(request: TransmissionRequest): TransmissionResult {
  return transmitStatutoryExport(request);
}
