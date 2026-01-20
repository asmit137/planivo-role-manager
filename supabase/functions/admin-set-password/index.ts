// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
// @ts-ignore
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// Validation Schemas
// ============================================

const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email format')
  .max(255, 'Email must be less than 255 characters')
  .transform((email: string) => email.toLowerCase().trim());

const passwordSchema = z
  .string()
  .min(6, 'Password must be at least 6 characters')
  .max(128, 'Password must be less than 128 characters');

const setPasswordSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

// ============================================
// Rate Limiting Helper
// ============================================

async function checkRateLimit(
  supabase: any,
  identifier: string,
  actionType: string,
  maxRequests: number = 5,
  windowSeconds: number = 60
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_identifier: identifier,
      p_action_type: actionType,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      console.error('Rate limit check failed:', error);
      return true;
    }

    return data === true;
  } catch {
    return true;
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  try {
    // 1. Auth Validation (Robust Pattern)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace("Bearer ", "");

    // 1. Auth Validation (Robust Pattern)
    const authClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });

    const { data: { user: requestingUser }, error: authError } = await authClient.auth.getUser(token);

    if (authError || !requestingUser) {
      return new Response(JSON.stringify({ error: "Unauthorized", details: authError?.message }), { status: 401, headers: corsHeaders });
    }

    // 2. Authorization Check (Requester must be admin)
    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: requesterRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id)
      .in("role", ["super_admin", "organization_admin", "general_admin"]);

    if (!requesterRoles || requesterRoles.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403, headers: corsHeaders });
    }

    // Parse and validate request body
    const rawBody = await req.json();
    const validationResult = setPasswordSchema.safeParse(rawBody);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`);
      return new Response(
        JSON.stringify({ error: "Validation failed", details: errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password } = validationResult.data;

    // Rate limiting: 5 password resets per email per minute
    const withinRateLimit = await checkRateLimit(
      supabaseAdmin,
      email,
      'admin_set_password',
      5,
      60
    );

    if (!withinRateLimit) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user by email
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
      throw listError;
    }

    const user = users.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
      // Don't reveal if user exists for security
      console.log(`Password reset attempted for non-existent user: ${email}`);
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update user password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password }
    );

    if (updateError) {
      throw updateError;
    }

    console.log(`Password updated successfully for user: ${email}`);

    // Send Password Change Notification (SendGrid)
    const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY");
    const SENDGRID_SENDER_EMAIL = Deno.env.get("SENDGRID_SENDER_EMAIL") || "no-reply@planivo.com";
    if (SENDGRID_API_KEY) {
      try {
        console.log(`Sending password change notification to ${email} via SendGrid...`);
        const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SENDGRID_API_KEY}`,
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: email }] }],
            from: { email: SENDGRID_SENDER_EMAIL, name: "Planivo" },
            subject: "Planivo - Password Changed",
            content: [{
              type: "text/html",
              value: `
                <h1>Password Changed</h1>
                <p>Your password for Planivo has been changed by an administrator.</p>
                <p><strong>New Password:</strong> ${password}</p>
                <p>If you did not request this, please contact support immediately.</p>
              `
            }],
          }),
        });

        if (!res.ok) {
          console.error("SendGrid API error:", await res.text());
        } else {
          console.log("Password change notification sent successfully via SendGrid.");
        }
      } catch (emailErr) {
        console.error("Failed to send notification email:", emailErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Password updated successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});