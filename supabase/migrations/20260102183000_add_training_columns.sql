-- Add missing columns to training_events table
ALTER TABLE public.training_events
ADD COLUMN IF NOT EXISTS registration_type TEXT NOT NULL DEFAULT 'open' CHECK (registration_type IN ('open', 'mandatory', 'invite_only')),
ADD COLUMN IF NOT EXISTS responsible_user_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS enable_video_conference BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS allow_recording BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS require_lobby BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS max_video_participants INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS jitsi_room_name TEXT;

-- Add index for performance on responsible_user_id
CREATE INDEX IF NOT EXISTS idx_training_events_responsible_user ON public.training_events(responsible_user_id);
