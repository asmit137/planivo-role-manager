import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useUserRole';
import { useOrganization } from '@/contexts/OrganizationContext';
import TrainingEventCard from './TrainingEventCard';
import TrainingEventForm from './TrainingEventForm';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Calendar, Filter, XCircle } from 'lucide-react';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { parseISO, isAfter } from 'date-fns';

interface TrainingEventListProps {
  showOnlyPublished?: boolean;
  showOnlyRegistered?: boolean;
  showAll?: boolean;
  showOnlyUpcoming?: boolean;
  isAdminView?: boolean;
  onSelectEvent?: (eventId: string | null) => void;
  departmentId?: string;
}

const TrainingEventList = ({
  showOnlyPublished = false,
  showOnlyRegistered = false,
  showAll = false,
  showOnlyUpcoming = false,
  isAdminView = false,
  onSelectEvent,
  departmentId,
}: TrainingEventListProps) => {
  const { user } = useAuth();
  const { data: roles } = useUserRole();
  const { selectedOrganizationId } = useOrganization();
  const [searchQuery, setSearchQuery] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // Subscribe to real-time updates
  useRealtimeSubscription({ table: 'training_events', invalidateQueries: ['training-events'] });
  useRealtimeSubscription({ table: 'training_registrations', invalidateQueries: ['training-events', 'training-registration'] });

  const isSuperAdmin = roles?.some(r => r.role === 'super_admin');

  // Get user's organization ID (fallback for non-super-admins)
  const { data: userOrgId } = useQuery({
    queryKey: ['user-org-id', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: directOrg } = await (supabase
        .from('user_roles')
        .select('organization_id')
        .eq('user_id', user.id)
        .not('organization_id', 'is', null)
        .limit(1)
        .maybeSingle() as any);

      if (directOrg?.organization_id) {
        return directOrg.organization_id;
      }

      const { data: workspaceOrg, error } = await supabase
        .from('user_roles')
        .select('workspaces(organization_id)')
        .eq('user_id', user.id)
        .not('workspace_id', 'is', null)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (workspaceOrg?.workspaces as any)?.organization_id || null;
    },
    enabled: !!user && !isSuperAdmin,
  });

  const effectiveOrgId = isSuperAdmin ? selectedOrganizationId : userOrgId;

  // Cache busting query key that updates every 5 minutes
  const now = new Date();
  const currentInterval = new Date(Math.floor(now.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000)).toISOString();

  const { data: events, isLoading, error } = useQuery({
    queryKey: ['training-events', showOnlyPublished, showOnlyRegistered, showAll, showOnlyUpcoming, effectiveOrgId, isSuperAdmin, departmentId, currentInterval],
    queryFn: async () => {
      let query = supabase
        .from('training_events')
        .select('*')
        .order('start_datetime', { ascending: true });

      if (effectiveOrgId && effectiveOrgId !== 'all') {
        query = query.eq('organization_id', effectiveOrgId);
      }

      if (departmentId) {
        const { data: targetEvents } = await supabase
          .from('training_event_targets')
          .select('event_id')
          .eq('department_id', departmentId)
          .eq('target_type', 'department');

        const eventIds = targetEvents?.map(te => te.event_id) || [];
        query = query.or(`id.in.(${eventIds.length > 0 ? eventIds.join(',') : '00000000-0000-0000-0000-000000000000'}),created_by.eq.${user?.id},responsible_user_id.eq.${user?.id}`);
      }

      if (showOnlyPublished) {
        query = query.eq('status', 'published');
      }

      // Server-side filter for upcoming
      // To fulfill the user's request of removing past-date events (like Jan 19 when today is Jan 20),
      // we filter by events where the START time is in the future.
      if (showOnlyUpcoming) {
        query = query.gt('start_datetime', new Date().toISOString());
      }

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

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
    enabled: (isSuperAdmin || !!userOrgId) || !!user,
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

  const filteredEvents = (events || []).filter(event => {
    // 1. Search Query Filter
    const matchesSearch =
      event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (event.description?.toLowerCase() || '').includes(searchQuery.toLowerCase());

    // 2. Type Filter
    const matchesType = eventTypeFilter === 'all' || event.event_type === eventTypeFilter;

    // 3. Upcoming Filter (Client-side strict check)
    let matchesUpcoming = true;
    if (showOnlyUpcoming) {
      // Strictly hide anything that has already started to match user expectation
      const eventStartDate = parseISO(event.start_datetime);
      matchesUpcoming = isAfter(eventStartDate, new Date());
    }

    return matchesSearch && matchesType && matchesUpcoming;
  });

  const handleEditEvent = (eventId: string) => {
    setEditingEventId(eventId);
  };

  const handleViewRegistrations = (eventId: string) => {
    onSelectEvent?.(eventId);
  };

  const getEmptyStateParams = () => {
    if (showOnlyRegistered) {
      return {
        title: "No Registrations",
        description: "You haven't registered for any events yet. Browse upcoming events to register."
      };
    }

    if (searchQuery || eventTypeFilter !== 'all') {
      return {
        title: "No Events Found",
        description: "No events match your current filters."
      };
    }

    return {
      title: "No Events Found",
      description: "No training events are scheduled. Check back later!"
    };
  };

  return (
    <div className="space-y-4">
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
            {(searchQuery || eventTypeFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setEventTypeFilter('all');
                }}
                className="h-10 text-muted-foreground hover:bg-secondary transition-colors gap-2"
              >
                <XCircle className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Clear Filters</span>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {filteredEvents.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title={getEmptyStateParams().title}
          description={getEmptyStateParams().description}
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
