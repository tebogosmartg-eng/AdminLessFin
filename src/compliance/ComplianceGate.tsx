import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RouteLoadingFallback from '../components/RouteLoadingFallback';
import { canAccessCompliance } from './flags';

/**
 * Compliance & Governance gate — feature flag, pilot allowlist and role.
 * Sits inside AdminRoute; the edge function enforces the same rule again.
 */
export default function ComplianceGate({ children }: { children: React.ReactNode }) {
  const { session, profile, role, loading } = useAuth();

  if (loading) return <RouteLoadingFallback />;

  const allowed = canAccessCompliance({
    role,
    userEmail: session?.user?.email,
    userId: session?.user?.id || profile?.id,
  });

  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}
