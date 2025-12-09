import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  role: 'super_admin' | 'organization_admin' | 'general_admin' | 'workplace_supervisor' | 'facility_supervisor' | 'department_head' | 'staff';
  workspace_id?: string;
  facility_id?: string;
  department_id?: string;
  specialty_id?: string;
  organization_id?: string;
  force_password_change?: boolean;
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

    // Verify the requesting user is a super admin
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: requestingUser }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !requestingUser) {
      console.error("Authentication error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body first
    const { email, password, full_name, role, workspace_id, facility_id, department_id, specialty_id, organization_id, force_password_change }: CreateUserRequest = await req.json();

    // Validate required fields
    if (!email || !password || !full_name || !role) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if requesting user has permission (super admin, organization admin, general admin, workplace supervisor, facility supervisor, or department head)
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

    // Organization admins can only create users within their organization's scope
    const isOrganizationAdmin = roles.some(r => r.role === "organization_admin");

    // Scope validation based on creator's role
    const isDepartmentHead = roles.some(r => r.role === "department_head");
    const isFacilitySupervisor = roles.some(r => r.role === "facility_supervisor");
    const isWorkplaceSupervisor = roles.some(r => r.role === "workplace_supervisor");

    // Department heads can only create staff in their department
    if (isDepartmentHead) {
      const departmentHeadRole = roles.find(r => r.role === "department_head");
      if (department_id && department_id !== departmentHeadRole?.department_id) {
        return new Response(
          JSON.stringify({ error: "Forbidden: Can only add users to your own department" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Facility supervisors can only create within their facility
    if (isFacilitySupervisor) {
      const facilitySupervisorRole = roles.find(r => r.role === "facility_supervisor");
      if (facility_id && facility_id !== facilitySupervisorRole?.facility_id) {
        return new Response(
          JSON.stringify({ error: "Forbidden: Can only add users to your own facility" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Workplace supervisors can only create within their workspace
    if (isWorkplaceSupervisor) {
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
      // Rollback user creation
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
      // Rollback
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
        // Don't rollback, user is created successfully, just log the error
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
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
