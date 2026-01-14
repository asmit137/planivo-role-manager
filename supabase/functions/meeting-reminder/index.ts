// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: any;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const now = new Date()
        const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)
        const twelveHoursLater = new Date(now.getTime() + 12 * 60 * 60 * 1000)

        // Window size: look ahead 1 hour window to catch everything if cron runs hourly
        const oneHourWindowEnd = new Date(oneHourLater.getTime() + 60 * 60 * 1000)
        const twelveHoursWindowEnd = new Date(twelveHoursLater.getTime() + 60 * 60 * 1000)

        console.log(`Checking for meetings between ${oneHourLater.toISOString()} and ${oneHourWindowEnd.toISOString()} (1h reminder)`)
        console.log(`Checking for meetings between ${twelveHoursLater.toISOString()} and ${twelveHoursWindowEnd.toISOString()} (12h reminder)`)

        // Fetch active registrations for events starting in the relevant windows
        const { data: registrations, error: regError } = await supabase
            .from('training_registrations')
            .select(`
            user_id,
            status,
            training_events!inner (
                id,
                title,
                start_datetime,
                event_type,
                location_type,
                online_link,
                location_address
            )
        `)
            .eq('status', 'registered')
            .gt('training_events.start_datetime', now.toISOString()) // Only future events

        if (regError) throw regError

        if (!registrations || registrations.length === 0) {
            return new Response(
                JSON.stringify({ success: true, message: 'No registered future events found' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const notificationsToSend = []

        for (const reg of registrations) {
            const event = reg.training_events as any
            const startDate = new Date(event.start_datetime)
            const userId = reg.user_id

            // Check 1 Hour Reminder
            if (startDate >= oneHourLater && startDate < oneHourWindowEnd) {
                const message = `You have a ${event.event_type} "${event.title}" starting in 1 hour at ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Mode: ${event.location_type}.`

                const { data: existing } = await supabase
                    .from('notifications')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('related_id', event.id)
                    .ilike('message', '%starting in 1 hour%')
                    .maybeSingle()

                if (!existing) {
                    notificationsToSend.push({
                        user_id: userId,
                        title: `Upcoming ${event.event_type}: 1 Hour Remaining`,
                        message: message,
                        type: 'message', // Using 'message' icon, or could be 'system'
                        related_id: event.id
                    })
                }
            }

            // Check 12 Hours Reminder
            if (startDate >= twelveHoursLater && startDate < twelveHoursWindowEnd) {
                const message = `You have a ${event.event_type} "${event.title}" starting in 12 hours at ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Mode: ${event.location_type}.`

                const { data: existing } = await supabase
                    .from('notifications')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('related_id', event.id)
                    .ilike('message', '%starting in 12 hours%')
                    .maybeSingle()

                if (!existing) {
                    notificationsToSend.push({
                        user_id: userId,
                        title: `Upcoming ${event.event_type}: 12 Hours Remaining`,
                        message: message,
                        type: 'message',
                        related_id: event.id
                    })
                }
            }
        }

        if (notificationsToSend.length > 0) {
            const { error: insertError } = await supabase
                .from('notifications')
                .insert(notificationsToSend)

            if (insertError) throw insertError

            console.log(`Sent ${notificationsToSend.length} reminders`)
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: `Processed ${registrations.length} registrations. Sent ${notificationsToSend.length} reminders.`
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
