/**
 * AdminLess product branding — single source of truth.
 * Swap `product` / `productShort` for future products (Edu, HR, Pay, Stock).
 */
export const BRAND = {
  master: "AdminLess",
  product: "AdminLess Fin",
  productShort: "Fin",
  tagline: "Less Admin. More Growth.",
  taglineLines: ["Less Admin.", "More Growth."],
  description:
    "AdminLess Fin unifies accounting, invoicing, payroll and reporting into one AI-powered financial operating system.",
  assets: {
    /** UI uses inline SVG via AdminLessFinMark — raster paths are for meta/PWA only. */
    iconSvg: "/icons/app-icon.svg",
    favicon32: "/icons/favicon-32.png",
    favicon192: "/icons/favicon-192.png",
    appleTouchIcon: "/icons/apple-touch-icon.png",
    pwaIcon: "/icons/app-icon.png",
    ogImage: "/og-image.png",
  },
  seo: {
    siteName: "AdminLess Fin",
    twitterCard: "summary_large_image",
    themeColor: "#047857",
  },
  /** Square optical sizes — icon is always rendered in a 1:1 box. */
  sizes: {
    xs: "size-5",
    sm: "size-7",
    md: "size-9",
    lg: "size-10",
    xl: "size-11",
  },
} as const;

export type BrandSize = keyof typeof BRAND.sizes;

export function getPageTitle(page?: string): string {
  return page ? `${page} · ${BRAND.product}` : BRAND.product;
}
