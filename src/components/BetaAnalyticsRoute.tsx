import { useAuth } from '../contexts/AuthContext';
import { Navigate, Outlet } from 'react-router-dom';
import FullScreenLoader from './FullScreenLoader';
import { isBetaAnalyticsAdmin } from '../lib/analytics/betaAllowlist';

/**
 * Platform beta analytics — allowlisted emails only (not company RBAC).
 */
const BetaAnalyticsRoute = () => {
  const { user, loading } = useAuth();

  if (loading) return <FullScreenLoader />;

  if (!isBetaAnalyticsAdmin(user?.email)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default BetaAnalyticsRoute;
