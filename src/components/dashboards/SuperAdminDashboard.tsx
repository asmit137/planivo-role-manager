import { PageHeader } from '@/components/layout';
import { StatsCard } from '@/components/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Building2, Calendar, ClipboardList, CheckCircle, XCircle, Clock, TrendingUp, Building, LayoutDashboard, Folders, UserCircle, FolderTree, Settings, Code, CalendarClock, GraduationCap, MessageSquare, Video } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { UserManagement, StaffManagementHub } from '@/modules/user-management';
import { OrganizationHub } from '@/modules/organization';
import { VacationHub } from '@/modules/vacation';
import { ModuleAccessHub } from '@/modules/core';
import { TaskHub } from '@/modules/tasks';
import { NotificationHub } from '@/modules/notifications';
import { MessagingHub } from '@/modules/messaging';
import ModuleSystemValidator from '@/components/admin/ModuleSystemValidator';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useModuleContext } from '@/contexts/ModuleContext';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FacilitySchedulingHub } from '@/components/scheduling';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import TrainingHub from '@/components/training/TrainingHub';
import { AuditLogsDashboard } from '@/components/admin/AuditLogsDashboard';
import { SecurityDashboard } from '@/components/admin/SecurityDashboard';
import { AnalyticsDashboard } from '@/components/admin/AnalyticsDashboard';
import { SystemSettingsHub } from '@/components/admin/SystemSettingsHub';
import { EmailManagement } from '@/components/admin/EmailManagement';
import { RealTimeActivityMonitor } from '@/components/admin/RealTimeActivityMonitor';
import { StaffManagementPage } from '@/components/staff';

const SuperAdminDashboard = () => {
  const { modules, hasAccess } = useModuleContext();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab') || 'dashboard';

  // Real-time subscriptions for live updates
  useRealtimeSubscription({ table: 'workspaces', invalidateQueries: ['workspaces'] });
  useRealtimeSubscription({ table: 'profiles', invalidateQueries: ['totalUsers'] });
  useRealtimeSubscription({ table: 'facilities', invalidateQueries: ['facilities-count'] });
  useRealtimeSubscription({ table: 'departments', invalidateQueries: ['departments-count'] });
  useRealtimeSubscription({ table: 'vacation_plans', invalidateQueries: ['vacation-stats', 'recent-activity'] });
  useRealtimeSubscription({ table: 'tasks', invalidateQueries: ['task-stats', 'recent-activity'] });
  useRealtimeSubscription({ table: 'organizations', invalidateQueries: ['organizations'] });

  const { data: workspaces, isLoading: workspacesLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const { data: organizations } = useQuery({
    queryKey: ['organizations-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('organizations')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: totalUsers } = useQuery({
    queryKey: ['totalUsers'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      if (error) throw error;
      return count || 0;
    },
  });

  const { data: facilities } = useQuery({
    queryKey: ['facilities-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('facilities')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: departments } = useQuery({
    queryKey: ['departments-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('departments')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  // Meetings & Training Stats
  const { data: meetingStats } = useQuery({
    queryKey: ['meeting-stats'],
    queryFn: async () => {
      const [totalMeetings, totalAttendance, upcomingMeetings] = await Promise.all([
        supabase.from('training_events').select('*', { count: 'exact', head: true }),
        supabase.from('training_attendance').select('*', { count: 'exact', head: true }),
        supabase.from('training_events').select('*', { count: 'exact', head: true })
          .eq('status', 'published')
          .gt('start_datetime', new Date().toISOString()),
      ]);
      return {
        totalMeetings: totalMeetings.count || 0,
        totalAttendance: totalAttendance.count || 0,
        upcomingMeetings: upcomingMeetings.count || 0,
      };
    },
  });

  // Messages Stats
  const { data: messageStats } = useQuery({
    queryKey: ['message-stats'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  // Schedules Stats  
  const { data: scheduleStats } = useQuery({
    queryKey: ['schedule-stats'],
    queryFn: async () => {
      const [totalSchedules, publishedSchedules] = await Promise.all([
        supabase.from('schedules').select('*', { count: 'exact', head: true }),
        supabase.from('schedules').select('*', { count: 'exact', head: true }).eq('status', 'published'),
      ]);
      return {
        total: totalSchedules.count || 0,
        published: publishedSchedules.count || 0,
      };
    },
  });

  const { data: vacationStats } = useQuery({
    queryKey: ['vacation-stats'],
    queryFn: async () => {
      const [pending, approved, rejected] = await Promise.all([
        supabase.from('vacation_plans').select('*', { count: 'exact', head: true }).in('status', ['pending_approval', 'department_pending', 'facility_pending', 'workspace_pending']),
        supabase.from('vacation_plans').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
        supabase.from('vacation_plans').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
      ]);
      return {
        pending: pending.count || 0,
        approved: approved.count || 0,
        rejected: rejected.count || 0,
      };
    },
  });

  const { data: taskStats } = useQuery({
    queryKey: ['task-stats'],
    queryFn: async () => {
      const [active, completed] = await Promise.all([
        supabase.from('task_assignments').select('*', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
        supabase.from('task_assignments').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      ]);
      return {
        active: active.count || 0,
        completed: completed.count || 0,
        total: (active.count || 0) + (completed.count || 0),
      };
    },
  });

  const { data: recentActivity } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: async () => {
      const [recentPlans, recentTasks] = await Promise.all([
        supabase
          .from('vacation_plans')
          .select('id, status, created_at, total_days, vacation_types(name)')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('tasks')
          .select('id, title, status, created_at, priority')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      return {
        vacationPlans: recentPlans.data || [],
        tasks: recentTasks.data || [],
      };
    },
  });

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      draft: { label: 'Draft', className: 'bg-warning text-warning-foreground hover:bg-warning' },
      department_pending: { label: 'Dept Pending', className: 'bg-primary text-primary-foreground hover:bg-primary' },
      facility_pending: { label: 'Facility Pending', className: 'bg-primary text-primary-foreground hover:bg-primary' },
      workspace_pending: { label: 'Final Pending', className: 'bg-primary text-primary-foreground hover:bg-primary' },
      approved: { label: 'Approved', className: 'bg-success text-success-foreground hover:bg-success' },
      rejected: { label: 'Rejected', className: 'bg-destructive hover:bg-destructive' },
      active: { label: 'Active', className: 'bg-primary hover:bg-primary' },
      pending_approval: { label: 'Pending', className: 'bg-primary hover:bg-primary' },
      completed: { label: 'Completed', className: 'bg-success hover:bg-success' },
    };
    const config = configs[status] || { label: status, className: 'bg-secondary hover:bg-secondary' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  return (
    <>
      {activeTab === 'dashboard' && (
        <PageHeader
          title="System Overview"
          description="Manage your entire system from one centralized dashboard"
        />
      )}
      {activeTab === 'modules' && (
        <PageHeader
          title="Module Management"
          description="Control system-wide module access and permissions"
        />
      )}
      {activeTab === 'validator' && (
        <PageHeader
          title="System Validator"
          description="Validate module system configuration and integrity"
        />
      )}
      {activeTab === 'organization' && (
        <PageHeader
          title="Organization Management"
          description="Manage workspaces, facilities, and departments"
        />
      )}
      {activeTab === 'users' && (
        <PageHeader
          title="User Management"
          description="Manage system users, roles, and permissions"
        />
      )}
      {activeTab === 'vacation' && (
        <PageHeader
          title="Vacation Management"
          description="Manage vacation types, plans, and approvals"
        />
      )}
      {activeTab === 'tasks' && (
        <PageHeader
          title="Task Management"
          description="Create, assign, and track tasks across the system"
        />
      )}
      {activeTab === 'staff' && (
        <PageHeader
          title="Staff Management"
          description="Manage staff across all departments and facilities"
        />
      )}
      {activeTab === 'messaging' && (
        <PageHeader
          title="Messaging"
        />
      )}
      {activeTab === 'notifications' && (
        <PageHeader
          title="Notifications"
          description="View and manage system notifications"
        />
      )}
      {activeTab === 'scheduling' && (
        <PageHeader
          title="Scheduling"
          description="Manage schedules and shift assignments across facilities"
        />
      )}
      {activeTab === 'training' && (
        <PageHeader
          title="Meeting & Training"
          description="Create and manage meetings and training sessions"
        />
      )}
      {activeTab === 'audit' && (
        <PageHeader
          title="Audit Logs"
          description="View and analyze all system changes and activities"
        />
      )}
      {activeTab === 'security' && (
        <PageHeader
          title="Security Dashboard"
          description="Monitor security events, rate limits, and role distribution"
        />
      )}
      {activeTab === 'analytics' && (
        <PageHeader
          title="Analytics"
          description="System-wide analytics and usage statistics"
        />
      )}
      {activeTab === 'settings' && (
        <PageHeader
          title="System Settings"
          description="Configure global system settings and integrations"
        />
      )}
      {activeTab === 'emails' && (
        <PageHeader
          title="Email & Broadcasts"
          description="Manage notifications and send system announcements"
        />
      )}
      {activeTab === 'activity' && (
        <PageHeader
          title="Live Activity Monitor"
          description="Real-time view of all system events as they happen"
        />
      )}
      {!['dashboard', 'modules', 'validator', 'organization', 'users', 'vacation', 'tasks', 'staff', 'messaging', 'notifications', 'scheduling', 'training', 'audit', 'security', 'analytics', 'settings', 'emails', 'activity'].includes(activeTab) && (
        <PageHeader
          title="System Overview"
          description="Manage your entire system from one centralized dashboard"
        />
      )}

      <div className="space-y-6">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Main Stats Grid */}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4">
              <StatsCard
                title="Organizations"
                value={organizations || 0}
                icon={Building}
              />
              <StatsCard
                title="Workspaces"
                value={workspaces?.length || 0}
                icon={Building2}
                isLoading={workspacesLoading}
              />
              <StatsCard
                title="Total Users"
                value={totalUsers || 0}
                icon={Users}
              />
              <StatsCard
                title="Facilities"
                value={facilities || 0}
                icon={LayoutDashboard}
              />
              <StatsCard
                title="Total Meetings"
                value={meetingStats?.totalMeetings || 0}
                icon={Video}
              />
              <StatsCard
                title="Meeting Attendance"
                value={meetingStats?.totalAttendance || 0}
                icon={GraduationCap}
              />
              <StatsCard
                title="Total Messages"
                value={messageStats || 0}
                icon={MessageSquare}
              />
              <StatsCard
                title="Published Schedules"
                value={scheduleStats?.published || 0}
                icon={CalendarClock}
              />
            </div>

            {/* Vacation & Task Stats */}
            <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Vacation Plans Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Pending Approval</span>
                      </div>
                      <span className="text-2xl font-bold">{vacationStats?.pending || 0}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span className="text-sm font-medium">Approved</span>
                      </div>
                      <span className="text-2xl font-bold text-success">{vacationStats?.approved || 0}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-destructive" />
                        <span className="text-sm font-medium">Rejected</span>
                      </div>
                      <span className="text-2xl font-bold text-destructive">{vacationStats?.rejected || 0}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5" />
                    Tasks Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Active Tasks</span>
                      </div>
                      <span className="text-2xl font-bold">{taskStats?.active || 0}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span className="text-sm font-medium">Completed</span>
                      </div>
                      <span className="text-2xl font-bold text-success">{taskStats?.completed || 0}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Completion Rate</span>
                      <span className="text-2xl font-bold">
                        {taskStats?.total
                          ? Math.round((taskStats.completed / taskStats.total) * 100)
                          : 0}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Vacation Plans</CardTitle>
                  <CardDescription>Latest 5 vacation plan submissions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recentActivity?.vacationPlans.map((plan: any) => {
                      const isPending = ['pending_approval', 'pending_approvals'].includes(plan.status);
                      return (
                        <div
                          key={plan.id}
                          className={`flex items-center justify-between p-3 rounded-lg transition-colors bg-secondary`}
                        >
                          <div>
                            <p className={`text-sm font-medium`}>
                              {plan.vacation_types?.name || 'Unknown Type'}
                            </p>
                            <p className={'text-xs text-muted-foreground'}>
                              {plan.total_days} days • {format(new Date(plan.created_at), 'MMM d, yyyy')}
                            </p>
                          </div>
                          {getStatusBadge(plan.status)}
                        </div>
                      );
                    })}
                    {recentActivity?.vacationPlans.length === 0 && (
                      <p className="text-center text-muted-foreground py-4">No recent vacation plans</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Tasks</CardTitle>
                  <CardDescription>Latest 5 tasks created</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recentActivity?.tasks.map((task: any) => (
                      <div key={task.id} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{task.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {task.priority} priority • {format(new Date(task.created_at), 'MMM d, yyyy')}
                          </p>
                        </div>
                        {getStatusBadge(task.status)}
                      </div>
                    ))}
                    {recentActivity?.tasks.length === 0 && (
                      <p className="text-center text-muted-foreground py-4">No recent tasks</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'modules' && (
          <ModuleGuard moduleKey="core">
            <ModuleAccessHub />
          </ModuleGuard>
        )}

        {activeTab === 'validator' && (
          <ModuleGuard moduleKey="core">
            <ModuleSystemValidator />
          </ModuleGuard>
        )}

        {activeTab === 'organization' && hasAccess('organization') && (
          <ModuleGuard moduleKey="organization">
            <OrganizationHub />
          </ModuleGuard>
        )}

        {activeTab === 'users' && hasAccess('user_management') && (
          <ModuleGuard moduleKey="user_management">
            <UserManagement />
          </ModuleGuard>
        )}

        {activeTab === 'vacation' && hasAccess('vacation_planning') && (
          <ModuleGuard moduleKey="vacation_planning">
            <VacationHub />
          </ModuleGuard>
        )}

        {activeTab === 'tasks' && hasAccess('task_management') && (
          <ModuleGuard moduleKey="task_management">
            <TaskHub />
          </ModuleGuard>
        )}

        {activeTab === 'staff' && hasAccess('staff_management') && (
          <ModuleGuard moduleKey="staff_management">
            <StaffManagementPage />
          </ModuleGuard>
        )}

        {activeTab === 'notifications' && hasAccess('notifications') && (
          <ModuleGuard moduleKey="notifications">
            <NotificationHub />
          </ModuleGuard>
        )}

        {activeTab === 'messaging' && hasAccess('messaging') && (
          <ModuleGuard moduleKey="messaging">
            <MessagingHub />
          </ModuleGuard>
        )}

        {activeTab === 'scheduling' && (
          <ModuleGuard moduleKey="scheduling">
            <FacilitySchedulingHub />
          </ModuleGuard>
        )}

        {activeTab === 'training' && hasAccess('training') && (
          <ModuleGuard moduleKey="training">
            <TrainingHub />
          </ModuleGuard>
        )}

        {activeTab === 'audit' && (
          <AuditLogsDashboard />
        )}

        {activeTab === 'security' && (
          <SecurityDashboard />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsDashboard />
        )}

        {activeTab === 'settings' && (
          <SystemSettingsHub />
        )}

        {activeTab === 'emails' && (
          <EmailManagement />
        )}

        {activeTab === 'activity' && (
          <RealTimeActivityMonitor />
        )}
      </div>
    </>
  );
};

export default SuperAdminDashboard;
