/**
 * Lazy loader for the jsPDF engine.
 *
 * WHY THIS EXISTS
 * jsPDF + jspdf-autotable + html2canvas + canvg + core-js weigh 793 kB raw
 * (243 kB gzip). Importing them at module scope makes them a *static* dependency
 * of whichever route chunk touches them, so merely opening Payroll Run Detail,
 * Payroll Reports or Audit & Compliance Reports downloaded the whole PDF engine
 * whether or not the user ever pressed Export.
 *
 * Routing every consumer through this module means there is exactly one
 * `import()` boundary for the PDF engine in the application, so the bundler can
 * keep `vendor-pdf` in a chunk that is fetched on demand and nothing else.
 *
 * `typeof import('jspdf')` below is a *type* query — it is erased at build time
 * and creates no runtime edge. Only the `import()` calls inside `loadPdfEngine`
 * are real.
 */
type JsPdfModule = typeof import('jspdf');
type AutoTableModule = typeof import('jspdf-autotable');

export type PdfEngine = {
  jsPDF: JsPdfModule['jsPDF'];
  autoTable: AutoTableModule['default'];
};

/**
 * Cached so the engine is fetched and evaluated once per session: the first
 * export pays the download, every subsequent one resolves immediately.
 * The promise (not the resolved value) is cached so two exports fired in
 * parallel share a single download rather than racing.
 */
let enginePromise: Promise<PdfEngine> | null = null;

export function loadPdfEngine(): Promise<PdfEngine> {
  if (!enginePromise) {
    enginePromise = Promise.all([import('jspdf'), import('jspdf-autotable')])
      .then(([pdf, table]) => ({ jsPDF: pdf.jsPDF, autoTable: table.default }))
      .catch((error) => {
        // Never cache a failure: a transient chunk-load error (deploy in
        // flight, offline) must not permanently disable PDF export for the
        // rest of the session.
        enginePromise = null;
        throw error;
      });
  }
  return enginePromise;
}
