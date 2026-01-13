import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { PageHeader, LoadingState, ErrorState } from '@/components/layout';
import { StatsCard } from '@/components/shared';
import { Building, Users, MapPin, Briefcase, AlertTriangle, Calendar, ListTodo, GraduationCap, Clock, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

const OrganizationAdminDashboard = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || '';

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
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
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

      // Get active tasks count
      const { count: activeTasks } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .eq('status', 'active');

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
        activeTasks: activeTasks || 0,
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
    <div className="space-y-6">
      {/* Resource Usage */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Workspaces</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
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

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Facilities</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
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

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
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
      <Card>
        <CardHeader>
          <CardTitle>Organization Details</CardTitle>
          <CardDescription>Your organization information and limits</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
    <div className="space-y-6">
      <PageHeader
        title={organization.name}
        description="Manage and monitor your organization's resources and activities"
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="overflow-x-auto scrollbar-hide -mx-2 px-2">
          <TabsList className="w-max min-w-full justify-start gap-1 h-auto py-1">
            <TabsTrigger value="" className="min-h-[40px] px-3 text-xs sm:text-sm">Overview</TabsTrigger>
            <TabsTrigger value="workspaces" className="min-h-[40px] px-3 text-xs sm:text-sm">Workspaces</TabsTrigger>
            <TabsTrigger value="facilities" className="min-h-[40px] px-3 text-xs sm:text-sm">Facilities</TabsTrigger>
            <TabsTrigger value="users" className="min-h-[40px] px-3 text-xs sm:text-sm">Users</TabsTrigger>
            <TabsTrigger value="vacation" className="min-h-[40px] px-3 text-xs sm:text-sm">Vacation</TabsTrigger>
            <TabsTrigger value="schedules" className="min-h-[40px] px-3 text-xs sm:text-sm">Schedules</TabsTrigger>
            <TabsTrigger value="tasks" className="min-h-[40px] px-3 text-xs sm:text-sm">Tasks</TabsTrigger>
            <TabsTrigger value="training" className="min-h-[40px] px-3 text-xs sm:text-sm">Training</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="" className="mt-6">
          {renderOverview()}
        </TabsContent>

        <TabsContent value="workspaces" className="mt-6">
          <WorkspaceManagement
            organizationId={organization.id}
            maxWorkspaces={organization.max_workspaces}
            currentWorkspaceCount={stats?.workspaces || 0}
          />
        </TabsContent>

        <TabsContent value="facilities" className="mt-6">
          <OrganizationFacilitiesView organizationId={organization.id} />
        </TabsContent>

        <TabsContent value="users" className="mt-6">
          <UnifiedUserHub
            mode="organization_admin"
            organizationId={organization.id}
            maxUsers={organization.max_users}
            currentUserCount={stats?.users || 0}
          />
        </TabsContent>

        <TabsContent value="vacation" className="mt-6">
          <OrganizationVacationMonitor organizationId={organization.id} />
        </TabsContent>

        <TabsContent value="schedules" className="mt-6">
          <OrganizationScheduleMonitor organizationId={organization.id} />
        </TabsContent>

        <TabsContent value="tasks" className="mt-6">
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

        <TabsContent value="training" className="mt-6">
          <OrganizationTrainingMonitor organizationId={organization.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OrganizationAdminDashboard;
