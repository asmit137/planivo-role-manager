import { PageHeader } from '@/components/layout';
import { StatsCard } from '@/components/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Building2, Calendar, ClipboardList, CheckCircle, XCircle, Clock, TrendingUp, Building, LayoutDashboard, Folders, UserCircle, FolderTree, Settings, Code, CalendarClock } from 'lucide-react';
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
import { SourceCodeHub } from '@/components/admin/SourceCodeHub';
import { FacilitySchedulingHub } from '@/components/scheduling';

const SuperAdminDashboard = () => {
  const { modules, hasAccess } = useModuleContext();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab') || 'dashboard';
  
  const { data: workspaces, isLoading: workspacesLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .order('created_at', { ascending: false});
      
      if (error) throw error;
      return data;
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

  const { data: vacationStats } = useQuery({
    queryKey: ['vacation-stats'],
    queryFn: async () => {
      const [pending, approved, rejected] = await Promise.all([
        supabase.from('vacation_plans').select('*', { count: 'exact', head: true }).in('status', ['department_pending', 'facility_pending', 'workspace_pending']),
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
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
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
      draft: { label: 'Draft', className: 'bg-warning text-warning-foreground' },
      department_pending: { label: 'Dept Pending', className: 'bg-primary text-primary-foreground' },
      facility_pending: { label: 'Facility Pending', className: 'bg-primary text-primary-foreground' },
      workspace_pending: { label: 'Final Pending', className: 'bg-primary text-primary-foreground' },
      approved: { label: 'Approved', className: 'bg-success text-success-foreground' },
      rejected: { label: 'Rejected', className: 'bg-destructive' },
      active: { label: 'Active', className: 'bg-primary' },
      completed: { label: 'Completed', className: 'bg-success' },
    };
    const config = configs[status] || { label: status, className: 'bg-secondary' };
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
          description="Communicate with colleagues across your workspaces"
        />
      )}
      {activeTab === 'notifications' && (
        <PageHeader 
          title="Notifications" 
          description="View and manage system notifications"
        />
      )}
      {activeTab === 'source-code' && (
        <PageHeader 
          title="Source Code" 
          description="View project structure and access source code"
        />
      )}
      {activeTab === 'scheduling' && (
        <PageHeader 
          title="Scheduling" 
          description="Manage schedules and shift assignments across facilities"
        />
      )}
      {!['dashboard','modules','validator','organization','users','vacation','tasks','staff','messaging','notifications','source-code','scheduling'].includes(activeTab) && (
        <PageHeader 
          title="System Overview" 
          description="Manage your entire system from one centralized dashboard"
        />
      )}
      
      <div className="space-y-6">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
          {/* Main Stats Grid */}
          <div className="grid gap-6 md:grid-cols-4">
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
              icon={Building}
            />
            <StatsCard
              title="Departments"
              value={departments || 0}
              icon={FolderTree}
            />
          </div>

          {/* Vacation & Task Stats */}
          <div className="grid gap-6 md:grid-cols-2">
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
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent Vacation Plans</CardTitle>
                <CardDescription>Latest 5 vacation plan submissions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentActivity?.vacationPlans.map((plan: any) => (
                    <div key={plan.id} className="flex items-center justify-between p-3 bg-accent rounded-lg">
                      <div>
                        <p className="text-sm font-medium">{plan.vacation_types?.name || 'Unknown Type'}</p>
                        <p className="text-xs text-muted-foreground">
                          {plan.total_days} days • {format(new Date(plan.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                      {getStatusBadge(plan.status)}
                    </div>
                  ))}
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
                    <div key={task.id} className="flex items-center justify-between p-3 bg-accent rounded-lg">
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
            <Card className="border-2">
              <CardHeader>
                <CardTitle>Staff Management</CardTitle>
                <CardDescription>
                  Staff management is handled through the User Management section
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground mb-4">
                    As Super Admin, you can manage all users including staff members through the User Management tab.
                  </p>
                  <Button 
                    onClick={() => window.location.href = '/dashboard?tab=users'}
                    className="bg-gradient-primary"
                  >
                    Go to User Management
                  </Button>
                </div>
              </CardContent>
            </Card>
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
        {activeTab === 'source-code' && (
          <SourceCodeHub />
        )}

        {activeTab === 'scheduling' && (
          <ModuleGuard moduleKey="scheduling">
            <FacilitySchedulingHub />
          </ModuleGuard>
        )}
      </div>
    </>
  );
};

export default SuperAdminDashboard;
