import { exportStatutoryReturn } from '../../../../returns/exportFramework';
import type { StatutoryReturn } from '../../../../../lib/statutoryReturns/types';
import type { ExportFormat, StatutoryExportArtifact } from '../../../../returns/contracts';

export function exportEmp501(ret: StatutoryReturn, format: ExportFormat = 'json'): StatutoryExportArtifact {
  return exportStatutoryReturn(ret, format);
}
