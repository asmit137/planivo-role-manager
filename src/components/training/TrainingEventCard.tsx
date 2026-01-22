import { format, formatDistanceToNow, isPast, isFuture } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Calendar,
  Clock,
  MapPin,
  Video,
  Users,
  CheckCircle,
  XCircle,
  ExternalLink,
  Loader2,
  Play,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface TrainingEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  location_type: string;
  location_address: string | null;
  online_link: string | null;
  start_datetime: string;
  end_datetime: string;
  max_participants: number | null;
  status: string;
  created_by: string;
  organization_id: string | null;
  enable_video_conference?: boolean;
}

interface TrainingEventCardProps {
  event: TrainingEvent;
  isAdminView?: boolean;
  onEdit?: (eventId: string) => void;
  onViewRegistrations?: (eventId: string) => void;
}

const TrainingEventCard = ({
  event,
  isAdminView = false,
  onEdit,
  onViewRegistrations
}: TrainingEventCardProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Check if user is already registered
  const { data: registration, isLoading: checkingRegistration } = useQuery({
    queryKey: ['training-registration', event.id, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('training_registrations')
        .select('id, status')
        .eq('event_id', event.id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Get registration count
  const { data: registrationCount } = useQuery({
    queryKey: ['training-registration-count', event.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('training_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .eq('status', 'registered');
      if (error) throw error;
      return count || 0;
    },
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('You must be logged in');

      // Check capacity
      if (event.max_participants && registrationCount && registrationCount >= event.max_participants) {
        throw new Error('This event has reached its maximum capacity');
      }

      // Check vacation availability (only for physical or hybrid events)
      if (event.location_type !== 'online') {
        const { data: availability, error: availabilityError } = await (supabase as any).rpc('check_staff_availability', {
          _staff_id: user.id,
          _start_time: event.start_datetime,
          _end_time: event.end_datetime
        });

        if (availabilityError) throw availabilityError;

        const availabilityData = availability as any;
        if (availabilityData && availabilityData.length > 0 && !availabilityData[0].is_available) {
          throw new Error(availabilityData[0].conflict_reason || 'You are on vacation during this event.');
        }
      }

      const { error } = await supabase
        .from('training_registrations')
        .insert({
          event_id: event.id,
          user_id: user.id,
          status: 'registered',
        });
      if (error) throw error;

      // Create confirmation notification
      await supabase.from('notifications').insert({
        user_id: user.id,
        title: 'Registration Confirmed',
        message: `You have successfully registered for "${event.title}"`,
        type: 'system',
        related_id: event.id,
      });
    },
    onSuccess: () => {
      toast.success('Successfully registered for the event!');
      queryClient.invalidateQueries({ queryKey: ['training-registration', event.id] });
      queryClient.invalidateQueries({ queryKey: ['training-registration-count', event.id] });
      queryClient.invalidateQueries({ queryKey: ['training-events'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to register');
    },
  });

  const cancelRegistrationMutation = useMutation({
    mutationFn: async () => {
      if (!user || !registration) return;
      const { error } = await supabase
        .from('training_registrations')
        .delete()
        .eq('id', registration.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Registration cancelled');
      queryClient.invalidateQueries({ queryKey: ['training-registration', event.id] });
      queryClient.invalidateQueries({ queryKey: ['training-registration-count', event.id] });
      queryClient.invalidateQueries({ queryKey: ['training-events'] });
    },
    onError: () => {
      toast.error('Failed to cancel registration');
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('cancel-training-event', {
        body: { eventId: event.id }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast.success('Event cancelled and notifications sent');
      queryClient.invalidateQueries({ queryKey: ['training-events'] });
      queryClient.invalidateQueries({ queryKey: ['training-events-calendar'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cancel event');
    },
  });

  const startDate = new Date(event.start_datetime);
  const endDate = new Date(event.end_datetime);
  const isEventPast = isPast(endDate);
  const isEventUpcoming = isFuture(startDate);
  const isFull = event.max_participants ? registrationCount && registrationCount >= event.max_participants : false;
  const isRegistered = !!registration && registration.status === 'registered';

  const getEventTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      training: 'bg-blue-500/10 text-blue-700 border-blue-200',
      workshop: 'bg-purple-500/10 text-purple-700 border-purple-200',
      seminar: 'bg-green-500/10 text-green-700 border-green-200',
      webinar: 'bg-brand-purple/10 text-brand-purple border-brand-purple/20',
      meeting: 'bg-orange-500/10 text-orange-700 border-orange-200',
      conference: 'bg-pink-500/10 text-pink-700 border-pink-200',
      other: 'bg-gray-500/10 text-gray-700 border-gray-200',
    };
    return colors[type] || colors.other;
  };

  const getLocationIcon = () => {
    if (event.location_type === 'online') return <Video className="h-4 w-4" />;
    if (event.location_type === 'physical') return <MapPin className="h-4 w-4" />;
    return <><Video className="h-4 w-4" /><MapPin className="h-4 w-4" /></>;
  };

  const getStatusBadge = () => {
    if (isEventPast) return <Badge variant="secondary">Completed</Badge>;
    if (event.status === 'draft') return <Badge variant="outline" className="bg-amber-500 text-white">Draft</Badge>;
    if (event.status === 'cancelled') return <Badge variant="destructive">Cancelled</Badge>;
    if (isFull) return <Badge variant="secondary">Full</Badge>;
    return <Badge className="bg-emerald-500 text-white">Open</Badge>;
  };

  return (
    <Card className={`transition-all hover:shadow-md flex flex-col h-full ${isEventPast ? 'opacity-60' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-lg line-clamp-2">{event.title}</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={getEventTypeColor(event.event_type)}>
                {event.event_type.charAt(0).toUpperCase() + event.event_type.slice(1)}
              </Badge>
              {getStatusBadge()}
              {isRegistered && (
                <Badge className="bg-primary text-primary-foreground">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Registered
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 flex-1">
        {event.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
        )}

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4 shrink-0" />
            <span>{format(startDate, 'EEEE, MMMM d, yyyy')}</span>
          </div>

          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" />
            <div className="flex flex-col">
              <span>{format(startDate, 'h:mm a')} - {format(endDate, 'h:mm a')}</span>
              {format(startDate, 'yyyy-MM-dd') !== format(endDate, 'yyyy-MM-dd') && (
                <span className="text-[10px] text-amber-600 font-medium">
                  Ends on {format(endDate, 'EEEE, MMM d')}
                </span>
              )}
            </div>
            {isEventUpcoming && (
              <span className="ml-auto text-primary font-medium text-xs">
                ({formatDistanceToNow(startDate, { addSuffix: true })})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-muted-foreground">
            {getLocationIcon()}
            <span className="capitalize">{event.location_type}</span>
            {event.location_address && <span>• {event.location_address}</span>}
          </div>

          {event.max_participants && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4 shrink-0" />
              <span>{registrationCount || 0} / {event.max_participants} participants</span>
            </div>
          )}
        </div>

        {event.online_link && isRegistered && (
          <a
            href={event.online_link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
            Join Online Session
          </a>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2 pt-4 border-t">
        {/* Video Conference Join Button */}
        {event.enable_video_conference && (isRegistered || isAdminView) && !isEventPast && (
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => navigate(`/meeting?eventId=${event.id}`)}
          >
            <Play className="h-4 w-4 mr-2" />
            Join Video Meeting
          </Button>
        )}

        {!isAdminView && !isEventPast && event.status === 'published' && (
          <>
            {isRegistered ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => cancelRegistrationMutation.mutate()}
                disabled={cancelRegistrationMutation.isPending}
              >
                {cancelRegistrationMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                Cancel Registration
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => registerMutation.mutate()}
                disabled={registerMutation.isPending || isFull || checkingRegistration}
              >
                {registerMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                {isFull ? 'Event Full' : 'Register'}
              </Button>
            )}
          </>
        )}

        {isAdminView && (
          <div className="flex items-center gap-2 w-full">
            <div className="flex gap-2 flex-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-block">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit?.(event.id)}
                        disabled={isEventPast}
                      >
                        Edit
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {isEventPast && (
                    <TooltipContent>
                      <p>Completed events cannot be edited</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>

              <Button variant="outline" size="sm" onClick={() => onViewRegistrations?.(event.id)}>
                <Users className="h-4 w-4 mr-2" />
                Registrations ({registrationCount || 0})
              </Button>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive-ghost" size="sm" className="shrink-0">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Delete Event
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{event.title}"? This action cannot be undone and all registrations will be lost.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteEventMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={deleteEventMutation.isPending}
                  >
                    {deleteEventMutation.isPending ? "Deleting..." : "Delete Event"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </CardFooter>
    </Card>
  );
};

export default TrainingEventCard;
