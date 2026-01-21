import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { LoadingState } from '@/components/layout/LoadingState';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Users,
  MessageSquare,
  Settings,
  Maximize,
  Minimize
} from 'lucide-react';
import MeetingChatPanel from './MeetingChatPanel';

interface JitsiMeetingRoomProps {
  eventId: string;
  onLeave?: () => void;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

const JitsiMeetingRoom = ({ eventId, onLeave }: JitsiMeetingRoomProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const attendanceIdRef = useRef<string | null>(null);

  // Fetch event details
  const { data: event } = useQuery({
    queryKey: ['training-event-video', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_events')
        .select('*')
        .eq('id', eventId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch Jitsi server config
  const { data: jitsiConfig } = useQuery({
    queryKey: ['jitsi-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jitsi_server_config')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data || { server_url: 'https://meet.jit.si' };
    },
  });

  // Fetch user profile for display name
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Log attendance when joining
  const logAttendanceMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('training_attendance')
        .insert({
          event_id: eventId,
          user_id: user.id,
          joined_at: new Date().toISOString(),
          attendance_status: 'present',
        })
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      attendanceIdRef.current = data.id;
    },
  });

  // Update attendance when leaving
  const updateAttendanceMutation = useMutation({
    mutationFn: async () => {
      if (!attendanceIdRef.current) return;
      const { error } = await supabase
        .from('training_attendance')
        .update({
          left_at: new Date().toISOString(),
        })
        .eq('id', attendanceIdRef.current);
      if (error) throw error;
    },
  });

  useEffect(() => {
    if (!event || !jitsiConfig || !profile || !jitsiContainerRef.current) return;

    // Load Jitsi Meet External API script
    let serverUrl = jitsiConfig.server_url || 'https://meet.jit.si';
    serverUrl = serverUrl.replace(/\/$/, ''); // Remove trailing slash if present
    const scriptSrc = `${serverUrl}/external_api.js`;

    const script = document.createElement('script');
    script.src = scriptSrc;
    script.async = true;
    script.onload = initializeJitsi;
    script.onerror = () => {
      console.error(`Failed to load Jitsi script from: ${scriptSrc}`);
      toast.error(`Failed to load video conferencing system from ${scriptSrc}`);
      setIsLoading(false);
    };
    document.body.appendChild(script);

    return () => {
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
      }
      document.body.removeChild(script);
      // Update attendance on unmount
      updateAttendanceMutation.mutate();
    };
  }, [event, jitsiConfig, profile]);

  const initializeJitsi = () => {
    if (!event || !jitsiConfig || !profile || !jitsiContainerRef.current) return;

    let serverUrl = jitsiConfig.server_url || 'https://meet.jit.si';
    serverUrl = serverUrl.replace(/\/$/, '');

    // Ensure protocol is present for URL constructor
    if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
      serverUrl = `https://${serverUrl}`;
    }

    const domain = new URL(serverUrl).hostname;
    const roomName = event.jitsi_room_name || `planivo-${eventId}`;

    const options = {
      roomName,
      parentNode: jitsiContainerRef.current,
      width: '100%',
      height: '100%',
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        prejoinPageEnabled: true,
        disableDeepLinking: true,
        enableWelcomePage: false,
        enableClosePage: false,
        // disableInviteFunctions: true,
        // requireDisplayName: true,
        enableLobbyChat: false,
        ...(event.allow_recording && { fileRecordingsEnabled: true }),
      },
      interfaceConfigOverwrite: {
        TOOLBAR_BUTTONS: [
          'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
          'fodeviceselection', 'hangup', 'chat', 'raisehand',
          'videoquality', 'stats', 'shortcuts', 'tileview',
          ...(event.allow_recording ? ['recording'] : []),
        ],
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        DEFAULT_BACKGROUND: '#1a1a2e',
        TOOLBAR_ALWAYS_VISIBLE: false,
        FILM_STRIP_MAX_HEIGHT: 120,
        ENABLE_FEEDBACK_ANIMATION: false,
      },
      userInfo: {
        displayName: profile.full_name,
        email: profile.email,
      },
    };

    try {
      jitsiApiRef.current = new window.JitsiMeetExternalAPI(domain, options);

      // Event listeners
      jitsiApiRef.current.addListener('videoConferenceJoined', () => {
        setIsLoading(false);
        logAttendanceMutation.mutate();
        toast.success('Joined video meeting');
      });

      jitsiApiRef.current.addListener('videoConferenceLeft', () => {
        updateAttendanceMutation.mutate();
        onLeave?.();
      });

      jitsiApiRef.current.addListener('participantJoined', () => {
        setParticipantCount(prev => prev + 1);
      });

      jitsiApiRef.current.addListener('participantLeft', () => {
        setParticipantCount(prev => Math.max(0, prev - 1));
      });

      jitsiApiRef.current.addListener('audioMuteStatusChanged', (data: { muted: boolean }) => {
        setIsAudioMuted(data.muted);
      });

      jitsiApiRef.current.addListener('videoMuteStatusChanged', (data: { muted: boolean }) => {
        setIsVideoMuted(data.muted);
      });

      // Get initial participant count
      try {
        const count = jitsiApiRef.current.getNumberOfParticipants();
        setParticipantCount(count);
      } catch (e) {
        console.warn('Could not get initial participant count:', e);
      }

    } catch (error) {
      console.error('Jitsi initialization error:', error);
      // Don't show generic error for membersOnly/connection issues as the banner handles it
      if (error?.toString().includes('membersOnly') || error?.toString().includes('connection')) {
        return;
      }
      toast.error('Failed to initialize video meeting');
      setIsLoading(false);
    }
  };

  const toggleAudio = () => {
    jitsiApiRef.current?.executeCommand('toggleAudio');
  };

  const toggleVideo = () => {
    jitsiApiRef.current?.executeCommand('toggleVideo');
  };

  const hangUp = () => {
    jitsiApiRef.current?.executeCommand('hangup');
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      jitsiContainerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  if (!jitsiConfig) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-destructive text-center">
            Video conferencing is not configured. Please contact your administrator.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-card border-b">
        <div className="flex items-center gap-3">
          <Video className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold">{event?.title || 'Video Meeting'}</h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{participantCount} participant{participantCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowChat(!showChat)}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Chat
          </Button>
          <Badge variant={event?.enable_video_conference ? 'default' : 'secondary'}>
            {isLoading ? 'Connecting...' : 'Live'}
          </Badge>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Info Banner for Jitsi Auth */}
        <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-2 border-b border-blue-100 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 flex items-center justify-center text-center">
          <span>
            <strong>Note:</strong> If you see "Waiting for moderator", please click the <strong>Log-in</strong> button in the video window to start the meeting.
          </span>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Video container */}
          <div className="flex-1 relative bg-black">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <LoadingState message="Connecting to video meeting..." />
              </div>
            )}
            <div ref={jitsiContainerRef} className="w-full h-full" />

            {/* Custom controls overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant={isAudioMuted ? 'destructive' : 'secondary'}
                  size="icon"
                  className="rounded-full h-12 w-12"
                  onClick={toggleAudio}
                >
                  {isAudioMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>
                <Button
                  variant={isVideoMuted ? 'destructive' : 'secondary'}
                  size="icon"
                  className="rounded-full h-12 w-12"
                  onClick={toggleVideo}
                >
                  {isVideoMuted ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  className="rounded-full h-14 w-14"
                  onClick={hangUp}
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="rounded-full h-12 w-12"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Chat panel */}
          {showChat && (
            <div className="w-80 border-l bg-card">
              <MeetingChatPanel eventId={eventId} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JitsiMeetingRoom;
