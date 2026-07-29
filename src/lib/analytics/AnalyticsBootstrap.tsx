import { useAnalyticsContextSync } from '@/lib/analytics/useAnalyticsContextSync';

/** Mount inside AuthProvider to sync user/company into analytics client. */
export function AnalyticsBootstrap() {
  useAnalyticsContextSync();
  return null;
}
