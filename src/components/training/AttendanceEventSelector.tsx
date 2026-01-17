import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { format, isToday, isTomorrow, startOfWeek, endOfWeek, isWithinInterval, addMinutes, isBefore } from 'date-fns';
import { Calendar, Clock, Search, Users, MapPin, Video, Lock, CheckCircle, XCircle } from 'lucide-react';

interface AttendanceEventSelectorProps {
  onSelectEvent: (eventId: string) => void;
  selectedEventId: string | null;
}

type DateFilter = 'today' | 'tomorrow' | 'this_week' | 'all';

const AttendanceEventSelector = ({ onSelectEvent, selectedEventId }: AttendanceEventSelectorProps) => {
  const { data: roles } = useUserRole();
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [searchQuery, setSearchQuery] = useState('');

  const isSuperAdmin = roles?.some(r => r.role === 'super_admin');

  // Get user's organization ID
  const { data: userOrgId } = useQuery({
    queryKey: ['user-org-id-attendance'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return null;

      const { data, error } = await (supabase as any)
        .from('user_roles')
        .select('organization_id')
        .eq('user_id', userData.user.id)
        .not('organization_id', 'is', null)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data as any)?.organization_id ?? null;
    },
  });

  const { data: events, isLoading } = useQuery({
    queryKey: ['attendance-events', userOrgId, isSuperAdmin, dateFilter],
    queryFn: async () => {
      let query = supabase
        .from('training_events')
        .select('*, responsible_user:responsible_user_id(full_name)')
        .eq('status', 'published')
        .order('start_datetime', { ascending: true });

      if (!isSuperAdmin && userOrgId) {
        query = query.eq('organization_id', userOrgId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: isSuperAdmin || !!userOrgId,
  });

  // Filter events by date
  const filteredEvents = events?.filter(event => {
    const eventDate = new Date(event.start_datetime);
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    let matchesDate = true;
    switch (dateFilter) {
      case 'today':
        matchesDate = isToday(eventDate);
        break;
      case 'tomorrow':
        matchesDate = isTomorrow(eventDate);
        break;
      case 'this_week':
        matchesDate = isWithinInterval(eventDate, { start: weekStart, end: weekEnd });
        break;
      case 'all':
        matchesDate = true;
        break;
    }

    const matchesSearch =
      event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.description?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesDate && matchesSearch;
  }) || [];

  // Check if attendance can be opened (10 mins before event)
  const canOpenAttendance = (startDatetime: string) => {
    const eventStart = new Date(startDatetime);
    const now = new Date();
    const openTime = addMinutes(eventStart, -10);
    return !isBefore(now, openTime);
  };

  const getTimeUntilOpen = (startDatetime: string) => {
    const eventStart = new Date(startDatetime);
    const now = new Date();
    const openTime = addMinutes(eventStart, -10);
    const diffMs = openTime.getTime() - now.getTime();
    const diffMins = Math.ceil(diffMs / (1000 * 60));

    if (diffMins > 60) {
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return `${hours}h ${mins}m`;
    }
    return `${diffMins}m`;
  };

  if (isLoading) {
    return <LoadingState message="Loading events..." />;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Select Event for Attendance
          </CardTitle>
          <CardDescription>
            Attendance opens 10 minutes before the event starts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date Filter Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={dateFilter === 'today' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateFilter('today')}
            >
              Today
            </Button>
            <Button
              variant={dateFilter === 'tomorrow' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateFilter('tomorrow')}
            >
              Tomorrow
            </Button>
            <Button
              variant={dateFilter === 'this_week' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateFilter('this_week')}
            >
              This Week
            </Button>
            <Button
              variant={dateFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateFilter('all')}
            >
              All Events
            </Button>
          </div>

          {/* Search */}
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
            {(searchQuery || dateFilter !== 'today') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setDateFilter('today');
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

      {/* Events List */}
      {filteredEvents.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No Events Found"
          description={
            dateFilter === 'today'
              ? "No events scheduled for today."
              : dateFilter === 'tomorrow'
                ? "No events scheduled for tomorrow."
                : "No events match your filters."
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEvents.map((event) => {
            const isSelected = selectedEventId === event.id;
            const canOpen = canOpenAttendance(event.start_datetime);
            const eventDate = new Date(event.start_datetime);

            return (
              <Card
                key={event.id}
                className={`cursor-pointer transition-all duration-200 hover:shadow-md ${isSelected ? 'ring-2 ring-primary border-primary' : ''
                  } ${!canOpen ? 'opacity-75' : ''}`}
                onClick={() => canOpen && onSelectEvent(event.id)}
              >
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold line-clamp-2">{event.title}</h3>
                    {isSelected && (
                      <CheckCircle className="h-5 w-5 text-primary shrink-0" />
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-xs">
                      {event.event_type}
                    </Badge>
                    {isToday(eventDate) && (
                      <Badge className="bg-emerald-500 text-white text-xs">Today</Badge>
                    )}
                    {isTomorrow(eventDate) && (
                      <Badge className="bg-blue-500 text-white text-xs">Tomorrow</Badge>
                    )}
                  </div>

                  <div className="space-y-1.5 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{format(eventDate, 'EEE, MMM d, yyyy')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{format(eventDate, 'h:mm a')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {event.location_type === 'online' ? (
                        <Video className="h-3.5 w-3.5" />
                      ) : (
                        <MapPin className="h-3.5 w-3.5" />
                      )}
                      <span className="capitalize">{event.location_type}</span>
                    </div>
                  </div>

                  {!canOpen ? (
                    <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        Opens in {getTimeUntilOpen(event.start_datetime)}
                      </span>
                    </div>
                  ) : (
                    <Button
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      className="w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(event.id);
                      }}
                    >
                      <Users className="h-4 w-4 mr-2" />
                      {isSelected ? 'Selected' : 'Manage Attendance'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AttendanceEventSelector;