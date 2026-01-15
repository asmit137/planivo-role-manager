import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { StatsCard } from '@/components/shared';
import { format } from 'date-fns';
import { safeProfileName } from '@/lib/utils';

interface OrganizationVacationMonitorProps {
  organizationId: string;
}

const OrganizationVacationMonitor = ({ organizationId }: OrganizationVacationMonitorProps) => {
  // Get all workspace IDs for this organization
  const { data: workspaceIds } = useQuery({
    queryKey: ['org-workspace-ids', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('id')
        .eq('organization_id', organizationId);
      if (error) throw error;
      return data?.map(w => w.id) || [];
    },
    enabled: !!organizationId,
  });

  // Get vacation stats
  const { data: vacationStats, isLoading: statsLoading } = useQuery({
    queryKey: ['org-vacation-stats', workspaceIds],
    queryFn: async () => {
      if (!workspaceIds || workspaceIds.length === 0) return null;

      // Get department IDs in these workspaces
      const { data: facilities } = await supabase
        .from('facilities')
        .select('id')
        .in('workspace_id', workspaceIds);

      const facilityIds = facilities?.map(f => f.id) || [];
      if (facilityIds.length === 0) return { pending: 0, approved: 0, rejected: 0, total: 0 };

      const { data: departments } = await supabase
        .from('departments')
        .select('id')
        .in('facility_id', facilityIds);

      const departmentIds = departments?.map(d => d.id) || [];
      if (departmentIds.length === 0) return { pending: 0, approved: 0, rejected: 0, total: 0 };

      // Count vacation plans by status
      const { count: pending } = await supabase
        .from('vacation_plans')
        .select('*', { count: 'exact', head: true })
        .in('department_id', departmentIds)
        .in('status', ['department_pending', 'facility_pending', 'workspace_pending']);

      const { count: approved } = await supabase
        .from('vacation_plans')
        .select('*', { count: 'exact', head: true })
        .in('department_id', departmentIds)
        .eq('status', 'approved');

      const { count: rejected } = await supabase
        .from('vacation_plans')
        .select('*', { count: 'exact', head: true })
        .in('department_id', departmentIds)
        .eq('status', 'rejected');

      return {
        pending: pending || 0,
        approved: approved || 0,
        rejected: rejected || 0,
        total: (pending || 0) + (approved || 0) + (rejected || 0),
      };
    },
    enabled: !!workspaceIds && workspaceIds.length > 0,
  });

  // Get recent vacation plans
  const { data: recentPlans, isLoading: plansLoading } = useQuery({
    queryKey: ['org-recent-vacations', workspaceIds],
    queryFn: async () => {
      if (!workspaceIds || workspaceIds.length === 0) return [];

      const { data: facilities } = await supabase
        .from('facilities')
        .select('id')
        .in('workspace_id', workspaceIds);

      const facilityIds = facilities?.map(f => f.id) || [];
      if (facilityIds.length === 0) return [];

      const { data: departments } = await supabase
        .from('departments')
        .select('id, name, facility_id')
        .in('facility_id', facilityIds);

      const departmentIds = departments?.map(d => d.id) || [];
      if (departmentIds.length === 0) return [];

      const { data: plans, error } = await supabase
        .from('vacation_plans')
        .select(`
          id,
          status,
          total_days,
          created_at,
          staff_id,
          department_id,
          vacation_type_id,
          vacation_types (name)
        `)
        .in('department_id', departmentIds)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      // Get staff profiles
      const staffIds = plans?.map(p => p.staff_id) || [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', staffIds);

      return plans?.map(plan => ({
        ...plan,
        staffName: safeProfileName(profiles?.find(p => p.id === plan.staff_id)),
        departmentName: departments?.find(d => d.id === plan.department_id)?.name || 'Unknown',
        vacationType: (plan.vacation_types as any)?.name || 'Unknown',
      })) || [];
    },
    enabled: !!workspaceIds && workspaceIds.length > 0,
  });

  const isLoading = statsLoading || plansLoading;

  if (isLoading) {
    return <LoadingState message="Loading vacation data..." />;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-emerald-500 text-white">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      default:
        return <Badge className="bg-amber-500 text-white">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid gap-2 sm:gap-4 grid-cols-2 md:grid-cols-4">
        <StatsCard
          title="Pending"
          value={vacationStats?.pending || 0}
          icon={Clock}
          description="Awaiting"
          className="p-3 sm:p-6"
        />
        <StatsCard
          title="Approved"
          value={vacationStats?.approved || 0}
          icon={CheckCircle}
          description="Approved"
          className="p-3 sm:p-6"
        />
        <StatsCard
          title="Rejected"
          value={vacationStats?.rejected || 0}
          icon={XCircle}
          description="Rejected"
          className="p-3 sm:p-6"
        />
        <StatsCard
          title="Total"
          value={vacationStats?.total || 0}
          icon={Calendar}
          description="All"
          className="p-3 sm:p-6"
        />
      </div>

      {/* Recent Vacation Requests */}
      <Card>
        <CardHeader className="px-3 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Calendar className="h-5 w-5 text-primary" />
            Recent Requests
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Latest vacation requests in your organization</CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {!recentPlans || recentPlans.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No Vacation Requests"
              description="No vacation requests found in your organization."
            />
          ) : (
            <div className="space-y-3">
              {recentPlans.map((plan: any) => (
                <div key={plan.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border bg-muted/30 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between sm:justify-start gap-2">
                      <p className="font-medium text-sm sm:text-base">{plan.staffName}</p>
                      <div className="sm:hidden">
                        {getStatusBadge(plan.status)}
                      </div>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1">
                      {plan.departmentName} · {plan.vacationType} · {plan.total_days} days
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      Submitted: {format(new Date(plan.created_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="hidden sm:block">
                    {getStatusBadge(plan.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OrganizationVacationMonitor;
