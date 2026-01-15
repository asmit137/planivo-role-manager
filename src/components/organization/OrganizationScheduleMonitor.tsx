import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, Users, FileText } from 'lucide-react';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { StatsCard } from '@/components/shared';
import { format } from 'date-fns';

interface OrganizationScheduleMonitorProps {
  organizationId: string;
}

const OrganizationScheduleMonitor = ({ organizationId }: OrganizationScheduleMonitorProps) => {
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

  // Get schedule stats
  const { data: scheduleStats, isLoading: statsLoading } = useQuery({
    queryKey: ['org-schedule-stats', workspaceIds],
    queryFn: async () => {
      if (!workspaceIds || workspaceIds.length === 0) return null;

      const { count: published } = await supabase
        .from('schedules')
        .select('*', { count: 'exact', head: true })
        .in('workspace_id', workspaceIds)
        .eq('status', 'published');

      const { count: draft } = await supabase
        .from('schedules')
        .select('*', { count: 'exact', head: true })
        .in('workspace_id', workspaceIds)
        .eq('status', 'draft');

      const { count: total } = await supabase
        .from('schedules')
        .select('*', { count: 'exact', head: true })
        .in('workspace_id', workspaceIds);

      return {
        published: published || 0,
        draft: draft || 0,
        total: total || 0,
      };
    },
    enabled: !!workspaceIds && workspaceIds.length > 0,
  });

  // Get recent schedules
  const { data: recentSchedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['org-recent-schedules', workspaceIds],
    queryFn: async () => {
      if (!workspaceIds || workspaceIds.length === 0) return [];

      const { data: schedules, error } = await supabase
        .from('schedules')
        .select(`
          id,
          name,
          status,
          start_date,
          end_date,
          shift_count,
          department_id,
          departments (name, facility_id, facilities (name))
        `)
        .in('workspace_id', workspaceIds)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      return schedules?.map(s => ({
        ...s,
        departmentName: (s.departments as any)?.name || 'Unknown',
        facilityName: (s.departments as any)?.facilities?.name || 'Unknown',
      })) || [];
    },
    enabled: !!workspaceIds && workspaceIds.length > 0,
  });

  const isLoading = statsLoading || schedulesLoading;

  if (isLoading) {
    return <LoadingState message="Loading schedule data..." />;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-emerald-500 text-white">Published</Badge>;
      case 'draft':
        return <Badge className="bg-amber-500 text-white">Draft</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid gap-2 sm:gap-4 grid-cols-2 md:grid-cols-3">
        <StatsCard
          title="Published"
          value={scheduleStats?.published || 0}
          icon={Calendar}
          description="Active"
          className="p-3 sm:p-6"
        />
        <StatsCard
          title="Draft"
          value={scheduleStats?.draft || 0}
          icon={FileText}
          description="Pending"
          className="p-3 sm:p-6"
        />
        <StatsCard
          title="Total"
          value={scheduleStats?.total || 0}
          icon={Clock}
          description="All"
          className="p-3 sm:p-6 col-span-2 sm:col-span-1"
        />
      </div>

      {/* Recent Schedules */}
      <Card>
        <CardHeader className="px-3 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Calendar className="h-5 w-5 text-primary" />
            Recent Schedules
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Latest schedules in your organization</CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {!recentSchedules || recentSchedules.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No Schedules"
              description="No schedules found in your organization."
            />
          ) : (
            <div className="space-y-3">
              {recentSchedules.map((schedule: any) => (
                <div key={schedule.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border bg-muted/30 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between sm:justify-start gap-2">
                      <p className="font-medium text-sm sm:text-base">{schedule.name}</p>
                      <div className="sm:hidden">
                        {getStatusBadge(schedule.status)}
                      </div>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1">
                      {schedule.facilityName} · {schedule.departmentName}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      {format(new Date(schedule.start_date), 'MMM d')} - {format(new Date(schedule.end_date), 'MMM d, yyyy')} · {schedule.shift_count} shifts
                    </p>
                  </div>
                  <div className="hidden sm:block">
                    {getStatusBadge(schedule.status)}
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

export default OrganizationScheduleMonitor;
