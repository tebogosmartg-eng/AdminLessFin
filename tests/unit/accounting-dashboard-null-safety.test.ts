/**
 * Regression: AccountingDashboard MovementCard / account list rendering must
 * tolerate null movement rows and missing related-account metadata without
 * throwing. Pure helpers mirrored from the page (no business/SQL changes).
 */

function safeMoney(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return `ZAR ${n.toFixed(2)}`;
}

function resolveAccountLabel(row: { account_name?: string | null; account_id?: string | null } | null | undefined): {
  label: string;
  missingAccount: boolean;
} {
  const name = row?.account_name?.trim();
  if (name) return { label: name, missingAccount: false };
  const id = row?.account_id;
  if (id) return { label: `Account ${String(id).slice(0, 8)}…`, missingAccount: true };
  return { label: 'Account unavailable', missingAccount: true };
}

function accountListItemKey(r: any, index: number): string {
  const id = r?.account_id != null && r.account_id !== '' ? String(r.account_id) : 'no-account';
  const reason = r?.reason != null && r.reason !== '' ? String(r.reason) : 'row';
  return `${id}|${reason}|${index}`;
}

function activityItemKey(item: any, index: number): string {
  const id = item?.id != null && item.id !== '' ? String(item.id) : null;
  if (id) return `${id}|${index}`;
  const parts = [item?.journal_number, item?.reference, item?.module, item?.committed_at, item?.created_at]
    .filter((v) => v != null && v !== '')
    .map(String);
  return parts.length > 0 ? `${parts.join('|')}|${index}` : `activity-${index}`;
}

/** Mirrors MovementCard null-guard order: never read row.* before this check. */
function movementCardSafe(row: any, balanceMode?: boolean) {
  if (!row) return { empty: true as const };
  const { label, missingAccount } = resolveAccountLabel(row);
  const from = balanceMode ? row.previous_balance : row.previous;
  const to = balanceMode ? row.current_balance : row.current;
  return {
    empty: false as const,
    label,
    missingAccount,
    delta: safeMoney(row.delta),
    range: `${safeMoney(from)} → ${safeMoney(to)}`,
    accountId: row.account_id != null && row.account_id !== '' ? String(row.account_id) : null,
  };
}

describe('AccountingDashboard null-safety regression', () => {
  it('does not throw when movement row is null', () => {
    expect(() => movementCardSafe(null)).not.toThrow();
    expect(movementCardSafe(null)).toEqual({ empty: true });
    expect(movementCardSafe(undefined)).toEqual({ empty: true });
  });

  it('renders movement metrics when related account metadata is missing', () => {
    const result = movementCardSafe({
      account_id: null,
      account_name: null,
      delta: 1200,
      previous: 100,
      current: 1300,
    });
    expect(result.empty).toBe(false);
    if (result.empty) return;
    expect(result.label).toBe('Account unavailable');
    expect(result.missingAccount).toBe(true);
    expect(result.accountId).toBeNull();
    expect(result.delta).toContain('1200');
  });

  it('flags missing account_name while preserving account_id for drill-through', () => {
    const result = movementCardSafe({
      account_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      account_name: null,
      delta: 50,
      previous_balance: 10,
      current_balance: 60,
    }, true);
    expect(result.empty).toBe(false);
    if (result.empty) return;
    expect(result.missingAccount).toBe(true);
    expect(result.accountId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(result.label.startsWith('Account aaaaaaaa')).toBe(true);
  });

  it('produces unique keys when the same account appears under multiple review reasons', () => {
    const rows = [
      { account_id: 'acc-1', reason: 'abnormal_balance' },
      { account_id: 'acc-1', reason: 'large_material_movement' },
    ];
    const keys = rows.map((r, i) => accountListItemKey(r, i));
    expect(new Set(keys).size).toBe(2);
  });

  it('produces unique activity keys when the same posting id appears twice', () => {
    const items = [
      { id: 'pr-1', module: 'payable' },
      { id: 'pr-1', module: 'purchase' },
    ];
    const keys = items.map((item, i) => activityItemKey(item, i));
    expect(new Set(keys).size).toBe(2);
  });

  it('does not fabricate money for null amounts', () => {
    expect(safeMoney(null)).toBe('—');
    expect(safeMoney(undefined)).toBe('—');
    expect(safeMoney(NaN)).toBe('—');
  });
});
