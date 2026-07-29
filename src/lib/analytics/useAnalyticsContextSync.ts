import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { setAnalyticsContext } from './productAnalytics';

/** Syncs auth context into the analytics client for all subsequent events. */
export function useAnalyticsContextSync() {
  const { user, activeCompany } = useAuth();

  useEffect(() => {
    setAnalyticsContext({
      userId: user?.id ?? null,
      companyId: activeCompany?.id ?? null,
    });
  }, [user?.id, activeCompany?.id]);
}
