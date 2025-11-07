import { useAuth } from '../contexts/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';
import Layout from './Layout';
import FullScreenLoader from './FullScreenLoader';

const ProtectedRoute = () => {
  const { session, activeCompany, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullScreenLoader />;
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  // If user is logged in but has no company,
  // only allow access to the create-company page.
  if (!activeCompany && location.pathname !== '/create-company') {
    return <Navigate to="/create-company" replace />;
  }

  // If user has a company but is on the create-company page, redirect them.
  if (activeCompany && location.pathname === '/create-company') {
    return <Navigate to="/" replace />;
  }

  return <Layout />;
};

export default ProtectedRoute;