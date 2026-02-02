// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
// @ts-ignore
import nodemailer from "npm:nodemailer@6.9.10";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  console.log("--- CREATE-USER REQUEST RECEIVED ---");

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  // Helper to generate a random password
  const generatePassword = (length = 12) => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let retVal = "";
    for (let i = 0, n = charset.length; i < length; ++i) {
      retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    return retVal;
  };

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Missing Authorization header");
      throw new Error("Missing Authorization header");
    }

    const token = authHeader.replace("Bearer ", "");

    // 1. Authenticate the requesting user (Robust Pattern)
    const authClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });

    const {
      data: { user: requestingUser },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !requestingUser) {
      console.error("AUTH ERROR:", authError?.message || "User not found");

      let jwtClaims: any = {};
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = parts[1];
          const padded = payload.padEnd(payload.length + (4 - payload.length % 4) % 4, '=');
          const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
          jwtClaims = JSON.parse(decoded);
        }
      } catch (e) { jwtClaims = { error: "Parse failed" }; }

      return new Response(
        JSON.stringify({
          error: "Unauthorized_from_code",
          details: authError?.message || "Invalid session",
          diagnostic: {
            authErrorMessage: authError?.message,
            jwtClaims,
            tokenLength: token.length,
            urlPresent: !!SUPABASE_URL,
            anonPresent: !!SUPABASE_ANON_KEY
          }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Authenticated as: ${requestingUser.email}`);

    // 2. Admin client for operations
    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    /* =====================================================
       3️⃣ REQUEST BODY
    ===================================================== */
    const body = await req.json();

    // Health check support
    if (body.type === "health") {
      return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: corsHeaders });
    }

    const {
      email,
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

    // Generate a random password if not provided
    const password = body.password || generatePassword();

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
      .select("role, workspace_id, facility_id, department_id, organization_id")
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
            hint: "Check if the user has at least one administrative role."
          }
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const roles = requestingUserRoles;
    const isSuperAdmin = roles.some((r: any) => r.role === 'super_admin');
    const isOrgAdmin = roles.some((r: any) => r.role === 'organization_admin');
    const isWorkspaceSupervisor = roles.some((r: any) => r.role === 'workspace_supervisor');
    const isFacilitySupervisor = roles.some((r: any) => r.role === 'facility_supervisor');
    const isDepartmentHead = roles.some((r: any) => r.role === 'department_head');

    // Role-based scope enforcement
    if (isDepartmentHead && !isSuperAdmin) {
      const deptRole = roles.find((r: any) => r.role === "department_head");
      if (department_id && department_id !== deptRole?.department_id) {
        return new Response(
          JSON.stringify({ error: "Forbidden: Can only add users to your own department" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (isFacilitySupervisor && !isSuperAdmin) {
      const facilityRole = roles.find((r: any) => r.role === "facility_supervisor");
      if (facility_id && facility_id !== facilityRole?.facility_id) {
        return new Response(
          JSON.stringify({ error: "Forbidden: Can only add users to your own facility" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!email || !full_name || !role) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        newUserId = existingUser.id;
        console.log("Found existing user ID:", newUserId);
      } else {
        return new Response(
          JSON.stringify({ error: createError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /* =====================================================
       6️⃣ PARENT RESOLUTION & ROLE ASSIGNMENT (UPSERT)
    ===================================================== */
    let resolvedFacilityId = facility_id;
    let resolvedWorkspaceId = workspace_id;
    let resolvedOrganizationId = organization_id;

    // Resolve Hierarchy if needed
    if (department_id && (!resolvedFacilityId || !resolvedWorkspaceId || !resolvedOrganizationId)) {
      console.log("Resolving hierarchy from department_id:", department_id);
      const { data: deptInfo, error: dError } = await adminClient
        .from("departments")
        .select("facility_id, facilities(workspace_id, workspaces(organization_id))")
        .eq("id", department_id)
        .maybeSingle();

      if (deptInfo) {
        resolvedFacilityId = resolvedFacilityId || deptInfo.facility_id;
        resolvedWorkspaceId = resolvedWorkspaceId || (deptInfo as any).facilities?.workspace_id;
        resolvedOrganizationId = resolvedOrganizationId || (deptInfo as any).facilities?.workspaces?.organization_id;
      } else if (dError) {
        console.error("Error resolving department info:", dError);
      }
    } else if (resolvedFacilityId && (!resolvedWorkspaceId || !resolvedOrganizationId)) {
      console.log("Resolving hierarchy from facility_id:", resolvedFacilityId);
      const { data: facInfo, error: fError } = await adminClient
        .from("facilities")
        .select("workspace_id, workspaces(organization_id)")
        .eq("id", resolvedFacilityId)
        .maybeSingle();

      if (facInfo) {
        resolvedWorkspaceId = resolvedWorkspaceId || facInfo.workspace_id;
        resolvedOrganizationId = resolvedOrganizationId || (facInfo as any).workspaces?.organization_id;
      } else if (fError) {
        console.error("Error resolving facility info:", fError);
      }
    } else if (resolvedWorkspaceId && !resolvedOrganizationId) {
      console.log("Resolving hierarchy from workspace_id:", resolvedWorkspaceId);
      const { data: wsInfo, error: wError } = await adminClient
        .from("workspaces")
        .select("organization_id")
        .eq("id", resolvedWorkspaceId)
        .maybeSingle();

      if (wsInfo) {
        resolvedOrganizationId = resolvedOrganizationId || wsInfo.organization_id;
      } else if (wError) {
        console.error("Error resolving workspace info:", wError);
      }
    }

    console.log(`Final Hierarchy Scope: Org=${resolvedOrganizationId}, WS=${resolvedWorkspaceId}, Fac=${resolvedFacilityId}`);

    // For roles, we upsert based on user_id, workspace_id, and role (unique constraint)
    const { error: roleError } = await adminClient.from("user_roles").upsert({
      user_id: newUserId,
      role,
      workspace_id: resolvedWorkspaceId,
      facility_id: resolvedFacilityId,
      department_id,
      specialty_id,
      organization_id: resolvedOrganizationId,
      custom_role_id,
      created_by: requestingUser.id,
    }, { onConflict: 'user_id,role,workspace_id,facility_id,department_id,organization_id' });

    if (roleError) {
      console.error("ROLE ASSIGNMENT ERROR:", roleError);
      return new Response(
        JSON.stringify({
          error: "Failed to assign role",
          details: roleError.message,
          diagnostic: { roleError }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /* =====================================================
       7️⃣ INITIALIZE LEAVE BALANCES (New)
    ===================================================== */
    const finalOrgId = organization_id || roles.find((r: any) => r.organization_id)?.organization_id;

    if (finalOrgId) {
      console.log(`Initializing leave balances for org: ${finalOrgId}`);
      const { data: vTypes } = await adminClient
        .from("vacation_types")
        .select("id")
        .eq("organization_id", finalOrgId)
        .eq("is_active", true);

      if (vTypes && vTypes.length > 0) {
        const currentYear = new Date().getFullYear();
        const initialBalances = vTypes.map((vt: any) => ({
          staff_id: newUserId,
          vacation_type_id: vt.id,
          organization_id: finalOrgId,
          accrued: 0,
          used: 0,
          balance: 0,
          year: currentYear
        }));

        const { error: balanceError } = await adminClient
          .from("leave_balances")
          .upsert(initialBalances, { onConflict: 'staff_id, vacation_type_id, year' });

        if (balanceError) {
          console.error("LEAVE BALANCE INITIALIZATION ERROR:", balanceError);
        } else {
          console.log(`Initialized ${vTypes.length} leave balances`);
        }
      }
    }

    // 4. Send Welcome Email (SMTP)
    const SMTP_HOST = Deno.env.get("SMTP_HOST");
    const SMTP_PORT = Deno.env.get("SMTP_PORT");
    const SMTP_USER = Deno.env.get("SMTP_USER");
    const SMTP_PASS = Deno.env.get("SMTP_PASS");
    const SMTP_FROM = Deno.env.get("SMTP_FROM") || "Planivo <noreply@planivo.com>";

    if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
      console.log(`Sending welcome email to ${email} via SMTP...`);
      try {
        const transporter = nodemailer.createTransport({
          host: SMTP_HOST,
          port: parseInt(SMTP_PORT || "587"),
          secure: parseInt(SMTP_PORT || "587") === 465, // true for 465, false for other ports
          auth: {
            user: SMTP_USER,
            pass: SMTP_PASS,
          },
        });

        const info = await transporter.sendMail({
          from: SMTP_FROM,
          to: email,
          subject: "Welcome to Planivo - Your Account Credentials",
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #0ea5e9;">Welcome to Planivo!</h1>
              <p>Your account has been successfully created by an administrator.</p>
              <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Username:</strong> ${email}</p>
                <p style="margin: 10px 0 0 0;"><strong>Password:</strong> ${password}</p>
              </div>
              <p>
                <a href="${Deno.env.get("PUBLIC_APP_URL") || '"https://planivo-role-manager.vercel.app/'}" 
                   style="background-color: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Login to Planivo
                </a>
              </p>
              <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                Please log in and change your password immediately for security reasons.
              </p>
            </div>
          `,
        });

        console.log("Welcome email sent via SMTP:", info.messageId);
      } catch (emailErr: any) {
        console.error("Failed to send welcome email via SMTP:", emailErr);
      }
    } else {
      console.warn("SMTP environment variables not set. Welcome email skipped.");
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
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Unhandled error in create-user:", err);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: err.message,
        stack: err.stack,
        diagnostic: "Caught in main try-catch"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
