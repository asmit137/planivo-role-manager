import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { PageHeader, LoadingState } from '@/components/layout';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorState } from '@/components/layout/ErrorState';
import TaskManager from '@/components/tasks/TaskManager';
import StaffTaskView from '@/components/tasks/StaffTaskView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import VacationApprovalWorkflow from '@/components/vacation/VacationApprovalWorkflow';
import VacationCalendarView from '@/components/vacation/VacationCalendarView';
import { VacationHub } from '@/modules/vacation';
import TrainingHub from '@/components/training/TrainingHub';
import { ClipboardList, CheckSquare, AlertCircle, CalendarClock, GraduationCap, Calendar, Users } from 'lucide-react';
import VacationConflictDashboard from '@/components/vacation/VacationConflictDashboard';
import { UnifiedUserHub } from '@/components/users';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useModuleContext } from '@/contexts/ModuleContext';
import { useLocation } from 'react-router-dom';
import { NotificationHub } from '@/modules/notifications';
import { MessagingHub } from '@/modules/messaging';
import { FacilitySchedulingHub } from '@/components/scheduling/FacilitySchedulingHub';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import OrganizationFacilitiesView from '@/components/organization/OrganizationFacilitiesView';

const FacilitySupervisorDashboard = () => {
  const { user } = useAuth();
  const { hasAccess } = useModuleContext();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab');

  // Real-time subscriptions for live updates
  useRealtimeSubscription({ table: 'tasks', invalidateQueries: ['facility-tasks'] });
  useRealtimeSubscription({ table: 'vacation_plans', invalidateQueries: ['facility-approvals'] });
  useRealtimeSubscription({ table: 'vacation_approvals', invalidateQueries: ['facility-conflicts'] });
  useRealtimeSubscription({ table: 'schedules', invalidateQueries: ['schedules'] });
  useRealtimeSubscription({ table: 'shifts', invalidateQueries: ['shifts'] });
  useRealtimeSubscription({ table: 'shift_assignments', invalidateQueries: ['shift-assignments'] });

  const { data: userRole } = useQuery({
    queryKey: ['facility-supervisor-role', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user?.id)
        .eq('role', 'facility_supervisor')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: stats } = useQuery({
    queryKey: ['facility-stats', userRole?.facility_id],
    queryFn: async () => {
      if (!userRole?.facility_id) return null;

      const today = new Date().toISOString().split('T')[0];

      const [activeTasks, pendingApprovals, conflicts, activeSchedules, staffOnVacation] = await Promise.all([
        (supabase.from('tasks') as any)
          .select('id', { count: 'exact', head: true })
          .eq('facility_id', userRole.facility_id)
          .eq('status', 'active'),
        (supabase.from('vacation_plans') as any)
          .select('id', { count: 'exact', head: true })
          .eq('facility_id', userRole.facility_id)
          .in('status', ['pending_approval', 'facility_pending']),
        (supabase.from('vacation_approvals') as any)
          .select('id, vacation_plans!inner(facility_id)', { count: 'exact', head: true })
          .eq('has_conflict', true)
          .eq('status', 'approved')
          .eq('vacation_plans.facility_id', userRole.facility_id),
        (supabase.from('schedules') as any)
          .select('id', { count: 'exact', head: true })
          .eq('facility_id', userRole.facility_id)
          .eq('status', 'published'),
        (supabase.from('vacation_splits') as any)
          .select('id, vacation_plans!inner(status, facility_id)', { count: 'exact', head: true })
          .lte('start_date', today)
          .gte('end_date', today)
          .eq('vacation_plans.status', 'approved')
          .eq('vacation_plans.facility_id', userRole.facility_id),
      ]);

      return {
        activeTasks: activeTasks.count || 0,
        pendingApprovals: pendingApprovals.count || 0,
        conflicts: conflicts.count || 0,
        activeSchedules: activeSchedules.count || 0,
        staffOnVacation: staffOnVacation.count || 0,
      };
    },
    enabled: !!userRole?.facility_id,
  });

  if (!userRole?.facility_id) {
    return <LoadingState message="Loading facility information..." />;
  }

  return (
    <ErrorBoundary
      fallback={
        <ErrorState
          title="Dashboard Error"
          message="Failed to load facility supervisor dashboard"
          onRetry={() => window.location.reload()}
        />
      }
    >
      <>
        {!activeTab && (
          <PageHeader
            title="Facility Overview"
            description="Manage tasks and vacation planning for the facility"
          />
        )}
        {activeTab === 'organization' && (
          <PageHeader
            title="Facility Organization"
            description="View organization details for this facility"
          />
        )}
        {activeTab === 'tasks' && (
          <PageHeader
            title="Facility Tasks"
            description="Manage and assign tasks within the facility"
          />
        )}
        {activeTab === 'approvals' && (
          <PageHeader
            title="Vacation Approvals"
            description="Review and approve vacation plans for the facility"
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
            description="Manage vacation planning for the facility"
          />
        )}
        {activeTab === 'staff' && (
          <PageHeader
            title="Staff Management"
            description="Manage staff members in the facility"
          />
        )}
        {activeTab === 'messaging' && (
          <PageHeader
            title="Messaging"
            description="Communicate with staff in this facility"
          />
        )}
        {activeTab === 'notifications' && (
          <PageHeader
            title="Notifications"
            description="View important updates for this facility"
          />
        )}
        {activeTab === 'scheduling' && (
          <PageHeader
            title="Scheduling"
            description="Create and manage staff schedules for your facility"
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
                <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">Facility-wide active tasks</p>
              </div>
              <div className="rounded-lg border bg-card p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Pending Approvals</p>
                  <CheckSquare className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold mt-2">{stats?.pendingApprovals ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">Awaiting your approval</p>
              </div>
              <div className="rounded-lg border bg-card p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Conflicts</p>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold mt-2">{stats?.conflicts ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">Approved with conflicts</p>
              </div>
              <div className="rounded-lg border bg-card p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">Active Schedules</p>
                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold mt-2">{stats?.activeSchedules ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">Published schedules</p>
              </div>
              <div className="rounded-lg border bg-card p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">On Vacation Today</p>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold mt-2">{stats?.staffOnVacation ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">Staff currently off</p>
              </div>
            </div>
          )}

          {activeTab === 'organization' && hasAccess('organization') && (
            <ModuleGuard moduleKey="organization">
              <OrganizationFacilitiesView
                organizationId={(userRole as any).organization_id}
                facilityId={userRole.facility_id}
              />
            </ModuleGuard>
          )}

          {activeTab === 'tasks' && hasAccess('task_management') && (
            <ModuleGuard moduleKey="task_management">
              <Tabs defaultValue="manage" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="manage">Manage Facility Tasks</TabsTrigger>
                  <TabsTrigger value="my-tasks">My Assigned Tasks</TabsTrigger>
                </TabsList>
                <TabsContent value="manage">
                  <TaskManager scopeType="facility" scopeId={userRole.facility_id} />
                </TabsContent>
                <TabsContent value="my-tasks">
                  <StaffTaskView />
                </TabsContent>
              </Tabs>
            </ModuleGuard>
          )}

          {activeTab === 'approvals' && hasAccess('vacation_planning') && (
            <ModuleGuard moduleKey="vacation_planning">
              <VacationApprovalWorkflow
                approvalLevel={2}
                scopeType="facility"
                scopeId={userRole.facility_id}
              />
            </ModuleGuard>
          )}

          {activeTab === 'conflicts' && hasAccess('vacation_planning') && (
            <ModuleGuard moduleKey="vacation_planning">
              <VacationConflictDashboard scopeType="facility" scopeId={userRole.facility_id} />
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
              <UnifiedUserHub scope="facility" scopeId={userRole.facility_id} />
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
              <FacilitySchedulingHub facilityId={userRole.facility_id} />
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

export default FacilitySupervisorDashboard;
