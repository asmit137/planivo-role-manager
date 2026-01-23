// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CancelEventRequest {
    eventId: string;
}

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'No authorization header' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Verify user session
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

        if (userError || !user) {
            return new Response(
                JSON.stringify({ error: 'Invalid token or unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Authorization Check: Must be a management role
        const { data: roles, error: rolesError } = await supabaseClient
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id);

        if (rolesError) throw rolesError;

        const authorizedRoles = [
            'super_admin',
            'organization_admin',
            'general_admin',
            'workplace_supervisor',
            'facility_supervisor',
            'department_head'
        ];

        const hasAccess = roles?.some((r: { role: string }) => authorizedRoles.includes(r.role));

        if (!hasAccess) {
            return new Response(
                JSON.stringify({ error: 'Access denied. Management role required.' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

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
            .select('user_id, status, profiles:user_id(email, full_name)')
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

        // 4. Delete dependent records (training_event_targets)
        // This table often has foreign key constraints that prevent event deletion.
        const { error: targetsError } = await supabaseClient
            .from('training_event_targets')
            .delete()
            .eq('event_id', eventId);

        if (targetsError) {
            console.error('Error deleting event targets:', targetsError);
            throw new Error(`Failed to delete event targets: ${targetsError.message}`);
        }

        // 5. Delete the event
        const { error: deleteError } = await supabaseClient
            .from('training_events')
            .delete()
            .eq('id', eventId);

        if (deleteError) {
            console.error('Error deleting event:', deleteError);
            throw new Error(`Failed to delete event: ${deleteError.message}`);
        }

        return new Response(
            JSON.stringify({ success: true, message: 'Event cancelled and notifications sent' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Error in cancel-training-event:', error);

        // Detailed error for debugging
        const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);

        return new Response(
            JSON.stringify({
                error: errorMsg,
                details: error instanceof Error ? error.stack : undefined
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
