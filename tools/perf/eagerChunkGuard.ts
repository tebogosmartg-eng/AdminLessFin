/**
 * Build-time guard: fails the build if a chunk declared "lazy-only" ends up in
 * the eager first-load set.
 *
 * WHY THIS EXISTS
 * `vendor-pdf` (793 kB raw / 243 kB gzip) shipped on first paint for an unknown
 * period. Nothing in the source said so, no tool warned, and the comment in
 * `vite.config.ts` asserted the opposite. The cause was a single virtual module
 * (`\0vite/preload-helper.js`) that Rollup happened to place inside that chunk,
 * which gave the entry a static edge to it — and chunk membership is
 * all-or-nothing, so one 400-byte module dragged 793 kB onto the critical path.
 *
 * That failure was silent and it was placement-dependent, meaning a dependency
 * bump could reintroduce it at any time. A comment cannot prevent that; an
 * assertion can.
 *
 * WHAT "EAGER" MEANS HERE
 * The entry chunk plus the transitive closure of its **static** imports —
 * precisely the set Vite writes into index.html as <script> and
 * <link rel="modulepreload">. Dynamic imports are chunk boundaries and are
 * deliberately not followed.
 */
import type { Plugin } from 'vite';
import type { OutputChunk } from 'rollup';

/**
 * Chunks that must never be reachable from the entry by static import.
 * Keep in sync with the lazy-only clusters in `vendorChunk()`.
 */
export const LAZY_ONLY_CHUNKS = [
  'vendor-pdf',
  'vendor-ocr',
  'vendor-codes',
  'vendor-recharts',
  'vendor-csv',
] as const;

export function eagerChunkGuard(forbidden: readonly string[] = LAZY_ONLY_CHUNKS): Plugin {
  return {
    name: 'perf-eager-chunk-guard',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(
        (item): item is OutputChunk => item.type === 'chunk',
      );
      const byFileName = new Map(chunks.map((c) => [c.fileName, c]));

      // Static-only closure from every entry, recording how each chunk was
      // reached so a failure can name the culprit instead of just the victim.
      const reachedVia = new Map<string, string | null>();
      const queue: string[] = [];
      for (const entry of chunks.filter((c) => c.isEntry)) {
        reachedVia.set(entry.fileName, null);
        queue.push(entry.fileName);
      }
      while (queue.length) {
        const fileName = queue.shift()!;
        for (const imported of byFileName.get(fileName)?.imports ?? []) {
          if (reachedVia.has(imported)) continue;
          reachedVia.set(imported, fileName);
          queue.push(imported);
        }
      }

      const chain = (fileName: string): string[] => {
        const path: string[] = [];
        let cur: string | undefined | null = fileName;
        while (cur) {
          path.unshift(cur);
          cur = reachedVia.get(cur);
        }
        return path;
      };

      const violations = chunks.filter(
        (c) => forbidden.includes(c.name) && reachedVia.has(c.fileName),
      );

      if (violations.length) {
        const detail = violations
          .map((c) => {
            const kb = (c.code.length / 1024).toFixed(1);
            const modules = Object.keys(c.modules);
            // The module that made it eager is almost always a small stowaway
            // rather than the bulk of the chunk, so surface the non-obvious
            // ones (virtual modules first) to point at the real cause.
            // Only bundler-injected virtuals, not the `?commonjs-exports`
            // helpers every CJS dependency generates — those are noise, and
            // burying the one useful line under 200 of them defeats the point.
            const virtuals = modules.filter(
              (m) => m.startsWith('\0') && !m.includes('node_modules'),
            );
            return (
              `  • ${c.name} (${c.fileName}, ${kb} kB) is eagerly loaded.\n` +
              `    Static chain from entry:\n` +
              chain(c.fileName)
                .map((f, i) => `      ${'  '.repeat(i)}${f}`)
                .join('\n') +
              (virtuals.length
                ? `\n    Virtual modules inside this chunk (a likely cause — ` +
                  `assign them explicitly in vendorChunk()):\n` +
                  virtuals.map((m) => `      ${JSON.stringify(m)}`).join('\n')
                : '')
            );
          })
          .join('\n\n');

        this.error(
          `Lazy-only chunk(s) reached the eager first-load set.\n\n${detail}\n\n` +
            `A chunk becomes eager when ANY module inside it is statically imported\n` +
            `from the entry graph — chunk membership is all-or-nothing. Either give\n` +
            `the offending module its own chunk in vendorChunk(), or replace the\n` +
            `static import with a dynamic import() at the call site.\n`,
        );
      }
    },
  };
}
