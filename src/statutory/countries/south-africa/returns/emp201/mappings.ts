/**
 * South Africa EMP201 — mappings from finalized snapshot → declaration fields.
 * Does not calculate PAYE/UIF/SDL.
 */

export const EMP201_MAPPINGS = {
  id: 'za.emp201.mappings.v1',
  engines: {
    paye: ['paye', 'directors_paye', 'bonus_tax', 'termination_tax'] as const,
    uifEmployee: ['uif'] as const,
    uifEmployer: ['uif_employer'] as const,
    sdl: ['sdl'] as const,
  },
  legislationFields: ['paye', 'uif', 'sdl'] as const,
};
