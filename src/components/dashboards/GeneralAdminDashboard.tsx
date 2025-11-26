import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { PageHeader, LoadingState } from '@/components/layout';
import { StatsCard } from '@/components/shared';
import { Building2, Users, FolderTree } from 'lucide-react';
import FacilityUserManagement from '@/components/admin/FacilityUserManagement';
import WorkspaceManagement from '@/components/admin/WorkspaceManagement';
import CategoryDepartmentManagement from '@/components/admin/CategoryDepartmentManagement';
import WorkspaceModuleManagement from '@/components/admin/WorkspaceModuleManagement';
import { VacationHub } from '@/modules/vacation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useModuleContext } from '@/contexts/ModuleContext';
import { useLocation } from 'react-router-dom';

const GeneralAdminDashboard = () => {
  const { user } = useAuth();
  const { hasAccess } = useModuleContext();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab') || (hasAccess('organization') ? 'facilities' : hasAccess('user_management') ? 'users' : 'modules');

  const { data: userRole } = useQuery({
    queryKey: ['general-admin-role', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*, workspaces(name)')
        .eq('user_id', user?.id)
        .eq('role', 'general_admin')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: stats } = useQuery({
    queryKey: ['workspace-stats', userRole?.workspace_id],
    queryFn: async () => {
      if (!userRole?.workspace_id) return null;

      const [facilities, users, departments] = await Promise.all([
        supabase
          .from('facilities')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', userRole.workspace_id),
        supabase
          .from('user_roles')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', userRole.workspace_id),
        supabase
          .from('departments')
          .select('id', { count: 'exact', head: true })
          .eq('facility_id', 'in.(select id from facilities where workspace_id = ' + userRole.workspace_id + ')'),
      ]);

      return {
        facilities: facilities.count || 0,
        users: users.count || 0,
        departments: departments.count || 0,
      };
    },
    enabled: !!userRole?.workspace_id,
  });

  if (!userRole?.workspace_id) {
    return <LoadingState message="Loading workspace information..." />;
  }

  return (
    <>
      {(activeTab === 'facilities' || !activeTab) && (
        <PageHeader 
          title={userRole.workspaces?.name || 'Workspace Management'}
          description="Manage workspace facilities and organizational structure"
        />
      )}
      {activeTab === 'categories' && (
        <PageHeader 
          title="Categories & Departments" 
          description="Manage organizational categories and department templates"
        />
      )}
      {activeTab === 'users' && (
        <PageHeader 
          title="User Management" 
          description="Manage workspace users and their roles"
        />
      )}
      {activeTab === 'modules' && (
        <PageHeader 
          title="Module Configuration" 
          description="Configure module access for this workspace"
        />
      )}
      {activeTab === 'vacation' && (
        <PageHeader 
          title="Vacation Management" 
          description="Manage vacation plans and approvals for this workspace"
        />
      )}
      
      <div className="space-y-6">
        {/* Stats Grid */}
        {stats && (
          <div className="grid gap-6 md:grid-cols-3">
            <StatsCard
              title="Facilities"
              value={stats.facilities}
              icon={Building2}
            />
            <StatsCard
              title="Departments"
              value={stats.departments}
              icon={FolderTree}
            />
            <StatsCard
              title="Users"
              value={stats.users}
              icon={Users}
            />
          </div>
        )}

        {/* Management Sections */}
        <div className="space-y-4">
          {activeTab === 'facilities' && hasAccess('organization') && (
            <ModuleGuard moduleKey="organization">
              <WorkspaceManagement />
            </ModuleGuard>
          )}

          {activeTab === 'categories' && hasAccess('organization') && (
            <ModuleGuard moduleKey="organization">
              <CategoryDepartmentManagement />
            </ModuleGuard>
          )}

          {activeTab === 'users' && hasAccess('user_management') && (
            <ModuleGuard moduleKey="user_management">
              <FacilityUserManagement />
            </ModuleGuard>
          )}

          {activeTab === 'modules' && (
            <ModuleGuard moduleKey="organization">
              <WorkspaceModuleManagement />
            </ModuleGuard>
          )}

          {activeTab === 'vacation' && hasAccess('vacation_planning') && (
            <ModuleGuard moduleKey="vacation_planning">
              <VacationHub />
            </ModuleGuard>
          )}
        </div>
      </div>
    </>
  );
};

export default GeneralAdminDashboard;
