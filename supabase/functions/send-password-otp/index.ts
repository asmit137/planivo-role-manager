// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const Deno: any;

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", {
            status: 200,
            headers: corsHeaders
        });
    }

    try {
        const { email } = await req.json();

        if (!email) {
            return new Response(JSON.stringify({ error: "Email is required" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

        // Store OTP in database
        const { error: dbError } = await supabaseAdmin
            .from("otp_verifications")
            .insert({
                email,
                otp_code: otp,
                purpose: "password_change",
                expires_at: expiresAt.toISOString(),
            });

        if (dbError) throw dbError;

        const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
        if (RESEND_API_KEY) {
            console.log(`Attempting to send OTP email to ${email} via Resend...`);
            const res = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${RESEND_API_KEY}`,
                },
                body: JSON.stringify({
                    from: "Planivo <onboarding@resend.dev>",
                    to: [email],
                    subject: "Your Password Change Verification Code",
                    html: `
                        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #0ea5e9;">Password Change Verification</h2>
                            <p>You have requested to change your password.</p>
                            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                                <p style="margin: 0; font-size: 14px; color: #6b7280;">Your verification code is:</p>
                                <h1 style="margin: 10px 0; color: #0f172a; letter-spacing: 4px;">${otp}</h1>
                                <p style="margin: 0; font-size: 12px; color: #9ca3af;">This code expires in 10 minutes.</p>
                            </div>
                            <p style="color: #6b7280; font-size: 14px;">If you did not request this change, please ignore this email.</p>
                        </div>
                    `,
                }),
            });

            if (!res.ok) {
                const error = await res.text();
                console.error("Resend API error:", error);
            } else {
                console.log("OTP email sent successfully via Resend");
            }
        } else {
            console.warn("RESEND_API_KEY not set. OTP will only be logged to console.");
        }

        // For development: log the OTP to Supabase logs
        console.log(`[DEVELOPMENT] OTP for ${email}: ${otp}`);

        return new Response(
            JSON.stringify({ success: true, message: "OTP sent successfully" }),
            {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
