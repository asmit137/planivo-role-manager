// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

declare const Deno: any;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
            console.error("Missing environment variables!");
            return new Response(
                JSON.stringify({ error: "Server configuration error (missing env vars)" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const body = await req.json();
        const { userId } = body;

        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: corsHeaders });
        }

        const token = authHeader.replace("Bearer ", "");

        // 1. Validate the requesting user
        const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY!, {
            auth: { persistSession: false },
        });

        const { data: { user: requestingUser }, error: authError } = await authClient.auth.getUser(token);

        if (authError || !requestingUser) {
            console.error("Auth error:", authError);
            return new Response(
                JSON.stringify({ error: "Unauthorized", details: authError?.message || "Invalid token" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 2. Admin client for deletions
        const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // Check if requesting user is a Super Admin or General Admin
        const { data: roleRecords, error: roleError } = await adminClient
            .from("user_roles")
            .select("role")
            .eq("user_id", requestingUser.id)
            .in("role", ["super_admin", "general_admin"]);

        if (roleError || !roleRecords || roleRecords.length === 0) {
            console.error("Authorization check failed:", roleError);
            return new Response(
                JSON.stringify({ error: "Forbidden: Administrative access required" }),
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

        console.log(`Attempting to delete user: ${userId} by admin: ${requestingUser.id}`);

        // 3. MANUALLY DELETE ALL DEPENDENT RECORDS FIRST (to avoid cascade issues)
        const deletionSteps = [
            // Clear references TO this user (set to NULL)
            { table: "training_events", column: "responsible_user_id", action: "nullify" },
            { table: "schedule_display_tokens", column: "created_by", action: "nullify" },
            { table: "user_module_access", column: "created_by", action: "nullify" },
            { table: "tasks", column: "created_by", action: "nullify" },
            { table: "vacation_plans", column: "created_by", action: "nullify" },
            { table: "vacation_types", column: "created_by", action: "nullify" },
            { table: "categories", column: "created_by", action: "nullify" },
            { table: "workspaces", column: "created_by", action: "nullify" },
            { table: "facilities", column: "created_by", action: "nullify" },
            { table: "departments", column: "created_by", action: "nullify" },
            { table: "organizations", column: "created_by", action: "nullify" },
            { table: "subscription_overrides", column: "approved_by", action: "nullify" },
            { table: "audit_logs", column: "performed_by", action: "nullify" },

            // Delete records belonging to user
            { table: "training_registrations", column: "user_id", action: "delete" },
            { table: "task_assignments", column: "assigned_to", action: "delete" },
            { table: "vacation_approvals", column: "approver_id", action: "delete" },
            { table: "clinic_assignments", column: "staff_id", action: "delete" },
            { table: "leave_balances", column: "user_id", action: "delete" },
            { table: "conversation_participants", column: "user_id", action: "delete" },
            { table: "messages", column: "sender_id", action: "nullify" },
            { table: "notifications", column: "user_id", action: "delete" },
            { table: "user_module_access", column: "user_id", action: "delete" },
            { table: "user_roles", column: "user_id", action: "delete" },
        ];

        for (const step of deletionSteps) {
            try {
                if (step.action === "nullify") {
                    await adminClient
                        .from(step.table)
                        .update({ [step.column]: null })
                        .eq(step.column, userId);
                } else if (step.action === "delete") {
                    await adminClient
                        .from(step.table)
                        .delete()
                        .eq(step.column, userId);
                }
                console.log(`Processed ${step.table}.${step.column} (${step.action})`);
            } catch (stepError: any) {
                console.log(`Skipped ${step.table}.${step.column}: ${stepError.message}`);
                // Continue - table might not exist or column might not exist
            }
        }

        // 4. Delete the profile directly
        const { error: profileDeleteError } = await adminClient
            .from("profiles")
            .delete()
            .eq("id", userId);

        if (profileDeleteError) {
            console.error("Profile deletion failed:", profileDeleteError);
            return new Response(
                JSON.stringify({
                    error: "Failed to delete profile",
                    details: profileDeleteError.message,
                    hint: profileDeleteError.hint
                }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log("Profile deleted successfully, now deleting auth user...");

        // 5. Delete the user from Auth
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

        if (deleteError) {
            console.error("Auth deletion error:", deleteError);

            // If user not found in Auth (already deleted or never existed), that's OK
            if (deleteError.message === "User not found") {
                return new Response(
                    JSON.stringify({ success: true, message: "User data cleaned up (auth user already removed)" }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            return new Response(
                JSON.stringify({
                    error: "Auth deletion failed",
                    details: deleteError.message,
                    code: deleteError.code || "unknown"
                }),
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
