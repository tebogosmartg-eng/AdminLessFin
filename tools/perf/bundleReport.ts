/**
 * Bundle measurement.
 *
 * Runs the real production build through Vite's JS API and reports what
 * actually ships: per-chunk raw/gzip/brotli bytes, which chunks the browser
 * fetches *eagerly* (entry + its static import closure, which is exactly what
 * Vite turns into <script> + <link modulepreload>), and — for any chunk that
 * looks wrongly eager — which module dragged it in.
 *
 * Reading the emitted bundle rather than the source is the point: manualChunks
 * groups by module id, so a chunk can become eager through a transitive
 * dependency that no application file names directly.
 *
 * Usage: npx tsx tools/perf/bundleReport.ts [--out <file.json>]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { build } from 'vite';
import type { OutputChunk, OutputAsset } from 'rollup';

const ROOT = process.cwd();

export type ChunkInfo = {
  name: string;
  fileName: string;
  isEntry: boolean;
  raw: number;
  gzip: number;
  brotli: number;
  /** Static imports — these propagate eagerness. */
  imports: string[];
  /** Dynamic imports — these are chunk boundaries and do NOT propagate. */
  dynamicImports: string[];
  moduleCount: number;
};

export type BundleReport = {
  generatedAt: string;
  totals: { raw: number; gzip: number; brotli: number; chunks: number };
  eager: { fileNames: string[]; raw: number; gzip: number; brotli: number };
  lazy: { raw: number; gzip: number; brotli: number };
  chunks: ChunkInfo[];
  css: { fileName: string; raw: number; gzip: number }[];
  /** chunk fileName -> module ids it contains (trimmed to repo-relative). */
  chunkModules: Record<string, string[]>;
};

function gzipSize(buf: Buffer): number {
  return zlib.gzipSync(buf, { level: 9 }).length;
}
function brotliSize(buf: Buffer): number {
  return zlib.brotliCompressSync(buf).length;
}

function shorten(id: string): string {
  const norm = id.replace(/\\/g, '/');
  const nm = norm.lastIndexOf('node_modules/');
  if (nm !== -1) return norm.slice(nm + 'node_modules/'.length);
  return path.relative(ROOT, norm).replace(/\\/g, '/');
}

export async function measureBundle(): Promise<BundleReport> {
  const result = await build({ logLevel: 'warn' });
  const output = Array.isArray(result)
    ? result[0].output
    : (result as { output: (OutputChunk | OutputAsset)[] }).output;

  const chunks: ChunkInfo[] = [];
  const chunkModules: Record<string, string[]> = {};
  const css: { fileName: string; raw: number; gzip: number }[] = [];
  const byFileName = new Map<string, ChunkInfo>();

  for (const item of output) {
    if (item.type === 'chunk') {
      const buf = Buffer.from(item.code, 'utf8');
      const info: ChunkInfo = {
        name: item.name,
        fileName: item.fileName,
        isEntry: item.isEntry,
        raw: buf.length,
        gzip: gzipSize(buf),
        brotli: brotliSize(buf),
        imports: item.imports,
        dynamicImports: item.dynamicImports,
        moduleCount: Object.keys(item.modules).length,
      };
      chunks.push(info);
      byFileName.set(item.fileName, info);
      chunkModules[item.fileName] = Object.keys(item.modules).map(shorten);
    } else if (item.fileName.endsWith('.css')) {
      const buf = Buffer.from(
        typeof item.source === 'string' ? item.source : Buffer.from(item.source),
      );
      css.push({ fileName: item.fileName, raw: buf.length, gzip: gzipSize(buf) });
    }
  }

  // Eager set = entry chunk plus the transitive closure of STATIC imports.
  // This mirrors exactly what Vite writes into index.html as <script> and
  // <link rel="modulepreload">, so it is the true first-load JS cost.
  const eager = new Set<string>();
  const queue = chunks.filter((c) => c.isEntry).map((c) => c.fileName);
  while (queue.length) {
    const fileName = queue.shift()!;
    if (eager.has(fileName)) continue;
    eager.add(fileName);
    for (const imp of byFileName.get(fileName)?.imports ?? []) queue.push(imp);
  }

  const sum = (list: ChunkInfo[], key: 'raw' | 'gzip' | 'brotli') =>
    list.reduce((acc, c) => acc + c[key], 0);
  const eagerChunks = chunks.filter((c) => eager.has(c.fileName));
  const lazyChunks = chunks.filter((c) => !eager.has(c.fileName));

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      raw: sum(chunks, 'raw'),
      gzip: sum(chunks, 'gzip'),
      brotli: sum(chunks, 'brotli'),
      chunks: chunks.length,
    },
    eager: {
      fileNames: [...eager].sort(),
      raw: sum(eagerChunks, 'raw'),
      gzip: sum(eagerChunks, 'gzip'),
      brotli: sum(eagerChunks, 'brotli'),
    },
    lazy: {
      raw: sum(lazyChunks, 'raw'),
      gzip: sum(lazyChunks, 'gzip'),
      brotli: sum(lazyChunks, 'brotli'),
    },
    chunks: chunks.sort((a, b) => b.raw - a.raw),
    css,
    chunkModules,
  };
}

const kb = (n: number) => (n / 1024).toFixed(1) + ' kB';

if (process.argv[1] && process.argv[1].includes('bundleReport')) {
  measureBundle()
    .then((report) => {
      const outIdx = process.argv.indexOf('--out');
      const outFile =
        outIdx !== -1 ? process.argv[outIdx + 1] : 'tests/perf/results/bundle.json';
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

      console.log('\n=== EAGER (first-load) JS ===');
      for (const name of report.eager.fileNames) {
        const c = report.chunks.find((x) => x.fileName === name)!;
        console.log(
          `  ${c.isEntry ? '*' : ' '} ${c.fileName.padEnd(52)} raw ${kb(c.raw).padStart(10)}  gzip ${kb(c.gzip).padStart(9)}  brotli ${kb(c.brotli).padStart(9)}`,
        );
      }
      console.log(
        `  TOTAL EAGER: raw ${kb(report.eager.raw)}  gzip ${kb(report.eager.gzip)}  brotli ${kb(report.eager.brotli)}`,
      );
      console.log(
        `  TOTAL LAZY : raw ${kb(report.lazy.raw)}  gzip ${kb(report.lazy.gzip)}`,
      );
      console.log(
        `  CSS        : ${report.css.map((c) => `${c.fileName} raw ${kb(c.raw)} gzip ${kb(c.gzip)}`).join(', ')}`,
      );
      console.log(`\nWrote ${outFile}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
