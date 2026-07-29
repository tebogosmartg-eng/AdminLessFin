import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { trackFirstUsageEvent } from './productAnalytics';

/** Fire once-per-company page view milestones (Trial Balance, Financial Statements). */
export function useFirstUsagePageView(eventName: string, eventKey: string) {
  const { activeCompany } = useAuth();

  useEffect(() => {
    if (!activeCompany?.id) return;
    trackFirstUsageEvent(activeCompany.id, eventName, eventKey);
  }, [activeCompany?.id, eventName, eventKey]);
}
