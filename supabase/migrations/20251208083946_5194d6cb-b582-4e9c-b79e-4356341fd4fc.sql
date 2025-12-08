-- Create training event types enum
CREATE TYPE public.training_event_type AS ENUM ('training', 'workshop', 'seminar', 'webinar', 'meeting', 'conference', 'other');

-- Create training event status enum
CREATE TYPE public.training_event_status AS ENUM ('draft', 'published', 'cancelled', 'completed');

-- Create location type enum
CREATE TYPE public.training_location_type AS ENUM ('online', 'physical', 'hybrid');

-- Create training events table
CREATE TABLE public.training_events (
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
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create training registrations table
CREATE TABLE public.training_registrations (
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

-- Enable RLS
ALTER TABLE public.training_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_registrations ENABLE ROW LEVEL SECURITY;

-- RLS for training_events
CREATE POLICY "Super admins can manage all training events"
ON public.training_events
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins can manage organization training events"
ON public.training_events
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN workspaces w ON ur.workspace_id = w.id
    WHERE ur.user_id = auth.uid()
    AND w.organization_id = training_events.organization_id
    AND ur.role IN ('general_admin'::app_role, 'workplace_supervisor'::app_role, 'facility_supervisor'::app_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN workspaces w ON ur.workspace_id = w.id
    WHERE ur.user_id = auth.uid()
    AND w.organization_id = training_events.organization_id
    AND ur.role IN ('general_admin'::app_role, 'workplace_supervisor'::app_role, 'facility_supervisor'::app_role)
  )
);

CREATE POLICY "Users can view published training events"
ON public.training_events
FOR SELECT
USING (
  status = 'published'::training_event_status AND
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN workspaces w ON ur.workspace_id = w.id
    WHERE ur.user_id = auth.uid()
    AND w.organization_id = training_events.organization_id
  )
);

-- RLS for training_registrations
CREATE POLICY "Users can register for events"
ON public.training_registrations
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view their own registrations"
ON public.training_registrations
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own registrations"
ON public.training_registrations
FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own registrations"
ON public.training_registrations
FOR DELETE
USING (user_id = auth.uid());

CREATE POLICY "Admins can view event registrations"
ON public.training_registrations
FOR SELECT
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR
  EXISTS (
    SELECT 1 FROM training_events te
    JOIN workspaces w ON w.organization_id = te.organization_id
    JOIN user_roles ur ON ur.workspace_id = w.id
    WHERE te.id = training_registrations.event_id
    AND ur.user_id = auth.uid()
    AND ur.role IN ('general_admin'::app_role, 'workplace_supervisor'::app_role, 'facility_supervisor'::app_role)
  )
);

-- Add updated_at trigger for training_events
CREATE TRIGGER update_training_events_updated_at
BEFORE UPDATE ON public.training_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add updated_at trigger for training_registrations
CREATE TRIGGER update_training_registrations_updated_at
BEFORE UPDATE ON public.training_registrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for training tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.training_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.training_registrations;