/**
 * The entity's logo, as the AFS cover prints it.
 *
 * The logo is the company's own branding, uploaded once under Company
 * Settings and shared with its invoices and quotes. A set of financial
 * statements carries it on the cover, above the entity's name.
 *
 * Whatever was uploaded — a PNG with transparency, a JPEG, a WebP, an SVG —
 * is drawn onto a white canvas and re-encoded as a baseline JPEG. Both the
 * PDF writer (DCTDecode) and Word embed a JPEG natively, so every output
 * format prints the same picture and neither needs an image decoder.
 */

export type CoverLogo = {
  /** Baseline JPEG, as a binary string (one character per byte). */
  jpeg: string;
  /** Pixel size of the image. */
  width: number;
  height: number;
};

/** The longest side the embedded logo is kept to: sharp in print, small in the file. */
const MAX_SIDE = 1200;

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The logo could not be decoded.'));
    };
    img.src = url;
  });
}

/**
 * Load a logo for the cover. Returns null where there is no logo, where it
 * cannot be fetched or decoded, or outside a browser — the cover then prints
 * without one rather than failing.
 */
export async function loadCoverLogo(url: string | null | undefined): Promise<CoverLogo | null> {
  if (!url || typeof document === 'undefined' || typeof fetch === 'undefined') return null;
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    const img = await blobToImage(await response.blob());
    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    if (!naturalW || !naturalH) return null;
    const scale = Math.min(1, MAX_SIDE / Math.max(naturalW, naturalH));
    const width = Math.max(1, Math.round(naturalW * scale));
    const height = Math.max(1, Math.round(naturalH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d');
    if (!g) return null;
    // The cover is white paper: transparency becomes white, not black.
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, width, height);
    g.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const jpeg = atob(base64);
    if (!jpeg.length) return null;
    return { jpeg, width, height };
  } catch {
    return null;
  }
}

/** The logo's JPEG bytes, for a file format that stores it as a part. */
export function coverLogoBytes(logo: CoverLogo): Uint8Array {
  const out = new Uint8Array(logo.jpeg.length);
  for (let i = 0; i < logo.jpeg.length; i++) out[i] = logo.jpeg.charCodeAt(i) & 0xff;
  return out;
}

/**
 * The size the logo prints at on the cover, in points: at most `maxW` wide
 * and `maxH` tall, never stretched.
 */
export function coverLogoBox(logo: CoverLogo, maxW: number, maxH: number): { w: number; h: number } {
  const ratio = logo.width / logo.height;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  return { w, h };
}
