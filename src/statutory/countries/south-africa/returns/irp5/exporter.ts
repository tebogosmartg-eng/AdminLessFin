import { exportStatutoryReturn } from '../../../../returns/exportFramework';
import type { StatutoryReturn } from '../../../../../lib/statutoryReturns/types';
import type { ExportFormat, StatutoryExportArtifact } from '../../../../returns/contracts';

export function exportIrp5(ret: StatutoryReturn, format: ExportFormat = 'json'): StatutoryExportArtifact {
  return exportStatutoryReturn(ret, format);
}
