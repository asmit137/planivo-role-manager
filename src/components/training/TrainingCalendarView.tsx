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
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
          <h2 className="text-sm sm:text-lg font-semibold truncate leading-none">
            Training Calendar
          </h2>
        </div>

        <div className="flex flex-col gap-2 w-full sm:w-auto">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-[140px] h-7 sm:h-10 text-[9px] sm:text-sm">
              <SelectValue placeholder="Event Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[9px] sm:text-sm">All Types</SelectItem>
              <SelectItem value="training" className="text-[9px] sm:text-sm">Training</SelectItem>
              <SelectItem value="workshop" className="text-[9px] sm:text-sm">Workshop</SelectItem>
              <SelectItem value="seminar" className="text-[9px] sm:text-sm">Seminar</SelectItem>
              <SelectItem value="webinar" className="text-[9px] sm:text-sm">Webinar</SelectItem>
              <SelectItem value="meeting" className="text-[9px] sm:text-sm">Meeting</SelectItem>
              <SelectItem value="conference" className="text-[9px] sm:text-sm">Conference</SelectItem>
              <SelectItem value="other" className="text-[9px] sm:text-sm">Other</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-[140px] h-7 sm:h-10 text-[9px] sm:text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[9px] sm:text-sm">All Status</SelectItem>
              <SelectItem value="published" className="text-[9px] sm:text-sm">Published</SelectItem>
              <SelectItem value="draft" className="text-[9px] sm:text-sm">Draft</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card className="border-2">
        <CardContent className="p-2 sm:p-6 overflow-hidden">
          <div className="w-full overflow-x-auto">
            <Calendar
              mode="single"
              selected={currentMonth}
              onSelect={(date) => date && setCurrentMonth(date)}
              onMonthChange={setCurrentMonth}
              month={currentMonth}
              className="p-0 pointer-events-auto w-full"
              classNames={{
                months: "flex flex-col gap-2 sm:gap-8 w-full justify-center",
                month: "space-y-2 sm:space-y-4 flex-1",
                caption: "flex justify-center pt-1 relative items-center mb-1 sm:mb-8 h-7 sm:h-12",
                caption_label: "text-xs sm:text-2xl font-bold tracking-tight",
                nav: "flex items-center",
                nav_button: "h-6 w-6 sm:h-10 sm:w-10 bg-transparent p-0 opacity-60 hover:opacity-100 hover:bg-accent rounded-md sm:rounded-xl transition-all flex items-center justify-center z-20",
                nav_button_previous: "absolute left-0 top-1/2 -translate-y-1/2",
                nav_button_next: "absolute right-0 top-1/2 -translate-y-1/2",
                table: "w-full border-collapse",
                head_row: "flex w-full mb-1 sm:mb-4",
                head_cell: "text-muted-foreground/60 rounded-md font-bold text-[0.45rem] sm:text-xs uppercase tracking-widest flex-1 min-w-0 text-center",
                row: "flex w-full mt-0.5 sm:mt-2",
                cell: "relative p-0.5 text-center focus-within:relative focus-within:z-20 flex-1 min-w-0 min-h-[34px] sm:min-h-[64px]",
                day: "h-full w-full p-0 font-normal hover:bg-accent/50 rounded-lg sm:rounded-xl transition-all touch-manipulation",
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
                            "h-full w-full p-1 sm:p-2 font-normal rounded-lg sm:rounded-xl transition-all relative group touch-manipulation flex flex-col items-center justify-center gap-0.5 sm:gap-1 overflow-hidden border-2",
                            hasEvents && "bg-emerald-100 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-200 dark:hover:bg-emerald-900",
                            !hasEvents && "border-transparent hover:bg-accent/50",
                            !isCurrentMonth && "opacity-30"
                          )}
                        >
                          <time
                            dateTime={format(date, "yyyy-MM-dd")}
                            className={cn(
                              "text-[9px] sm:text-lg font-medium transition-colors w-full text-center",
                              isToday ? "text-primary font-bold" : "text-foreground/70"
                            )}
                          >
                            {format(date, "d")}
                          </time>

                          {hasEvents && (
                            <div className="w-full flex items-center justify-between mt-auto">
                              <div className={cn(
                                "text-white text-[6px] sm:text-[10px] font-black rounded-sm sm:rounded-lg px-0.5 sm:px-1.5 py-0 sm:py-0.5 flex items-center justify-center shadow-md z-10 border border-white/10 bg-emerald-500"
                              )}>
                                {dayEvents.length}
                              </div>

                              <div className="hidden sm:flex -space-x-1.5 overflow-hidden">
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
                        <PopoverContent className="w-[calc(100vw-2rem)] sm:w-80 p-0 overflow-hidden border-border" align="center">
                          <div className="p-4 border-b bg-muted/10">
                            <h4 className="font-bold text-lg">
                              {format(date, "MMMM d, yyyy")}
                            </h4>
                            <p className="text-sm text-muted-foreground mt-1">
                              {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''} scheduled
                            </p>
                          </div>
                          <div className="p-3 space-y-3 max-h-[60vh] overflow-y-auto">
                            {dayEvents.map((event: any) => (
                              <EventPopover
                                key={event.id}
                                event={event}
                                isRegistered={registrations?.includes(event.id) || false}
                                onJoin={() => navigate(`/meeting?eventId=${event.id}`)}
                              />
                            ))}
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
        <CardHeader className="p-3 sm:pb-2">
          <CardTitle className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground">Legend</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className="grid grid-cols-2 xs:grid-cols-3 sm:flex sm:flex-wrap gap-1.5 sm:gap-4">
            {Object.entries(eventTypeColors).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md bg-muted/50 border">
                <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-[9px] sm:text-xs capitalize font-medium truncate">{type}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-4 py-4 sm:px-6">
          <CardTitle className="text-lg sm:text-base flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-primary" />
            Events This Month
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {events?.length || 0} events scheduled for {format(currentMonth, 'MMMM yyyy')}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-6 pb-6">
          <div className="space-y-2 sm:space-y-3">
            {events?.length === 0 ? (
              <p className="text-xs sm:text-sm text-muted-foreground text-center py-6">
                No events scheduled for this month
              </p>
            ) : (
              events?.map(event => (
                <div
                  key={event.id}
                  className="flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg border bg-muted/20 hover:bg-muted/50 transition-colors"
                >
                  <div
                    className="w-1.5 sm:w-2 h-full min-h-[40px] rounded-full shrink-0"
                    style={{ backgroundColor: eventTypeColors[event.event_type] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-sm sm:text-base truncate">{event.title}</h4>
                      <Badge variant="outline" className="shrink-0 text-[10px] h-5 sm:h-6">
                        {eventTypeLabels[event.event_type]}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[10px] sm:text-xs text-muted-foreground font-medium">
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
                        <span className="flex items-center gap-1 text-primary">
                          <Video className="h-3 w-3" />
                          Video
                        </span>
                      )}
                      {registrations?.includes(event.id) && (
                        <Badge className="bg-emerald-500 text-white text-[9px] h-4 leading-none">Registered</Badge>
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
    <div className={cn(
      "relative flex gap-3 rounded-xl border p-3 transition-colors",
      event.event_type === 'training'
        ? "bg-teal-950/30 border-teal-900/50 hover:bg-teal-950/50"
        : "bg-card hover:bg-accent/50"
    )}>
      {/* Indicator Bar */}
      <div
        className="w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: eventTypeColors[event.event_type] }}
      />

      <div className="flex-1 min-w-0 space-y-2">
        <div className="space-y-1">
          <p className="font-bold text-base leading-none">{event.title}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px] font-medium h-5">
              {eventTypeLabels[event.event_type]}
            </Badge>
            {event.registration_type === 'mandatory' && (
              <Badge className="rounded-full px-2 py-0 text-[10px] bg-red-500 hover:bg-red-600 h-5 border-none">
                Mandatory
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>{format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}</span>
        </div>

        <div className="pt-1">
          {isRegistered ? (
            <div className="flex gap-2">
              {event.enable_video_conference && isOngoing && (
                <Button size="sm" onClick={onJoin} className="h-7 text-xs rounded-full bg-emerald-600 hover:bg-emerald-700">
                  <Video className="h-3 w-3 mr-1" />
                  Join
                </Button>
              )}
              <Badge variant="outline" className="rounded-full px-3 py-0.5 text-xs border-emerald-500/50 text-emerald-500 bg-emerald-500/10">
                Registered
              </Badge>
            </div>
          ) : (
            <Badge variant="outline" className="rounded-full px-3 py-0.5 text-xs text-muted-foreground font-normal">
              Not Registered
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrainingCalendarView;