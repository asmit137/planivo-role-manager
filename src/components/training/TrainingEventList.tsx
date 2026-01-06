import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useUserRole';
import TrainingEventCard from './TrainingEventCard';
import TrainingEventForm from './TrainingEventForm';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Calendar, Filter } from 'lucide-react';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

interface TrainingEventListProps {
  showOnlyPublished?: boolean;
  showOnlyRegistered?: boolean;
  showAll?: boolean;
  isAdminView?: boolean;
  onSelectEvent?: (eventId: string | null) => void;
}

const TrainingEventList = ({
  showOnlyPublished = false,
  showOnlyRegistered = false,
  showAll = false,
  isAdminView = false,
  onSelectEvent,
}: TrainingEventListProps) => {
  const { user } = useAuth();
  const { data: roles } = useUserRole();
  const [searchQuery, setSearchQuery] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // Subscribe to real-time updates
  useRealtimeSubscription({ table: 'training_events', invalidateQueries: ['training-events'] });
  useRealtimeSubscription({ table: 'training_registrations', invalidateQueries: ['training-events', 'training-registration'] });

  const isSuperAdmin = roles?.some(r => r.role === 'super_admin');

  // Get user's organization ID
  const { data: userOrgId } = useQuery({
    queryKey: ['user-org-id', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('user_roles')
        .select('workspaces(organization_id)')
        .eq('user_id', user.id)
        .not('workspace_id', 'is', null)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data?.workspaces?.organization_id;
    },
    enabled: !!user,
  });

  const { data: events, isLoading, error } = useQuery({
    queryKey: ['training-events', showOnlyPublished, showOnlyRegistered, showAll, userOrgId, isSuperAdmin],
    queryFn: async () => {
      let query = supabase
        .from('training_events')
        .select('*')
        .order('start_datetime', { ascending: true });

      // For non-super-admin, filter by organization
      if (!isSuperAdmin && userOrgId) {
        query = query.eq('organization_id', userOrgId);
      }

      // Filter by status
      if (showOnlyPublished) {
        query = query.eq('status', 'published');
      }

      const { data, error } = await query;
      if (error) throw error;

      // If showing only registered events, filter by user's registrations
      if (showOnlyRegistered && user) {
        const { data: registrations } = await supabase
          .from('training_registrations')
          .select('event_id')
          .eq('user_id', user.id)
          .eq('status', 'registered');

        const registeredEventIds = registrations?.map(r => r.event_id) || [];
        return data.filter(event => registeredEventIds.includes(event.id));
      }

      return data;
    },
    enabled: (isSuperAdmin || !!userOrgId) && !!user,
  });

  if (isLoading) {
    return <LoadingState message="Loading training events..." />;
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-destructive">Failed to load events. Please try again.</p>
        </CardContent>
      </Card>
    );
  }

  // Apply filters
  const filteredEvents = events?.filter(event => {
    const matchesSearch =
      event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = eventTypeFilter === 'all' || event.event_type === eventTypeFilter;
    return matchesSearch && matchesType;
  }) || [];

  const handleEditEvent = (eventId: string) => {
    setEditingEventId(eventId);
  };

  const handleViewRegistrations = (eventId: string) => {
    onSelectEvent?.(eventId);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filter Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Event Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="training">Training</SelectItem>
                <SelectItem value="workshop">Workshop</SelectItem>
                <SelectItem value="seminar">Seminar</SelectItem>
                <SelectItem value="webinar">Webinar</SelectItem>
                <SelectItem value="meeting">Meeting</SelectItem>
                <SelectItem value="conference">Conference</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Events Grid */}
      {filteredEvents.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title={showOnlyRegistered ? "No Registrations" : "No Events Found"}
          description={
            showOnlyRegistered
              ? "You haven't registered for any events yet. Browse upcoming events to register."
              : searchQuery || eventTypeFilter !== 'all'
                ? "No events match your current filters."
                : "No training events are scheduled. Check back later!"
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEvents.map((event) => (
            <TrainingEventCard
              key={event.id}
              event={event}
              isAdminView={isAdminView}
              onEdit={handleEditEvent}
              onViewRegistrations={handleViewRegistrations}
            />
          ))}
        </div>
      )}

      {/* Edit Event Dialog */}
      <Dialog open={!!editingEventId} onOpenChange={(open) => !open && setEditingEventId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
            <DialogDescription>
              Modify the details of the existing training event.
            </DialogDescription>
          </DialogHeader>
          {editingEventId && (
            <TrainingEventForm
              eventId={editingEventId}
              onSuccess={() => setEditingEventId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TrainingEventList;
