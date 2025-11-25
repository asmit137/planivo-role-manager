import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { PageHeader, LoadingState } from '@/components/layout';
import { StatsCard } from '@/components/shared';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, Users, FolderTree, LayoutGrid } from 'lucide-react';
import FacilityUserManagement from '@/components/admin/FacilityUserManagement';
import WorkspaceManagement from '@/components/admin/WorkspaceManagement';
import CategoryDepartmentManagement from '@/components/admin/CategoryDepartmentManagement';
import WorkspaceModuleManagement from '@/components/admin/WorkspaceModuleManagement';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useModuleContext } from '@/contexts/ModuleContext';

const GeneralAdminDashboard = () => {
  const { user } = useAuth();
  const { hasAccess } = useModuleContext();

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
      <PageHeader 
        title={userRole.workspaces?.name || 'Workspace Management'}
        description="Manage your workspace facilities, departments, and users"
      />
      
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

        {/* Management Tabs */}
        <Tabs defaultValue={hasAccess('organization') ? 'facilities' : hasAccess('user_management') ? 'users' : 'modules'} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            {hasAccess('organization') && (
              <TabsTrigger value="facilities">
                <Building2 className="h-4 w-4 mr-2" />
                Facilities
              </TabsTrigger>
            )}
            {hasAccess('organization') && (
              <TabsTrigger value="categories">
                <FolderTree className="h-4 w-4 mr-2" />
                Categories & Departments
              </TabsTrigger>
            )}
            {hasAccess('user_management') && (
              <TabsTrigger value="users">
                <Users className="h-4 w-4 mr-2" />
                Users
              </TabsTrigger>
            )}
            <TabsTrigger value="modules">
              <LayoutGrid className="h-4 w-4 mr-2" />
              Modules
            </TabsTrigger>
          </TabsList>

          {hasAccess('organization') && (
            <TabsContent value="facilities">
              <ModuleGuard moduleKey="organization">
                <WorkspaceManagement />
              </ModuleGuard>
            </TabsContent>
          )}

          {hasAccess('organization') && (
            <TabsContent value="categories">
              <ModuleGuard moduleKey="organization">
                <CategoryDepartmentManagement />
              </ModuleGuard>
            </TabsContent>
          )}

          {hasAccess('user_management') && (
            <TabsContent value="users">
              <ModuleGuard moduleKey="user_management">
                <FacilityUserManagement />
              </ModuleGuard>
            </TabsContent>
          )}

          <TabsContent value="modules">
            <ModuleGuard moduleKey="organization">
              <WorkspaceModuleManagement />
            </ModuleGuard>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default GeneralAdminDashboard;
