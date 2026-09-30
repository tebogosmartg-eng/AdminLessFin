import { useAuth } from '../contexts/AuthContext';
import { canAccessCompliance } from './flags';
import { useComplianceCalendar } from './queries';

/**
 * The one place an existing screen (the Operations Calendar) reads from
 * Compliance. Flag-gated and owner/admin only here, and refused again by the
 * `compliance` edge function for anyone else, so members never see
 * compliance dates. It is a separate query from `calendar-events`: if it
 * fails, the calendar still shows everything else and says so.
 */
export function useComplianceCalendarEvents(start: string, end: string) {
  const { activeCompany, role, session, profile } = useAuth();
  const enabled = canAccessCompliance({
    role,
    userEmail: session?.user?.email,
    userId: session?.user?.id || profile?.id,
  });
  const query = useComplianceCalendar(activeCompany?.id, start, end, enabled);
  return { enabled, ...query };
}

export const complianceObligationRoute = (obligationId: string) => `/compliance/obligations/${obligationId}`;
