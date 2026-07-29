/**
 * EMP201 exporter — isolated from validation (V3.6.1).
 */

import { exportStatutoryReturn } from '../../../../returns/exportFramework';
import type { StatutoryReturn } from '../../../../../lib/statutoryReturns/types';
import type { ExportFormat, StatutoryExportArtifact } from '../../../../returns/contracts';

export function exportEmp201(
  ret: StatutoryReturn,
  format: ExportFormat = 'json'
): StatutoryExportArtifact {
  return exportStatutoryReturn(ret, format);
}
