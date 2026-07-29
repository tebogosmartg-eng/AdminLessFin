/**
 * South Africa statutory returns country package (V3.6.1).
 */

import type { CountryPluginBundle } from '../../../returns/contracts';
import { zaEmp201Plugin } from './emp201';
import { zaEmp501Plugin } from './emp501';
import { zaIrp5Plugin } from './irp5';
import { zaTaxCertificatePlugin } from './tax-certificates';

export const SOUTH_AFRICA_RETURN_PLUGINS = [
  zaEmp201Plugin,
  zaEmp501Plugin,
  zaIrp5Plugin,
  zaTaxCertificatePlugin,
] as const;

export function getSouthAfricaPluginBundle(): CountryPluginBundle {
  return {
    countryCode: 'ZA',
    returns: SOUTH_AFRICA_RETURN_PLUGINS,
    validators: SOUTH_AFRICA_RETURN_PLUGINS.map((p) => ({
      id: `${p.returnType}.validator`,
      validate: p.validate,
    })),
    exporters: SOUTH_AFRICA_RETURN_PLUGINS.map((p) => ({
      id: `${p.returnType}.exporter`,
      exportReturn: p.exportReturn,
    })),
    transmissionProviders: [
      { id: 'manual', transmit: zaEmp201Plugin.transmit },
      { id: 'sars_efiling_stub', transmit: zaEmp201Plugin.transmit },
    ],
    certificates: [
      { id: 'irp5', returnType: 'IRP5' },
      { id: 'tax_certificate', returnType: 'TAX_CERTIFICATE' },
    ],
  };
}

export { zaEmp201Plugin, generateEmp201, validateEmp201 } from './emp201';
export { zaEmp501Plugin, generateEmp501, validateEmp501 } from './emp501';
export { zaIrp5Plugin, generateIrp5, validateIrp5 } from './irp5';
export { zaTaxCertificatePlugin, generateTaxCertificate } from './tax-certificates';
