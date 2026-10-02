import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const COMPANY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ASSET = '11111111-1111-4111-8111-111111111111';
const ENTRY = '22222222-2222-4222-8222-222222222222';
const DEBIT = '33333333-3333-4333-8333-333333333333';
const CREDIT = '44444444-4444-4444-8444-444444444444';
const USER = '55555555-5555-4555-8555-555555555555';
let db: PGlite;
const read = (file: string) => readFileSync(file, 'utf8');
async function result(sql: string, params: unknown[] = []) {
  return (await db.query<{ result: Record<string, unknown> }>(sql, params)).rows[0].result;
}
const depreciate = (date = '2026-09-30', company: string | null = null, actor: string | null = null) =>
  result('SELECT depreciate_fixed_asset_atomic($1, $2, $3, $4) AS result', [ASSET, date, company, actor]);
const recur = () => result('SELECT process_recurring_journal_atomic($1, $2) AS result', [ENTRY, '2026-09-30']);
async function journalCount() {
  return (await db.query<{ n: number }>('SELECT count(*)::integer AS n FROM journal_entries')).rows[0].n;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(read('tests/integration/fixtures/scheduled-accounting.sql'));
  const source = read('supabase/migrations/20260916100000_invoice_lines_keep_what_they_say.sql');
  await db.exec(source.slice(source.indexOf('CREATE OR REPLACE FUNCTION public.posting_engine_submit'),
    source.indexOf('COMMENT ON FUNCTION public.posting_engine_submit')));
  await db.exec(read('supabase/migrations/20261001160000_scheduled_accounting_is_atomic_and_requests_are_limited.sql'));
}, 60000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`RESET ROLE;
    SET request.jwt.claim.role = 'service_role';
    SET test.closed_period = 'false';
    SET test.fail_journal_entry_items = 'false';
    SET test.fail_fixed_assets = 'false';
    SET test.fail_recurring_journal_entries = 'false';
    TRUNCATE journal_entry_items, journal_entries, posting_requests, recurring_journal_entry_items,
      recurring_journal_entries, fixed_assets, chart_of_accounts, companies, company_users, edge_request_quotas CASCADE;
    INSERT INTO companies VALUES ('${COMPANY}'), ('${FOREIGN}');
    INSERT INTO chart_of_accounts(id, company_id, name) VALUES
      ('${DEBIT}', '${COMPANY}', 'Expense'), ('${CREDIT}', '${COMPANY}', 'Accumulated depreciation');
    INSERT INTO company_users VALUES ('${COMPANY}', '${USER}', 'owner');
    INSERT INTO fixed_assets(id, company_id, status, depreciation_method, useful_life_years,
      depreciation_expense_account_id, accumulated_depreciation_account_id, purchase_cost,
      residual_value, accumulated_depreciation, purchase_date, asset_code, description)
    VALUES ('${ASSET}', '${COMPANY}', 'active', 'straight-line', 1,
      '${DEBIT}', '${CREDIT}', 1200, 0, 0, '2026-09-01', 'FA-1', 'Laptop');
    INSERT INTO recurring_journal_entries VALUES
      ('${ENTRY}', '${COMPANY}', 'Rent', 'monthly', '2026-09-30', '2026-09-01', NULL);
    INSERT INTO recurring_journal_entry_items(recurring_journal_entry_id, account_id, type, amount) VALUES
      ('${ENTRY}', '${DEBIT}', 'debit', 100), ('${ENTRY}', '${CREDIT}', 'credit', 100);`);
});

describe('atomic scheduled accounting in PostgreSQL', () => {
  it('posts balanced depreciation, updates its register, and skips retries even on a different day', async () => {
    expect(await depreciate()).toMatchObject({ posting_status: 'committed', amount: 100, months: 1 });
    expect(await depreciate('2026-10-01')).toMatchObject({ posting_status: 'skipped' });
    expect(await journalCount()).toBe(1);
    expect((await db.query('SELECT accumulated_depreciation::float AS amount, last_depreciation_date::text AS date FROM fixed_assets')).rows[0])
      .toEqual({ amount: 100, date: '2026-09-30' });
    expect((await db.query('SELECT sum(CASE WHEN type = \'debit\' THEN amount ELSE -amount END)::float AS balance FROM journal_entry_items')).rows[0])
      .toEqual({ balance: 0 });
  });
  it.each(['journal_entry_items', 'fixed_assets'])('rolls back depreciation after a failure writing %s', async (table) => {
    await db.exec(`SET test.fail_${table} = 'true'`);
    await expect(depreciate()).rejects.toThrow('Injected failure');
    expect(await journalCount()).toBe(0);
    expect((await db.query('SELECT count(*)::integer AS n FROM posting_requests')).rows[0]).toEqual({ n: 0 });
    expect((await db.query('SELECT accumulated_depreciation::float AS amount FROM fixed_assets')).rows[0]).toEqual({ amount: 0 });
    await db.exec(`SET test.fail_${table} = 'false'`);
    expect(await depreciate()).toMatchObject({ posting_status: 'committed', amount: 100 });
  });
  it('caps the final depreciation charge at remaining value', async () => {
    await db.exec('UPDATE fixed_assets SET accumulated_depreciation = 1175');
    expect(await depreciate()).toMatchObject({ amount: 25 });
    expect((await db.query('SELECT status FROM fixed_assets')).rows[0]).toEqual({ status: 'fully-depreciated' });
  });
  it('rejects foreign-company and non-admin interactive depreciation', async () => {
    await expect(depreciate('2026-09-30', FOREIGN, USER)).rejects.toThrow('Permission denied');
    await db.exec("UPDATE company_users SET role = 'member'");
    await expect(depreciate('2026-09-30', COMPANY, USER)).rejects.toThrow('Permission denied');
    expect(await journalCount()).toBe(0);
  });
  it('keeps source and journal unchanged when the period guard refuses posting', async () => {
    await db.exec("SET test.closed_period = 'true'");
    await expect(depreciate()).rejects.toThrow('Closed financial year');
    await expect(recur()).rejects.toThrow('Closed financial year');
    expect(await journalCount()).toBe(0);
  });
  it('processes a recurring occurrence once and advances its schedule', async () => {
    expect(await recur()).toMatchObject({ posting_status: 'committed' });
    expect(await recur()).toMatchObject({ posting_status: 'skipped' });
    expect(await journalCount()).toBe(1);
    expect((await db.query('SELECT next_run_date::text AS date FROM recurring_journal_entries')).rows[0])
      .toEqual({ date: '2026-10-30' });
  });
  it.each(['journal_entry_items', 'recurring_journal_entries'])('rolls back a recurring occurrence after failure writing %s', async (table) => {
    await db.exec(`SET test.fail_${table} = 'true'`);
    await expect(recur()).rejects.toThrow('Injected failure');
    expect(await journalCount()).toBe(0);
    expect((await db.query('SELECT next_run_date::text AS date FROM recurring_journal_entries')).rows[0])
      .toEqual({ date: '2026-09-30' });
    await db.exec(`SET test.fail_${table} = 'false'`);
    expect(await recur()).toMatchObject({ posting_status: 'committed' });
  });
  it('rejects unbalanced and foreign-company recurring lines through the actual posting engine', async () => {
    await db.exec("UPDATE recurring_journal_entry_items SET amount = 90 WHERE type = 'credit'");
    await expect(recur()).rejects.toThrow('do not equal credits');
    await db.exec("UPDATE recurring_journal_entry_items SET amount = 100");
    await db.query('UPDATE chart_of_accounts SET company_id = $1 WHERE id = $2', [FOREIGN, CREDIT]);
    await expect(recur()).rejects.toThrow('not found for this company');
    expect(await journalCount()).toBe(0);
  });
  it('rejects an invalid frequency before creating a journal', async () => {
    await db.exec("UPDATE recurring_journal_entries SET frequency = 'invalid'");
    await expect(recur()).rejects.toThrow('Unsupported');
    expect(await journalCount()).toBe(0);
  });
});

describe('distributed quotas and database privileges', () => {
  const consume = (bucket = 'invoices:user-1') => result('SELECT consume_edge_request_quota($1, 2) AS result', [bucket]);
  it('denies excess requests, isolates buckets, and resets an expired window', async () => {
    expect(await consume()).toMatchObject({ allowed: true });
    expect(await consume()).toMatchObject({ allowed: true });
    expect(await consume()).toMatchObject({ allowed: false });
    expect(await consume('invoices:user-2')).toMatchObject({ allowed: true });
    await db.exec("UPDATE edge_request_quotas SET window_start = now() - interval '2 minutes'");
    expect(await consume()).toMatchObject({ allowed: true });
  });
  it.each(['anon', 'authenticated'])('prevents %s callers from executing service-only RPCs or changing quota counters', async (role) => {
    await db.exec(`SET ROLE ${role}; SET request.jwt.claim.role = '${role}'`);
    await expect(consume()).rejects.toThrow('permission denied');
    await expect(depreciate()).rejects.toThrow('permission denied');
    await expect(recur()).rejects.toThrow('permission denied');
    await expect(db.exec('DELETE FROM edge_request_quotas')).rejects.toThrow('permission denied');
  });
  it('checks service claims even for a database owner executing the RPC', async () => {
    await db.exec("SET request.jwt.claim.role = 'authenticated'");
    await expect(consume()).rejects.toThrow('service role required');
    await expect(depreciate()).rejects.toThrow('service role required');
    await expect(recur()).rejects.toThrow('service role required');
  });
});
