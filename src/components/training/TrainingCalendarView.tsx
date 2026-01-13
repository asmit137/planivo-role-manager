import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LoadingState } from '@/components/layout/LoadingState';
import { format, startOfMonth, endOfMonth, isSameDay, isSameMonth } from 'date-fns';
import { Calendar as CalendarIcon, Clock, MapPin, Video, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type EventType = 'training' | 'workshop' | 'seminar' | 'webinar' | 'meeting' | 'conference' | 'other';

interface TrainingEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: EventType;
  location_type: 'online' | 'physical' | 'hybrid';
  start_datetime: string;
  end_datetime: string;
  status: string;
  max_participants: number | null;
  enable_video_conference: boolean;
  registration_type: string;
  responsible_user_id: string | null;
}

const eventTypeColors: Record<EventType, string> = {
  training: '#3b82f6',
  workshop: '#10b981',
  seminar: '#f59e0b',
  webinar: '#8b5cf6',
  meeting: '#f43f5e',
  conference: '#06b6d4',
  other: '#6b7280',
};

const eventTypeLabels: Record<EventType, string> = {
  training: 'Training',
  workshop: 'Workshop',
  seminar: 'Seminar',
  webinar: 'Webinar',
  meeting: 'Meeting',
  conference: 'Conference',
  other: 'Other',
};

const TrainingCalendarView = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('published');

  // Fetch events for current month range
  const { data: events, isLoading } = useQuery({
    queryKey: ['training-events-calendar', currentMonth, filterType, filterStatus],
    queryFn: async () => {
      const start = startOfMonth(currentMonth);
      const end = endOfMonth(currentMonth);

      let query = supabase
        .from('training_events')
        .select('*')
        .gte('start_datetime', start.toISOString())
        .lte('start_datetime', end.toISOString())
        .order('start_datetime');

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus as 'draft' | 'published' | 'cancelled' | 'completed');
      }

      if (filterType !== 'all') {
        query = query.eq('event_type', filterType as EventType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as TrainingEvent[];
    },
  });

  // Fetch user's registrations
  const { data: registrations } = useQuery({
    queryKey: ['my-registrations', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('training_registrations')
        .select('event_id')
        .eq('user_id', user.id);
      if (error) throw error;
      return data.map(r => r.event_id);
    },
    enabled: !!user,
  });

  const getEventsForDay = (day: Date) => {
    if (!events) return [];
    return events.filter(event =>
      isSameDay(new Date(event.start_datetime), day)
    );
  };

  if (isLoading) {
    return <LoadingState message="Loading calendar..." />;
  }

  return (
    <div className="space-y-4">
      {/* Header with navigation and filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold min-w-[160px]">
            Training Calendar
          </h2>
        </div>

        <div className="flex gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[140px]">
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

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card className="border-2">
        <CardContent className="p-3 sm:p-6 overflow-x-auto">
          <div className="min-w-[320px]">
            <Calendar
              mode="single"
              selected={currentMonth}
              onSelect={(date) => date && setCurrentMonth(date)}
              onMonthChange={setCurrentMonth}
              month={currentMonth}
              className="rounded-md w-full pointer-events-auto"
              classNames={{
                months: "flex flex-col gap-4 sm:gap-8 w-full justify-center",
                month: "space-y-4 flex-1",
                caption: "flex justify-center pt-1 relative items-center mb-4 sm:mb-8",
                caption_label: "text-lg sm:text-2xl font-bold tracking-tight",
                nav: "flex items-center",
                nav_button: "h-10 w-10 bg-transparent p-0 opacity-60 hover:opacity-100 hover:bg-accent rounded-xl transition-all flex items-center justify-center z-20",
                nav_button_previous: "absolute left-0 top-1/2 -translate-y-1/2",
                nav_button_next: "absolute right-0 top-1/2 -translate-y-1/2",
                table: "w-full border-collapse",
                head_row: "flex w-full mb-4",
                head_cell: "text-muted-foreground/60 rounded-md font-bold text-[0.65rem] sm:text-xs uppercase tracking-widest flex-1 text-center",
                row: "flex w-full mt-2",
                cell: "relative p-0.5 text-center focus-within:relative focus-within:z-20 flex-1 h-10 sm:h-16",
                day: "h-full w-full p-0 font-normal hover:bg-accent/50 rounded-xl transition-all touch-manipulation",
                day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground shadow-lg shadow-primary/20",
                day_today: "bg-accent/30 text-accent-foreground font-bold ring-2 ring-primary/20 ring-offset-2",
                day_outside: "text-muted-foreground opacity-20",
                day_disabled: "text-muted-foreground opacity-20",
                day_hidden: "invisible",
              }}
              components={{
                Day: ({ date, displayMonth, ...props }: any) => {
                  const dayEvents = getEventsForDay(date);
                  const hasEvents = dayEvents.length > 0;
                  const isCurrentMonth = isSameMonth(date, currentMonth);
                  const isToday = isSameDay(date, new Date());

                  return (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          {...props}
                          className={cn(
                            "h-full w-full p-2 font-normal rounded-xl transition-all relative group touch-manipulation flex flex-col items-center justify-center gap-1 overflow-hidden border-2",
                            hasEvents && "bg-emerald-100 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-200 dark:hover:bg-emerald-900",
                            !hasEvents && "border-transparent hover:bg-accent/50",
                            !isCurrentMonth && "opacity-30"
                          )}
                        >
                          <time
                            dateTime={format(date, "yyyy-MM-dd")}
                            className={cn(
                              "text-sm sm:text-lg font-medium transition-colors w-full text-center",
                              isToday ? "text-primary font-bold" : "text-foreground/70"
                            )}
                          >
                            {format(date, "d")}
                          </time>

                          {hasEvents && (
                            <div className="w-full flex items-center justify-between">
                              <div className={cn(
                                "text-white text-[9px] sm:text-[10px] font-black rounded-lg px-1.5 py-0.5 flex items-center justify-center shadow-md z-10 border border-white/10 bg-emerald-500"
                              )}>
                                {dayEvents.length}
                              </div>

                              <div className="flex -space-x-1.5 overflow-hidden">
                                {dayEvents.slice(0, 3).map((event: any, idx: number) => (
                                  <div
                                    key={idx}
                                    className="h-2 w-2 sm:h-3 sm:w-3 rounded-full border-2 border-background shadow-sm"
                                    style={{ backgroundColor: eventTypeColors[event.event_type as EventType] || '#10b981' }}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </button>
                      </PopoverTrigger>
                      {hasEvents && (
                        <PopoverContent className="w-80 p-3 sm:p-4 max-h-[60vh] overflow-y-auto" side="bottom" align="center">
                          <div className="space-y-3">
                            <h4 className="font-semibold text-lg border-b pb-2">
                              {format(date, "MMMM d, yyyy")}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {dayEvents.length} event{dayEvents.length > 1 ? 's' : ''} scheduled
                            </p>
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                              {dayEvents.map((event: any) => (
                                <EventPopover
                                  key={event.id}
                                  event={event}
                                  isRegistered={registrations?.includes(event.id) || false}
                                  onJoin={() => navigate(`/meeting?eventId=${event.id}`)}
                                />
                              ))}
                            </div>
                          </div>
                        </PopoverContent>
                      )}
                    </Popover>
                  );
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(eventTypeColors).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
                <span className="text-xs capitalize">{type}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Events List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarIcon className="h-4 w-4" />
            Events This Month
          </CardTitle>
          <CardDescription>
            {events?.length || 0} events scheduled
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {events?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No events scheduled for this month
              </p>
            ) : (
              events?.map(event => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div
                    className="w-2 h-full min-h-[40px] rounded-full"
                    style={{ backgroundColor: eventTypeColors[event.event_type] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium truncate">{event.title}</h4>
                      <Badge variant="outline" className="shrink-0">
                        {eventTypeLabels[event.event_type]}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(event.start_datetime), 'MMM d, h:mm a')}
                      </span>
                      {event.location_type !== 'online' && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {event.location_type}
                        </span>
                      )}
                      {event.enable_video_conference && (
                        <span className="flex items-center gap-1">
                          <Video className="h-3 w-3" />
                          Video
                        </span>
                      )}
                      {registrations?.includes(event.id) && (
                        <Badge className="bg-emerald-500 text-white text-xs">Registered</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Event card for popover
const EventPopover = ({
  event,
  isRegistered,
  onJoin
}: {
  event: TrainingEvent;
  isRegistered: boolean;
  onJoin: () => void;
}) => {
  const startTime = new Date(event.start_datetime);
  const endTime = new Date(event.end_datetime);
  const isOngoing = new Date() >= startTime && new Date() <= endTime;

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors">
      <div
        className="w-3 h-10 rounded"
        style={{ backgroundColor: eventTypeColors[event.event_type] }}
      />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="font-medium truncate">{event.title}</p>
        <Badge variant="outline" className="text-xs">
          {eventTypeLabels[event.event_type]}
        </Badge>
        {event.registration_type === 'mandatory' && (
          <Badge className="ml-1 bg-red-500 text-white text-xs">Mandatory</Badge>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}</span>
        </div>
        <div className="flex gap-2 pt-1">
          {isRegistered && event.enable_video_conference && isOngoing && (
            <Button size="sm" onClick={onJoin} className="h-7 text-xs">
              <Video className="h-3 w-3 mr-1" />
              Join
            </Button>
          )}
          {isRegistered ? (
            <Badge className="bg-emerald-500 text-white text-xs">✓ Registered</Badge>
          ) : (
            <Badge variant="outline" className="text-xs">Not Registered</Badge>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrainingCalendarView;