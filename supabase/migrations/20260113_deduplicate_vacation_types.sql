-- Migration: Deduplicate vacation_types
-- Description: Merges duplicate vacation types by name, handling references in plans and balances, then adds a unique constraint.

DO $$
DECLARE
    r RECORD;
    keeper_id UUID;
    duplicate_count INTEGER;
BEGIN
    -- Log start
    RAISE NOTICE 'Starting vacation type deduplication...';

    FOR r IN (
        SELECT name
        FROM vacation_types
        GROUP BY name
        HAVING COUNT(*) > 1
    ) LOOP
        RAISE NOTICE 'Processing duplicates for: %', r.name;

        -- Select the keeper ID (oldest created_at)
        SELECT id INTO keeper_id
        FROM vacation_types
        WHERE name = r.name
        ORDER BY created_at ASC
        LIMIT 1;

        RAISE NOTICE 'Keeper ID: %', keeper_id;

        -- Update vacation_plans: pointing them to the keeper_id
        UPDATE vacation_plans
        SET vacation_type_id = keeper_id
        WHERE vacation_type_id IN (
            SELECT id FROM vacation_types WHERE name = r.name AND id != keeper_id
        );
        
        GET DIAGNOSTICS duplicate_count = ROW_COUNT;
        RAISE NOTICE 'Updated % vacation_plans', duplicate_count;

        -- Clean up leave_balances
        -- 1. Identify and delete balances for duplicate types where the user ALREADY has a balance for the keeper type
        --    (We assume the keeper balance is the correct one to keep)
        DELETE FROM leave_balances
        WHERE vacation_type_id IN (
            SELECT id FROM vacation_types WHERE name = r.name AND id != keeper_id
        )
        AND staff_id IN (
            SELECT staff_id FROM leave_balances WHERE vacation_type_id = keeper_id
        );
        
        GET DIAGNOSTICS duplicate_count = ROW_COUNT;
        RAISE NOTICE 'Deleted % redundant leave_balances', duplicate_count;

        -- 2. Update remaining balances (where user had NO balance for keeper type) to point to keeper_id
        UPDATE leave_balances
        SET vacation_type_id = keeper_id
        WHERE vacation_type_id IN (
            SELECT id FROM vacation_types WHERE name = r.name AND id != keeper_id
        );
        
        GET DIAGNOSTICS duplicate_count = ROW_COUNT;
        RAISE NOTICE 'Transferred % leave_balances', duplicate_count;

        -- Finally, delete the duplicate vacation_types
        DELETE FROM vacation_types
        WHERE name = r.name AND id != keeper_id;
        
        GET DIAGNOSTICS duplicate_count = ROW_COUNT;
        RAISE NOTICE 'Deleted % duplicate vacation_types', duplicate_count;

    END LOOP;

    RAISE NOTICE 'Deduplication complete.';
END $$;

-- Add unique constraint to prevent future duplicates if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vacation_types_name_key'
    ) THEN
        ALTER TABLE vacation_types ADD CONSTRAINT vacation_types_name_key UNIQUE (name);
        RAISE NOTICE 'Added unique constraint vacation_types_name_key';
    END IF;
END $$;
