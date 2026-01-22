import { useEffect } from 'react';
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
import { ModuleGuard } from '@/components/ModuleGuard';
import { useModuleContext } from '@/contexts/ModuleContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { StatsCard } from '@/components/shared';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import {
  Calendar,
  ClipboardList,
  UserPlus,
  Bell,
  MessageSquare,
  CalendarClock,
  GraduationCap,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react';

const DepartmentHeadDashboard = () => {
  const { user } = useAuth();
  const { hasAccess } = useModuleContext();
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab');

  // Real-time subscriptions for live updates
  useRealtimeSubscription({ table: 'user_roles', invalidateQueries: ['department-stats', 'staff-count'] });
  useRealtimeSubscription({ table: 'vacation_plans', invalidateQueries: ['department-stats', 'pending-vacations', 'department-vacations-dashboard'] });
  useRealtimeSubscription({ table: 'tasks', invalidateQueries: ['department-stats', 'active-tasks', 'department-tasks-dashboard'] });
  useRealtimeSubscription({ table: 'task_assignments', invalidateQueries: ['department-stats'] });
  useRealtimeSubscription({ table: 'schedules', invalidateQueries: ['department-stats', 'schedules'] });
  useRealtimeSubscription({ table: 'shift_assignments', invalidateQueries: ['department-stats', 'shift-assignments'] });

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
  const { data: departmentStats, refetch: refetchStats } = useQuery({
    queryKey: ['department-stats', userRole?.department_id],
    queryFn: async () => {
      if (!userRole?.department_id) return null;

      const today = new Date().toISOString().split('T')[0];

      // Get all staff IDs in this department to include tasks assigned to them
      const { data: departmentStaff } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('department_id', userRole.department_id);

      const staffIds = departmentStaff?.map(s => s.user_id) || [];
      const allTargetUserIds = [...new Set([...staffIds, user?.id])].filter(Boolean);

      // Get task IDs assigned to these users
      const { data: assignedTasks } = await supabase
        .from('task_assignments')
        .select('task_id')
        .in('assigned_to', allTargetUserIds);

      const assignedTaskIds = assignedTasks?.map(at => at.task_id) || [];
      const taskIdsFilter = assignedTaskIds.length > 0 ? assignedTaskIds.join(',') : '00000000-0000-0000-0000-000000000000';

      const { data: allActiveTasks, error: taskError } = await supabase
        .from('tasks')
        .select('id, status, due_date')
        .or(`department_id.eq.${userRole.department_id},id.in.(${taskIdsFilter})`);

      if (taskError) console.error('Error fetching tasks for stats:', taskError);

      let activeCount = 0;
      let completedCount = 0;
      let overdueCount = 0;

      (allActiveTasks || []).forEach(task => {
        if (task.status === 'completed') {
          completedCount++;
        } else {
          activeCount++;
          if (task.due_date && task.due_date < today) {
            overdueCount++;
          }
        }
      });

      // Counts for other modules
      const [
        staffCount,
        pendingVacations,
        approvedVacations,
        deniedVacations,
        publishedSchedules,
        draftSchedules,
        archivedSchedules,
        staffOnVacation,
        upcomingTraining,
        completedTraining
      ] = await Promise.all([
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
          .from('vacation_plans')
          .select('*', { count: 'exact', head: true })
          .eq('department_id', userRole.department_id)
          .eq('status', 'approved'),
        supabase
          .from('vacation_plans')
          .select('*', { count: 'exact', head: true })
          .eq('department_id', userRole.department_id)
          .eq('status', 'denied'),
        supabase
          .from('schedules')
          .select('*', { count: 'exact', head: true })
          .eq('department_id', userRole.department_id)
          .eq('status', 'published'),
        supabase
          .from('schedules')
          .select('*', { count: 'exact', head: true })
          .eq('department_id', userRole.department_id)
          .eq('status', 'draft'),
        supabase
          .from('schedules')
          .select('*', { count: 'exact', head: true })
          .eq('department_id', userRole.department_id)
          .eq('status', 'archived'),
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
          .eq('organization_id', (userRole as any).organization_id)
          .gt('start_datetime', new Date().toISOString()),
        supabase
          .from('training_events')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'published')
          .lt('end_datetime', new Date().toISOString()),
      ]);

      return {
        staffCount: staffCount.count || 0,
        pendingVacations: pendingVacations.count || 0,
        approvedVacations: approvedVacations.count || 0,
        deniedVacations: deniedVacations.count || 0,
        activeTasks: activeCount,
        completedTasks: completedCount,
        overdueTasks: overdueCount,
        publishedSchedules: publishedSchedules.count || 0,
        draftSchedules: draftSchedules.count || 0,
        archivedSchedules: archivedSchedules.count || 0,
        staffOnVacation: staffOnVacation.count || 0,
        upcomingTraining: upcomingTraining.count || 0,
        completedTraining: completedTraining.count || 0,
      };
    },
    enabled: !!userRole?.department_id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
  });

  // Fetch Department Upcoming Meetings/Training (Next 5)
  const { data: departmentMeetings, isLoading: meetingsLoading, refetch: refetchMeetings } = useQuery({
    queryKey: ['department-meetings-dashboard', userRole?.department_id],
    queryFn: async () => {
      // Fetch targeted event IDs
      const { data: targetEvents } = await supabase
        .from('training_event_targets')
        .select('event_id')
        .eq('department_id', userRole.department_id)
        .eq('target_type', 'department');

      const eventIds = targetEvents?.map(te => te.event_id) || [];
      const targetedIdsString = eventIds.length > 0 ? eventIds.join(',') : '00000000-0000-0000-0000-000000000000';

      const { data, error } = await supabase
        .from('training_events')
        .select('id, title, start_datetime, end_datetime, location_type')
        .eq('status', 'published')
        .eq('organization_id', (userRole as any).organization_id)
        .gt('start_datetime', new Date().toISOString())
        .or(`id.in.(${targetedIdsString}),created_by.eq.${user?.id},responsible_user_id.eq.${user?.id},registration_type.eq.open`)
        .order('start_datetime', { ascending: true })
        .limit(5);

      if (error) throw error;
      return data;
    },
    enabled: !!userRole?.department_id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Fetch Department Recent Vacation Plans (Next 5)
  const { data: recentVacations, isLoading: vacationsLoading, refetch: refetchVacations } = useQuery({
    queryKey: ['department-vacations-dashboard', userRole?.department_id],
    queryFn: async () => {
      if (!userRole?.department_id) return [];
      const { data, error } = await supabase
        .from('vacation_plans')
        .select(`
          id, status, submitted_at, staff_id,
          profiles:staff_id(full_name)
        `)
        .eq('department_id', userRole.department_id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
    enabled: !!userRole?.department_id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Fetch Department Recent Tasks (Next 5)
  const { data: departmentTasks, isLoading: tasksLoading, refetch: refetchTasks } = useQuery({
    queryKey: ['department-tasks-dashboard', userRole?.department_id],
    queryFn: async () => {
      if (!userRole?.department_id) return [];

      // Get all staff IDs in this department to include tasks assigned to them
      const { data: departmentStaff } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('department_id', userRole.department_id);

      const staffIds = departmentStaff?.map(s => s.user_id) || [];
      const allTargetUserIds = [...new Set([...staffIds, user?.id])].filter(Boolean);

      // Get task IDs assigned to these users
      const { data: assignedTasks } = await supabase
        .from('task_assignments')
        .select('task_id')
        .in('assigned_to', allTargetUserIds);

      const assignedTaskIds = assignedTasks?.map(at => at.task_id) || [];
      const taskIdsFilter = assignedTaskIds.length > 0 ? assignedTaskIds.join(',') : '00000000-0000-0000-0000-000000000000';

      const { data, error } = await supabase
        .from('tasks')
        .select(`
          id, title, due_date, priority, status,
          task_assignments(profiles(full_name))
        `)
        .or(`department_id.eq.${userRole.department_id},id.in.(${taskIdsFilter})`)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
    enabled: !!userRole?.department_id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Fetch Department Recent Schedules (Next 5)
  const { data: recentSchedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['department-schedules-dashboard', userRole?.department_id],
    queryFn: async () => {
      if (!userRole?.department_id) return [];
      const { data, error } = await supabase
        .from('schedules')
        .select(`
          id, name, status, start_date, end_date
        `)
        .eq('department_id', userRole.department_id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
    enabled: !!userRole?.department_id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Re-fetch data when user clicks back to Dashboard (no active tab)
  useEffect(() => {
    if (!activeTab) {
      refetchStats();
      refetchMeetings();
      refetchVacations();
      refetchTasks();
    }
  }, [activeTab, refetchStats, refetchMeetings, refetchVacations, refetchTasks]);

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

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      draft: { label: 'Draft', className: 'bg-warning text-warning-foreground hover:bg-warning' },
      department_pending: { label: 'Dept Pending', className: 'bg-primary text-primary-foreground hover:bg-primary' },
      facility_pending: { label: 'Facility Pending', className: 'bg-primary text-primary-foreground hover:bg-primary' },
      workspace_pending: { label: 'Final Pending', className: 'bg-primary text-primary-foreground hover:bg-primary' },
      approved: { label: 'Approved', className: 'bg-success text-success-foreground hover:bg-success' },
      rejected: { label: 'Rejected', className: 'bg-destructive hover:bg-destructive' },
      denied: { label: 'Denied', className: 'bg-destructive hover:bg-destructive' },
      active: { label: 'Active', className: 'bg-primary hover:bg-primary' },
      pending_approval: { label: 'Pending', className: 'bg-primary hover:bg-primary' },
      completed: { label: 'Completed', className: 'bg-success hover:bg-success' },
      overdue: { label: 'Overdue', className: 'bg-destructive hover:bg-destructive' },
      published: { label: 'Published', className: 'bg-success text-success-foreground hover:bg-success' },
    };
    const config = configs[status] || { label: status, className: 'bg-secondary hover:bg-secondary' };
    return <Badge className={`text-[10px] px-1.5 h-5 ${config.className}`}>{config.label}</Badge>;
  };

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
      <div className="space-y-6">
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

        {!['staff', 'vacation', 'tasks', 'messaging', 'notifications', 'scheduling', 'training'].includes(activeTab || '') && (
          <>
            {/* Main Stats Grid */}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
              <StatsCard
                title="Total Staff"
                value={departmentStats?.staffCount || 0}
                icon={UserPlus}
                description="Active in department"
              />
              <StatsCard
                title="On Vacation"
                value={departmentStats?.staffOnVacation || 0}
                icon={Calendar}
                description="Away today"
              />
              <StatsCard
                title="Training"
                value={departmentStats?.upcomingTraining || 0}
                icon={GraduationCap}
                description="Upcoming events"
              />
              <StatsCard
                title="Active Tasks"
                value={departmentStats?.activeTasks || 0}
                icon={ClipboardList}
                description="To be completed"
              />
              <StatsCard
                title="Schedules"
                value={departmentStats?.publishedSchedules || 0}
                icon={CalendarClock}
                description="Published this month"
              />
            </div>

            {/* Vacation & Task Stats Overview */}
            <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2">
              {/* Vacation Overview Card */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      Vacation Plans
                    </CardTitle>
                    <button
                      onClick={() => navigate('/dashboard?tab=vacation')}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      View All
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle className="h-4 w-4 text-success" />
                      Approved
                    </div>
                    <span className="text-xl font-bold">{departmentStats?.approvedVacations || 0}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Clock className="h-4 w-4 text-warning" />
                      Pending
                    </div>
                    <span className="text-xl font-bold">{departmentStats?.pendingVacations || 0}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <XCircle className="h-4 w-4 text-destructive" />
                      Denied
                    </div>
                    <span className="text-xl font-bold">{departmentStats?.deniedVacations || 0}</span>
                  </div>

                  <div className="pt-2 space-y-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Recent Requests</p>
                    <div className="space-y-2">
                      {vacationsLoading ? (
                        <div className="text-xs text-muted-foreground italic">Loading...</div>
                      ) : recentVacations?.length === 0 ? (
                        <div className="text-xs text-muted-foreground italic">No recent requests</div>
                      ) : (
                        recentVacations?.map((v: any) => (
                          <div key={v.id} className="flex items-center justify-between p-2 rounded-md bg-secondary transition-colors">
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-medium truncate">{v.profiles?.full_name}</span>
                              <span className="text-[9px] text-muted-foreground">
                                {new Date(v.submitted_at || '').toLocaleDateString()}
                              </span>
                            </div>
                            {getStatusBadge(v.status)}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tasks Overview Card */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      <ClipboardList className="h-5 w-5 text-primary" />
                      Tasks Overview
                    </CardTitle>
                    <button
                      onClick={() => navigate('/dashboard?tab=tasks')}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      View All
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      Active
                    </div>
                    <span className="text-xl font-bold">{departmentStats?.activeTasks || 0}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle className="h-4 w-4 text-success" />
                      Done
                    </div>
                    <span className="text-xl font-bold">{departmentStats?.completedTasks || 0}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <XCircle className="h-4 w-4 text-destructive" />
                      Overdue
                    </div>
                    <span className="text-xl font-bold">{departmentStats?.overdueTasks || 0}</span>
                  </div>

                  <div className="pt-2 space-y-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Recently Added</p>
                    <div className="space-y-2">
                      {tasksLoading ? (
                        <div className="text-xs text-muted-foreground italic">Loading...</div>
                      ) : departmentTasks?.length === 0 ? (
                        <div className="text-xs text-muted-foreground italic">No tasks found</div>
                      ) : (
                        departmentTasks?.map((t: any) => (
                          <div key={t.id} className="flex items-center justify-between p-2 rounded-md bg-secondary transition-colors">
                            <div className="flex flex-col min-w-0 flex-1 mr-2">
                              <span className="text-xs font-medium truncate">{t.title}</span>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className={`text-[9px] font-bold ${t.priority === 'high' ? 'text-destructive' : t.priority === 'medium' ? 'text-warning' : 'text-primary'} uppercase`}>
                                  {t.priority} priority
                                </span>
                                {t.task_assignments && t.task_assignments.length > 0 && (
                                  <>
                                    <span className="text-[9px] text-muted-foreground">•</span>
                                    <span className="text-[9px] text-muted-foreground truncate max-w-[100px]">
                                      {t.task_assignments.map((ta: any) => ta.profiles?.full_name).join(', ')}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end shrink-0">
                              {getStatusBadge(t.status)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Schedules Overview Card */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      <CalendarClock className="h-5 w-5 text-primary" />
                      Schedules
                    </CardTitle>
                    <button
                      onClick={() => navigate('/dashboard?tab=scheduling')}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      View All
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle className="h-4 w-4 text-success" />
                      Published
                    </div>
                    <span className="text-xl font-bold">{departmentStats?.publishedSchedules || 0}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Clock className="h-4 w-4 text-warning" />
                      Drafts
                    </div>
                    <span className="text-xl font-bold">{departmentStats?.draftSchedules || 0}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      Archived
                    </div>
                    <span className="text-xl font-bold">{departmentStats?.archivedSchedules || 0}</span>
                  </div>

                  <div className="pt-2 space-y-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Recent Schedules</p>
                    <div className="space-y-2">
                      {schedulesLoading ? (
                        <div className="text-xs text-muted-foreground italic">Loading...</div>
                      ) : recentSchedules?.length === 0 ? (
                        <div className="text-xs text-muted-foreground italic">No schedules found</div>
                      ) : (
                        recentSchedules?.map((s: any) => (
                          <div key={s.id} className="flex items-center justify-between p-2 rounded-md bg-secondary transition-colors">
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-medium truncate">{s.name}</span>
                              <span className="text-[9px] text-muted-foreground">
                                {new Date(s.start_date).toLocaleDateString()} - {new Date(s.end_date).toLocaleDateString()}
                              </span>
                            </div>
                            {getStatusBadge(s.status)}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Meetings & Training Overview Card */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      <GraduationCap className="h-5 w-5 text-primary" />
                      Meetings & Training
                    </CardTitle>
                    <button
                      onClick={() => navigate('/dashboard?tab=training')}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      View All
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Bell className="h-4 w-4 text-primary" />
                      Upcoming
                    </div>
                    <span className="text-xl font-bold">{departmentStats?.upcomingTraining || 0}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle className="h-4 w-4 text-success" />
                      Completed
                    </div>
                    <span className="text-xl font-bold">{departmentStats?.completedTraining || 0}</span>
                  </div>

                  <div className="pt-2 space-y-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Upcoming Events</p>
                    <div className="space-y-2">
                      {meetingsLoading ? (
                        <div className="text-xs text-muted-foreground italic">Loading...</div>
                      ) : departmentMeetings?.length === 0 ? (
                        <div className="text-xs text-muted-foreground italic">No upcoming events</div>
                      ) : (
                        departmentMeetings?.map((m: any) => (
                          <div key={m.id} className="flex items-center justify-between p-2 rounded-md bg-secondary transition-colors">
                            <div className="flex flex-col min-w-0 flex-1 mr-2">
                              <span className="text-xs font-medium truncate">{m.title}</span>
                              <span className="text-[9px] text-muted-foreground">
                                {new Date(m.start_datetime).toLocaleDateString()} at {new Date(m.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className="flex flex-col items-end shrink-0">
                              <Badge variant="outline" className="text-[9px] h-4">
                                {m.location_type === 'online' ? 'Online' : 'In-person'}
                              </Badge>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

          </>
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
    </ErrorBoundary>
  );
};

export default DepartmentHeadDashboard;
