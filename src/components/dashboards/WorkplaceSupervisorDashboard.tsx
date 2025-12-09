import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { PageHeader, LoadingState } from '@/components/layout';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorState } from '@/components/layout/ErrorState';
import TaskManager from '@/components/tasks/TaskManager';
import VacationApprovalWorkflow from '@/components/vacation/VacationApprovalWorkflow';
import VacationCalendarView from '@/components/vacation/VacationCalendarView';
import { VacationHub } from '@/modules/vacation';
import TrainingHub from '@/components/training/TrainingHub';
import { ClipboardList, CheckSquare, AlertCircle, GraduationCap, Calendar, CalendarClock } from 'lucide-react';
import VacationConflictDashboard from '@/components/vacation/VacationConflictDashboard';
import { UnifiedUserHub } from '@/components/users';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useModuleContext } from '@/contexts/ModuleContext';
import { useLocation } from 'react-router-dom';
import { NotificationHub } from '@/modules/notifications';
import { MessagingHub } from '@/modules/messaging';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

const WorkplaceSupervisorDashboard = () => {
  const { user } = useAuth();
  const { hasAccess } = useModuleContext();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab');

  // Real-time subscriptions for live updates
  useRealtimeSubscription({ table: 'tasks', invalidateQueries: ['workspace-tasks-count'] });
  useRealtimeSubscription({ table: 'vacation_plans', invalidateQueries: ['workspace-approvals-count'] });
  useRealtimeSubscription({ table: 'vacation_approvals', invalidateQueries: ['workspace-conflicts-count'] });

  const { data: userRole } = useQuery({
    queryKey: ['workplace-supervisor-role', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user?.id)
        .eq('role', 'workplace_supervisor')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch workspace stats
  const { data: stats } = useQuery({
    queryKey: ['workspace-supervisor-stats', userRole?.workspace_id],
    queryFn: async () => {
      if (!userRole?.workspace_id) return null;

      const today = new Date().toISOString().split('T')[0];

      const [tasksCount, approvalsCount, conflictsCount, staffOnVacation, publishedSchedules] = await Promise.all([
        supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', userRole.workspace_id)
          .eq('status', 'active'),
        supabase
          .from('vacation_plans')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'workspace_pending'),
        supabase
          .from('vacation_approvals')
          .select('*', { count: 'exact', head: true })
          .eq('has_conflict', true)
          .in('status', ['pending', 'approved']),
        supabase
          .from('vacation_splits')
          .select('id, vacation_plans!inner(status)', { count: 'exact', head: true })
          .lte('start_date', today)
          .gte('end_date', today)
          .eq('vacation_plans.status', 'approved'),
        supabase
          .from('schedules')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', userRole.workspace_id)
          .eq('status', 'published'),
      ]);

      return {
        activeTasks: tasksCount.count || 0,
        pendingApprovals: approvalsCount.count || 0,
        conflicts: conflictsCount.count || 0,
        staffOnVacation: staffOnVacation.count || 0,
        publishedSchedules: publishedSchedules.count || 0,
      };
    },
    enabled: !!userRole?.workspace_id,
  });

  if (!userRole?.workspace_id) {
    return <LoadingState message="Loading workspace information..." />;
  }

  return (
    <ErrorBoundary
      fallback={
        <ErrorState
          title="Dashboard Error"
          message="Failed to load workplace supervisor dashboard"
          onRetry={() => window.location.reload()}
        />
      }
    >
      <>
      {!activeTab && (
        <PageHeader 
          title="Workspace Overview" 
          description="Manage tasks and vacation planning for the workspace"
        />
      )}
      {activeTab === 'tasks' && (
        <PageHeader 
          title="Workspace Tasks" 
          description="Manage and assign tasks across the workspace"
        />
      )}
      {activeTab === 'approvals' && (
        <PageHeader 
          title="Final Vacation Approvals" 
          description="Review and approve vacation plans at the workspace level"
        />
      )}
      {activeTab === 'conflicts' && (
        <PageHeader 
          title="Vacation Conflicts" 
          description="View and resolve vacation scheduling conflicts"
        />
      )}
      {activeTab === 'calendar' && (
        <PageHeader 
          title="Vacation Calendar" 
          description="View vacation schedules in calendar format"
        />
      )}
      {activeTab === 'vacation' && (
        <PageHeader 
          title="Vacation Planning" 
          description="Manage vacation planning for the workspace"
        />
      )}
      {activeTab === 'staff' && (
        <PageHeader 
          title="Staff Management" 
          description="Manage staff members across the workspace"
        />
      )}
      {activeTab === 'messaging' && (
        <PageHeader 
          title="Messaging" 
          description="Communicate with staff across this workspace"
        />
      )}
      {activeTab === 'notifications' && (
        <PageHeader 
          title="Notifications" 
          description="View important updates for this workspace"
        />
      )}
      
      <div className="space-y-4">
        {!activeTab && (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-lg border bg-card p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground">Active Tasks</p>
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl sm:text-3xl font-bold mt-2">{stats?.activeTasks ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">Workspace tasks</p>
            </div>
            <div className="rounded-lg border bg-card p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground">Pending Approvals</p>
                <CheckSquare className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl sm:text-3xl font-bold mt-2">{stats?.pendingApprovals ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">Awaiting final approval</p>
            </div>
            <div className="rounded-lg border bg-card p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground">Conflicts</p>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl sm:text-3xl font-bold mt-2">{stats?.conflicts ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">Vacation conflicts</p>
            </div>
            <div className="rounded-lg border bg-card p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground">On Vacation Today</p>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl sm:text-3xl font-bold mt-2">{stats?.staffOnVacation ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">Staff currently off</p>
            </div>
            <div className="rounded-lg border bg-card p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground">Active Schedules</p>
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl sm:text-3xl font-bold mt-2">{stats?.publishedSchedules ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">Published schedules</p>
            </div>
          </div>
        )}

        {activeTab === 'tasks' && hasAccess('task_management') && (
          <ModuleGuard moduleKey="task_management">
            <TaskManager scopeType="workspace" scopeId={userRole.workspace_id} />
          </ModuleGuard>
        )}

        {activeTab === 'approvals' && hasAccess('vacation_planning') && (
          <ModuleGuard moduleKey="vacation_planning">
            <VacationApprovalWorkflow 
              approvalLevel={3} 
              scopeType="workspace" 
              scopeId={userRole.workspace_id} 
            />
          </ModuleGuard>
        )}

        {activeTab === 'conflicts' && hasAccess('vacation_planning') && (
          <ModuleGuard moduleKey="vacation_planning">
            <VacationConflictDashboard scopeType="workspace" scopeId={userRole.workspace_id} />
          </ModuleGuard>
        )}

        {activeTab === 'calendar' && hasAccess('vacation_planning') && (
          <ModuleGuard moduleKey="vacation_planning">
            <VacationCalendarView />
          </ModuleGuard>
        )}

        {activeTab === 'vacation' && hasAccess('vacation_planning') && (
          <ModuleGuard moduleKey="vacation_planning">
            <VacationHub />
          </ModuleGuard>
        )}

        {activeTab === 'staff' && hasAccess('staff_management') && (
          <ModuleGuard moduleKey="staff_management">
            <UnifiedUserHub scope="workspace" scopeId={userRole.workspace_id} />
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

export default WorkplaceSupervisorDashboard;
