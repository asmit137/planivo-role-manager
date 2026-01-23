import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LoadingState } from '@/components/layout/LoadingState';
import { format, startOfMonth, endOfMonth, isSameDay, isSameMonth } from 'date-fns';
import { Calendar as CalendarIcon, Clock, MapPin, Video, Users, Globe, Target, Trash2 } from 'lucide-react';
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
  created_by: string | null;
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
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('published');
  const [selectedListEvent, setSelectedListEvent] = useState<TrainingEvent | null>(null);

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

  // Delete event mutation
  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from('training_events')
        .delete()
        .eq('id', eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-events-calendar'] });
      toast.success('Event deleted successfully');
      setSelectedListEvent(null);
      setIsDeleteDialogOpen(false);
    },
    onError: (error) => {
      console.error('Error deleting event:', error);
      toast.error('Failed to delete event');
    },
  });

  const handleDelete = () => {
    if (selectedListEvent) {
      deleteEventMutation.mutate(selectedListEvent.id);
    }
  };

  // Fetch creator for the selected event
  const { data: creatorProfile } = useQuery({
    queryKey: ['event-creator', selectedListEvent?.created_by],
    queryFn: async () => {
      if (!selectedListEvent || !selectedListEvent.created_by) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', selectedListEvent.created_by)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedListEvent,
  });

  // Fetch total registrations for the selected event
  const { data: totalRegistrationsCount } = useQuery({
    queryKey: ['event-registrations-count', selectedListEvent?.id],
    queryFn: async () => {
      if (!selectedListEvent?.id) return 0;
      const { count, error } = await supabase
        .from('training_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', selectedListEvent.id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!selectedListEvent,
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
          <SearchableSelect
            options={[
              { value: 'all', label: 'All Types' },
              { value: 'training', label: 'Training' },
              { value: 'workshop', label: 'Workshop' },
              { value: 'seminar', label: 'Seminar' },
              { value: 'webinar', label: 'Webinar' },
              { value: 'meeting', label: 'Meeting' },
              { value: 'conference', label: 'Conference' },
              { value: 'other', label: 'Other' },
            ]}
            value={filterType}
            onValueChange={setFilterType}
            placeholder="Event Type"
            className="w-full sm:w-[150px]"
          />

          <SearchableSelect
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'published', label: 'Published' },
              { value: 'draft', label: 'Draft' },
            ]}
            value={filterStatus}
            onValueChange={setFilterStatus}
            placeholder="Status"
            className="w-full sm:w-[150px]"
          />
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
              <div
                key={type}
                className={cn(
                  "flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md border cursor-pointer transition-all hover:bg-muted font-medium",
                  filterType === type ? "bg-primary/10 border-primary shadow-sm scale-105" : "bg-muted/50 border-transparent opacity-70 hover:opacity-100"
                )}
                onClick={() => setFilterType(filterType === type ? 'all' : type)}
              >
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
                  className="flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg border bg-muted/20 hover:bg-muted/50 transition-colors cursor-pointer group"
                  onClick={() => setSelectedListEvent(event)}
                >
                  <div
                    className="w-1.5 sm:w-2 h-full min-h-[40px] rounded-full shrink-0 transition-transform group-hover:scale-y-110"
                    style={{ backgroundColor: eventTypeColors[event.event_type] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-sm sm:text-base truncate group-hover:text-primary transition-colors">{event.title}</h4>
                      <div className="flex items-center gap-2">
                        {(event.status === 'completed' || new Date(event.end_datetime) < new Date()) && (
                          <Badge className="bg-slate-500 text-white bg-success text-[9px] h-4 sm:h-5 leading-none px-1.5 border-none">Completed</Badge>
                        )}
                        <Badge variant="outline" className="shrink-0 text-[10px] h-5 sm:h-6">
                          {eventTypeLabels[event.event_type]}
                        </Badge>
                      </div>
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

      {/* Event Details Dialog */}
      <Dialog open={!!selectedListEvent} onOpenChange={(open) => !open && setSelectedListEvent(null)}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-none shadow-2xl">
          {selectedListEvent && (
            <div className="relative">
              {/* Header with Background Pattern */}
              <div
                className="h-32 sm:h-40 w-full relative p-6 flex flex-col justify-end"
                style={{
                  backgroundColor: eventTypeColors[selectedListEvent.event_type],
                  backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%)'
                }}
              >
                <div className="absolute top-4 right-12 z-10 flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 bg-white/10 hover:bg-red-500/20 text-white border-white/20 hover:text-red-500 rounded-full backdrop-blur-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  {(selectedListEvent.status === 'completed' || new Date(selectedListEvent.end_datetime) < new Date()) && (
                    <Badge className="bg-white/20 backdrop-blur-md text-white border-white/30 text-[10px] uppercase font-bold tracking-tighter shadow-sm px-2 py-0.5">
                      Completed
                    </Badge>
                  )}
                  <Badge className="bg-white text-black border-none text-[10px] uppercase font-bold tracking-tighter shadow-sm px-2 py-0.5">
                    {eventTypeLabels[selectedListEvent.event_type]}
                  </Badge>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white drop-shadow-md leading-tight">
                  {selectedListEvent.title}
                </h3>
              </div>

              <div className="p-6 space-y-6 bg-background">
                {selectedListEvent.description && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Description</p>
                    <p className="text-sm text-foreground/80 leading-relaxed italic border-l-2 pl-4 border-muted">
                      {selectedListEvent.description}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 p-3 rounded-xl bg-muted/30 border border-muted/50">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      Duration
                    </p>
                    <div className="space-y-1">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Start</p>
                        <p className="text-xs font-bold">
                          {format(new Date(selectedListEvent.start_datetime), 'MMM d, yyyy @ p')}
                        </p>
                      </div>
                      <div className="pt-1 border-t border-muted/50">
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">End</p>
                        <p className="text-xs font-bold">
                          {format(new Date(selectedListEvent.end_datetime), 'MMM d, yyyy @ p')}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 p-3 rounded-xl bg-muted/30 border border-muted/50">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <Globe className="h-3 w-3" />
                      Event Mode
                    </p>
                    <div className="space-y-1">
                      <p className="text-xs font-bold capitalize">{selectedListEvent.location_type}</p>
                      <Badge variant="outline" className="text-[9px] h-4 py-0 font-medium">
                        {selectedListEvent.location_type === 'online' ? 'Internet Required' : 'On-site presence'}
                      </Badge>
                      <p className="text-[10px] text-muted-foreground pt-1 italic">
                        {selectedListEvent.enable_video_conference ? "Video conferencing enabled for this session." : "No virtual link available."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 p-3 rounded-xl bg-muted/30 border border-muted/50">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <Users className="h-3 w-3" />
                      Created By
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-brand-purple/10 flex items-center justify-center">
                        <Users className="h-3 w-3 text-brand-purple" />
                      </div>
                      <p className="text-xs font-bold truncate">
                        {creatorProfile?.full_name || "System Administrator"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 p-3 rounded-xl bg-muted/30 border border-muted/50">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <Target className="h-3 w-3" />
                      Registration
                    </p>
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold capitalize">{selectedListEvent.registration_type}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {selectedListEvent.max_participants ? `${selectedListEvent.max_participants} max seats` : "Unlimited capacity"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-dashed">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center -space-x-2">
                      <div className="h-8 w-8 rounded-full border-2 border-background bg-emerald-500/10 flex items-center justify-center text-[10px] font-bold text-emerald-600">
                        {totalRegistrationsCount}
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase block leading-none">Registered</span>
                      <span className="text-[9px] text-muted-foreground">Total Participants</span>
                    </div>
                  </div>

                  {registrations?.includes(selectedListEvent.id) && (
                    <Badge className="bg-emerald-500 text-white border-none text-[10px] px-3 py-1 font-bold uppercase tracking-widest">
                      Registered
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the event
              "{selectedListEvent?.title}" and remove all registration data associated with it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteEventMutation.isPending ? 'Deleting...' : 'Delete Event'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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