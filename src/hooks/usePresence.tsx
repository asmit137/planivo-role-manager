import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export const usePresence = () => {
    const { user } = useAuth();

    useEffect(() => {
        if (!user) return;

        const updatePresence = async () => {
            // Only update if the document is visible to save requests
            if (document.visibilityState !== 'visible') return;

            try {
                const { error } = await supabase
                    .from('profiles')
                    .update({ last_seen: new Date().toISOString() } as any)
                    .eq('id', user.id);

                if (error) {
                    console.error('Error updating presence:', error);
                }
            } catch (err) {
                console.error('Presence update failed:', err);
            }
        };

        // Update immediately on mount
        updatePresence();

        // Update every 1 minute
        const interval = setInterval(updatePresence, 60 * 1000);

        // Also update when tab becomes visible again
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                updatePresence();
            }
        };

        window.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(interval);
            window.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user]);
};
