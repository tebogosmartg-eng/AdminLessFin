// @ts-nocheck
/**
 * Central Import Engine — tenant API.
 *
 * Owner and admin only, enforced for every method. Replaces the old
 * IMPORT_ENTRIES path that wrote journal rows directly: every ledger write
 * now goes through the module RPCs / posting_engine_submit with
 * deterministic idempotency keys, every run is staged and recorded in
 * import_runs / import_run_rows, and a failed row never blocks or corrupts
 * the rows around it.
 *
 * Lifecycle: CREATE_RUN → APPEND_ROWS* → VALIDATE → (SET_OPTIONS →
 * VALIDATE)* → COMMIT (repeat while 'continuing') → GET_RUN / ERROR_REPORT.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  bootstrapTenantRequest,
  edgeFailure,
  edgeSuccess,
  platformLog,
  withEnterprisePlatform,
} from '../_shared/enterpriseEdgePlatform.ts';
import { ENTITY_SPECS, entitySpec } from '../_shared/importEngine/spec.ts';
import { IMPORT_ENTITY_TYPES } from '../_shared/importEngine/types.ts';
import { Resolver } from '../_shared/importEngine/resolve.ts';
import { compareTrialBalance, ledgerFromTypeSigned, TB_COMPARE_FIELDS } from '../_shared/importEngine/compare.ts';
import {
  buildCommitUnits,
  collectPostingDates,
  applyEngineVerdict,
  buildEnginePreviews,
  validateAllRows,
} from '../_shared/importEngine/service.ts';

const IMPORT_BUCKET = 'import-files';
const MAX_ROWS = 20000;
const APPEND_BATCH_MAX = 1000;
const ROW_PAGE = 1000;
const TIME_BUDGET_MS = 100_000;
const WRITE_CHUNK = 250;

function must(res, what) {
  if (res.error) throw new Error(`Could not ${what}: ${res.error.message}`);
  return res.data;
}

async function requireAdmin(admin, userId, companyId) {
  const { data: member, error } = await admin
    .from('company_users')
    .select('role')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .single();
  if (error || !member || !['owner', 'admin'].includes(member.role)) {
    throw new Error('Access denied: importing data requires an owner or admin.');
  }
}

async function loadRun(admin, companyId, runId) {
  if (!runId || typeof runId !== 'string') throw new Error('run_id is required.');
  const run = must(
    await admin.from('import_runs').select('*').eq('id', runId).eq('company_id', companyId).maybeSingle(),
    'read the import run',
  );
  if (!run) throw new Error('Import run not found.');
  return run;
}

const LEASE_MS = TIME_BUDGET_MS + 30_000;

/**
 * Status transition that also takes the run's processing lease: only one
 * validate/commit pass runs at a time, and a pass that died releases the
 * run automatically once its lease expires.
 */
async function transition(admin, run, from, to, extra = {}) {
  const now = new Date();
  const { data, error } = await admin
    .from('import_runs')
    .update({ status: to, lease_until: new Date(now.getTime() + LEASE_MS).toISOString(), ...extra })
    .eq('id', run.id)
    .in('status', Array.isArray(from) ? from : [from])
    .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
    .select('id, status');
  if (error) throw new Error(`Could not update the run: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error('This import is being processed by another request. Wait a moment and try again.');
  }
}

async function releaseLease(admin, runId) {
  await admin.from('import_runs').update({ lease_until: null }).eq('id', runId);
}

/** A run stuck mid-pass (its lease expired) may be picked up again. */
function leaseExpired(run) {
  return !run.lease_until || new Date(run.lease_until).getTime() < Date.now();
}

async function loadAllRows(admin, runId, columns) {
  const rows = [];
  for (let offset = 0; ; offset += ROW_PAGE) {
    const page = must(
      await admin
        .from('import_run_rows')
        .select(columns)
        .eq('run_id', runId)
        .order('row_number', { ascending: true })
        .range(offset, offset + ROW_PAGE - 1),
      'read the staged rows',
    );
    rows.push(...page);
    if (page.length < ROW_PAGE) break;
  }
  return rows;
}

async function loadReferenceData(admin, companyId, entity, postingDates) {
  const pick = async (table, columns, extra = q => q) =>
    must(await extra(admin.from(table).select(columns).eq('company_id', companyId)).limit(10000), `read ${table}`);

  const [accounts, customers, vendors, products, taxRates, bankAccountsRaw, projects] = await Promise.all([
    pick('chart_of_accounts', 'id, name, account_code, account_number, type, category, account_role, is_active, posting_blocked, control_account, allow_manual_posting'),
    pick('customers', 'id, name, email, payment_terms'),
    pick('vendors', 'id, name, email, payment_terms'),
    pick('products', 'id, name, sku, type, price, cost, income_account_id, cogs_account_id, inventory_asset_account_id, tax_rate_id'),
    pick('tax_rates', 'id, name, rate'),
    pick('bank_accounts', 'id, name, chart_of_account_id, opening_balance_posted'),
    pick('projects', 'id, name').catch(() => []),
  ]);

  const needInvoices = entity === 'invoices' || entity === 'customer_payments';
  const needBills = entity === 'bills' || entity === 'supplier_payments';
  const invoices = needInvoices
    ? must(await admin.from('invoices').select('id, invoice_number, customer_id, status').eq('company_id', companyId).limit(20000), 'read invoices')
        .map(i => ({ ...i, total_amount: null }))
    : [];
  const bills = needBills
    ? must(await admin.from('bills').select('id, bill_number, vendor_id, status').eq('company_id', companyId).limit(20000), 'read bills')
    : [];

  // Possible-duplicate detection for journals: entries on the same dates.
  let existingJournals = [];
  if (entity === 'journal_entries' && postingDates.length > 0 && postingDates.length <= 120) {
    const candidates = must(
      await admin
        .from('journal_entries')
        .select('id, entry_date, description')
        .eq('company_id', companyId)
        .in('entry_date', postingDates)
        .limit(200),
      'read journal entries',
    );
    if (candidates.length > 0 && candidates.length <= 200) {
      const items = must(
        await admin
          .from('journal_entry_items')
          .select('journal_entry_id, type, amount')
          .in('journal_entry_id', candidates.map(c => c.id)),
        'read journal entry items',
      );
      const totals = new Map();
      for (const item of items) {
        if (item.type !== 'debit') continue;
        totals.set(item.journal_entry_id, (totals.get(item.journal_entry_id) ?? 0) + Number(item.amount ?? 0));
      }
      existingJournals = candidates.map(c => ({
        entry_date: c.entry_date,
        description: c.description,
        total: Math.round((totals.get(c.id) ?? 0) * 100) / 100,
      }));
    }
  }

  return {
    accounts: accounts.map(a => ({
      ...a,
      account_number: a.account_number == null ? null : Number(a.account_number),
      is_active: a.is_active !== false,
      posting_blocked: a.posting_blocked === true,
      control_account: a.control_account === true,
      allow_manual_posting: a.allow_manual_posting !== false,
    })),
    customers,
    vendors,
    products: products.map(p => ({ ...p, price: p.price == null ? null : Number(p.price), cost: p.cost == null ? null : Number(p.cost) })),
    taxRates: taxRates.map(t => ({ ...t, rate: Number(t.rate) })),
    bankAccounts: bankAccountsRaw.map(b => ({
      id: b.id,
      account_name: b.name,
      chart_of_account_id: b.chart_of_account_id,
      opening_balance_posted: b.opening_balance_posted,
    })),
    projects,
    invoices,
    bills,
    existingJournals,
  };
}

/** Which of the run's posting dates fall in a closed/locked period. */
async function findClosedDates(admin, companyId, dates) {
  const closed = new Set();
  const CHUNK = 10;
  for (let i = 0; i < dates.length; i += CHUNK) {
    await Promise.all(dates.slice(i, i + CHUNK).map(async date => {
      const { error } = await admin.rpc('assert_period_open', { p_company_id: companyId, p_date: date });
      if (error) {
        if (error.code === '2200G' || /closed|locked/i.test(error.message ?? '')) closed.add(date);
        else throw new Error(`Could not check the accounting period for ${date}: ${error.message}`);
      }
    }));
  }
  return closed;
}

function makeImportDb(admin, companyId) {
  return {
    insert: async (table, values) => {
      if (values.company_id !== companyId) throw new Error('Tenant mismatch on insert.');
      const { data, error } = await admin.from(table).insert(values).select('id').single();
      if (error) throw new Error(error.message);
      return data;
    },
    update: async (table, id, values) => {
      const { data, error } = await admin.from(table).update(values).eq('id', id).eq('company_id', companyId).select('id');
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error('The record to update no longer exists.');
    },
    rpc: async (name, args) => {
      const { data, error } = await admin.rpc(name, args);
      if (error) throw new Error(error.message);
      return data;
    },
  };
}

/**
 * Opening balances post the difference between the old system's balances
 * and this ledger, so the ledger is read as at the take-on date — through
 * the same routine the Trial Balance report uses, with the caller's rights.
 */
async function loadLedgerNet(supabase, companyId, run) {
  if (run.entity_type !== 'opening_balances') return undefined;
  const asAt = run.options?.as_at_date;
  if (typeof asAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(asAt)) return undefined;
  const { data, error } = await supabase.rpc('get_balances_as_of_date', { p_end_date: asAt, p_company_id: companyId });
  if (error) throw new Error(`Could not read the ledger as at ${asAt}: ${error.message}`);
  return new Map(ledgerFromTypeSigned(data ?? []).map(l => [l.account_id, l.net]));
}

async function writeRowUpdates(admin, run, updates) {
  for (let i = 0; i < updates.length; i += WRITE_CHUNK) {
    const chunk = updates.slice(i, i + WRITE_CHUNK);
    const { error } = await admin.from('import_run_rows').upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error(`Could not save validation results: ${error.message}`);
  }
}

async function outcomeCounts(admin, runId) {
  const counts = {};
  await Promise.all(['pending', 'imported', 'updated', 'skipped', 'failed'].map(async outcome => {
    const { count, error } = await admin
      .from('import_run_rows')
      .select('id', { count: 'exact', head: true })
      .eq('run_id', runId)
      .eq('outcome', outcome);
    if (error) throw new Error(`Could not count rows: ${error.message}`);
    counts[outcome] = count ?? 0;
  }));
  return counts;
}

serve(withEnterprisePlatform('data-import', 'tenant', async (req, ctx) => {
  try {
    const { user, supabase, admin, body, company_id } = await bootstrapTenantRequest(req, ctx);
    await requireAdmin(admin, user.id, company_id);
    const method = body.method;
    let data = null;

    switch (method) {
      case 'GET_SPEC': {
        data = { entities: ENTITY_SPECS, max_rows: MAX_ROWS, compare_fields: TB_COMPARE_FIELDS };
        break;
      }

      case 'GET_REFERENCES': {
        const refs = await loadReferenceData(admin, company_id, 'customers', []);
        const roleOf = role => refs.accounts.some(a => a.account_role === role && a.is_active);
        data = {
          accounts: refs.accounts
            .filter(a => a.is_active)
            .map(a => ({ id: a.id, name: a.name, account_code: a.account_code, account_number: a.account_number, type: a.type, account_role: a.account_role })),
          bank_accounts: refs.bankAccounts.map(b => ({ id: b.id, name: b.account_name })),
          tax_rates: refs.taxRates,
          roles_mapped: {
            trade_receivable: roleOf('trade_receivable'),
            trade_payable: roleOf('trade_payable'),
            output_vat: roleOf('output_vat'),
            input_vat: roleOf('input_vat'),
            inventory_asset: roleOf('inventory_asset'),
          },
        };
        break;
      }

      case 'CREATE_RUN': {
        const entity = body.entity_type;
        if (!IMPORT_ENTITY_TYPES.includes(entity)) throw new Error(`Unknown import type: ${entity}`);
        entitySpec(entity);
        const fileName = typeof body.file_name === 'string' ? body.file_name.slice(0, 200) : null;
        const fileHash = typeof body.file_hash === 'string' ? body.file_hash.slice(0, 80) : null;
        const mapping = body.mapping && typeof body.mapping === 'object' ? body.mapping : {};
        const options = body.options && typeof body.options === 'object' ? body.options : {};

        let fileWarning = null;
        if (fileHash) {
          const prior = must(
            await admin
              .from('import_runs')
              .select('id, created_at, status')
              .eq('company_id', company_id)
              .eq('file_hash', fileHash)
              .eq('status', 'committed')
              .order('created_at', { ascending: false })
              .limit(1),
            'check earlier imports',
          );
          if (prior.length > 0) {
            fileWarning = `This exact file was already imported on ${String(prior[0].created_at).slice(0, 10)}. Importing it again may duplicate records that have no duplicate protection.`;
          }
        }

        const run = must(
          await admin
            .from('import_runs')
            .insert({
              company_id,
              entity_type: entity,
              status: 'created',
              file_name: fileName,
              file_hash: fileHash,
              file_size: typeof body.file_size === 'number' ? Math.floor(body.file_size) : null,
              mapping,
              options,
              created_by: user.id,
            })
            .select('*')
            .single(),
          'create the import run',
        );

        // Best effort: a signed upload slot for the original file.
        let upload = null;
        if (fileName) {
          try {
            const safeName = fileName.replace(/[^\w.\-]+/g, '_').slice(0, 120);
            const path = `${company_id}/${run.id}/${safeName}`;
            const ticket = await admin.storage.from(IMPORT_BUCKET).createSignedUploadUrl(path);
            if (!ticket.error && ticket.data) {
              upload = { path: ticket.data.path, token: ticket.data.token };
              await admin.from('import_runs').update({ storage_path: ticket.data.path }).eq('id', run.id);
            }
          } catch (e) {
            platformLog(ctx, 'import.upload_ticket_failed', { message: e?.message });
          }
        }

        data = { run, upload, file_warning: fileWarning };
        break;
      }

      case 'APPEND_ROWS': {
        const run = await loadRun(admin, company_id, body.run_id);
        if (run.status !== 'created') throw new Error('Rows can only be added before validation. Create a new run to start over.');
        const rows = Array.isArray(body.rows) ? body.rows : null;
        if (!rows || rows.length === 0) throw new Error('rows is required.');
        if (rows.length > APPEND_BATCH_MAX) throw new Error(`Send at most ${APPEND_BATCH_MAX} rows per call.`);
        if (run.row_count + rows.length > MAX_ROWS) {
          throw new Error(`A single import is limited to ${MAX_ROWS} rows. Split the file and import it in parts.`);
        }
        const toInsert = rows.map(r => {
          const rowNumber = Number(r?.row_number);
          if (!Number.isInteger(rowNumber) || rowNumber < 1) throw new Error('Each row needs a positive row_number.');
          if (r.raw == null || typeof r.raw !== 'object' || Array.isArray(r.raw)) throw new Error('Each row needs its raw cell values.');
          return { company_id, run_id: run.id, row_number: rowNumber, raw: r.raw };
        });
        must(await admin.from('import_run_rows').insert(toInsert), 'stage the rows');
        must(
          await admin.from('import_runs').update({ row_count: run.row_count + toInsert.length }).eq('id', run.id).select('id'),
          'update the row count',
        );
        data = { staged: run.row_count + toInsert.length };
        break;
      }

      case 'SET_OPTIONS': {
        const run = await loadRun(admin, company_id, body.run_id);
        if (!['created', 'validated'].includes(run.status)) {
          throw new Error('Options can only change before the import is committed.');
        }
        const patch = { status: 'created', validated_at: null };
        if (body.options && typeof body.options === 'object') patch.options = { ...run.options, ...body.options };
        if (body.mapping && typeof body.mapping === 'object') patch.mapping = body.mapping;
        const updated = must(
          await admin.from('import_runs').update(patch).eq('id', run.id).select('*').single(),
          'update the run',
        );
        data = { run: updated };
        break;
      }

      case 'VALIDATE': {
        const run = await loadRun(admin, company_id, body.run_id);
        const resumable = run.status === 'validating' && leaseExpired(run);
        if (!['created', 'validated'].includes(run.status) && !resumable) {
          throw new Error(run.status === 'validating' ? 'This import is already being checked.' : 'This run can no longer be validated.');
        }
        if (run.row_count === 0) throw new Error('The run has no rows to validate.');
        await transition(admin, run, ['created', 'validated', 'validating'], 'validating');
        try {
          const inputRows = await loadAllRows(admin, run.id, 'id, row_number, raw');
          const postingDates = collectPostingDates(run.entity_type, inputRows, run.mapping, run.options);
          const [closedDates, refs, ledgerNet] = await Promise.all([
            findClosedDates(admin, company_id, postingDates),
            loadReferenceData(admin, company_id, run.entity_type, postingDates),
            loadLedgerNet(supabase, company_id, run),
          ]);
          const result = validateAllRows({
            entity: run.entity_type,
            rows: inputRows,
            mapping: run.mapping,
            options: run.options,
            refs,
            closedDates,
            existingBankRefs: new Set(),
            ledgerNet,
          });

          // Bank imports: check the (explicit or generated) references against
          // lines that already exist for this bank account.
          if (run.entity_type === 'bank_transactions' && typeof run.options.bank_account_id === 'string') {
            const candidates = result.rows
              .filter(r => r.planned_action === 'create' && typeof r.normalized.external_reference === 'string')
              .map(r => r.normalized.external_reference);
            const existing = new Set();
            for (let i = 0; i < candidates.length; i += 200) {
              const page = must(
                await admin
                  .from('bank_statement_lines')
                  .select('external_reference')
                  .eq('bank_account_id', run.options.bank_account_id)
                  .in('external_reference', candidates.slice(i, i + 200)),
                'check existing bank lines',
              );
              for (const hit of page) existing.add(hit.external_reference);
            }
            if (existing.size > 0) {
              for (const row of result.rows) {
                if (row.planned_action === 'create' && existing.has(row.normalized.external_reference)) {
                  row.planned_action = 'skip';
                  if (row.validation_status === 'valid') row.validation_status = 'warning';
                  row.issues.push({ severity: 'warning', code: 'duplicate_existing', message: 'This line was imported before (same bank reference) and will be skipped.' });
                  result.totals.warnings += 1;
                }
              }
            }
          }

          // Journals and opening balances: ask the posting engine itself, in
          // preview mode (which writes nothing), for its verdict — including
          // every accounting policy this company has configured.
          const previews = buildEnginePreviews({
            entity: run.entity_type,
            rows: result.rows,
            refs,
            companyId: company_id,
            actorUserId: user.id,
            options: run.options,
          });
          if (previews.length > 0) {
            for (let i = 0; i < previews.length; i += 8) {
              await Promise.all(previews.slice(i, i + 8).map(async preview => {
                const { data: verdict, error: previewError } = await admin.rpc('posting_engine_submit', {
                  p_request: preview.request,
                  p_mode: 'preview',
                });
                const violations = previewError
                  ? [{ message: previewError.message }]
                  : (verdict?.policy_results?.violations ?? []);
                applyEngineVerdict(preview, violations, result.rows);
              }));
            }
            const counted = result.rows.filter(r =>
              !(r.planned_action === 'skip' && r.issues.length === 0 && Object.keys(r.normalized ?? {}).length === 0));
            result.totals.errors = counted.filter(r => r.validation_status === 'error').length;
            result.totals.warnings = counted.filter(r => r.validation_status === 'warning').length;
            result.totals.valid = counted.filter(r => r.validation_status !== 'error').length;
            if (run.entity_type === 'opening_balances' && result.totals.errors > 0 &&
                !result.runIssues.some(i => i.code === 'trial_balance_incomplete')) {
              result.runIssues.push({
                severity: 'error',
                code: 'trial_balance_incomplete',
                message: 'Opening balances are posted as one complete trial balance, so every row marked below must be fixed before any of it can be imported.',
              });
            }
          }

          const rawById = new Map(inputRows.map(r => [r.id, r]));
          const updates = result.rows.map(r => ({
            id: r.id,
            company_id,
            run_id: run.id,
            row_number: rawById.get(r.id).row_number,
            raw: rawById.get(r.id).raw,
            normalized: r.normalized,
            group_key: r.group_key,
            validation_status: r.validation_status,
            issues: r.issues,
            planned_action: r.planned_action,
            outcome: 'pending',
            outcome_detail: null,
          }));
          await writeRowUpdates(admin, run, updates);

          const totals = { ...result.totals, run_issues: result.runIssues };
          const updated = must(
            await admin
              .from('import_runs')
              .update({
                status: 'validated',
                validated_at: new Date().toISOString(),
                lease_until: null,
                totals,
                options: { ...run.options, resolved_date_format: result.dateFormat },
                last_error: null,
              })
              .eq('id', run.id)
              .select('*')
              .single(),
            'record the validation result',
          );
          data = { run: updated, totals, run_issues: result.runIssues };
        } catch (e) {
          await admin.from('import_runs').update({ status: 'failed', lease_until: null, last_error: String(e?.message ?? e) }).eq('id', run.id);
          throw e;
        }
        break;
      }

      case 'COMMIT': {
        const run = await loadRun(admin, company_id, body.run_id);
        if (!['validated', 'committing'].includes(run.status)) {
          throw new Error(run.status === 'committed' ? 'This run has already been imported.' : 'Validate the run before importing.');
        }
        const runIssues = Array.isArray(run.totals?.run_issues) ? run.totals.run_issues : [];
        if (runIssues.some(i => i.severity === 'error')) {
          throw new Error('This import has problems that affect the whole file. Fix them and validate again.');
        }
        const skipInvalid = run.options?.skip_invalid === true;
        if (run.status === 'validated') {
          const { count: errorCount } = await admin
            .from('import_run_rows')
            .select('id', { count: 'exact', head: true })
            .eq('run_id', run.id)
            .eq('validation_status', 'error');
          if ((errorCount ?? 0) > 0 && !skipInvalid) {
            throw new Error(`${errorCount} row(s) still have errors. Fix the file and validate again, or choose to skip invalid rows.`);
          }
        }
        await transition(admin, run, ['validated', 'committing'], 'committing');
        try {

        const started = Date.now();
        const allRows = await loadAllRows(
          admin, run.id,
          'id, row_number, raw, normalized, group_key, validation_status, issues, planned_action, outcome, outcome_detail',
        );

        // Error rows are skipped (recorded, never silently dropped).
        const errorPending = allRows.filter(r => r.validation_status === 'error' && r.outcome === 'pending');
        if (errorPending.length > 0) {
          await writeRowUpdates(admin, run, errorPending.map(r => ({
            ...r,
            company_id,
            run_id: run.id,
            outcome: 'skipped',
            outcome_detail: { reason: 'The row had validation errors and skipping invalid rows was chosen.' },
          })));
        }

        const pending = allRows.filter(r => r.validation_status !== 'error' && r.outcome === 'pending');
        let processed = 0;
        let budgetExhausted = false;

        if (pending.length > 0) {
          const postingDates = collectPostingDates(run.entity_type, pending, run.mapping, run.options);
          const refs = await loadReferenceData(admin, company_id, run.entity_type, postingDates);
          const resolver = new Resolver(refs);
          const commitCtx = {
            db: makeImportDb(admin, company_id),
            companyId: company_id,
            runId: run.id,
            actorUserId: user.id,
            resolver,
            options: run.options,
            createdParties: new Map(),
            ledgerNet: await loadLedgerNet(supabase, company_id, run),
          };
          const { units } = buildCommitUnits(run.entity_type, pending, true);
          const rowById = new Map(allRows.map(r => [r.id, r]));

          for (const unit of units) {
            if (Date.now() - started > TIME_BUDGET_MS) {
              budgetExhausted = true;
              break;
            }
            if (!unit.rows.some(r => rowById.get(r.id)?.outcome === 'pending')) continue;
            let outcomes;
            try {
              outcomes = await unit.execute(commitCtx);
            } catch (e) {
              const message = String(e?.message ?? e);
              outcomes = new Map(unit.rows.map(r => [r.id, { outcome: 'failed', detail: { error: message } }]));
            }
            const updates = [];
            for (const row of unit.rows) {
              const result = outcomes.get(row.id) ?? { outcome: 'failed', detail: { error: 'No outcome recorded.' } };
              const full = rowById.get(row.id);
              full.outcome = result.outcome;
              updates.push({
                id: row.id,
                company_id,
                run_id: run.id,
                row_number: full.row_number,
                raw: full.raw,
                normalized: full.normalized,
                group_key: full.group_key,
                validation_status: full.validation_status,
                issues: full.issues ?? [],
                planned_action: full.planned_action,
                outcome: result.outcome,
                outcome_detail: result.detail ?? null,
              });
            }
            await writeRowUpdates(admin, run, updates);
            const maxRow = Math.max(...unit.rows.map(r => r.row_number));
            await admin.from('import_runs').update({ cursor_position: maxRow }).eq('id', run.id);
            processed += unit.rows.length;
          }
        }

        const counts = await outcomeCounts(admin, run.id);
        if (counts.pending === 0 && !budgetExhausted) {
          const totals = {
            ...(run.totals ?? {}),
            imported: counts.imported,
            updated: counts.updated,
            skipped: counts.skipped,
            failed: counts.failed,
          };
          must(
            await admin
              .from('import_runs')
              .update({ status: 'committed', committed_at: new Date().toISOString(), totals })
              .eq('id', run.id)
              .select('id'),
            'close the run',
          );
          const spec = entitySpec(run.entity_type);
          try {
            await admin.from('notifications').insert({
              user_id: run.created_by,
              company_id,
              content: `${spec.label} import finished: ${counts.imported} imported, ${counts.updated} updated, ${counts.skipped} skipped, ${counts.failed} failed.`,
              link_to: '/import',
              is_read: false,
            });
          } catch (e) {
            platformLog(ctx, 'import.notification_failed', { message: e?.message });
          }
          data = { status: 'committed', counts };
        } else {
          data = { status: 'continuing', counts, processed };
        }
        } finally {
          await releaseLease(admin, run.id);
        }
        break;
      }

      case 'RECONCILE': {
        // Reads back what the ledger actually holds for this run — from the
        // journal lines, not from the file — and compares it per account.
        const run = await loadRun(admin, company_id, body.run_id);
        if (run.status !== 'committed') throw new Error('Reconciliation is available once the import has finished.');
        const rows = await loadAllRows(admin, run.id, 'row_number, normalized, outcome, outcome_detail');
        const imported = rows.filter(r => r.outcome === 'imported');

        const journalIds = new Set(imported.map(r => r.outcome_detail?.journal_id).filter(Boolean));
        const documentIds = [...new Set(imported.map(r => r.outcome_detail?.id).filter(Boolean))];
        if (['invoices', 'bills'].includes(run.entity_type) && documentIds.length > 0) {
          for (let i = 0; i < documentIds.length; i += 200) {
            const docs = must(
              await admin.from(run.entity_type).select('journal_entry_id')
                .eq('company_id', company_id).in('id', documentIds.slice(i, i + 200)),
              'read the imported documents',
            );
            for (const d of docs) if (d.journal_entry_id) journalIds.add(d.journal_entry_id);
          }
        }

        const posted = new Map();
        const ids = [...journalIds];
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          // Tenant check: every journal must belong to this company.
          const owned = must(
            await admin.from('journal_entries').select('id').eq('company_id', company_id).in('id', chunk),
            'read the posted journals',
          );
          const ownedIds = owned.map(j => j.id);
          if (ownedIds.length === 0) continue;
          const items = must(
            await admin.from('journal_entry_items').select('account_id, type, amount').in('journal_entry_id', ownedIds),
            'read the posted journal lines',
          );
          for (const item of items) {
            const p = posted.get(item.account_id) ?? { debit: 0, credit: 0 };
            p[item.type === 'debit' ? 'debit' : 'credit'] += Number(item.amount ?? 0);
            posted.set(item.account_id, p);
          }
        }

        const fileSide = new Map();
        const compareFile = ['journal_entries', 'opening_balances'].includes(run.entity_type);
        const isTakeOn = run.entity_type === 'opening_balances';
        if (isTakeOn) {
          // A take-on posts differences, so the proof is the books themselves:
          // every account in the file, as at the take-on date, against its target.
          const ledgerNet = await loadLedgerNet(supabase, company_id, run);
          posted.clear();
          for (const r of rows) {
            const accountId = r.normalized?.account_id;
            if (!accountId || !['imported', 'skipped'].includes(r.outcome)) continue;
            const net = ledgerNet?.get(accountId) ?? 0;
            posted.set(accountId, { debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 });
            const f = fileSide.get(accountId) ?? { debit: 0, credit: 0 };
            f.debit += Number(r.normalized.debit ?? 0);
            f.credit += Number(r.normalized.credit ?? 0);
            fileSide.set(accountId, f);
          }
        } else if (compareFile) {
          for (const r of imported) {
            const accountId = r.normalized?.account_id;
            if (!accountId) continue;
            const f = fileSide.get(accountId) ?? { debit: 0, credit: 0 };
            f.debit += Number(r.normalized.debit ?? 0);
            f.credit += Number(r.normalized.credit ?? 0);
            fileSide.set(accountId, f);
          }
        }

        const accountIds = [...new Set([...posted.keys(), ...fileSide.keys()])];
        const names = new Map();
        for (let i = 0; i < accountIds.length; i += 200) {
          const accounts = must(
            await admin.from('chart_of_accounts').select('id, name, account_code')
              .eq('company_id', company_id).in('id', accountIds.slice(i, i + 200)),
            'read account names',
          );
          for (const a of accounts) names.set(a.id, a.account_code ? `${a.account_code} ${a.name}` : a.name);
        }
        const round = n => Math.round(n * 100) / 100;
        const accounts = accountIds.map(id => {
          const p = posted.get(id) ?? { debit: 0, credit: 0 };
          const f = fileSide.get(id);
          return {
            account_id: id,
            account: names.get(id) ?? 'Unknown account',
            posted_debit: round(p.debit),
            posted_credit: round(p.credit),
            file_debit: f ? round(f.debit) : null,
            file_credit: f ? round(f.credit) : null,
            matches: f
              ? (isTakeOn
                ? Math.abs((f.debit - f.credit) - (p.debit - p.credit)) < 0.005
                : Math.abs(f.debit - p.debit) < 0.005 && Math.abs(f.credit - p.credit) < 0.005)
              : null,
          };
        }).sort((a, b) => a.account.localeCompare(b.account));
        const totalDebit = round(accounts.reduce((s, a) => s + a.posted_debit, 0));
        const totalCredit = round(accounts.reduce((s, a) => s + a.posted_credit, 0));
        data = {
          journals: ids.length,
          total_debit: totalDebit,
          total_credit: totalCredit,
          balanced: isTakeOn ? accounts.every(a => a.matches !== false) : Math.abs(totalDebit - totalCredit) < 0.005,
          compares_file: compareFile,
          take_on: isTakeOn,
          accounts,
        };
        break;
      }

      case 'GET_RUN': {
        const run = await loadRun(admin, company_id, body.run_id);
        const counts = ['committing', 'committed'].includes(run.status) ? await outcomeCounts(admin, run.id) : null;
        data = { run, counts };
        break;
      }

      case 'GET_ROWS': {
        const run = await loadRun(admin, company_id, body.run_id);
        const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);
        const offset = Math.max(Number(body.offset) || 0, 0);
        let query = admin
          .from('import_run_rows')
          .select('id, row_number, raw, normalized, group_key, validation_status, issues, planned_action, outcome, outcome_detail', { count: 'exact' })
          .eq('run_id', run.id);
        if (typeof body.status_filter === 'string' && ['valid', 'warning', 'error', 'pending'].includes(body.status_filter)) {
          query = query.eq('validation_status', body.status_filter);
        }
        if (typeof body.outcome_filter === 'string' && ['pending', 'imported', 'updated', 'skipped', 'failed'].includes(body.outcome_filter)) {
          query = query.eq('outcome', body.outcome_filter);
        }
        const { data: rows, error, count } = await query.order('row_number', { ascending: true }).range(offset, offset + limit - 1);
        if (error) throw new Error(`Could not read the rows: ${error.message}`);
        data = { rows, total: count ?? 0 };
        break;
      }

      case 'ERROR_REPORT': {
        const run = await loadRun(admin, company_id, body.run_id);
        const rows = [];
        for (let offset = 0; ; offset += ROW_PAGE) {
          const page = must(
            await admin
              .from('import_run_rows')
              .select('row_number, raw, validation_status, issues, outcome, outcome_detail')
              .eq('run_id', run.id)
              .or('validation_status.in.(error,warning),outcome.eq.failed')
              .order('row_number', { ascending: true })
              .range(offset, offset + ROW_PAGE - 1),
            'read the report rows',
          );
          rows.push(...page);
          if (page.length < ROW_PAGE) break;
        }
        data = { file_name: run.file_name, entity_type: run.entity_type, rows };
        break;
      }

      case 'LIST_RUNS': {
        const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 100);
        const runs = must(
          await admin
            .from('import_runs')
            .select('id, entity_type, status, file_name, row_count, mapping, totals, created_by, created_at, committed_at')
            .eq('company_id', company_id)
            .order('created_at', { ascending: false })
            .limit(limit),
          'list the imports',
        );
        const userIds = [...new Set(runs.map(r => r.created_by))];
        let names = {};
        if (userIds.length > 0) {
          // Names are a nicety; a profile read failure must not hide the history.
          const { data: profiles, error: profileError } = await admin.from('profiles').select('id, full_name').in('id', userIds);
          if (profileError) platformLog(ctx, 'import.profile_names_failed', { message: profileError.message });
          names = Object.fromEntries((profiles ?? []).map(p => [p.id, p.full_name || null]));
        }
        data = { runs: runs.map(r => ({ ...r, created_by_name: names[r.created_by] || null })) };
        break;
      }

      case 'COMPARE_TRIAL_BALANCE': {
        // Read-only: the old system's trial balance against this ledger.
        const asAt = typeof body.as_at_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.as_at_date) ? body.as_at_date : null;
        if (!asAt) throw new Error('Choose the date the trial balance is stated at.');
        const rows = Array.isArray(body.rows) ? body.rows : null;
        if (!rows || rows.length === 0) throw new Error('The file has no rows.');
        if (rows.length > 5000) throw new Error('A trial balance is limited to 5000 lines.');
        const mapping = body.mapping && typeof body.mapping === 'object' ? body.mapping : {};
        if (!mapping.account && !mapping.account_code) throw new Error('Match the account column first.');
        if (!mapping.balance && !mapping.debit && !mapping.credit) throw new Error('Match the debit and credit (or balance) columns first.');
        const [refs, balances] = await Promise.all([
          loadReferenceData(admin, company_id, 'opening_balances', []),
          supabase.rpc('get_balances_as_of_date', { p_end_date: asAt, p_company_id: company_id }),
        ]);
        if (balances.error) throw new Error(`Could not read the ledger: ${balances.error.message}`);
        data = {
          as_at_date: asAt,
          ...compareTrialBalance({
            rows: rows.map((r, i) => ({
              row_number: Number.isInteger(r?.row_number) ? r.row_number : i + 2,
              raw: r?.raw && typeof r.raw === 'object' ? r.raw : {},
            })),
            mapping,
            resolver: new Resolver(refs),
            ledger: ledgerFromTypeSigned(balances.data ?? []),
          }),
        };
        break;
      }

      case 'IMPORT_ENTRIES': {
        // Compatibility for the previous Import page until every browser has
        // the new one. Same payload as before, but each journal now goes
        // through the posting engine (balance, period, policy, idempotency)
        // instead of being inserted directly. All journals are validated in
        // preview first; nothing posts unless every one would be accepted.
        const entries = Array.isArray(body.entries) ? body.entries : null;
        if (!entries || entries.length === 0) throw new Error("Invalid 'entries' payload.");
        if (entries.length > 500) throw new Error('Import at most 500 journals at a time.');
        const callId = crypto.randomUUID();
        const requests = entries.map((entry, index) => {
          const items = Array.isArray(entry?.items) ? entry.items : [];
          if (items.length < 2) throw new Error(`Journal ${index + 1} needs at least two lines.`);
          return {
            company_id,
            posting_date: entry.entry_date,
            module: 'manual_journal',
            document_type: 'manual_journal',
            description: entry.description ?? null,
            source: 'import',
            created_by: user.id,
            customer_id: entry.customer_id ?? null,
            vendor_id: entry.vendor_id ?? null,
            idempotency_key: `import:legacy:${callId}:${index}`,
            lines: items.map(item => ({
              account_id: item.account_id,
              debit: item.type === 'debit' ? Number(item.amount) : 0,
              credit: item.type === 'credit' ? Number(item.amount) : 0,
            })),
          };
        });
        for (const [index, request] of requests.entries()) {
          const { data: verdict, error: previewError } = await admin.rpc('posting_engine_submit', { p_request: request, p_mode: 'validate' });
          if (previewError) throw new Error(`Journal ${index + 1} ("${request.description ?? ''}") was not imported: ${previewError.message}`);
          if (!verdict) throw new Error(`Journal ${index + 1} could not be checked.`);
        }
        let posted = 0;
        for (const request of requests) {
          must(await admin.rpc('posting_engine_submit', { p_request: request, p_mode: 'commit' }), 'post a journal');
          posted += 1;
        }
        data = { message: `${posted} entries imported successfully.` };
        break;
      }

      case 'CANCEL_RUN': {
        const run = await loadRun(admin, company_id, body.run_id);
        if (!['created', 'validated', 'failed'].includes(run.status)) {
          throw new Error('Only a run that has not started importing can be cancelled.');
        }
        await transition(admin, run, ['created', 'validated', 'failed'], 'cancelled');
        data = { cancelled: true };
        break;
      }

      default:
        throw new Error(`Unsupported method: ${method}`);
    }

    return edgeSuccess(ctx, data);
  } catch (error) {
    return edgeFailure(ctx, error);
  }
}));
