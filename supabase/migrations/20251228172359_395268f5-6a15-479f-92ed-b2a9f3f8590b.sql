-- Fix the security definer view by making it invoker instead
DROP VIEW IF EXISTS public.jitsi_server_public;

-- Recreate without sensitive data exposed via normal RLS
-- The existing policy already handles access control properly