import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Building2, Settings, Plus, Calendar, ClipboardList, CheckCircle, XCircle, Clock, TrendingUp, Building, Briefcase, LayoutDashboard, UserCog, Folders, UserCircle, UsersRound, FolderTree } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import WorkspaceManagement from '@/components/admin/WorkspaceManagement';
import UserManagement from '@/components/admin/UserManagement';
import AccessManagement from '@/components/admin/AccessManagement';
import VacationTypeManagement from '@/components/vacation/VacationTypeManagement';
import FacilityUserManagement from '@/components/admin/FacilityUserManagement';
import DepartmentManagement from '@/components/admin/DepartmentManagement';

const SuperAdminDashboard = () => {
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
        supabase.from('vacation_plans').select('*', { count: 'exact', head: true }).in('status', ['submitted', 'approved_level2']),
        supabase.from('vacation_plans').select('*', { count: 'exact', head: true }).eq('status', 'approved_final'),
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
      draft: { label: 'Draft', className: 'bg-secondary' },
      submitted: { label: 'Pending', className: 'bg-primary' },
      approved_level2: { label: 'L2 Approved', className: 'bg-warning' },
      approved_final: { label: 'Approved', className: 'bg-success' },
      rejected: { label: 'Rejected', className: 'bg-destructive' },
      active: { label: 'Active', className: 'bg-primary' },
      completed: { label: 'Completed', className: 'bg-success' },
    };
    const config = configs[status] || { label: status, className: 'bg-secondary' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  return (
    <DashboardLayout title="System Overview" roleLabel="Super Admin" roleColor="text-primary">
      <Tabs defaultValue="dashboard" className="space-y-6">
        <Card className="border-2">
          <TabsList className="w-full h-auto p-2 bg-transparent grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2">
            <TabsTrigger 
              value="dashboard" 
              className="flex items-center gap-2 px-4 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger 
              value="access" 
              className="flex items-center gap-2 px-4 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
            >
              <UserCog className="h-4 w-4" />
              <span className="hidden sm:inline">Access</span>
            </TabsTrigger>
            <TabsTrigger 
              value="workspaces" 
              className="flex items-center gap-2 px-4 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
            >
              <Folders className="h-4 w-4" />
              <span className="hidden sm:inline">Workspaces</span>
            </TabsTrigger>
            <TabsTrigger 
              value="users" 
              className="flex items-center gap-2 px-4 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
            >
              <UserCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Users</span>
            </TabsTrigger>
            <TabsTrigger 
              value="facilities" 
              className="flex items-center gap-2 px-4 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
            >
              <UsersRound className="h-4 w-4" />
              <span className="hidden sm:inline">Facilities & Staff</span>
            </TabsTrigger>
            <TabsTrigger 
              value="vacation" 
              className="flex items-center gap-2 px-4 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
            >
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Vacation Types</span>
            </TabsTrigger>
            <TabsTrigger 
              value="departments" 
              className="flex items-center gap-2 px-4 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
            >
              <FolderTree className="h-4 w-4" />
              <span className="hidden sm:inline">Departments</span>
            </TabsTrigger>
          </TabsList>
        </Card>

        <TabsContent value="dashboard" className="space-y-6">
          {/* Main Stats Grid */}
          <div className="grid gap-6 md:grid-cols-4">
            <Card className="border-2 hover:border-primary/20 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Workspaces</CardTitle>
                <Building2 className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                {workspacesLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-3xl font-bold">{workspaces?.length || 0}</div>
                )}
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-primary/20 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                <Users className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{totalUsers || 0}</div>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-primary/20 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Facilities</CardTitle>
                <Building className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{facilities || 0}</div>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-primary/20 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Departments</CardTitle>
                <Briefcase className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{departments || 0}</div>
              </CardContent>
            </Card>
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

          {/* System Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                System Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">All Systems Operational</p>
                  <p className="text-xs text-muted-foreground">Last checked: {format(new Date(), 'PPp')}</p>
                </div>
                <Badge className="bg-success text-lg px-4 py-2">Active</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="access">
          <AccessManagement />
        </TabsContent>

        <TabsContent value="workspaces">
          <WorkspaceManagement />
        </TabsContent>

        <TabsContent value="users">
          <UserManagement />
        </TabsContent>

        <TabsContent value="facilities">
          <FacilityUserManagement />
        </TabsContent>

        <TabsContent value="vacation">
          <VacationTypeManagement />
        </TabsContent>

        <TabsContent value="departments">
          <DepartmentManagement />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default SuperAdminDashboard;
