-- Audit Logging Implementation

-- 1. Create the Audit Function
CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    old_row jsonb := null;
    new_row jsonb := null;
    changed_keys text[] := array[]::text[];
    k text;
    v jsonb;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        old_row := to_jsonb(OLD);
    ELSIF (TG_OP = 'UPDATE') THEN
        old_row := to_jsonb(OLD);
        new_row := to_jsonb(NEW);
        
        -- Find changed fields
        FOR k, v IN SELECT * FROM jsonb_each(new_row)
        LOOP
            IF v IS DISTINCT FROM old_row->k THEN
                changed_keys := array_append(changed_keys, k);
            END IF;
        END LOOP;
    ELSIF (TG_OP = 'INSERT') THEN
        new_row := to_jsonb(NEW);
    END IF;

    INSERT INTO public.audit_logs (
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        changed_fields,
        performed_by,
        performed_at,
        ip_address,
        user_agent
    ) VALUES (
        TG_TABLE_NAME,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
        TG_OP,
        old_row,
        new_row,
        changed_keys,
        auth.uid(),
        now(),
        NULL,
        NULL
    );

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Helper to apply audit triggers to tables
-- Note: We manually apply them for clarity and to handle potential errors

DROP TRIGGER IF EXISTS tr_audit_organizations ON public.organizations;
CREATE TRIGGER tr_audit_organizations AFTER INSERT OR UPDATE OR DELETE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS tr_audit_workspaces ON public.workspaces;
CREATE TRIGGER tr_audit_workspaces AFTER INSERT OR UPDATE OR DELETE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS tr_audit_facilities ON public.facilities;
CREATE TRIGGER tr_audit_facilities AFTER INSERT OR UPDATE OR DELETE ON public.facilities FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS tr_audit_departments ON public.departments;
CREATE TRIGGER tr_audit_departments AFTER INSERT OR UPDATE OR DELETE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS tr_audit_profiles ON public.profiles;
CREATE TRIGGER tr_audit_profiles AFTER INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS tr_audit_user_roles ON public.user_roles;
CREATE TRIGGER tr_audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS tr_audit_tasks ON public.tasks;
CREATE TRIGGER tr_audit_tasks AFTER INSERT OR UPDATE OR DELETE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS tr_audit_vacation_plans ON public.vacation_plans;
CREATE TRIGGER tr_audit_vacation_plans AFTER INSERT OR UPDATE OR DELETE ON public.vacation_plans FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS tr_audit_training_events ON public.training_events;
CREATE TRIGGER tr_audit_training_events AFTER INSERT OR UPDATE OR DELETE ON public.training_events FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
