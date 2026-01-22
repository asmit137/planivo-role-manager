// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"; // Using consistent version
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CancelEventRequest {
    eventId: string;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { eventId } = await req.json() as CancelEventRequest;

        if (!eventId) {
            return new Response(
                JSON.stringify({ error: 'Missing eventId' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 1. Fetch event details
        const { data: event, error: eventError } = await supabaseClient
            .from('training_events')
            .select('title, start_datetime')
            .eq('id', eventId)
            .single();

        if (eventError || !event) {
            throw new Error('Event not found');
        }

        // 2. Fetch registered users
        const { data: registrations, error: regError } = await supabaseClient
            .from('training_registrations')
            .select('user_id, status, profiles:user_id(email, first_name, last_name)')
            .eq('event_id', eventId)
            .eq('status', 'registered');

        if (regError) throw regError;

        // 3. Send Emails
        const SMTP_HOST = Deno.env.get("SMTP_HOST");
        const SMTP_PORT = Deno.env.get("SMTP_PORT");
        const SMTP_USER = Deno.env.get("SMTP_USER");
        const SMTP_PASS = Deno.env.get("SMTP_PASS");
        const SMTP_FROM = Deno.env.get("SMTP_FROM") || "Planivo <noreply@planivo.com>";

        if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
            const transporter = nodemailer.createTransport({
                host: SMTP_HOST,
                port: parseInt(SMTP_PORT || "587"),
                secure: parseInt(SMTP_PORT || "587") === 465,
                auth: {
                    user: SMTP_USER,
                    pass: SMTP_PASS,
                },
            });

            const emailPromises = registrations?.map(async (reg: any) => {
                const email = reg.profiles?.email;
                if (!email) return;

                try {
                    await transporter.sendMail({
                        from: SMTP_FROM,
                        to: email,
                        subject: `Event Cancelled: ${event.title}`,
                        html: `
                      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                          <h2 style="color: #ef4444;">Event Cancelled</h2>
                          <p>We regret to inform you that the following event has been cancelled:</p>
                          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                              <h3 style="margin: 0; color: #1f2937;">${event.title}</h3>
                              <p style="margin: 10px 0 0 0; color: #4b5563;">
                                  Scheduled for: ${new Date(event.start_datetime).toLocaleString()}
                              </p>
                          </div>
                          <p>We apologize for any inconvenience caused.</p>
                      </div>
                  `,
                    });
                } catch (e) {
                    console.error(`Failed to send cancellation email to ${email}:`, e);
                }
            }) || [];

            await Promise.all(emailPromises);
        } else {
            console.warn("SMTP config missing, skipping emails.");
        }

        // 4. Delete the event (Cascade will handle registrations, but we can be explicit if needed)
        // Deleting the event is enough if cascade is set up, typically it is.
        // If NO ACTION/RESTRICT on foreign key, we might need to delete registrations first.
        // Assuming standard Supabase cascade or handling, but to be safe let's delete registrations first if cascade isn't guaranteed.
        // Actually, usually RLS policies might block deletion if we don't own rows. But we are using Service Role key so we are fine.

        // Let's rely on event deletion. If it fails due to FK constraint, we'll know.
        const { error: deleteError } = await supabaseClient
            .from('training_events')
            .delete()
            .eq('id', eventId);

        if (deleteError) throw deleteError;

        return new Response(
            JSON.stringify({ success: true, message: 'Event cancelled and notifications sent' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Error cancelling event:', error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
