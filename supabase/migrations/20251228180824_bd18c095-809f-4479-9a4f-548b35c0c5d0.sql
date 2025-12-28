-- Enable realtime for audit_logs table
ALTER TABLE public.audit_logs REPLICA IDENTITY FULL;

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;