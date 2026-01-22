
-- Add reminder_sent column to task_assignments
ALTER TABLE public.task_assignments ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;

-- Trigger function for immediate notification upon task assignment
CREATE OR REPLACE FUNCTION public.notify_task_assignment()
RETURNS TRIGGER AS $$
DECLARE
    task_title TEXT;
    task_due_date DATE;
BEGIN
    -- Fetch task details
    SELECT title, due_date INTO task_title, task_due_date 
    FROM public.tasks WHERE id = NEW.task_id;

    -- Insert notification for the assigned user
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (
        NEW.assigned_to,
        'New Task Assigned',
        'You have been assigned a new task: ' || task_title || '. Due date: ' || COALESCE(to_char(task_due_date, 'YYYY-MM-DD'), 'No due date set') || '.',
        'task',
        NEW.task_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new task assignments
DROP TRIGGER IF EXISTS after_task_assignment_insert ON public.task_assignments;
CREATE TRIGGER after_task_assignment_insert
    AFTER INSERT ON public.task_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_task_assignment();

-- Function to send reminders for tasks due in 24 hours
CREATE OR REPLACE FUNCTION public.send_due_date_reminders()
RETURNS VOID AS $$
BEGIN
    -- Insert notifications for tasks due tomorrow that haven't had a reminder sent
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    SELECT 
        ta.assigned_to,
        'Task Due Tomorrow',
        'Reminder: Your task "' || t.title || '" is due tomorrow (' || to_char(t.due_date, 'YYYY-MM-DD') || ').',
        'task',
        ta.task_id
    FROM public.task_assignments ta
    JOIN public.tasks t ON ta.task_id = t.id
    WHERE 
        t.due_date IS NOT NULL
        AND t.due_date = (CURRENT_DATE + interval '1 day')::date
        AND ta.status != 'completed'
        AND ta.reminder_sent = false;

    -- Mark these assignments as having received a reminder
    UPDATE public.task_assignments ta
    SET reminder_sent = true
    FROM public.tasks t
    WHERE 
        ta.task_id = t.id
        AND t.due_date IS NOT NULL
        AND t.due_date = (CURRENT_DATE + interval '1 day')::date
        AND ta.status != 'completed'
        AND ta.reminder_sent = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule the reminder function to run hourly using pg_cron
-- We wrap it in a block to avoid errors if the job already exists
DO $$
BEGIN
    -- Remove existing job if it exists to avoid duplicates
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'task-due-reminders') THEN
        PERFORM cron.unschedule('task-due-reminders');
    END IF;
    
    -- Schedule the new job
    PERFORM cron.schedule(
        'task-due-reminders', -- name of the cron job
        '0 * * * *',          -- every hour (at minute 0)
        'SELECT public.send_due_date_reminders()'
    );
END $$;
