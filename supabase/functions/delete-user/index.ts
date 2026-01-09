// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Global declaration to silence IDE errors for Deno
declare const Deno: any;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = "https://pgllmekcarufmcznoive.supabase.co";
        const supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnbGxtZWtjYXJ1Zm1jem5vaXZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNDg5NzcsImV4cCI6MjA4MjcyNDk3N30.3FZNEemVFEqqWzpwpS2OacmcnLbo24hAcOcFsG3wwf0";
        console.log("Supabase URL:", supabaseUrl);
        console.log("Supabase Service Key:", supabaseServiceKey);

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error("Missing environment variables");
            return new Response(
                JSON.stringify({ error: "Configuration Error: Missing ENV vars" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Create admin client with service role key for deletions
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        // Verify the requesting user is authenticated using their token
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            console.error("Missing Authorization header");
            return new Response(
                JSON.stringify({ error: "Missing Authorization header" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const token = authHeader.replace("Bearer ", "");
        console.log("Token received, length:", token.length);

        // Use admin client to verify the user from their JWT
        const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !requestingUser) {
            console.error("Auth error:", authError);
            return new Response(
                JSON.stringify({ error: "Unauthorized", details: authError?.message || "Invalid token" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log("Authenticated user:", requestingUser.id);

        // Check if requesting user is a Super Admin
        const { data: roles, error: roleError } = await supabaseAdmin
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

        // Parse and validate request body
        const { userId } = await req.json();

        if (!userId) {
            return new Response(
                JSON.stringify({ error: "Target User ID is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Prevent self-deletion
        if (userId === requestingUser.id) {
            return new Response(
                JSON.stringify({ error: "You cannot delete your own account" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Delete the user using admin API
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

        if (deleteError) {
            console.error("User deletion error:", deleteError);
            return new Response(
                JSON.stringify({ error: deleteError.message }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Profile and roles should be deleted by cascade, but let's be safe
        // Note: Foreign Key constraints with ON DELETE CASCADE on profiles.user_id 
        // and user_roles.user_id should handle this.

        console.log(`Successfully deleted user: ${userId}`);

        return new Response(
            JSON.stringify({ success: true, message: "User successfully deleted" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error: unknown) {
        console.error("Unexpected error:", error);
        const message = error instanceof Error ? error.message : "Internal server error";
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
