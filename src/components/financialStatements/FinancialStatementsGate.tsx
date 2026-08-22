import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { canAccessFinancialStatementsWorkspace } from '../../lib/financialStatements/flags';
import RouteLoadingFallback from '../RouteLoadingFallback';

/**
 * V6.5.0 Internal Preview gate — persona + feature-flag enforced.
 * Not a public production surface.
 */
export default function FinancialStatementsGate({ children }: { children: React.ReactNode }) {
  const { session, profile, role, loading } = useAuth();

  if (loading) return <RouteLoadingFallback />;

  const allowed = canAccessFinancialStatementsWorkspace({
    role,
    userEmail: session?.user?.email,
    userId: session?.user?.id || profile?.id,
  });

  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
