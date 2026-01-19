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
        const { email, otp, newPassword } = await req.json();

        if (!email || !otp || !newPassword) {
            return new Response(
                JSON.stringify({ error: "Email, OTP, and new password are required" }),
                {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // 1. Verify OTP
        const { data: otpData, error: otpError } = await supabaseAdmin
            .from("otp_verifications")
            .select("*")
            .eq("email", email)
            .eq("otp_code", otp)
            .eq("purpose", "password_change")
            .gt("expires_at", new Date().toISOString())
            .is("verified_at", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (otpError || !otpData) {
            return new Response(
                JSON.stringify({ error: "Invalid or expired OTP" }),
                {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        // 2. Mark OTP as verified
        await supabaseAdmin
            .from("otp_verifications")
            .update({ verified_at: new Date().toISOString() })
            .eq("id", otpData.id);

        // 3. Get user by email to get their ID
        const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();

        if (listError) throw listError;

        const user = users.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());

        if (!user) {
            return new Response(JSON.stringify({ error: "User not found" }), {
                status: 404,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 4. Update password
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            user.id,
            { password: newPassword }
        );

        if (updateError) throw updateError;

        return new Response(
            JSON.stringify({ success: true, message: "Password updated successfully" }),
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
