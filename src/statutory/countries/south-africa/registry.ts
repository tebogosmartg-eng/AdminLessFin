import type { CountryLegislationPackage } from '../../registry/types';
import { RULE_SET_2024_2025 } from './years/2024-2025';
import { RULE_SET_2025_2026 } from './years/2025-2026';
import { RULE_SET_2026_2027 } from './years/2026-2027';

export {
  RULE_SET_2024_2025,
  RULE_SET_2025_2026,
  RULE_SET_2026_2027,
};

export const SOUTH_AFRICA_PACKAGES: readonly CountryLegislationPackage[] = [
  RULE_SET_2024_2025,
  RULE_SET_2025_2026,
  RULE_SET_2026_2027,
] as const;
