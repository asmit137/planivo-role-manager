-- Create otp_verifications table
CREATE TABLE IF NOT EXISTS public.otp_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    otp_code TEXT NOT NULL,
    purpose TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    request_count INTEGER DEFAULT 1
);

-- Enable RLS
ALTER TABLE public.otp_verifications ENABLE ROW LEVEL SECURITY;

-- Only service role can manage (Edge Functions)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'otp_verifications' 
        AND policyname = 'Only service role can manage otp_verifications'
    ) THEN
        CREATE POLICY "Only service role can manage otp_verifications"
        ON public.otp_verifications
        FOR ALL
        USING (auth.role() = 'service_role')
        WITH CHECK (auth.role() = 'service_role');
    END IF;
END $$;

-- Create an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_otp_verifications_email_purpose ON public.otp_verifications (email, purpose);
