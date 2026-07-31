/**
 * Importer tracer.
 *
 * Asks Rollup — not the source text — "which modules statically import package
 * X, and what is the shortest static chain from the entry to it?". Used to
 * settle why a supposedly lazy vendor chunk ends up in the eager first-load
 * set. Source-level grepping cannot answer this reliably because barrel files
 * and re-exports move the real edge somewhere no one wrote the package name.
 *
 * Usage: npx tsx tools/perf/traceImporters.ts <pkg> [<pkg> ...]
 */
import path from 'node:path';
import { build } from 'vite';
import type { Plugin } from 'vite';

const ROOT = process.cwd();
const targets = process.argv.slice(2).filter((a) => !a.startsWith('--'));

if (!targets.length) {
  console.error('Usage: npx tsx tools/perf/traceImporters.ts <pkg> [<pkg> ...]');
  process.exit(1);
}

const short = (id: string) => {
  const norm = id.replace(/\\/g, '/');
  const nm = norm.lastIndexOf('node_modules/');
  return nm !== -1 ? norm.slice(nm + 13) : path.relative(ROOT, norm).replace(/\\/g, '/');
};

const tracer: Plugin = {
  name: 'perf-trace-importers',
  generateBundle() {
    // Rebuild the static-only graph from Rollup's module info. Dynamic
    // importers are excluded on purpose: a dynamic edge is a chunk boundary
    // and does not make anything eager.
    const staticParents = new Map<string, string[]>();
    const entries: string[] = [];

    for (const id of this.getModuleIds()) {
      const info = this.getModuleInfo(id);
      if (!info) continue;
      if (info.isEntry) entries.push(id);
      staticParents.set(id, info.importers.slice());
    }

    for (const target of targets) {
      const matches = [...this.getModuleIds()].filter((id) =>
        id.replace(/\\/g, '/').includes(`node_modules/${target}/`),
      );

      if (!matches.length) {
        console.log(`\n### ${target}: not present in the module graph.`);
        continue;
      }

      // BFS upward from every module of the package to any entry, following
      // static importer edges only. First hit is the shortest eager chain.
      const seen = new Set<string>(matches);
      let frontier = matches.map((m) => [m]);
      let chain: string[] | null = null;

      while (frontier.length && !chain) {
        const next: string[][] = [];
        for (const p of frontier) {
          const head = p[0];
          if (entries.includes(head)) {
            chain = p;
            break;
          }
          for (const parent of staticParents.get(head) ?? []) {
            if (seen.has(parent)) continue;
            seen.add(parent);
            next.push([parent, ...p]);
          }
        }
        frontier = next;
      }

      console.log(`\n### ${target} (${matches.length} modules in graph)`);
      if (chain) {
        console.log('  EAGER — shortest static chain from entry:');
        chain.forEach((id, i) => console.log(`    ${'  '.repeat(i)}${short(id)}`));
      } else {
        console.log('  Not statically reachable from any entry (lazy-only).');
      }
    }
  },
};

build({
  logLevel: 'error',
  plugins: [tracer],
  build: { write: false },
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
