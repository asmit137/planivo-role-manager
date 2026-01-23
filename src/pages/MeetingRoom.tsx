import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import JitsiMeetingRoom from '@/components/training/JitsiMeetingRoom';
import { LoadingState } from '@/components/layout/LoadingState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Video } from 'lucide-react';

const MeetingRoom = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get('eventId');
  const { user, loading: authLoading } = useAuth();

  // Verify user is registered for this event
  const { data: registration, isLoading: regLoading } = useQuery({
    queryKey: ['meeting-registration', eventId, user?.id],
    queryFn: async () => {
      if (!user || !eventId) return null;
      const { data, error } = await supabase
        .from('training_registrations')
        .select('id, status')
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .eq('status', 'registered')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!eventId,
  });

  // Fetch event details
  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: ['meeting-event', eventId],
    queryFn: async () => {
      if (!eventId) return null;
      const { data, error } = await supabase
        .from('training_events')
        .select('*')
        .eq('id', eventId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  const handleLeave = () => {
    navigate('/dashboard?tab=training');
  };

  if (authLoading || regLoading || eventLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingState message="Preparing meeting room..." />
      </div>
    );
  }

  if (!eventId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <Video className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">No Meeting Selected</h2>
            <p className="text-muted-foreground">
              Please select a meeting from your training events.
            </p>
            <Button onClick={() => navigate('/dashboard?tab=training')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Training
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // We allow access even if not registered, per user request "only details not register"
  // JitsiMeetingRoom will still log attendance if they actually join.

  if (!event?.enable_video_conference) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <Video className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">Video Not Available</h2>
            <p className="text-muted-foreground">
              Video conferencing is not enabled for this event.
            </p>
            <Button onClick={() => navigate('/dashboard?tab=training')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Training
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      <JitsiMeetingRoom eventId={eventId} onLeave={handleLeave} />
    </div>
  );
};

export default MeetingRoom;
