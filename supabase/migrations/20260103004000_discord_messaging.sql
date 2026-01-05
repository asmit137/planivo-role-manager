-- Add type and scope to conversations
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS type text DEFAULT 'dm' CHECK (type IN ('channel', 'group', 'dm')),
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id),
ADD COLUMN IF NOT EXISTS slug text; -- For channel names like #general

-- Migrate existing data
UPDATE public.conversations SET type = 'group' WHERE is_group = true AND type = 'dm';

-- Add unique constraint for channel slugs per workspace
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_workspace_slug ON public.conversations (workspace_id, slug) WHERE type = 'channel';

-- Trigger to handle channel slug generation
CREATE OR REPLACE FUNCTION public.generate_channel_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'channel' AND NEW.slug IS NULL THEN
    NEW.slug := lower(regexp_replace(NEW.title, '[^a-zA-Z0-9]', '-', 'g'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_channel_slug
BEFORE INSERT OR UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.generate_channel_slug();

-- RLS Update (Simulated via policy replacement/addition)
-- Drop existing insert policy if simple, or add new specific ones
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;

CREATE POLICY "Admin roles can create channels"
ON public.conversations FOR INSERT
TO authenticated
WITH CHECK (
  (type = 'channel' AND (
    has_role(auth.uid(), 'super_admin') OR 
    has_role(auth.uid(), 'department_head') OR
    has_role(auth.uid(), 'workplace_supervisor') OR
    has_role(auth.uid(), 'facility_supervisor')
  )) OR
  (type IN ('dm', 'group')) -- Everyone can create DMs and Groups (Groups as private multi-user chats)
);

-- Channels are viewable by everyone in the workspace (simplified scope)
-- We need a policy that allows viewing channels even if not in participants initially?
-- Or we auto-add everyone to channels? Discord model: You see channels.
-- For simplicity: Allow SELECT if type='channel' AND (workspace match or global).
-- But RLS usually checks 'conversation_participants'.
-- We might need to allow checking conversations table if type='channel'.

CREATE POLICY "View Channels in Workspace"
ON public.conversations FOR SELECT
TO authenticated
USING (
  (type = 'channel') OR -- Simplification: All channels visible. Refine by workspace if needed.
  (id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = auth.uid()))
);

-- Allow joining channels (insert into participants)
-- Ideally, anyone can join a public channel.
CREATE POLICY "Join Public Channels"
ON public.conversation_participants FOR INSERT
TO authenticated
WITH CHECK (
  conversation_id IN (SELECT id FROM conversations WHERE type = 'channel') OR
  user_id = auth.uid() -- Allow adding self? Or standard logic.
);
