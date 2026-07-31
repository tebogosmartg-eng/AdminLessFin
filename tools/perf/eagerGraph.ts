/**
 * Eager import-graph walker.
 *
 * Answers one question with evidence rather than assumption: which modules are
 * reachable from `src/main.tsx` through *static* imports only? That set is what
 * the browser must download, parse and execute before the app can render
 * anything — dynamic `import()` calls are chunk boundaries and are deliberately
 * NOT followed (they are recorded as frontier edges instead).
 *
 * This exists because `vite.config.ts` asserts several vendor clusters have
 * "zero eager consumers"; the built `index.html` modulepreload list disagrees.
 * The walker settles it by reading the source, not the package names.
 *
 * Usage: npx tsx tools/perf/eagerGraph.ts [--json] [--why <package>]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const ENTRY = path.join(SRC, 'main.tsx');
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

type Edge = { from: string; to: string; specifier: string };

/** Strips comments and string literals so import scanning cannot be fooled by them. */
function stripNoise(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/**
 * Extracts static import specifiers. Covers `import x from 's'`,
 * `import 's'`, `export ... from 's'`, and `import type` (which is erased at
 * build time and therefore explicitly excluded — counting it would inflate the
 * eager graph with modules that never ship).
 */
function staticSpecifiers(code: string): string[] {
  const out: string[] = [];
  const clean = stripNoise(code);

  const re = /(?:^|[\s;}])(import|export)\s+([\s\S]*?)\bfrom\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const clause = m[2];
    // `import type {...} from` / `export type {...} from` vanish at compile
    // time. Named type specifiers (`import { type Foo }`) still emit a runtime
    // import for the module unless every binding is a type, which is close
    // enough to ignore — being conservative here over-reports, never under.
    if (/^\s*type\s/.test(clause)) continue;
    out.push(m[3]);
  }

  // Side-effect-only imports: `import "./globals.css"`
  const bare = /(?:^|[\s;}])import\s*['"]([^'"]+)['"]/g;
  while ((m = bare.exec(clean))) out.push(m[1]);

  return out;
}

function dynamicSpecifiers(code: string): string[] {
  const out: string[] = [];
  const re = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripNoise(code)))) out.push(m[1]);
  return out;
}

/** Resolves a specifier to an absolute file path, or to a bare package name. */
function resolve(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(fromFile), specifier);
  else return `pkg:${packageOf(specifier)}`;

  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXTS) {
    if (fs.existsSync(base + ext)) return base + ext;
  }
  for (const ext of EXTS) {
    const idx = path.join(base, 'index' + ext);
    if (fs.existsSync(idx)) return idx;
  }
  return null; // CSS/assets/unresolvable — irrelevant to JS cost
}

function packageOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

export type GraphResult = {
  eagerFiles: string[];
  eagerPackages: string[];
  /** Every static edge, so any package's inclusion can be traced to a cause. */
  edges: Edge[];
  /** Modules reached only via `import()` — chunk boundaries, not eager cost. */
  dynamicFrontier: string[];
};

export function walk(): GraphResult {
  const seen = new Set<string>();
  const pkgs = new Set<string>();
  const edges: Edge[] = [];
  const frontier = new Set<string>();
  const queue = [ENTRY];

  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);

    let code: string;
    try {
      code = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    for (const spec of dynamicSpecifiers(code)) {
      const target = resolve(spec, file);
      if (target) frontier.add(target);
    }

    for (const spec of staticSpecifiers(code)) {
      const target = resolve(spec, file);
      if (!target) continue;
      edges.push({ from: rel(file), to: rel(target), specifier: spec });
      if (target.startsWith('pkg:')) {
        pkgs.add(target.slice(4));
      } else if (!seen.has(target)) {
        queue.push(target);
      }
    }
  }

  return {
    eagerFiles: [...seen].map(rel).sort(),
    eagerPackages: [...pkgs].sort(),
    edges,
    dynamicFrontier: [...frontier].map((f) => (f.startsWith('pkg:') ? f : rel(f))).sort(),
  };
}

function rel(p: string): string {
  return p.startsWith('pkg:') ? p : path.relative(ROOT, p).replace(/\\/g, '/');
}

/** Shortest static path from the entry to a package — i.e. "why is this eager?" */
export function why(graph: GraphResult, pkg: string): string[] | null {
  const target = `pkg:${pkg}`;
  const parents = new Map<string, string>();
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }

  const start = 'src/main.tsx';
  const q = [start];
  const seen = new Set([start]);
  while (q.length) {
    const cur = q.shift()!;
    for (const next of adj.get(cur) || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      parents.set(next, cur);
      if (next === target) {
        const chain = [next];
        let c: string | undefined = cur;
        while (c) {
          chain.unshift(c);
          c = parents.get(c);
        }
        return chain;
      }
      q.push(next);
    }
  }
  return null;
}

if (process.argv[1] && process.argv[1].includes('eagerGraph')) {
  const graph = walk();
  const whyArg = process.argv.indexOf('--why');

  if (whyArg !== -1) {
    const pkg = process.argv[whyArg + 1];
    const chain = why(graph, pkg);
    console.log(chain ? chain.join('\n  -> ') : `${pkg} is NOT in the eager graph.`);
  } else if (process.argv.includes('--json')) {
    console.log(JSON.stringify(graph, null, 2));
  } else {
    console.log(`Eager source files : ${graph.eagerFiles.length}`);
    console.log(`Eager npm packages : ${graph.eagerPackages.length}`);
    console.log(`Dynamic frontier   : ${graph.dynamicFrontier.length}`);
    console.log('\nEager packages:');
    for (const p of graph.eagerPackages) console.log('  ' + p);
  }
}
