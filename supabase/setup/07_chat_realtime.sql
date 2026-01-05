-- STEP 7: CHAT AND REAL-TIME COMMUNICATION

-- TRAINING MEETING CHAT
CREATE TABLE IF NOT EXISTS public.training_meeting_chat (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.training_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message text NOT NULL,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- JITSI SERVER CONFIG
CREATE TABLE IF NOT EXISTS public.jitsi_server_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  server_url text NOT NULL,
  app_id text,
  app_secret text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

ALTER TABLE public.training_meeting_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jitsi_server_config ENABLE ROW LEVEL SECURITY;

-- ENABLE REAL-TIME
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

-- Add tables to realtime publication
-- Note: Some of these might already be added, we catch errors if they are.
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.training_events;
    EXCEPTION WHEN others THEN RAISE NOTICE 'Table already in publication';
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.training_registrations;
    EXCEPTION WHEN others THEN RAISE NOTICE 'Table already in publication';
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.training_meeting_chat;
    EXCEPTION WHEN others THEN RAISE NOTICE 'Table already in publication';
    END;
END $$;

-- CHAT INDICES
CREATE INDEX IF NOT EXISTS idx_training_attendance_event_id ON public.training_attendance(event_id);
CREATE INDEX IF NOT EXISTS idx_training_meeting_chat_event_id ON public.training_meeting_chat(event_id);
CREATE INDEX IF NOT EXISTS idx_training_meeting_chat_sent_at ON public.training_meeting_chat(sent_at);
