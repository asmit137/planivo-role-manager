import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/layout';
import StaffTaskView from '@/components/tasks/StaffTaskView';
import { VacationHub } from '@/modules/vacation';
import { NotificationHub } from '@/modules/notifications';
import { MessagingHub } from '@/modules/messaging';
import { SchedulingHub } from '@/components/scheduling';
import TrainingHub from '@/components/training/TrainingHub';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useModuleContext } from '@/contexts/ModuleContext';
import { useLocation } from 'react-router-dom';
import { ClipboardList, Calendar, CalendarClock, Bell } from 'lucide-react';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorState } from '@/components/layout/ErrorState';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

const StaffDashboard = () => {
  const { user } = useAuth();
  const { hasAccess } = useModuleContext();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab');

  // Real-time subscriptions for live updates
  useRealtimeSubscription({ table: 'task_assignments', invalidateQueries: ['my-tasks', 'staff-stats'] });
  useRealtimeSubscription({ table: 'vacation_plans', invalidateQueries: ['my-vacation', 'staff-stats'] });
  useRealtimeSubscription({ table: 'shift_assignments', invalidateQueries: ['my-schedule'] });
  useRealtimeSubscription({ table: 'notifications', invalidateQueries: ['notifications'] });

  const { data: stats } = useQuery({
    queryKey: ['staff-stats', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const today = new Date().toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const [myTasks, myVacations, myUpcomingShifts, unreadMessages, userRole] = await Promise.all([
        supabase
          .from('task_assignments')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_to', user.id)
          .eq('status', 'pending'),
        supabase
          .from('vacation_plans')
          .select('id', { count: 'exact', head: true })
          .eq('staff_id', user.id)
          .neq('status', 'rejected'),
        supabase
          .from('shift_assignments')
          .select('id', { count: 'exact', head: true })
          .eq('staff_id', user.id)
          .gte('assignment_date', today)
          .lte('assignment_date', nextWeek),
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false),
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'super_admin')
          .maybeSingle(),
      ]);

      return {
        myTasks: myTasks.count || 0,
        myVacations: myVacations.count || 0,
        upcomingShifts: myUpcomingShifts.count || 0,
        unreadMessages: unreadMessages.count || 0,
        isSuperAdmin: !!userRole?.data,
      };
    },
    enabled: !!user?.id,
  });

  return (
    <ErrorBoundary
      fallback={
        <ErrorState
          title="Dashboard Error"
          message="Failed to load staff dashboard"
          onRetry={() => window.location.reload()}
        />
      }
    >
      <>
        {!activeTab && (
          <PageHeader
            title="My Dashboard"
            description="View your tasks and manage your vacation"
          />
        )}
        {activeTab === 'tasks' && (
          <PageHeader
            title={stats?.isSuperAdmin ? "Global Task Progress" : "My Tasks"}
            description={stats?.isSuperAdmin ? "View progress of all assigned tasks" : "View and complete your assigned tasks"}
          />
        )}
        {activeTab === 'vacation' && (
          <PageHeader
            title="My Vacation"
            description="Plan and manage your vacation requests"
          />
        )}
        {activeTab === 'messaging' && (
          <PageHeader
            title="Messaging"
            description="Chat with your colleagues"
          />
        )}
        {activeTab === 'notifications' && (
          <PageHeader
            title="Notifications"
            description="View your personal notifications"
          />
        )}
        {activeTab === 'scheduling' && (
          <PageHeader
            title="My Schedule"
            description="View your assigned shifts and work schedule"
          />
        )}
        {activeTab === 'training' && (
          <PageHeader
            title="Meeting & Training"
            description="View and register for meetings and training sessions"
          />
        )}

        <div className="space-y-4">
          {!activeTab && (
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border bg-card p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                    {stats?.isSuperAdmin ? "Global Progress" : "Pending Tasks"}
                  </p>
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold mt-2">{stats?.myTasks ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">
                  {stats?.isSuperAdmin ? "All assignments tracking" : "Tasks assigned to you"}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">My Vacation</p>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold mt-2">{stats?.myVacations ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">Active vacation requests</p>
              </div>
              <div className="rounded-lg border bg-card p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Upcoming Shifts</p>
                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold mt-2">{stats?.upcomingShifts ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">Shifts in next 7 days</p>
              </div>
              <div className="rounded-lg border bg-card p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Unread Notifications</p>
                  <Bell className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold mt-2">{stats?.unreadMessages ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">New messages & alerts</p>
              </div>
            </div>
          )}

          {activeTab === 'tasks' && hasAccess('task_management') && (
            <ModuleGuard moduleKey="task_management">
              <StaffTaskView />
            </ModuleGuard>
          )}

          {activeTab === 'vacation' && hasAccess('vacation_planning') && (
            <ModuleGuard moduleKey="vacation_planning">
              <VacationHub />
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
              <SchedulingHub />
            </ModuleGuard>
          )}

          {activeTab === 'training' && hasAccess('training') && (
            <ModuleGuard moduleKey="training">
              <TrainingHub />
            </ModuleGuard>
          )}
        </div>
      </>
    </ErrorBoundary>
  );
};

export default StaffDashboard;
