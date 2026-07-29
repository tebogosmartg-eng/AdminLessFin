import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { SmartSelect, type SmartSelectOption } from '@/components/cotf/SmartSelect';
import type { QuickCreateConfig } from '@/components/cotf/QuickCreateDialog';

// Toast side-effects need a mounted Toaster we don't render here.
vi.mock('@/utils/toast', () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
  showPlatformError: vi.fn(),
}));

const user = userEvent.setup({ pointerEventsCheck: 0 });

function customerCreateConfig(create: QuickCreateConfig['create']): QuickCreateConfig {
  return {
    title: 'New Customer',
    submitLabel: 'Create customer',
    fields: [{ name: 'name', label: 'Customer name', type: 'text', required: true, prefillFromSearch: true }],
    create,
  };
}

function renderSmartSelect(props: {
  options: SmartSelectOption[];
  createConfig?: QuickCreateConfig;
  invalidateSpy?: (arg: unknown) => void;
  initialValue?: string;
}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (props.invalidateSpy) {
    qc.invalidateQueries = ((arg: unknown) => {
      props.invalidateSpy!(arg);
      return Promise.resolve();
    }) as typeof qc.invalidateQueries;
  }
  const onChange = vi.fn();

  function Harness() {
    const [value, setValue] = React.useState<string>(props.initialValue ?? '');
    return (
      <QueryClientProvider client={qc}>
        <SmartSelect
          entityLabel="customer"
          options={props.options}
          value={value}
          onChange={(v) => {
            setValue(v);
            onChange(v);
          }}
          recentScope="test-customer"
          createConfig={props.createConfig}
          invalidateKeys={props.createConfig ? [['customers', 'co1']] : undefined}
        />
      </QueryClientProvider>
    );
  }

  render(<Harness />);
  return { onChange };
}

const SEARCH = 'Zzyzx Holdings'; // z/y/x make fuzzy matches against real options impossible

describe('SmartSelect — Create-on-the-Fly standard', () => {
  beforeEach(() => window.localStorage.clear());

  it('shows the standard empty state and a Create affordance carrying the typed value', async () => {
    renderSmartSelect({
      options: [{ value: 'c1', label: 'ACME Ltd' }],
      createConfig: customerCreateConfig(vi.fn()),
    });

    await user.click(screen.getByRole('combobox', { name: /select customer/i }));
    await user.type(screen.getByPlaceholderText(/search customer/i), SEARCH);

    expect(await screen.findByText(/no matching results found/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(`create "${SEARCH}"`, 'i') })).toBeInTheDocument();
  });

  it('creates inline, pre-fills the typed value, auto-selects, invalidates, and returns focus', async () => {
    const create = vi.fn(async (values: Record<string, string>) => ({
      value: 'new-1',
      label: values.name,
    }));
    const invalidateSpy = vi.fn();
    const { onChange } = renderSmartSelect({
      options: [{ value: 'c1', label: 'ACME Ltd' }],
      createConfig: customerCreateConfig(create),
      invalidateSpy,
    });

    const trigger = screen.getByRole('combobox', { name: /select customer/i });
    await user.click(trigger);
    await user.type(screen.getByPlaceholderText(/search customer/i), SEARCH);

    // Open the compact create modal from the empty state.
    await user.click(screen.getByRole('button', { name: new RegExp(`create "${SEARCH}"`, 'i') }));

    // Pre-filled with exactly what the user typed.
    const nameInput = await screen.findByLabelText(/customer name/i);
    expect(nameInput).toHaveValue(SEARCH);

    // Save.
    await user.click(screen.getByRole('button', { name: /create customer/i }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: SEARCH }));

    // Modal auto-closes.
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /new customer/i })).not.toBeInTheDocument(),
    );

    // Auto-selected: the trigger now reflects the created record.
    const selected = await screen.findByRole('combobox', { name: new RegExp(SEARCH, 'i') });
    expect(onChange).toHaveBeenCalledWith('new-1');

    // Query invalidation fired with the configured key.
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['customers', 'co1'] }),
    );

    // Focus returns to the field just completed.
    await waitFor(() => expect(selected).toHaveFocus());
  });

  it('surfaces a Recently used section for prior selections', async () => {
    renderSmartSelect({
      options: [
        { value: 'c1', label: 'ACME Ltd' },
        { value: 'c2', label: 'Beta Trading' },
      ],
    });

    // Select ACME, then Beta — ACME becomes "recently used".
    await user.click(screen.getByRole('combobox', { name: /select customer/i }));
    await user.click(await screen.findByRole('option', { name: /acme ltd/i }));

    await user.click(screen.getByRole('combobox', { name: /acme ltd/i }));
    await user.click(await screen.findByRole('option', { name: /beta trading/i }));

    // Reopen with the current selection = Beta; ACME shows under Recently used.
    await user.click(screen.getByRole('combobox', { name: /beta trading/i }));
    const recentHeading = await screen.findByText('Recently used');
    const recentGroup = recentHeading.closest('[cmdk-group]') as HTMLElement;
    expect(within(recentGroup).getByText(/acme ltd/i)).toBeInTheDocument();
  });

  it('clears the selection', async () => {
    const { onChange } = renderSmartSelect({
      options: [{ value: 'c1', label: 'ACME Ltd' }],
      initialValue: 'c1',
    });

    expect(screen.getByRole('combobox', { name: /acme ltd/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /clear customer/i }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });
});
