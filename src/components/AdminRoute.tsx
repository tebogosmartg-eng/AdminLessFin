import { useAuth } from '../contexts/AuthContext';
import { Navigate, Outlet } from 'react-router-dom';
import RouteLoadingFallback from './RouteLoadingFallback';

const AdminRoute = () => {
  const { role, loading } = useAuth();

  if (loading) {
    return <RouteLoadingFallback />;
  }

  // Only allow Owners and Admins
  if (role !== 'owner' && role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default AdminRoute;