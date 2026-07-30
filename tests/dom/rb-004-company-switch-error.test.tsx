/**
 * RB-004 REGRESSION VAULT — a failed company switch must surface an error toast,
 * not a silent unhandled rejection.
 *
 * Root cause: `onSelect={() => switchCompany(id)}` neither awaited nor caught,
 * and switchCompany rethrows on failure → unhandled rejection, stale active
 * company, zero user feedback. Fix awaits inside a guarded handler that shows an
 * error toast.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { showError } = vi.hoisted(() => ({ showError: vi.fn() }));
const { switchCompany } = vi.hoisted(() => ({ switchCompany: vi.fn() }));

vi.mock('@/utils/toast', () => ({ showError, showSuccess: vi.fn() }));
vi.mock('@/hooks/useEnterpriseIdentity', () => ({
  useEnterpriseIdentity: () => ({ identity: { name: 'Acme (Pty) Ltd' } }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    activeCompany: { id: 'c1', name: 'Acme (Pty) Ltd' },
    companies: [
      { id: 'c1', name: 'Acme (Pty) Ltd' },
      { id: 'c2', name: 'Beta Holdings' },
    ],
    switchCompany,
  }),
}));

import CompanySwitcher from '@/components/CompanySwitcher';

const user = userEvent.setup({ pointerEventsCheck: 0 });

describe('RB-004 — company switch failure handling', () => {
  beforeEach(() => {
    showError.mockClear();
    switchCompany.mockReset();
  });

  it('shows an error toast when switchCompany rejects (no silent failure)', async () => {
    switchCompany.mockRejectedValue(new Error('edge 500'));

    render(<CompanySwitcher />);
    await user.click(screen.getByRole('button', { name: /acme/i }));
    await user.click(await screen.findByText('Beta Holdings'));

    // The rejection is caught and surfaced, not swallowed.
    await vi.waitFor(() => expect(switchCompany).toHaveBeenCalledWith('c2'));
    await vi.waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
  });

  it('does not show an error toast on a successful switch', async () => {
    switchCompany.mockResolvedValue(undefined);

    render(<CompanySwitcher />);
    await user.click(screen.getByRole('button', { name: /acme/i }));
    await user.click(await screen.findByText('Beta Holdings'));

    await vi.waitFor(() => expect(switchCompany).toHaveBeenCalledWith('c2'));
    expect(showError).not.toHaveBeenCalled();
  });
});
