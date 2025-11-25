import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useUserRole';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import PasswordChangeDialog from '@/components/PasswordChangeDialog';
import ErrorBoundary from '@/components/ErrorBoundary';
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

  // Check if user needs to change password
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('force_password_change')
        .eq('id', user.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  if (authLoading || rolesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show password change dialog if needed
  if (user && profile?.force_password_change) {
    return <PasswordChangeDialog open={true} userId={user.id} />;
  }

  if (!roles || roles.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-accent/5 to-background">
        <div className="text-center space-y-6 max-w-md p-8">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold">No Role Assigned</h2>
            <p className="text-muted-foreground text-lg">
              Contact your administrator to get access
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button 
              size="lg"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate('/');
              }}
            >
              Log Out
            </Button>
            <Button 
              variant="outline"
              size="lg"
              onClick={() => {
                supabase.auth.signOut();
                navigate('/bootstrap');
              }}
            >
              Go to Bootstrap Setup
            </Button>
          </div>
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
      return (
        <ErrorBoundary fallbackTitle="Super Admin Dashboard Error">
          <SuperAdminDashboard />
        </ErrorBoundary>
      );
    case 'general_admin':
      return (
        <ErrorBoundary fallbackTitle="General Admin Dashboard Error">
          <GeneralAdminDashboard />
        </ErrorBoundary>
      );
    case 'workplace_supervisor':
      return (
        <ErrorBoundary fallbackTitle="Workplace Supervisor Dashboard Error">
          <WorkplaceSupervisorDashboard />
        </ErrorBoundary>
      );
    case 'facility_supervisor':
      return (
        <ErrorBoundary fallbackTitle="Facility Supervisor Dashboard Error">
          <FacilitySupervisorDashboard />
        </ErrorBoundary>
      );
    case 'department_head':
      return (
        <ErrorBoundary fallbackTitle="Department Head Dashboard Error">
          <DepartmentHeadDashboard />
        </ErrorBoundary>
      );
    case 'staff':
      return (
        <ErrorBoundary fallbackTitle="Staff Dashboard Error">
          <StaffDashboard />
        </ErrorBoundary>
      );
    default:
      return (
        <ErrorBoundary fallbackTitle="Dashboard Error">
          <StaffDashboard />
        </ErrorBoundary>
      );
  }
};

export default Dashboard;
