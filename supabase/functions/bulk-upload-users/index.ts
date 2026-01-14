
// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';
// @ts-ignore
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

declare const Deno: any;

console.log("BULK UPLOAD FUNCTION LOADED - Version: 2.0.1 (Unified Roles)");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

const nameSchema = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must be less than 100 characters')
  .transform((name: string) => name.trim());

const bulkUserSchema = z.object({
  email: emailSchema,
  full_name: nameSchema,
  organization_name: z.string().max(200).optional().nullable().transform((s: string | null | undefined) => s?.trim() || undefined),
  workspace_name: z.string().max(200).optional().nullable().transform((s: string | null | undefined) => s?.trim() || undefined),
  facility_name: z.string().max(200).optional().nullable().transform((s: string | null | undefined) => s?.trim() || undefined),
  department_name: z.string().max(200).optional().nullable().transform((s: string | null | undefined) => s?.trim() || undefined),
  specialty_name: z.string().max(200).optional().nullable().transform((s: string | null | undefined) => s?.trim() || undefined),
  role: z.enum([
    'staff',
    'department_head',
    'facility_supervisor',
    'workplace_supervisor',
    'general_admin',
    'organization_admin',
    'workspace_supervisor',
    'intern'
  ]),
});

const bulkUploadSchema = z.object({
  users: z.array(bulkUserSchema).min(1, 'At least one user required').max(100, 'Maximum 100 users per upload'),
  organizationId: z.string().uuid('Invalid organization ID'),
});

interface BulkUploadResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; email: string; error: string }>;
}

// ============================================
// Rate Limiting Helper
// ============================================

async function checkRateLimit(
  supabase: any,
  identifier: string,
  actionType: string,
  maxRequests: number = 5,
  windowSeconds: number = 300
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

serve(async (req: Request) => {
  console.log("--- BULK UPLOAD USERS REQUEST RECEIVED ---");
  console.log("Method:", req.method);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  console.log("ENV STATUS - URL:", !!SUPABASE_URL, "Anon:", !!SUPABASE_ANON_KEY, "Service:", !!SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 1. Parse request body for health check
    const rawBody = await req.json();

    if (rawBody.type === "health") {
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
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabaseAdmin = createClient(
      SUPABASE_URL ?? '',
      SUPABASE_SERVICE_ROLE_KEY ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Verify the requesting user is authenticated (using ANON client for verification like create-user)
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      console.error("Missing authorization token");
      return new Response(
        JSON.stringify({ error: "No authorization token provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: { user: requestingUser }, error: authError } = await authClient.auth.getUser(token);

    if (authError || !requestingUser) {
      console.error("AUTH ERROR:", authError?.message || "User not found");
      return new Response(
        JSON.stringify({
          error: "Unauthorized_from_code",
          details: authError?.message || "Invalid or expired token",
          diagnostic: {
            tokenReceived: !!token,
            tokenLength: token?.length,
            error: authError
          }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has admin role
    const { data: roles, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id)
      .in("role", ["super_admin", "organization_admin", "general_admin"]);

    if (roleError || !roles || roles.length === 0) {
      console.error("FORBIDDEN: Admin role required. User:", requestingUser.email, "Error:", roleError);
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin access required for bulk upload" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limiting
    const withinRateLimit = await checkRateLimit(supabaseAdmin, requestingUser.id, 'bulk_upload_users', 5, 300);

    if (!withinRateLimit) {
      console.warn("Rate limit exceeded for user:", requestingUser.email);
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please wait before uploading more users." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use validation results (already parsed type:health check above, now validate for real work)
    const validationResult = bulkUploadSchema.safeParse(rawBody);

    if (!validationResult.success) {
      const errorDetails = validationResult.error.errors
        .map((e: any) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');

      console.error('Zod Validation Failed for request:', errorDetails);
      console.error('Raw Zod Errors:', JSON.stringify(validationResult.error.errors));

      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: errorDetails
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { users, organizationId } = validationResult.data;
    console.log(`Starting processing for ${users.length} users. Org ID: ${organizationId}`);

    const result: BulkUploadResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    // Cache for resolved IDs to avoid redundant DB calls
    const orgCache = new Map<string, string>();
    const workspaceCache = new Map<string, string>();
    const facilityCache = new Map<string, string>();
    const departmentCache = new Map<string, string>();
    const specialtyCache = new Map<string, string>();
    const vTypesCache = new Map<string, any[]>();

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const rowNumber = i + 2;

      try {
        console.log(`[Row ${rowNumber}] Processing ${user.email}`);

        // Normalize role (handle common typos/confusions)
        let userRole = user.role;
        if (userRole === 'workspace_supervisor' as any) {
          userRole = 'workspace_supervisor'; // Already in schema, just being explicit
        }

        let rowOrganizationId = organizationId;
        let workspaceId: string | null = null;
        let facilityId: string | null = null;
        let departmentId: string | null = null;
        let specialtyId: string | null = null;

        // 1. Resolve Organization
        if (user.organization_name) {
          const orgName = user.organization_name.trim();
          if (orgCache.has(orgName)) {
            rowOrganizationId = orgCache.get(orgName)!;
          } else {
            const { data: org, error: orgE } = await supabaseAdmin
              .from('organizations')
              .select('id')
              .eq('name', orgName)
              .maybeSingle();

            if (orgE || !org) {
              throw new Error(`Organization "${orgName}" not found`);
            }
            orgCache.set(orgName, org.id);
            rowOrganizationId = org.id;
          }

          const isSuperAdmin = roles.some((r: any) => r.role === 'super_admin');
          if (!isSuperAdmin && rowOrganizationId !== organizationId) {
            throw new Error(`Unauthorized: You cannot upload to organization "${orgName}"`);
          }
        }

        // 2. Resolve Workspace
        if (user.workspace_name && !['organization_admin', 'general_admin'].includes(userRole)) {
          const wsKey = `${rowOrganizationId}:${user.workspace_name.trim()}`;
          if (workspaceCache.has(wsKey)) {
            workspaceId = workspaceCache.get(wsKey)!;
          } else {
            const { data: workspace, error: wsError } = await supabaseAdmin
              .from('workspaces')
              .select('id')
              .eq('name', user.workspace_name.trim())
              .eq('organization_id', rowOrganizationId)
              .maybeSingle();

            if (wsError || !workspace) {
              throw new Error(`Workspace "${user.workspace_name}" not found in this organization`);
            }
            workspaceCache.set(wsKey, workspace.id);
            workspaceId = workspace.id;
          }
        }

        // 3. Resolve Facility
        const facilityRoles = ['facility_supervisor', 'department_head', 'staff', 'intern'];
        if (facilityRoles.includes(userRole)) {
          if (!user.facility_name) {
            throw new Error(`Facility Name is required for role "${userRole}"`);
          }

          const facName = user.facility_name.trim();
          const facKey = `${workspaceId || 'any'}:${facName}`;

          if (facilityCache.has(facKey)) {
            facilityId = facilityCache.get(facKey)!;
          } else {
            let facilityQuery = supabaseAdmin
              .from('facilities')
              .select('id, workspace_id, workspaces!inner(organization_id)')
              .eq('name', facName)
              .eq('workspaces.organization_id', rowOrganizationId);

            if (workspaceId) {
              facilityQuery = facilityQuery.eq('workspace_id', workspaceId);
            }

            const { data: facility, error: facilityError } = await facilityQuery.maybeSingle();

            if (facilityError || !facility) {
              throw new Error(`Facility "${facName}" not found in this organization${user.workspace_name ? ` within workspace "${user.workspace_name}"` : ''}`);
            }
            facilityCache.set(facKey, facility.id);
            facilityId = facility.id;
            // Back-fill workspaceId if it wasn't provided but facility was found
            if (!workspaceId) workspaceId = facility.workspace_id;
          }

          // 4. Resolve Department
          const deptRoles = ['department_head', 'staff', 'intern'];
          if (deptRoles.includes(userRole)) {
            if (!user.department_name) {
              throw new Error(`Department Name is required for role "${userRole}"`);
            }

            const deptName = user.department_name.trim();
            const deptKey = `${facilityId}:${deptName}`;

            if (departmentCache.has(deptKey)) {
              departmentId = departmentCache.get(deptKey)!;
            } else {
              const { data: department, error: deptError } = await supabaseAdmin
                .from('departments')
                .select('id')
                .eq('name', deptName)
                .eq('facility_id', facilityId)
                .maybeSingle();

              if (deptError || !department) {
                throw new Error(`Department "${deptName}" not found in facility "${user.facility_name}"`);
              }
              departmentCache.set(deptKey, department.id);
              departmentId = department.id;
            }

            // 5. Resolve Specialty
            if (user.specialty_name) {
              const specName = user.specialty_name.trim();
              const specKey = `${departmentId}:${specName}`;

              if (specialtyCache.has(specKey)) {
                specialtyId = specialtyCache.get(specKey)!;
              } else {
                const { data: specialty, error: specialtyError } = await supabaseAdmin
                  .from('departments')
                  .select('id')
                  .eq('name', specName)
                  .eq('parent_department_id', departmentId)
                  .maybeSingle();

                if (specialty) {
                  specialtyCache.set(specKey, specialty.id);
                  specialtyId = specialty.id;
                }
              }
            }
          }
        }

        // 6. Create/Get auth user
        let newUserId: string | null = null;
        const lowEmail = user.email.toLowerCase().trim();

        // Check profiles first (Fastest)
        const { data: existingProfile } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', lowEmail)
          .maybeSingle();

        if (existingProfile) {
          newUserId = existingProfile.id;
        } else {
          // Try to create in Auth
          const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: lowEmail,
            password: '12345678', // Default password
            email_confirm: true,
            user_metadata: { full_name: user.full_name },
          });

          if (authError) {
            if (authError.message?.includes("already registered") || authError.status === 422) {
              // User exists in auth but not profile, go find them
              const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
              if (listError) throw listError;
              const foundUser = listData.users.find((u: any) => u.email?.toLowerCase() === lowEmail);
              if (!foundUser) throw new Error(`User exists in Auth but could not be found`);
              newUserId = foundUser.id;
            } else {
              throw new Error(`Auth creation failed: ${authError.message}`);
            }
          } else {
            newUserId = authUser.user.id;
          }
        }

        if (!newUserId) throw new Error("Failed to establish target user ID");

        // 7. Profile Upsert (Atomic)
        const { error: profileError } = await supabaseAdmin.rpc('upsert_profile_safe', {
          _id: newUserId,
          _email: lowEmail,
          _full_name: user.full_name,
          _created_by: requestingUser.id
        });

        if (profileError) throw new Error(`Profile sync failed: ${profileError.message}`);

        // 8. Role Upsert
        const { error: roleError } = await supabaseAdmin
          .from('user_roles')
          .upsert({
            user_id: newUserId,
            role: userRole,
            workspace_id: workspaceId,
            facility_id: facilityId,
            department_id: departmentId,
            specialty_id: specialtyId,
            organization_id: rowOrganizationId,
            created_by: requestingUser.id,
          }, { onConflict: 'user_id, role, workspace_id, facility_id, department_id, organization_id' });

        if (roleError) throw new Error(`Role assignment failed: ${roleError.message}`);

        // 9. Leave Balances Initialization
        if (rowOrganizationId) {
          let vTypes = vTypesCache.get(rowOrganizationId);
          if (!vTypes) {
            const { data } = await supabaseAdmin
              .from("vacation_types")
              .select("id")
              .eq("organization_id", rowOrganizationId)
              .eq("is_active", true);
            const resolvedTypes = data || [];
            vTypesCache.set(rowOrganizationId, resolvedTypes);
            vTypes = resolvedTypes;
          }

          if (vTypes && vTypes.length > 0) {
            const currentYear = new Date().getFullYear();
            const initialBalances = vTypes.map((vt: any) => ({
              staff_id: newUserId,
              vacation_type_id: vt.id,
              organization_id: rowOrganizationId,
              accrued: 0,
              used: 0,
              balance: 0,
              year: currentYear
            }));

            await supabaseAdmin
              .from("leave_balances")
              .upsert(initialBalances, { onConflict: 'staff_id, vacation_type_id, year' });
          }
        }

        result.success++;
        console.log(`[Row ${rowNumber}] Success for ${lowEmail}`);

      } catch (err: any) {
        console.error(`[Row ${rowNumber}] Failed:`, err.message);
        result.failed++;
        result.errors.push({
          row: rowNumber,
          email: user.email,
          error: err.message || 'Unknown error',
        });
      }
    }

    console.log(`Bulk upload finished. Total: ${users.length}, Success: ${result.success}, Failed: ${result.failed}`);
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('CRITICAL BULK UPLOAD ERROR:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
