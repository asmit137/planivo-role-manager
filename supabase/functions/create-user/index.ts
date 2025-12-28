import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

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
  .transform((email) => email.toLowerCase().trim());

const passwordSchema = z
  .string()
  .min(6, 'Password must be at least 6 characters')
  .max(128, 'Password must be less than 128 characters');

const fullNameSchema = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must be less than 100 characters')
  .transform((name) => name.trim());

const uuidSchema = z.string().uuid('Invalid UUID format').optional().nullable();

const appRoleSchema = z.enum([
  'super_admin',
  'organization_admin',
  'general_admin',
  'workplace_supervisor',
  'facility_supervisor',
  'department_head',
  'staff',
]);

const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  full_name: fullNameSchema,
  role: appRoleSchema,
  workspace_id: uuidSchema,
  facility_id: uuidSchema,
  department_id: uuidSchema,
  specialty_id: uuidSchema,
  organization_id: uuidSchema,
  force_password_change: z.boolean().optional().default(false),
});

// ============================================
// Rate Limiting Helper
// ============================================

async function checkRateLimit(
  supabase: any,
  identifier: string,
  actionType: string,
  maxRequests: number = 10,
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Verify the requesting user is authenticated
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader?.replace("Bearer ", "");
    
    if (!token) {
      return new Response(
        JSON.stringify({ error: "No authorization token provided" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { user: requestingUser }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !requestingUser) {
      console.error("Authentication error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limiting: 20 user creations per minute per admin
    const withinRateLimit = await checkRateLimit(
      supabaseClient,
      requestingUser.id,
      'create_user',
      20,
      60
    );

    if (!withinRateLimit) {
      console.warn(`Rate limit exceeded for user ${requestingUser.id} on create_user`);
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse and validate request body
    const rawBody = await req.json();
    const validationResult = createUserSchema.safeParse(rawBody);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      console.error("Validation error:", errors);
      return new Response(
        JSON.stringify({ error: "Validation failed", details: errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, full_name, role, workspace_id, facility_id, department_id, specialty_id, organization_id, force_password_change } = validationResult.data;

    // Check if requesting user has permission
    const { data: roles, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("role, department_id, facility_id, workspace_id")
      .eq("user_id", requestingUser.id)
      .in("role", ["super_admin", "organization_admin", "general_admin", "workplace_supervisor", "facility_supervisor", "department_head"]);

    if (roleError || !roles || roles.length === 0) {
      console.error("Role check failed:", roleError);
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin, Supervisor, or Department Head access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Scope validation based on creator's role
    const isDepartmentHead = roles.some(r => r.role === "department_head");
    const isFacilitySupervisor = roles.some(r => r.role === "facility_supervisor");
    const isWorkplaceSupervisor = roles.some(r => r.role === "workplace_supervisor");

    // Department heads can only create staff in their department
    if (isDepartmentHead && !roles.some(r => r.role === 'super_admin')) {
      const departmentHeadRole = roles.find(r => r.role === "department_head");
      if (department_id && department_id !== departmentHeadRole?.department_id) {
        return new Response(
          JSON.stringify({ error: "Forbidden: Can only add users to your own department" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Facility supervisors can only create within their facility
    if (isFacilitySupervisor && !roles.some(r => r.role === 'super_admin')) {
      const facilitySupervisorRole = roles.find(r => r.role === "facility_supervisor");
      if (facility_id && facility_id !== facilitySupervisorRole?.facility_id) {
        return new Response(
          JSON.stringify({ error: "Forbidden: Can only add users to your own facility" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Workplace supervisors can only create within their workspace
    if (isWorkplaceSupervisor && !roles.some(r => r.role === 'super_admin')) {
      const workplaceSupervisorRole = roles.find(r => r.role === "workplace_supervisor");
      if (workspace_id && workspace_id !== workplaceSupervisorRole?.workspace_id) {
        return new Response(
          JSON.stringify({ error: "Forbidden: Can only add users to your own workspace" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Create the user using admin API
    const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      console.error("User creation error:", createError);
      const errorMessage = createError.message.includes('already been registered') 
        ? `Email ${email} is already registered. Please use a different email address.`
        : createError.message;
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!newUser.user) {
      return new Response(
        JSON.stringify({ error: "Failed to create user" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create profile
    const { error: profileError } = await supabaseClient
      .from("profiles")
      .insert([
        {
          id: newUser.user.id,
          email,
          full_name,
          created_by: requestingUser.id,
          force_password_change: force_password_change ?? false,
        },
      ]);

    if (profileError) {
      console.error("Profile creation error:", profileError);
      await supabaseClient.auth.admin.deleteUser(newUser.user.id);
      return new Response(
        JSON.stringify({ error: "Failed to create profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create user role
    const { error: roleInsertError } = await supabaseClient
      .from("user_roles")
      .insert([
        {
          user_id: newUser.user.id,
          role,
          workspace_id: workspace_id || null,
          facility_id: facility_id || null,
          department_id: department_id || null,
          specialty_id: specialty_id || null,
          created_by: requestingUser.id,
        },
      ]);

    if (roleInsertError) {
      console.error("Role creation error:", roleInsertError);
      await supabaseClient.auth.admin.deleteUser(newUser.user.id);
      return new Response(
        JSON.stringify({ error: "Failed to create role" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If creating organization_admin and organization_id provided, update organization's owner_id
    if (role === 'organization_admin' && organization_id) {
      const { error: orgUpdateError } = await supabaseClient
        .from('organizations')
        .update({ owner_id: newUser.user.id })
        .eq('id', organization_id);
      
      if (orgUpdateError) {
        console.error("Organization owner update error:", orgUpdateError);
      } else {
        console.log(`Updated organization ${organization_id} owner to ${newUser.user.id}`);
      }
    }

    console.log(`Successfully created user: ${email} with role: ${role}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: { 
          id: newUser.user.id, 
          email, 
          full_name, 
          role 
        } 
      }),
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