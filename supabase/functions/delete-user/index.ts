// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

declare const Deno: any;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
            console.error("Missing environment variables!");
            return new Response(
                JSON.stringify({
                    error: "Server configuration error (missing env vars)"
                }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const body = await req.json();
        const { userId } = body;

        // 1. Validate the requesting user using the ANON client (same as create-user)
        const authHeader = req.headers.get("Authorization");
        const token = authHeader?.replace("Bearer ", "");

        const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY!, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        });

        const { data: { user: requestingUser }, error: authError } = await authClient.auth.getUser(token);

        if (authError || !requestingUser) {
            console.error("Auth error:", authError);
            return new Response(
                JSON.stringify({
                    error: "Unauthorized_from_code",
                    details: authError?.message || "Invalid token",
                    diagnostic: {
                        authErrorMessage: authError?.message,
                        headerPrefix: authHeader?.substring(0, 25) + "...",
                        tokenLength: token?.length,
                    }
                }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 2. Perform the deletion using the ADMIN client
        const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        // Check if requesting user is a Super Admin
        const { data: roles, error: roleError } = await adminClient
            .from("user_roles")
            .select("role")
            .eq("user_id", requestingUser.id)
            .eq("role", "super_admin")
            .single();

        if (roleError || !roles) {
            console.error("Super Admin check failed:", roleError);
            return new Response(
                JSON.stringify({ error: "Forbidden: Super Admin access required" }),
                { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (!userId) {
            return new Response(
                JSON.stringify({ error: "Target User ID is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (userId === requestingUser.id) {
            return new Response(
                JSON.stringify({ error: "You cannot delete your own account" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Delete the user using admin API
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

        if (deleteError) {
            console.error("User deletion error:", deleteError);
            return new Response(
                JSON.stringify({ error: deleteError.message }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ success: true, message: "User successfully deleted" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error: any) {
        console.error("Unexpected error:", error);
        return new Response(
            JSON.stringify({ error: error.message || "Internal server error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
