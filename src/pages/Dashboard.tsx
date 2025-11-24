import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useUserRole';
import { Loader2 } from 'lucide-react';
import SuperAdminDashboard from '@/components/dashboards/SuperAdminDashboard';
import GeneralAdminDashboard from '@/components/dashboards/GeneralAdminDashboard';
import WorkplaceSupervisorDashboard from '@/components/dashboards/WorkplaceSupervisorDashboard';
import FacilitySupervisorDashboard from '@/components/dashboards/FacilitySupervisorDashboard';
import DepartmentHeadDashboard from '@/components/dashboards/DepartmentHeadDashboard';
import StaffDashboard from '@/components/dashboards/StaffDashboard';

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const { data: roles, isLoading: rolesLoading } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  if (authLoading || rolesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!roles || roles.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">No Role Assigned</h2>
          <p className="text-muted-foreground">
            Contact your administrator to get access
          </p>
        </div>
      </div>
    );
  }

  // Get primary role (prioritize higher permissions)
  const getPrimaryRole = () => {
    const roleHierarchy = ['super_admin', 'general_admin', 'workplace_supervisor', 'facility_supervisor', 'department_head', 'staff'];
    for (const role of roleHierarchy) {
      if (roles.some(r => r.role === role)) {
        return role;
      }
    }
    return 'staff';
  };

  const primaryRole = getPrimaryRole();

  switch (primaryRole) {
    case 'super_admin':
      return <SuperAdminDashboard />;
    case 'general_admin':
      return <GeneralAdminDashboard />;
    case 'workplace_supervisor':
      return <WorkplaceSupervisorDashboard />;
    case 'facility_supervisor':
      return <FacilitySupervisorDashboard />;
    case 'department_head':
      return <DepartmentHeadDashboard />;
    case 'staff':
      return <StaffDashboard />;
    default:
      return <StaffDashboard />;
  }
};

export default Dashboard;
