import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Đang tải...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Redirect ADMIN away from standard user pages (dashboard, groups, etc)
  if (user?.role === 'ADMIN' && !location.pathname.startsWith('/admin') && !['/profile', '/settings'].includes(location.pathname)) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
