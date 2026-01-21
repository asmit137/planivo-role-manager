// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore
import nodemailer from "npm:nodemailer@6.9.10";

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

        // Send OTP via SMTP
        const SMTP_HOST = Deno.env.get("SMTP_HOST");
        const SMTP_PORT = Deno.env.get("SMTP_PORT");
        const SMTP_USER = Deno.env.get("SMTP_USER");
        const SMTP_PASS = Deno.env.get("SMTP_PASS");
        const SMTP_FROM = Deno.env.get("SMTP_FROM") || "Planivo <noreply@planivo.com>";

        if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
            console.log(`Attempting to send OTP email to ${email} via SMTP...`);
            try {
                const transporter = nodemailer.createTransport({
                    host: SMTP_HOST,
                    port: parseInt(SMTP_PORT || "587"),
                    secure: parseInt(SMTP_PORT || "587") === 465,
                    auth: {
                        user: SMTP_USER,
                        pass: SMTP_PASS,
                    },
                });

                await transporter.sendMail({
                    from: SMTP_FROM,
                    to: email,
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
                });
                console.log("OTP email sent successfully via SMTP");
            } catch (error) {
                console.error("Failed to send OTP email via SMTP:", error);
                // Don't throw error to client if email fails, but log it. 
                // Client usually needs to know if OTP generation succeeded.
            }
        } else {
            console.warn("SMTP environment variables not set. OTP will only be logged to console.");
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
