import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/layout';
import { StaffManagementHub } from '@/modules/staff-management';
import { VacationHub } from '@/modules/vacation';
import { TaskHub } from '@/modules/tasks';
import { NotificationHub } from '@/modules/notifications';
import { MessagingHub } from '@/modules/messaging';
import { Calendar, ClipboardList, UserPlus, Bell, MessageSquare } from 'lucide-react';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useModuleContext } from '@/contexts/ModuleContext';
import { useLocation } from 'react-router-dom';

const DepartmentHeadDashboard = () => {
  const { user } = useAuth();
  const { hasAccess } = useModuleContext();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab');

  const { data: userRole, isLoading: roleLoading, error: roleError } = useQuery({
    queryKey: ['department-head-role', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User not found');
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id)
        .eq('role', 'department_head')
        .maybeSingle();
      
      if (error) {
        console.error('Department head role query error:', error);
        throw error;
      }
      
      return data;
    },
    enabled: !!user,
  });

  // Count queries for overview - MUST be before early returns
  const { data: staffCount } = useQuery({
    queryKey: ['staff-count', userRole?.department_id],
    queryFn: async () => {
      if (!userRole?.department_id) return 0;
      const { count } = await supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('department_id', userRole.department_id)
        .eq('role', 'staff');
      return count || 0;
    },
    enabled: !!userRole?.department_id,
  });

  const { data: pendingVacations } = useQuery({
    queryKey: ['pending-vacations', userRole?.department_id],
    queryFn: async () => {
      if (!userRole?.department_id) return 0;
      const { count } = await supabase
        .from('vacation_plans')
        .select('*', { count: 'exact', head: true })
        .eq('department_id', userRole.department_id)
        .eq('status', 'draft');
      return count || 0;
    },
    enabled: !!userRole?.department_id,
  });

  const { data: activeTasks } = useQuery({
    queryKey: ['active-tasks', userRole?.department_id],
    queryFn: async () => {
      if (!userRole?.department_id) return 0;
      const { count } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('department_id', userRole.department_id)
        .eq('status', 'active');
      return count || 0;
    },
    enabled: !!userRole?.department_id,
  });

  if (roleLoading) {
    return <LoadingState message="Loading department information..." />;
  }

  if (roleError) {
    return (
      <ErrorState 
        title="Error Loading Department"
        message="Error loading department information. Please try refreshing the page." 
      />
    );
  }

  if (!userRole?.department_id) {
    return (
      <EmptyState 
        title="No Department Assigned"
        description="No department assigned to your account. Please contact an administrator."
      />
    );
  }

  return (
    <>
      {activeTab === 'staff' && (
        <PageHeader 
          title="Staff Management" 
          description="Manage your department's staff members"
        />
      )}
      {activeTab === 'vacation' && (
        <PageHeader 
          title="Vacation Planning" 
          description="Plan and manage staff vacation schedules"
        />
      )}
      {activeTab === 'tasks' && (
        <PageHeader 
          title="Department Tasks" 
          description="Assign and track department tasks"
        />
      )}
      {activeTab === 'messaging' && (
        <PageHeader 
          title="Messaging" 
          description="Chat with staff in your department"
        />
      )}
      {activeTab === 'notifications' && (
        <PageHeader 
          title="Notifications" 
          description="View important updates for your department"
        />
      )}
      {!['staff','vacation','tasks','messaging','notifications'].includes(activeTab) && (
        <PageHeader 
          title="Department Overview" 
          description="Manage your department"
        />
      )}
      
      <div className="space-y-4">
        {!['staff','vacation','tasks','messaging','notifications'].includes(activeTab) && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border bg-card p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Total Staff</p>
                <UserPlus className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-3xl font-bold mt-2">{staffCount || 0}</p>
            </div>
            <div className="rounded-lg border bg-card p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Pending Requests</p>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-3xl font-bold mt-2">{pendingVacations || 0}</p>
            </div>
            <div className="rounded-lg border bg-card p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Active Tasks</p>
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-3xl font-bold mt-2">{activeTasks || 0}</p>
            </div>
          </div>
        )}

        {activeTab === 'staff' && hasAccess('staff_management') && (
          <ModuleGuard moduleKey="staff_management">
            <StaffManagementHub />
          </ModuleGuard>
        )}

        {activeTab === 'vacation' && hasAccess('vacation_planning') && (
          <ModuleGuard moduleKey="vacation_planning">
            <VacationHub departmentId={userRole.department_id} />
          </ModuleGuard>
        )}

        {activeTab === 'tasks' && hasAccess('task_management') && (
          <ModuleGuard moduleKey="task_management">
            <TaskHub />
          </ModuleGuard>
        )}

        {activeTab === 'messaging' && hasAccess('messaging') && (
          <ModuleGuard moduleKey="messaging">
            <MessagingHub />
          </ModuleGuard>
        )}

        {activeTab === 'notifications' && hasAccess('notifications') && (
          <ModuleGuard moduleKey="notifications">
            <NotificationHub />
          </ModuleGuard>
        )}

        {/* Show message if no valid tab content */}
        {!hasAccess('staff_management') && !hasAccess('vacation_planning') && !hasAccess('task_management') && !hasAccess('messaging') && !hasAccess('notifications') && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No modules available. Contact your administrator.</p>
          </div>
        )}
      </div>
    </>
  );
};

export default DepartmentHeadDashboard;
