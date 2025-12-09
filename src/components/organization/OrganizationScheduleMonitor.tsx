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
      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="Published Schedules"
          value={scheduleStats?.published || 0}
          icon={Calendar}
          description="Active schedules"
        />
        <StatsCard
          title="Draft Schedules"
          value={scheduleStats?.draft || 0}
          icon={FileText}
          description="Pending publication"
        />
        <StatsCard
          title="Total Schedules"
          value={scheduleStats?.total || 0}
          icon={Clock}
          description="All schedules"
        />
      </div>

      {/* Recent Schedules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Recent Schedules
          </CardTitle>
          <CardDescription>Latest schedules across your organization</CardDescription>
        </CardHeader>
        <CardContent>
          {!recentSchedules || recentSchedules.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No Schedules"
              description="No schedules found in your organization."
            />
          ) : (
            <div className="space-y-3">
              {recentSchedules.map((schedule: any) => (
                <div key={schedule.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div className="space-y-1">
                    <p className="font-medium">{schedule.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {schedule.facilityName} · {schedule.departmentName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(schedule.start_date), 'MMM d')} - {format(new Date(schedule.end_date), 'MMM d, yyyy')} · {schedule.shift_count} shifts
                    </p>
                  </div>
                  {getStatusBadge(schedule.status)}
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
