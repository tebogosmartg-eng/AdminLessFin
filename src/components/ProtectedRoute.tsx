import { useAuth } from '../contexts/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';
import Layout from './Layout';

const ProtectedRoute = () => {
  const { session, activeCompany } = useAuth();
  const location = useLocation();

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  // If user is logged in but has no company,
  // only allow access to the create-company page.
  if (!activeCompany && location.pathname !== '/create-company') {
    return <Navigate to="/create-company" replace />;
  }

  return <Layout />;
};

export default ProtectedRoute;