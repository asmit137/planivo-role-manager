import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/layout';
import { StaffManagementHub } from '@/modules/staff-management';
import { VacationHub } from '@/modules/vacation';
import { TaskHub } from '@/modules/tasks';
import { NotificationHub } from '@/modules/notifications';
import { MessagingHub } from '@/modules/messaging';
import { SchedulingHub } from '@/components/scheduling';
import TrainingHub from '@/components/training/TrainingHub';
import { Calendar, ClipboardList, UserPlus, Bell, MessageSquare, CalendarClock, GraduationCap } from 'lucide-react';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useModuleContext } from '@/contexts/ModuleContext';
import { useLocation } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

const DepartmentHeadDashboard = () => {
  const { user } = useAuth();
  const { hasAccess } = useModuleContext();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab');

  // Real-time subscriptions for live updates
  useRealtimeSubscription({ table: 'user_roles', invalidateQueries: ['staff-count'] });
  useRealtimeSubscription({ table: 'vacation_plans', invalidateQueries: ['pending-vacations'] });
  useRealtimeSubscription({ table: 'tasks', invalidateQueries: ['active-tasks'] });
  useRealtimeSubscription({ table: 'schedules', invalidateQueries: ['schedules'] });
  useRealtimeSubscription({ table: 'shift_assignments', invalidateQueries: ['shift-assignments'] });

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
  const { data: departmentStats } = useQuery({
    queryKey: ['department-stats', userRole?.department_id],
    queryFn: async () => {
      if (!userRole?.department_id) return null;

      const today = new Date().toISOString().split('T')[0];

      const [staffCount, pendingVacations, activeTasks, staffOnVacation, upcomingTraining] = await Promise.all([
        supabase
          .from('user_roles')
          .select('*', { count: 'exact', head: true })
          .eq('department_id', userRole.department_id)
          .eq('role', 'staff'),
        supabase
          .from('vacation_plans')
          .select('*', { count: 'exact', head: true })
          .eq('department_id', userRole.department_id)
          .in('status', ['pending_approval', 'department_pending']),
        supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('department_id', userRole.department_id)
          .eq('status', 'active'),
        supabase
          .from('vacation_splits')
          .select('id, vacation_plans!inner(status, department_id)', { count: 'exact', head: true })
          .lte('start_date', today)
          .gte('end_date', today)
          .eq('vacation_plans.status', 'approved')
          .eq('vacation_plans.department_id', userRole.department_id),
        supabase
          .from('training_events')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'published')
          .gt('start_datetime', new Date().toISOString()),
      ]);

      return {
        staffCount: staffCount.count || 0,
        pendingVacations: pendingVacations.count || 0,
        activeTasks: activeTasks.count || 0,
        staffOnVacation: staffOnVacation.count || 0,
        upcomingTraining: upcomingTraining.count || 0,
      };
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
    <ErrorBoundary
      fallback={
        <ErrorState
          title="Dashboard Error"
          message="Failed to load department head dashboard"
          onRetry={() => window.location.reload()}
        />
      }
    >
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
        {activeTab === 'scheduling' && (
          <PageHeader
            title="Scheduling"
            description="Manage staff schedules and shifts"
          />
        )}
        {activeTab === 'training' && (
          <PageHeader
            title="Meeting & Training"
            description="Create and manage meetings and training sessions"
          />
        )}
        {!['staff', 'vacation', 'tasks', 'messaging', 'notifications', 'scheduling', 'training'].includes(activeTab || '') && (
          <PageHeader
            title="Department Overview"
            description="Manage your department"
          />
        )}

        <div className="space-y-4">
          {!['staff', 'vacation', 'tasks', 'messaging', 'notifications', 'scheduling', 'training'].includes(activeTab || '') && (
            <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-lg border bg-card p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Total Staff</p>
                  <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold mt-2">{departmentStats?.staffCount || 0}</p>
                <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">In your department</p>
              </div>
              <div className="rounded-lg border bg-card p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Pending</p>
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold mt-2">{departmentStats?.pendingVacations || 0}</p>
                <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">Vacation requests</p>
              </div>
              <div className="rounded-lg border bg-card p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Tasks</p>
                  <ClipboardList className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold mt-2">{departmentStats?.activeTasks || 0}</p>
                <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">Active tasks</p>
              </div>
              <div className="rounded-lg border bg-card p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">On Vacation</p>
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold mt-2">{departmentStats?.staffOnVacation || 0}</p>
                <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">Today</p>
              </div>
              <div className="rounded-lg border bg-card p-4 sm:p-6 col-span-2 md:col-span-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Training</p>
                  <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold mt-2">{departmentStats?.upcomingTraining || 0}</p>
                <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">Upcoming</p>
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

          {activeTab === 'scheduling' && hasAccess('scheduling') && (
            <ModuleGuard moduleKey="scheduling">
              <SchedulingHub departmentId={userRole.department_id} />
            </ModuleGuard>
          )}

          {activeTab === 'training' && hasAccess('training') && (
            <ModuleGuard moduleKey="training">
              <TrainingHub departmentId={userRole.department_id} />
            </ModuleGuard>
          )}

          {/* Show message if no valid tab content */}
          {!hasAccess('staff_management') && !hasAccess('vacation_planning') && !hasAccess('task_management') && !hasAccess('messaging') && !hasAccess('notifications') && !hasAccess('scheduling') && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No modules available. Contact your administrator.</p>
            </div>
          )}
        </div>
      </>
    </ErrorBoundary>
  );
};

export default DepartmentHeadDashboard;
