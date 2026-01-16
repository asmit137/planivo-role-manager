import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useUserRole';
import { PageHeader, LoadingState, ErrorState } from '@/components/layout';
import { StatsCard } from '@/components/shared';
import { Building, Users, MapPin, Briefcase, AlertTriangle, Calendar, ListTodo, GraduationCap, Clock, CheckCircle, MessageSquare, Bell, BarChart3, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveTabsList } from '@/components/layout/ResponsiveTabsList';
import WorkspaceManagement from '@/components/admin/WorkspaceManagement';
import { UnifiedUserHub } from '@/components/users';
import StaffTaskView from '@/components/tasks/StaffTaskView';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import {
  OrganizationFacilitiesView,
  OrganizationVacationMonitor,
  OrganizationScheduleMonitor,
  OrganizationTaskMonitor,
  OrganizationTrainingMonitor
} from '@/components/organization';
import { MessagingHub } from '@/modules/messaging';
import { NotificationHub } from '@/modules/notifications';
import { AnalyticsDashboard } from '@/components/admin/AnalyticsDashboard';
import { AuditLogsDashboard } from '@/components/admin/AuditLogsDashboard';
import { EmailManagement } from '@/components/admin/EmailManagement';

const OrganizationAdminDashboard = () => {
  const { user } = useAuth();
  const { data: roles } = useUserRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || '';

  // Map sidebar tabs to dashboard inner tabs to prevent blank screens
  const normalizedTab = (activeTab: string) => {
    const mapping: Record<string, string> = {
      'staff': 'users',
      'scheduling': 'schedules',
      'organization': 'workspaces',
      'settings': '',
    };
    return mapping[activeTab] || activeTab;
  };

  const currentTab = normalizedTab(activeTab);

  useRealtimeSubscription({
    table: 'organizations',
    invalidateQueries: ['organization-admin-org'],
  });

  useRealtimeSubscription({
    table: 'workspaces',
    invalidateQueries: ['org-admin-stats'],
  });

  // Fetch the organization this user belongs to
  const { data: organization, isLoading: orgLoading, error: orgError } = useQuery({
    queryKey: ['organization-admin-org', user?.id, roles?.length],
    queryFn: async () => {
      if (!user || !roles) return null;

      // If user is owner of an org, prioritize that
      const { data: ownedOrg } = await supabase
        .from('organizations')
        .select('*')
        .eq('owner_id', user.id)
        .single();

      if (ownedOrg) return ownedOrg;

      // Otherwise, get organization from their roles
      const orgId = roles.find(r => r.organization_id)?.organization_id;
      if (orgId) {
        const { data: memberOrg, error } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', orgId)
          .single();
        if (error) throw error;
        return memberOrg;
      }

      return null;
    },
    enabled: !!user && !!roles,
  });

  // Fetch usage stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['org-admin-stats', organization?.id],
    queryFn: async () => {
      if (!organization) return null;

      // Get workspace count
      const { count: workspaceCount } = await supabase
        .from('workspaces')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id);

      // Get workspace IDs for facility and user queries
      const { data: workspaces } = await supabase
        .from('workspaces')
        .select('id')
        .eq('organization_id', organization.id);

      const workspaceIds = workspaces?.map(w => w.id) || [];

      // Get facility count
      let facilityCount = 0;
      if (workspaceIds.length > 0) {
        const { count } = await supabase
          .from('facilities')
          .select('*', { count: 'exact', head: true })
          .in('workspace_id', workspaceIds);
        facilityCount = count || 0;
      }

      // Get user count (include all users assigned to this organization!)
      const { count: userCount } = await supabase
        .from('user_roles' as any)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organization.id);

      // Get pending vacation count
      let pendingVacations = 0;
      if (workspaceIds.length > 0) {
        const { data: facilities } = await supabase
          .from('facilities')
          .select('id')
          .in('workspace_id', workspaceIds);
        const facilityIds = facilities?.map(f => f.id) || [];

        if (facilityIds.length > 0) {
          const { data: departments } = await supabase
            .from('departments')
            .select('id')
            .in('facility_id', facilityIds);
          const departmentIds = departments?.map(d => d.id) || [];

          if (departmentIds.length > 0) {
            const { count } = await supabase
              .from('vacation_plans')
              .select('*', { count: 'exact', head: true })
              .in('department_id', departmentIds)
              .in('status', ['department_pending', 'facility_pending', 'workspace_pending']);
            pendingVacations = count || 0;
          }
        }
      }

      // Get active tasks count - tasks table uses workspace_id, not organization_id
      let activeTasks = 0;
      if (workspaceIds.length > 0) {
        const { count } = await supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .in('workspace_id', workspaceIds)
          .eq('status', 'active');
        activeTasks = count || 0;
      }

      // Get upcoming training count
      const { count: upcomingTraining } = await supabase
        .from('training_events')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .eq('status', 'published')
        .gt('start_datetime', new Date().toISOString());

      return {
        workspaces: workspaceCount || 0,
        facilities: facilityCount,
        users: userCount || 0,
        pendingVacations,
        activeTasks,
        upcomingTraining: upcomingTraining || 0,
      };
    },
    enabled: !!organization,
  });

  const handleTabChange = (value: string) => {
    if (value === '') {
      setSearchParams({});
    } else {
      setSearchParams({ tab: value });
    }
  };

  if (orgLoading || statsLoading) {
    return <LoadingState message="Loading organization data..." />;
  }

  if (orgError || !organization) {
    return (
      <ErrorState
        title="No Organization Found"
        message="You don't have an organization assigned to your account. Please contact the Super Admin."
      />
    );
  }

  const getUsagePercentage = (current: number, max: number | null) => {
    if (max === null) return 0;
    return Math.min((current / max) * 100, 100);
  };

  const formatLimit = (current: number, max: number | null) => {
    return max === null ? `${current} / ∞` : `${current} / ${max}`;
  };

  const isNearLimit = (current: number, max: number | null) => {
    if (max === null) return false;
    return current >= max * 0.9;
  };

  // Overview content
  const renderOverview = () => (
    <div className="space-y-4 sm:space-y-6">
      {/* Resource Usage */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-none sm:shadow-sm border-2 sm:border">
          <CardHeader className="p-3 sm:p-6 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Workspaces</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold">
              {formatLimit(stats?.workspaces || 0, organization.max_workspaces)}
            </div>
            {organization.max_workspaces && (
              <Progress
                value={getUsagePercentage(stats?.workspaces || 0, organization.max_workspaces)}
                className="mt-2"
              />
            )}
            {isNearLimit(stats?.workspaces || 0, organization.max_workspaces) && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Approaching limit
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-none sm:shadow-sm border-2 sm:border">
          <CardHeader className="p-3 sm:p-6 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Facilities</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold">
              {formatLimit(stats?.facilities || 0, organization.max_facilities)}
            </div>
            {organization.max_facilities && (
              <Progress
                value={getUsagePercentage(stats?.facilities || 0, organization.max_facilities)}
                className="mt-2"
              />
            )}
            {isNearLimit(stats?.facilities || 0, organization.max_facilities) && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Approaching limit
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-none sm:shadow-sm border-2 sm:border">
          <CardHeader className="p-3 sm:p-6 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold">
              {formatLimit(stats?.users || 0, organization.max_users)}
            </div>
            {organization.max_users && (
              <Progress
                value={getUsagePercentage(stats?.users || 0, organization.max_users)}
                className="mt-2"
              />
            )}
            {isNearLimit(stats?.users || 0, organization.max_users) && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Approaching limit
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Overview */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <StatsCard
          title="Pending Vacations"
          value={stats?.pendingVacations || 0}
          icon={Clock}
          description="Awaiting approval"
        />
        <StatsCard
          title="Active Tasks"
          value={stats?.activeTasks || 0}
          icon={ListTodo}
          description="In progress"
        />
        <StatsCard
          title="Upcoming Training"
          value={stats?.upcomingTraining || 0}
          icon={GraduationCap}
          description="Scheduled events"
        />
      </div>

      {/* Organization Details */}
      <Card className="shadow-none sm:shadow-sm border-2 sm:border">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">Organization Details</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Your organization information and limits</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Building className="h-5 w-5 text-primary" />
              {organization.name}
            </h3>
            {organization.description && (
              <p className="text-muted-foreground mt-1">{organization.description}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={organization.max_workspaces ? 'secondary' : 'default'}>
              Max Workspaces: {organization.max_workspaces || 'Unlimited'}
            </Badge>
            <Badge variant={organization.max_facilities ? 'secondary' : 'default'}>
              Max Facilities: {organization.max_facilities || 'Unlimited'}
            </Badge>
            <Badge variant={organization.max_users ? 'secondary' : 'default'}>
              Max Users: {organization.max_users || 'Unlimited'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6 w-full overflow-x-hidden p-0 sm:p-0">
      <div className="px-4 sm:px-0">
        <PageHeader
          title={organization.name}
          description="Manage and monitor your organization's resources and activities"
        />
      </div>

      <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
        {/* Navigation is now handled by the AppSidebar. The Tabs component is kept for content routing logic. */}

        <TabsContent value="" className="mt-4 sm:mt-6 px-4 sm:px-0">
          {renderOverview()}
        </TabsContent>

        <TabsContent value="workspaces" className="mt-4 sm:mt-6 px-4 sm:px-0">
          <WorkspaceManagement
            organizationId={organization.id}
            maxWorkspaces={organization.max_workspaces}
            currentWorkspaceCount={stats?.workspaces || 0}
          />
        </TabsContent>

        <TabsContent value="facilities" className="mt-4 sm:mt-6 px-4 sm:px-0">
          <OrganizationFacilitiesView organizationId={organization.id} />
        </TabsContent>

        <TabsContent value="users" className="mt-4 sm:mt-6 px-4 sm:px-0">
          <UnifiedUserHub
            mode="organization_admin"
            organizationId={organization.id}
            maxUsers={organization.max_users}
            currentUserCount={stats?.users || 0}
          />
        </TabsContent>

        <TabsContent value="vacation" className="mt-4 sm:mt-6 px-4 sm:px-0">
          <OrganizationVacationMonitor organizationId={organization.id} />
        </TabsContent>

        <TabsContent value="schedules" className="mt-4 sm:mt-6 px-4 sm:px-0">
          <OrganizationScheduleMonitor organizationId={organization.id} />
        </TabsContent>

        <TabsContent value="tasks" className="mt-4 sm:mt-6 px-4 sm:px-0">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="overview">Organization Overview</TabsTrigger>
              <TabsTrigger value="my-tasks">My Assigned Tasks</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <OrganizationTaskMonitor organizationId={organization.id} />
            </TabsContent>
            <TabsContent value="my-tasks">
              <StaffTaskView />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="training" className="mt-4 sm:mt-6 px-4 sm:px-0">
          <OrganizationTrainingMonitor organizationId={organization.id} />
        </TabsContent>

        {/* Messaging, Notifications, Analytics, and Audit Logs are accessible via sidebar only */}
        <TabsContent value="messaging" className="mt-4 sm:mt-6 px-4 sm:px-0">
          <MessagingHub />
        </TabsContent>

        <TabsContent value="notifications" className="mt-4 sm:mt-6 px-4 sm:px-0">
          <NotificationHub />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4 sm:mt-6 px-4 sm:px-0">
          <AnalyticsDashboard organizationId={organization.id} />
        </TabsContent>

        <TabsContent value="audit" className="mt-4 sm:mt-6 px-4 sm:px-0">
          <AuditLogsDashboard />
        </TabsContent>

        <TabsContent value="emails" className="mt-4 sm:mt-6 px-4 sm:px-0">
          <EmailManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OrganizationAdminDashboard;
