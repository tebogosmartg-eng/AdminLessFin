import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import Layout from './Layout';

const ProtectedRoute = () => {
  const { session } = useAuth();

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  return <Layout />;
};

export default ProtectedRoute;