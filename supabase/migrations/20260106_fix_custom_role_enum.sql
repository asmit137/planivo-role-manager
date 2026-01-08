-- ================================================================
-- BUGFIX: ADD 'CUSTOM' TO APP_ROLE ENUM
-- ==========script======================================================

-- This is needed because the frontend and edge function send 'custom'
-- when a custom role is assigned, but the database enum is missing it.

-- 1. Add 'custom' to the app_role enum
-- Note: ALTER TYPE ... ADD VALUE cannot be executed inside a multi-statement transaction 
-- in some Postgres versions, but Supabase handles it if it's the only thing or in a script.
-- If this fails, try running it separately.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'custom';

-- 2. Update get_user_modules to be more robust (Optional but good practice)
-- I already updated it in the repair , but let's ensure it's solid.

-- 3. Force schema reload for PostgREST to pick up the enum change
NOTIFY pgrst, 'reload schema';
