-- Function to delete notifications older than 30 days
CREATE OR REPLACE FUNCTION delete_old_notifications()
RETURNS void AS $$
BEGIN
    DELETE FROM notifications
    WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule the cleanup job to run daily at 3:00 AM
SELECT cron.schedule(
    'delete-old-notifications-daily',
    '0 3 * * *',
    'SELECT delete_old_notifications()'
);
