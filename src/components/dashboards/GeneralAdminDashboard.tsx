import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { PageHeader, LoadingState } from '@/components/layout';
import { StatsCard } from '@/components/shared';
import { Building2, Users, FolderTree, ClipboardList, Calendar, CalendarClock } from 'lucide-react';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorState } from '@/components/layout/ErrorState';
import FacilityUserManagement from '@/components/admin/FacilityUserManagement';
import WorkspaceManagement from '@/components/admin/WorkspaceManagement';
import CategoryDepartmentManagement from '@/components/admin/CategoryDepartmentManagement';
import WorkspaceModuleManagement from '@/components/admin/WorkspaceModuleManagement';
import { VacationHub } from '@/modules/vacation';
import TrainingHub from '@/components/training/TrainingHub';
import TaskManager from '@/components/tasks/TaskManager';
import StaffTaskView from '@/components/tasks/StaffTaskView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SchedulingHub } from '@/components/scheduling';
import { UnifiedUserHub } from '@/components/users';
import { MessagingHub } from '@/modules/messaging';
import { NotificationHub } from '@/modules/notifications';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useModuleContext } from '@/contexts/ModuleContext';
import { useLocation } from 'react-router-dom';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useOrganization } from '@/contexts/OrganizationContext';
import { AuditLogsDashboard } from '@/components/admin/AuditLogsDashboard';

const GeneralAdminDashboard = () => {
  const { user } = useAuth();
  const { hasAccess } = useModuleContext();
  const { selectedOrganizationId } = useOrganization();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab');

  // Real-time subscriptions for live updates
  useRealtimeSubscription({ table: 'facilities', invalidateQueries: ['workspace-stats'] });
  useRealtimeSubscription({ table: 'user_roles', invalidateQueries: ['workspace-stats'] });
  useRealtimeSubscription({ table: 'departments', invalidateQueries: ['workspace-stats'] });
  useRealtimeSubscription({ table: 'tasks', invalidateQueries: ['workspace-tasks-stats'] });
  useRealtimeSubscription({ table: 'vacation_plans', invalidateQueries: ['workspace-vacation-stats'] });
  useRealtimeSubscription({ table: 'schedules', invalidateQueries: ['workspace-schedules-stats'] });

  const { data: userRole, isLoading: roleLoading } = useQuery({
    queryKey: ['general-admin-role', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*, workspaces(name), organizations(name)')
        .eq('user_id', user?.id)
        .eq('role', 'general_admin')
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!user,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['general-admin-stats'],
    queryFn: async () => {
      // General Admin has system-wide access like Super Admin
      const [facilities, users, departments, pendingVacations, activeTasks, publishedSchedules] = await Promise.all([
        supabase.from('facilities').select('id', { count: 'exact', head: true }),
        supabase.from('user_roles').select('id', { count: 'exact', head: true }),
        supabase.from('departments').select('id', { count: 'exact', head: true }),
        supabase.from('vacation_plans').select('id', { count: 'exact', head: true }).in('status', ['department_pending', 'facility_pending', 'workspace_pending']),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('schedules').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      ]);

      return {
        facilities: facilities.count || 0,
        users: users.count || 0,
        departments: departments.count || 0,
        pendingVacations: pendingVacations.count || 0,
        activeTasks: activeTasks.count || 0,
        publishedSchedules: publishedSchedules.count || 0,
      };
    },
    enabled: !!userRole,
  });

  if (roleLoading || statsLoading) {
    return <LoadingState message="Loading dashboard information..." />;
  }

  return (
    <ErrorBoundary
      fallback={
        <ErrorState
          title="Dashboard Error"
          message="Failed to load general admin dashboard"
          onRetry={() => window.location.reload()}
        />
      }
    >
      <>
        {activeTab === 'facilities' && (
          <PageHeader
            title={userRole.workspaces?.name || 'Workspace Management'}
            description="Manage workspace facilities and organizational structure"
          />
        )}
        {!activeTab && (
          <PageHeader
            title={userRole.workspaces?.name || 'Workspace Management'}
            description="Overview of workspace statistics and management"
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

        {activeTab === 'vacation' && (
          <PageHeader
            title="Vacation Management"
            description="Manage vacation plans and approvals for this workspace"
          />
        )}
        {activeTab === 'training' && (
          <PageHeader
            title="Meeting & Training"
            description="Create and manage meetings and training sessions"
          />
        )}
        {activeTab === 'tasks' && (
          <PageHeader
            title="Task Management"
            description="Manage tasks across the workspace"
          />
        )}
        {activeTab === 'scheduling' && (
          <PageHeader
            title="Scheduling"
            description="View and manage schedules across the workspace"
          />
        )}
        {activeTab === 'staff' && (
          <PageHeader
            title="Staff Management"
            description="Manage staff members in this workspace"
          />
        )}
        {activeTab === 'messaging' && (
          <PageHeader
            title="Messaging"
            description="Communicate with workspace members"
          />
        )}
        {activeTab === 'notifications' && (
          <PageHeader
            title="Notifications"
            description="View important updates"
          />
        )}
        {activeTab === 'audit' && (
          <PageHeader
            title="Audit Logs"
            description="View system activity and security logs"
          />
        )}

        <div className="space-y-6">
          {/* Stats Grid - Show in overview or on tabs */}
          {stats && !activeTab && (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
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
              <StatsCard
                title="Pending Vacations"
                value={stats.pendingVacations}
                icon={Calendar}
              />
              <StatsCard
                title="Active Tasks"
                value={stats.activeTasks}
                icon={ClipboardList}
              />
              <StatsCard
                title="Schedules"
                value={stats.publishedSchedules}
                icon={CalendarClock}
              />
            </div>
          )}

          {/* Management Sections */}
          <div className="space-y-4">
            {activeTab === 'facilities' && (
              <WorkspaceManagement
                workspaceId={userRole.workspace_id}
              />
            )}

            {activeTab === 'categories' && (
              <CategoryDepartmentManagement
                workspaceId={userRole.workspace_id}
              />
            )}

            {activeTab === 'users' && (
              <FacilityUserManagement />
            )}



            {activeTab === 'vacation' && (
              <VacationHub />
            )}

            {activeTab === 'training' && (
              <TrainingHub />
            )}

            {activeTab === 'tasks' && (
              <Tabs defaultValue="manage" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="manage">Manage Workspace Tasks</TabsTrigger>
                  <TabsTrigger value="my-tasks">My Assigned Tasks</TabsTrigger>
                </TabsList>
                <TabsContent value="manage">
                  <TaskManager scopeType="workspace" scopeId={userRole.workspace_id} />
                </TabsContent>
                <TabsContent value="my-tasks">
                  <StaffTaskView />
                </TabsContent>
              </Tabs>
            )}

            {activeTab === 'scheduling' && (
              <SchedulingHub />
            )}

            {activeTab === 'staff' && (
              <UnifiedUserHub
                scope="system"
                organizationId={selectedOrganizationId}
              />
            )}

            {activeTab === 'messaging' && (
              <MessagingHub />
            )}

            {activeTab === 'notifications' && (
              <NotificationHub />
            )}

            {activeTab === 'audit' && (
              <AuditLogsDashboard />
            )}
          </div>
        </div>
      </>
    </ErrorBoundary>
  );
};

export default GeneralAdminDashboard;
