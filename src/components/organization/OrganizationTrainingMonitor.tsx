import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GraduationCap, Calendar, Users, Clock } from 'lucide-react';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { StatsCard } from '@/components/shared';
import { format } from 'date-fns';
import { safeProfileName } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import TrainingEventForm from '@/components/training/TrainingEventForm';

interface OrganizationTrainingMonitorProps {
  organizationId: string;
}

const OrganizationTrainingMonitor = ({ organizationId }: OrganizationTrainingMonitorProps) => {
  const [createOpen, setCreateOpen] = useState(false);

  // Get training event stats
  const { data: trainingStats, isLoading: statsLoading } = useQuery({
    queryKey: ['org-training-stats', organizationId],
    queryFn: async () => {
      const { count: upcoming } = await supabase
        .from('training_events')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'published')
        .gt('start_datetime', new Date().toISOString());

      const { count: completed } = await supabase
        .from('training_events')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'completed');

      const { count: draft } = await supabase
        .from('training_events')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'draft');

      const { count: total } = await supabase
        .from('training_events')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId);

      return {
        upcoming: upcoming || 0,
        completed: completed || 0,
        draft: draft || 0,
        total: total || 0,
      };
    },
    enabled: !!organizationId,
  });

  // Get recent training events
  const { data: recentEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ['org-recent-training', organizationId],
    queryFn: async () => {
      const { data: events, error } = await supabase
        .from('training_events')
        .select(`
          id,
          title,
          status,
          event_type,
          location_type,
          start_datetime,
          end_datetime,
          max_participants,
          responsible_user_id,
          created_by
        `)
        .eq('organization_id', organizationId)
        .order('start_datetime', { ascending: false })
        .limit(10);

      if (error) throw error;

      // Get registration counts and responsible user profiles
      const eventsWithStats = await Promise.all(
        (events || []).map(async (event) => {
          const { count: registrationCount } = await supabase
            .from('training_registrations')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', event.id);

          let responsibleName = 'Unassigned Coordinator';
          const targetUserId = event.responsible_user_id || event.created_by;

          if (targetUserId) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', targetUserId)
              .single();
            responsibleName = safeProfileName(profile);
          }

          return {
            ...event,
            registrationCount: registrationCount || 0,
            responsibleName,
          };
        })
      );

      return eventsWithStats;
    },
    enabled: !!organizationId,
  });

  const isLoading = statsLoading || eventsLoading;

  if (isLoading) {
    return <LoadingState message="Loading training data..." />;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-emerald-500 text-white">Published</Badge>;
      case 'completed':
        return <Badge className="bg-blue-500 text-white">Completed</Badge>;
      case 'draft':
        return <Badge className="bg-amber-500 text-white">Draft</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getEventTypeBadge = (type: string) => {
    return <Badge variant="outline" className="capitalize">{type}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid gap-2 sm:gap-4 grid-cols-2 md:grid-cols-4">
        <StatsCard
          title="Upcoming"
          value={trainingStats?.upcoming || 0}
          icon={Calendar}
          description="Scheduled"
          className="p-3 sm:p-6"
        />
        <StatsCard
          title="Completed"
          value={trainingStats?.completed || 0}
          icon={GraduationCap}
          description="Finished"
          className="p-3 sm:p-6"
        />
        <StatsCard
          title="Draft"
          value={trainingStats?.draft || 0}
          icon={Clock}
          description="Pending"
          className="p-3 sm:p-6"
        />
        <StatsCard
          title="Total"
          value={trainingStats?.total || 0}
          icon={Users}
          description="All"
          className="p-3 sm:p-6"
        />
      </div>

      {/* Recent Training Events */}
      <Card>
        <CardHeader className="px-3 sm:px-6">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <GraduationCap className="h-5 w-5 text-primary" />
              Recent Events
            </CardTitle>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-primary text-xs sm:text-sm h-8 sm:h-9">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Create Event
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full p-0">
                <div className="p-1">
                  <TrainingEventForm
                    organizationId={organizationId}
                    onSuccess={() => setCreateOpen(false)}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <CardDescription className="text-xs sm:text-sm mt-1">Latest training and meeting events in your organization</CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {!recentEvents || recentEvents.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="No Training Events"
              description="No training events found in your organization."
            />
          ) : (
            <div className="space-y-3">
              {recentEvents.map((event: any) => (
                <div key={event.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border bg-muted/30 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between sm:justify-start gap-2">
                      <p className="font-medium text-sm sm:text-base line-clamp-1">{event.title}</p>
                      <div className="sm:hidden flex gap-1">
                        {getEventTypeBadge(event.event_type)}
                        {getStatusBadge(event.status)}
                      </div>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1">
                      {event.responsibleName} · {event.location_type}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      {format(new Date(event.start_datetime), 'MMM d, yyyy h:mm a')}
                      {event.max_participants && ` · ${event.registrationCount}/${event.max_participants} registered`}
                    </p>
                  </div>
                  <div className="hidden sm:flex gap-2">
                    {getEventTypeBadge(event.event_type)}
                    {getStatusBadge(event.status)}
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

export default OrganizationTrainingMonitor;
