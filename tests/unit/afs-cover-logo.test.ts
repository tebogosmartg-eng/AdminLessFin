/**
 * The entity's logo prints on the AFS cover, above its name, in the PDF and
 * in the Word document; the preparer can leave it off; no logo means a plain
 * cover, never a broken one.
 */
import { describe, expect, it } from 'vitest';
import { buildV16SampleModel } from '../../src/lib/financialStatements/composition/fixtures/v16SampleModel';
import { emptyOverrides, includeKey } from '../../src/lib/financialStatements/document/documentStore';
import { buildCanonicalPublishPackage } from '../../src/lib/financialStatements/publication/canonicalDocumentPublish';
import { coverLogoBox, type CoverLogo } from '../../src/lib/financialStatements/publication/coverLogo';

// A 1 x 1 baseline JPEG.
const JPEG = atob(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
);
const logo: CoverLogo = { jpeg: JPEG, width: 400, height: 200 };

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

describe('The company logo on the cover', () => {
  it('prints in the PDF as an embedded JPEG, bytes intact', () => {
    const pkg = buildCanonicalPublishPackage({ ...buildV16SampleModel(), logo }, emptyOverrides());
    const pdf = latin1(pkg.pdfBytes);
    expect(pdf).toContain('/Subtype /Image /Width 400 /Height 200');
    expect(pdf).toContain('/Filter /DCTDecode');
    expect(pdf).toContain(`/Length ${JPEG.length} >>\nstream\n${JPEG}\nendstream`);
    // Drawn on the cover page, which names it as a resource.
    expect(pdf).toMatch(/\/XObject << \/Im1 \d+ 0 R >>/);
    expect(pdf).toMatch(/cm \/Im1 Do Q/);
  });

  it('is stored in the Word document as a picture on the cover', () => {
    const pkg = buildCanonicalPublishPackage({ ...buildV16SampleModel(), logo }, emptyOverrides());
    const docx = latin1(pkg.docxBytes);
    expect(docx).toContain('word/media/logo.jpeg');
    expect(docx).toContain('r:embed="rIdLogo"');
    expect(docx).toContain('Target="media/logo.jpeg"');
    expect(docx).toContain('<Default Extension="jpeg" ContentType="image/jpeg"/>');
  });

  it('can be left off this set of statements', () => {
    const off = { ...emptyOverrides(), include: { [includeKey('section', 'cover:logo')]: false } };
    const pkg = buildCanonicalPublishPackage({ ...buildV16SampleModel(), logo }, off);
    expect(latin1(pkg.pdfBytes)).not.toContain('/Subtype /Image');
    expect(latin1(pkg.docxBytes)).not.toContain('word/media/logo.jpeg');
  });

  it('a company without a logo gets a plain cover', () => {
    const pkg = buildCanonicalPublishPackage(buildV16SampleModel(), emptyOverrides());
    expect(latin1(pkg.pdfBytes)).not.toContain('/XObject');
    expect(latin1(pkg.docxBytes)).not.toContain('rIdLogo');
  });

  it('keeps its proportions within the cover box', () => {
    expect(coverLogoBox({ jpeg: '', width: 400, height: 200 }, 240, 130)).toEqual({ w: 240, h: 120 });
    const tall = coverLogoBox({ jpeg: '', width: 100, height: 400 }, 240, 130);
    expect(tall.h).toBe(130);
    expect(tall.w).toBeCloseTo(32.5);
  });
});
