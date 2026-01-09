// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

declare const Deno: any;

/* =========================
   CORS
========================= */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  console.log("--- REQUEST RECEIVED ---");
  console.log("Method:", req.method);
  console.log("Auth Header present:", !!req.headers.get("Authorization"));

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Use standard environment variables (Supabase provides these automatically)
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  console.log("ENV CHECK - URL:", !!SUPABASE_URL, "Anon:", !!SUPABASE_ANON_KEY, "Service:", !!SUPABASE_SERVICE_ROLE_KEY);
  console.log("Auth Header:", req.headers.get("Authorization")?.substring(0, 20) + "...");

  try {

    /* =====================================================
       1️⃣ REQUEST BODY & HEALTH CHECK
    ===================================================== */
    const body = await req.json();

    if (body.type === "health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          message: "Function reached successfully",
          config: {
            supabaseUrl: SUPABASE_URL,
            hasAnonKey: !!SUPABASE_ANON_KEY,
            hasServiceKey: !!SUPABASE_SERVICE_ROLE_KEY,
            authHeaderPresent: !!req.headers.get("Authorization"),
          }
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    const {
      email,
      password,
      full_name,
      role,
      organization_id,
      workspace_id,
      facility_id,
      department_id,
      specialty_id,
      custom_role_id,
      force_password_change,
    } = body;

    /* =====================================================
       2️⃣ AUTH CLIENT (VALIDATES USER JWT)
    ===================================================== */
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user: requestingUser },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !requestingUser) {
      console.error("AUTH ERROR:", authError);
      return new Response(
        JSON.stringify({
          error: "Unauthorized_from_code",
          details: authError?.message || "User not found",
          diagnostic: {
            authErrorMessage: authError?.message,
            authErrorStatus: authError?.status,
            headerPrefix: authHeader?.substring(0, 25) + "...",
            tokenLength: token?.length,
          },
          hint: "The request reached the function, but Supabase rejected the token. Ensure the Authorization header is correctly passed."
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    /* =====================================================
       3️⃣ ADMIN CLIENT & ROLE VALIDATION
    ===================================================== */
    const adminClient = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false },
      }
    );

    // Get requesting user's roles
    console.log(`Checking roles for user: ${requestingUser.email} (${requestingUser.id})`);
    const { data: requestingUserRoles, error: rolesError } = await adminClient
      .from("user_roles")
      .select("role, workspace_id, facility_id, department_id")
      .eq("user_id", requestingUser.id);

    if (rolesError || !requestingUserRoles || requestingUserRoles.length === 0) {
      console.error("ROLES ERROR OR EMPTY:", rolesError, requestingUserRoles);
      return new Response(
        JSON.stringify({
          error: "Forbidden: No roles assigned to your account",
          diagnostic: {
            userId: requestingUser.id,
            userEmail: requestingUser.email,
            rolesCount: requestingUserRoles?.length || 0,
            rolesError: rolesError,
            hint: "If rolesError is 'column organization_id does not exist', I have now fixed this in the code. Please redeploy."
          }
        }),
        { status: 403, headers: corsHeaders }
      );
    }

    const roles = requestingUserRoles;
    const isSuperAdmin = roles.some((r: any) => r.role === 'super_admin');
    const isOrgAdmin = roles.some((r: any) => r.role === 'org_admin');
    const isWorkspaceSupervisor = roles.some((r: any) => r.role === 'workspace_supervisor');
    const isFacilitySupervisor = roles.some((r: any) => r.role === 'facility_supervisor');
    const isDepartmentHead = roles.some((r: any) => r.role === 'department_head');

    // Role-based scope enforcement
    if (isDepartmentHead && !isSuperAdmin) {
      const deptRole = roles.find((r: any) => r.role === "department_head");
      if (department_id && department_id !== deptRole?.department_id) {
        return new Response(
          JSON.stringify({ error: "Forbidden: Can only add users to your own department" }),
          { status: 403, headers: corsHeaders }
        );
      }
    }

    if (isFacilitySupervisor && !isSuperAdmin) {
      const facilityRole = roles.find((r: any) => r.role === "facility_supervisor");
      if (facility_id && facility_id !== facilityRole?.facility_id) {
        return new Response(
          JSON.stringify({ error: "Forbidden: Can only add users to your own facility" }),
          { status: 403, headers: corsHeaders }
        );
      }
    }

    if (!email || !password || !full_name || !role) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: corsHeaders }
      );
    }

    /* =====================================================
       4️⃣ CREATE/GET AUTH USER
    ===================================================== */
    let newUserId: string;

    const { data: authUser, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

    if (createError) {
      if (createError.message?.includes("already registered") || createError.status === 422) {
        console.log("User already exists in Auth, attempting to retrieve ID...");
        // If user already exists, we try to get their ID to repair profile/roles
        const { data: existingUsers, error: listError } = await adminClient.auth.admin.listUsers();
        if (listError) throw listError;

        const existingUser = existingUsers.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
        if (!existingUser) {
          return new Response(
            JSON.stringify({ error: "User already exists but could not be retrieved" }),
            { status: 400, headers: corsHeaders }
          );
        }
        newUserId = existingUser.id;
        console.log("Found existing user ID:", newUserId);
      } else {
        return new Response(
          JSON.stringify({ error: createError.message }),
          { status: 400, headers: corsHeaders }
        );
      }
    } else {
      newUserId = authUser.user.id;
    }

    /* =====================================================
       5️⃣ PROFILE (UPSERT)
    ===================================================== */
    const { error: profileError } = await adminClient.from("profiles").upsert({
      id: newUserId,
      email,
      full_name,
      created_by: requestingUser.id,
      force_password_change: force_password_change ?? true,
    }, { onConflict: 'id' });

    if (profileError) {
      console.error("PROFILE UPSERT ERROR:", profileError);
      return new Response(
        JSON.stringify({
          error: "Failed to create/update user profile",
          details: profileError.message,
          diagnostic: { profileError }
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    /* =====================================================
       6️⃣ ROLE ASSIGNMENT (UPSERT)
    ===================================================== */
    // For roles, we upsert based on user_id, workspace_id, and role (unique constraint)
    const { error: roleError } = await adminClient.from("user_roles").upsert({
      user_id: newUserId,
      role,
      workspace_id,
      facility_id,
      department_id,
      specialty_id,
      custom_role_id,
      created_by: requestingUser.id,
    }, { onConflict: 'user_id, workspace_id, role' });

    if (roleError) {
      console.error("ROLE ASSIGNMENT ERROR:", roleError);
      return new Response(
        JSON.stringify({
          error: "Failed to assign role",
          details: roleError.message,
          diagnostic: { roleError }
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUserId,
          email,
          full_name,
          role,
        },
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
