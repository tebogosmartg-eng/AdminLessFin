/**
 * V4.2.1 pass-2 — route all catch blocks through edgeFailure (structured errors).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'supabase', 'functions');

const dirs = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== '_shared')
  .map((d) => d.name);

const report = [];

for (const name of dirs) {
  const file = path.join(ROOT, name, 'index.ts');
  if (!fs.existsSync(file)) continue;
  let src = fs.readFileSync(file, 'utf8');
  if (!src.includes('withEnterprisePlatform(')) {
    report.push({ name, status: 'skip_no_platform' });
    continue;
  }

  let changed = false;

  // Ensure edgeFailure import
  if (!src.includes('edgeFailure')) {
    src = src.replace(
      /ENTERPRISE_CORS_HEADERS,\n(\s*)withEnterprisePlatform,/,
      'ENTERPRISE_CORS_HEADERS,\n$1withEnterprisePlatform,\n$1edgeFailure,',
    );
    // handle requireServiceRole already there
    if (!src.includes('edgeFailure')) {
      src = src.replace(
        /withEnterprisePlatform,\n(\s*)requireServiceRole,/,
        'withEnterprisePlatform,\n$1edgeFailure,\n$1requireServiceRole,',
      );
    }
    if (!src.includes('edgeFailure')) {
      src = src.replace(
        "from '../_shared/enterpriseEdgePlatform.ts'",
        "from '../_shared/enterpriseEdgePlatform.ts'",
      );
      // last resort insert
      src = src.replace(
        /from '\.\.\/_shared\/enterpriseEdgePlatform\.ts'/,
        (m) => m,
      );
      if (!src.includes('edgeFailure')) {
        src = src.replace(
          /import \{\n([\s\S]*?)\} from '\.\.\/_shared\/enterpriseEdgePlatform\.ts'/,
          (full, body) => {
            if (body.includes('edgeFailure')) return full;
            return `import {\n${body.trimEnd().replace(/,?$/, ',')}\n  edgeFailure,\n} from '../_shared/enterpriseEdgePlatform.ts'`;
          },
        );
      }
    }
    changed = true;
  }

  // Bind companyId onto ctx after membership / company_id availability
  if (
    src.includes("const { method, company_id }") ||
    src.includes('const { method, company_id,')
  ) {
    if (!src.includes('_ctx.companyId = company_id') && !src.includes('_ctx.companyId =')) {
      src = src.replace(
        /if\s*\(\s*!company_id\s*\)\s*\{?\s*throw new Error\(["']Company ID is required\.["']\);?\s*\}?/,
        (m) => `${m}\n    _ctx.companyId = company_id;`,
      );
      changed = true;
    }
  }

  // Replace generic catch return JSON error with edgeFailure
  const catchPatterns = [
    // status 400 or 500 variants
    /catch\s*\(\s*error\s*\)\s*\{\s*return\s+new\s+Response\(\s*JSON\.stringify\(\s*\{\s*error:\s*error\.message\s*\}\s*\)\s*,\s*\{\s*headers:\s*\{\s*\.\.\.corsHeaders\s*,\s*['"]Content-Type['"]:\s*['"]application\/json['"]\s*\}\s*,\s*status:\s*\d+\s*,?\s*\}\s*\)\s*;?\s*\}/g,
    /catch\s*\(\s*error\s*\)\s*\{\s*\n\s*return\s+new\s+Response\(JSON\.stringify\(\{\s*error:\s*error\.message\s*\}\),\s*\{\s*\n\s*headers:\s*\{\s*\.\.\.corsHeaders,\s*['"]Content-Type['"]:\s*['"]application\/json['"]\s*\},\s*\n\s*status:\s*\d+,?\s*\n\s*\}\);\s*\n\s*\}/g,
  ];

  for (const re of catchPatterns) {
    const next = src.replace(re, 'catch (error) {\n    return edgeFailure(_ctx, error);\n  }');
    if (next !== src) {
      src = next;
      changed = true;
    }
  }

  // bills: platformErrorResponse → edgeFailure
  if (src.includes('platformErrorResponse(')) {
    src = src.replace(
      /return\s+platformErrorResponse\(\s*error\s*,\s*\{[^}]*\}\s*,\s*corsHeaders\s*\)\s*;?/g,
      'return edgeFailure(_ctx, error);',
    );
    // remove unused import if no longer referenced
    if (!src.includes('platformErrorResponse(')) {
      src = src.replace(
        /import\s*\{\s*platformErrorResponse\s*\}\s*from\s*['"]\.\.\/_shared\/platformError\.ts['"];?\n?/,
        '',
      );
    }
    changed = true;
  }

  // payroll: enrich payrollErrorResponse with ctx headers — keep domain shape
  if (name === 'payroll') {
    if (src.includes('function payrollErrorResponse(error)') && !src.includes('function payrollErrorResponse(error, ctx)')) {
      src = src.replace(
        'function payrollErrorResponse(error) {\n  if (error instanceof PayrollDomainError) {\n    return new Response(JSON.stringify({\n      error: error.message,\n      stage: error.stage,\n      code: error.code,\n      recovery: error.recovery,\n    }), {\n      headers: { ...corsHeaders, \'Content-Type\': \'application/json\' },\n      status: error.status,\n    });\n  }\n  const message = error?.message ?? \'Unexpected payroll error\';\n  return new Response(JSON.stringify({\n    error: message,\n    stage: \'unknown\',\n    code: \'INTERNAL_ERROR\',\n    recovery: \'Retry the operation. Contact support if the error persists.\',\n  }), {\n    headers: { ...corsHeaders, \'Content-Type\': \'application/json\' },\n    status: 500,\n  });\n}',
        `function payrollErrorResponse(error, ctx) {
  const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json',
    'x-correlation-id': ctx?.correlationId ?? '',
    'x-platform-version': '4.2.1',
    'x-function-name': 'payroll',
  };
  if (error instanceof PayrollDomainError) {
    return new Response(JSON.stringify({
      error: error.message,
      stage: error.stage,
      code: error.code,
      recovery: error.recovery,
      correlationId: ctx?.correlationId,
    }), {
      headers,
      status: error.status,
    });
  }
  const message = error?.message ?? 'Unexpected payroll error';
  return new Response(JSON.stringify({
    error: message,
    stage: 'unknown',
    code: 'INTERNAL_ERROR',
    recovery: 'Retry the operation. Contact support if the error persists.',
    correlationId: ctx?.correlationId,
  }), {
    headers,
    status: 500,
  });
}`,
      );
      src = src.replace(
        /return\s+payrollErrorResponse\(\s*error\s*\)\s*;/g,
        'return payrollErrorResponse(error, _ctx);',
      );
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(file, src);
    report.push({ name, status: 'updated' });
  } else {
    report.push({ name, status: 'unchanged' });
  }
}

console.log(JSON.stringify(report, null, 2));
console.log('updated', report.filter((r) => r.status === 'updated').length);
