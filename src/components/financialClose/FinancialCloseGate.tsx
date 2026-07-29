import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { canAccessFinancialClose } from '../../lib/financialClose/flags';
import FullScreenLoader from '../FullScreenLoader';

/** EFCP V6.8.0 gate — persona + feature-flag enforced. */
export default function FinancialCloseGate({ children }: { children: React.ReactNode }) {
  const { session, profile, role, loading } = useAuth();

  if (loading) return <FullScreenLoader />;

  const allowed = canAccessFinancialClose({
    role,
    userEmail: session?.user?.email,
    userId: session?.user?.id || profile?.id,
  });

  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
