/**
 * V4.2.1 codemod — adopt Enterprise Edge Platform across all functions.
 * Preserves business logic; only standardises lifecycle shell.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'supabase', 'functions');

const SYSTEM = new Set(['process-recurring-entries', 'run-depreciation']);
const SERVICE = new Set(['send-po-email', 'send-quote-email', 'send-statement-email']);

function modeFor(name) {
  if (SYSTEM.has(name)) return 'system';
  if (SERVICE.has(name)) return 'service';
  return 'tenant';
}

function transform(name, src) {
  if (src.includes('withEnterprisePlatform(')) {
    return { src, skipped: true, reason: 'already adopted' };
  }

  let out = src;

  // Ensure import of platform (after existing imports block)
  const importLine =
    `import {\n` +
    `  ENTERPRISE_CORS_HEADERS,\n` +
    `  withEnterprisePlatform,\n` +
    `} from '../_shared/enterpriseEdgePlatform.ts'\n`;

  if (!out.includes('enterpriseEdgePlatform.ts')) {
    // Insert after last import line
    const lines = out.split('\n');
    let lastImport = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^import\s/.test(lines[i]) || /^import\{/.test(lines[i])) lastImport = i;
      // multi-line import
      if (lastImport >= 0 && i > lastImport && /from\s+['"].+['"]/.test(lines[i]) && !/^import\s/.test(lines[i])) {
        lastImport = i;
      }
    }
    if (lastImport >= 0) {
      lines.splice(lastImport + 1, 0, importLine);
      out = lines.join('\n');
    } else {
      out = importLine + out;
    }
  }

  // Replace local corsHeaders object with certified constant
  out = out.replace(
    /const corsHeaders\s*=\s*\{[\s\S]*?\n\}/,
    'const corsHeaders = ENTERPRISE_CORS_HEADERS',
  );

  // Also handle work's double-quoted variant already replaced by above

  // Wrap serve(...)
  const mode = modeFor(name);
  // Patterns: serve(async (req) => {  OR serve(async (_req) => {
  const serveRe = /serve\(\s*async\s*\(\s*(_?req)\s*\)\s*=>\s*\{/;
  if (!serveRe.test(out)) {
    return { src: out, skipped: true, reason: 'serve pattern not found' };
  }
  out = out.replace(
    serveRe,
    `serve(withEnterprisePlatform('${name}', '${mode}', async ($1, _ctx) => {`,
  );

  // Close withEnterprisePlatform: change final `})` of serve to `}))`
  // The file ends with `})\n` or `});\n` after serve callback.
  // Safer: replace the last occurrence of `})` that closes serve.
  // Most files end with:
  //   }
  // })
  // or `});`

  // Remove OPTIONS blocks (wrapper handles them)
  out = out.replace(
    /\n\s*if\s*\(\s*_?req\.method\s*===\s*['\"]OPTIONS['\"]\s*\)\s*\{[\s\S]*?\n\s*\}\n/,
    '\n',
  );
  // Single-line OPTIONS
  out = out.replace(
    /\n\s*if\s*\(\s*_?req\.method\s*===\s*['\"]OPTIONS['\"]\s*\)\s*return\s+new\s+Response\([^;]+;\n/,
    '\n',
  );

  // Close extra paren before final serve terminator
  // Find last `})` or `});`
  const closeMatch = out.match(/\n\}\)\s*;?\s*$/);
  if (closeMatch) {
    out = out.replace(/\n\}\)\s*;?\s*$/, '\n}))\n');
  } else {
    // try `})` with semicolon mid
    const idx = out.lastIndexOf('})');
    if (idx !== -1) {
      out = out.slice(0, idx) + '}))' + out.slice(idx + 2);
    }
  }

  // Service mode: inject service-role gate after try {
  if (mode === 'service' && !out.includes('requireServiceRole')) {
    // Add requireServiceRole to import
    out = out.replace(
      'ENTERPRISE_CORS_HEADERS,\n  withEnterprisePlatform,\n}',
      'ENTERPRISE_CORS_HEADERS,\n  withEnterprisePlatform,\n  requireServiceRole,\n}',
    );
    out = out.replace(
      /try\s*\{/,
      `try {\n    requireServiceRole($1 === '_req' ? _req : req, _ctx);`.replace(
        "$1 === '_req' ? _req : req",
        // fix properly below
        'REQ_PLACEHOLDER',
      ),
    );
  }

  return { src: out, skipped: false };
}

function fixServiceGate(name, src) {
  if (!SERVICE.has(name)) return src;
  let out = src;
  // Fix botched placeholder if any
  out = out.replace(
    /requireServiceRole\(REQ_PLACEHOLDER, _ctx\);/,
    'requireServiceRole(req, _ctx);',
  );
  // If gate missing entirely after try
  if (!out.includes('requireServiceRole(req')) {
    // ensure import
    if (!out.includes('requireServiceRole')) {
      out = out.replace(
        'ENTERPRISE_CORS_HEADERS,\n  withEnterprisePlatform,\n}',
        'ENTERPRISE_CORS_HEADERS,\n  withEnterprisePlatform,\n  requireServiceRole,\n}',
      );
    }
    // inject after first try {
    out = out.replace(/try\s*\{/, 'try {\n    requireServiceRole(req, _ctx);');
  }
  // send-* use `req` normally
  return out;
}

function fixRecurringInvoices(src) {
  // Add membership check if missing
  if (src.includes('company_users')) return src;
  const inject = `
    if (!company_id) {
      throw new Error("Company ID is required.");
    }
    const { data: companyMember, error: memberError } = await supabase
      .from('company_users')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();
    if (memberError || !companyMember) {
      throw new Error("Permission denied.");
    }
`;
  // After getUser block
  return src.replace(
    /if\s*\(\s*!user\s*\)\s*throw\s+new\s+Error\(["']User not authenticated\.["']\);\s*/,
    (m) => m + '\n' + inject + '\n',
  );
}

const dirs = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== '_shared')
  .map((d) => d.name);

const report = [];
for (const name of dirs) {
  const file = path.join(ROOT, name, 'index.ts');
  if (!fs.existsSync(file)) {
    report.push({ name, status: 'no_index' });
    continue;
  }
  const original = fs.readFileSync(file, 'utf8');
  let { src, skipped, reason } = transform(name, original);
  if (skipped) {
    report.push({ name, status: 'skipped', reason });
    continue;
  }
  src = fixServiceGate(name, src);
  if (name === 'recurring-invoices') src = fixRecurringInvoices(src);

  // Basic sanity: balanced withEnterprisePlatform
  const open = (src.match(/withEnterprisePlatform\(/g) || []).length;
  const serveCount = (src.match(/\bserve\(/g) || []).length;
  if (open !== 1) {
    report.push({ name, status: 'error', reason: `withEnterprisePlatform count=${open}` });
    continue;
  }

  fs.writeFileSync(file, src);
  report.push({ name, status: 'adopted', mode: modeFor(name) });
}

console.log(JSON.stringify(report, null, 2));
const adopted = report.filter((r) => r.status === 'adopted').length;
const skipped = report.filter((r) => r.status === 'skipped').length;
const errors = report.filter((r) => r.status === 'error');
console.log(`\nAdopted=${adopted} skipped=${skipped} errors=${errors.length}`);
if (errors.length) console.log(errors);
