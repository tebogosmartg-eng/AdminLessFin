/**
 * Brand Identity (V14.0) — presentation metadata only.
 *
 * Branding controls the cover design, header/footer styling, colour palette and
 * typography theme of the published Annual Financial Statements. It is a pure
 * presentation layer: branding NEVER alters statutory content, numbering,
 * cross-references, tables or amounts. The document's structure fingerprint is
 * computed independently of branding, so re-branding a document changes only its
 * appearance, never its meaning.
 */
import type { Rgb } from './render/pdfKit';

export type BrandTypographyTheme = 'classic' | 'modern' | 'legal';
export type BrandCoverDesign = 'minimal' | 'banded' | 'framed';

export type BrandIdentity = {
  /** Brand name shown in the footer credit line. */
  brandName: string;
  /** Optional tagline shown on the cover. */
  tagline: string;
  /** Primary colour — cover title, section rules (RGB, 0..1). */
  primaryColor: Rgb;
  /** Accent colour — cover accents, header/footer rules (RGB, 0..1). */
  accentColor: Rgb;
  /** Soft tint used for table header washes (RGB, 0..1). */
  accentTint: Rgb;
  /** Hex equivalents (without '#') for the DOCX renderer. */
  primaryHex: string;
  accentHex: string;
  accentTintHex: string;
  /** Cover layout treatment. */
  coverDesign: BrandCoverDesign;
  /** Header styling. */
  header: {
    showRule: boolean;
    ruleColor: Rgb;
    ruleWidth: number;
  };
  /** Footer styling. */
  footer: {
    showRule: boolean;
    ruleColor: Rgb;
    ruleWidth: number;
    /** Credit line rendered at the foot of every page. */
    creditLine: string;
  };
  /** Typography theme controlling cover/heading emphasis. */
  typographyTheme: BrandTypographyTheme;
};

/**
 * Default AdminLess Fin enterprise brand identity.
 * Deep navy primary with a professional forest-green accent — premium, calm,
 * and suitable for statutory financial statements without distracting colour.
 */
export const ADMINLESS_FIN_BRAND: BrandIdentity = {
  brandName: 'AdminLess Fin',
  tagline: 'Enterprise Accounts Production',
  primaryColor: [0.07, 0.18, 0.28], // deep navy
  accentColor: [0.12, 0.42, 0.32], // professional forest green
  accentTint: [0.93, 0.96, 0.94], // soft green wash for table headers
  primaryHex: '122E47',
  accentHex: '1F6B52',
  accentTintHex: 'EDF5F0',
  coverDesign: 'banded',
  header: {
    showRule: true,
    ruleColor: [0.12, 0.42, 0.32],
    ruleWidth: 0.9,
  },
  footer: {
    showRule: true,
    ruleColor: [0.78, 0.82, 0.80],
    ruleWidth: 0.5,
    creditLine: 'AdminLess Fin',
  },
  typographyTheme: 'classic',
};

export type BrandOverrides = {
  brandName?: string;
  tagline?: string;
  primaryColor?: Rgb;
  accentColor?: Rgb;
  accentTint?: Rgb;
  primaryHex?: string;
  accentHex?: string;
  accentTintHex?: string;
  coverDesign?: BrandCoverDesign;
  typographyTheme?: BrandTypographyTheme;
  creditLine?: string;
};

/**
 * Resolve the effective brand identity, layering optional configuration over the
 * AdminLess Fin default. Colour overrides update both the RGB and hex forms so
 * the PDF and DOCX renderers remain consistent.
 */
export function resolveBrandIdentity(overrides?: BrandOverrides | null): BrandIdentity {
  const base = ADMINLESS_FIN_BRAND;
  if (!overrides) return base;
  const brandName = overrides.brandName ?? base.brandName;
  return {
    ...base,
    brandName,
    tagline: overrides.tagline ?? base.tagline,
    primaryColor: overrides.primaryColor ?? base.primaryColor,
    accentColor: overrides.accentColor ?? base.accentColor,
    accentTint: overrides.accentTint ?? base.accentTint,
    primaryHex: overrides.primaryHex ?? (overrides.primaryColor ? rgbToHex(overrides.primaryColor) : base.primaryHex),
    accentHex: overrides.accentHex ?? (overrides.accentColor ? rgbToHex(overrides.accentColor) : base.accentHex),
    accentTintHex:
      overrides.accentTintHex ??
      (overrides.accentTint ? rgbToHex(overrides.accentTint) : base.accentTintHex),
    coverDesign: overrides.coverDesign ?? base.coverDesign,
    typographyTheme: overrides.typographyTheme ?? base.typographyTheme,
    header: { ...base.header, ruleColor: overrides.accentColor ?? base.header.ruleColor },
    footer: {
      ...base.footer,
      creditLine: overrides.creditLine ?? brandName,
    },
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Convert an RGB (0..1) colour to an upper-case 6-digit hex string. */
export function rgbToHex(c: Rgb): string {
  return c
    .map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}
