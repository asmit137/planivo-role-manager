-- ================================================================
-- FIX USER DELETION FOREIGN KEY CONSTRAINTS
-- ================================================================
-- Based on query results, these 3 tables block profile deletion:
-- 1. training_events.responsible_user_id -> profiles (NO ACTION)
-- 2. schedule_display_tokens.created_by -> profiles (NO ACTION)
-- 3. user_module_access.created_by -> profiles (NO ACTION)

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- 1. Fix training_events.responsible_user_id
  IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'training_events' AND column_name = 'responsible_user_id') THEN
      -- Drop NOT NULL if exists
      BEGIN
          ALTER TABLE public.training_events ALTER COLUMN responsible_user_id DROP NOT NULL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
      
      -- Drop existing FK
      FOR constraint_name IN
          SELECT tc.constraint_name
          FROM information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name = 'training_events' AND kcu.column_name = 'responsible_user_id'
      LOOP
           EXECUTE 'ALTER TABLE public.training_events DROP CONSTRAINT ' || quote_ident(constraint_name);
      END LOOP;

      -- Add FK with SET NULL
      ALTER TABLE public.training_events 
      ADD CONSTRAINT training_events_responsible_user_id_fkey_fix 
      FOREIGN KEY (responsible_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  -- 2. Fix schedule_display_tokens.created_by
  IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'schedule_display_tokens' AND column_name = 'created_by') THEN
      BEGIN
          ALTER TABLE public.schedule_display_tokens ALTER COLUMN created_by DROP NOT NULL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
      
      FOR constraint_name IN
          SELECT tc.constraint_name
          FROM information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name = 'schedule_display_tokens' AND kcu.column_name = 'created_by'
      LOOP
           EXECUTE 'ALTER TABLE public.schedule_display_tokens DROP CONSTRAINT ' || quote_ident(constraint_name);
      END LOOP;

      ALTER TABLE public.schedule_display_tokens 
      ADD CONSTRAINT schedule_display_tokens_created_by_fkey_fix 
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  -- 3. Fix user_module_access.created_by
  IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_module_access' AND column_name = 'created_by') THEN
      BEGIN
          ALTER TABLE public.user_module_access ALTER COLUMN created_by DROP NOT NULL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
      
      FOR constraint_name IN
          SELECT tc.constraint_name
          FROM information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name = 'user_module_access' AND kcu.column_name = 'created_by'
      LOOP
           EXECUTE 'ALTER TABLE public.user_module_access DROP CONSTRAINT ' || quote_ident(constraint_name);
      END LOOP;

      ALTER TABLE public.user_module_access 
      ADD CONSTRAINT user_module_access_created_by_fkey_fix 
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

END $$;

NOTIFY pgrst, 'reload schema';
