-- STEP 6: TRAINING MODULE SETUP

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'training_event_type') THEN
        CREATE TYPE public.training_event_type AS ENUM ('training', 'workshop', 'seminar', 'webinar', 'meeting', 'conference', 'other');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'training_event_status') THEN
        CREATE TYPE public.training_event_status AS ENUM ('draft', 'published', 'cancelled', 'completed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'training_location_type') THEN
        CREATE TYPE public.training_location_type AS ENUM ('online', 'physical', 'hybrid');
    END IF;
END $$;

-- TRAINING EVENTS
CREATE TABLE IF NOT EXISTS public.training_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_type training_event_type NOT NULL DEFAULT 'training',
  location_type training_location_type NOT NULL DEFAULT 'physical',
  location_address TEXT,
  online_link TEXT,
  start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  max_participants INTEGER,
  created_by UUID NOT NULL,
  status training_event_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  enable_video_conference boolean DEFAULT false,
  jitsi_room_name text,
  jitsi_moderator_password text,
  allow_recording boolean DEFAULT false,
  require_lobby boolean DEFAULT true,
  max_video_participants integer DEFAULT 500
);

-- TRAINING REGISTRATIONS
CREATE TABLE IF NOT EXISTS public.training_registrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.training_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  registered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'registered',
  reminder_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE public.training_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_registrations ENABLE ROW LEVEL SECURITY;

-- TRAINING ATTENDANCE
CREATE TABLE IF NOT EXISTS public.training_attendance (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.training_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  left_at timestamp with time zone,
  attendance_status text DEFAULT 'present',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id, joined_at)
);

ALTER TABLE public.training_attendance ENABLE ROW LEVEL SECURITY;
