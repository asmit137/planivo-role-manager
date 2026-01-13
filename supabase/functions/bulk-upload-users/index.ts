
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
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  console.log("ENV STATUS - URL:", !!SUPABASE_URL, "Key:", !!SUPABASE_SERVICE_ROLE_KEY);

  try {
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

    // Verify the requesting user is authenticated and authorized
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      console.error("Missing authorization token");
      return new Response(
        JSON.stringify({ error: "No authorization token provided" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !requestingUser) {
      console.error("AUTH ERROR:", authError?.message || "User not found");
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: authError?.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    // Parse and validate request body
    const rawBody = await req.json();
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

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const rowNumber = i + 2;

      try {
        console.log(`[Row ${rowNumber}] Processing ${user.email}`);
        let rowOrganizationId = organizationId;
        let workspaceId: string | null = null;
        let facilityId: string | null = null;
        let departmentId: string | null = null;
        let specialtyId: string | null = null;

        // Resolve Organization if provided
        if (user.organization_name) {
          const { data: org, error: orgE } = await supabaseAdmin
            .from('organizations')
            .select('id')
            .eq('name', user.organization_name)
            .single();

          if (orgE || !org) {
            throw new Error(`Organization "${user.organization_name}" not found`);
          }

          const isSuperAdmin = roles.some((r: any) => r.role === 'super_admin');
          if (!isSuperAdmin && org.id !== organizationId) {
            throw new Error(`Unauthorized: You cannot upload to organization "${user.organization_name}"`);
          }

          rowOrganizationId = org.id;
        }

        // Scoping Logic
        if (user.role !== 'organization_admin' && user.role !== 'general_admin') {
          // Resolve Workspace
          if (user.workspace_name) {
            const { data: workspace, error: wsError } = await supabaseAdmin
              .from('workspaces')
              .select('id')
              .eq('name', user.workspace_name)
              .eq('organization_id', rowOrganizationId)
              .single();

            if (wsError || !workspace) {
              throw new Error(`Workspace "${user.workspace_name}" not found in this organization`);
            }
            workspaceId = workspace.id;
          }

          // Resolve Facility
          if (['facility_supervisor', 'department_head', 'staff', 'intern'].includes(user.role)) {
            if (!user.facility_name) {
              throw new Error(`Facility Name is required for role "${user.role}"`);
            }

            let facilityQuery = supabaseAdmin
              .from('facilities')
              .select('id, workspace_id, workspaces!inner(organization_id)')
              .eq('name', user.facility_name)
              .eq('workspaces.organization_id', rowOrganizationId);

            if (workspaceId) {
              facilityQuery = facilityQuery.eq('workspace_id', workspaceId);
            }

            const { data: facility, error: facilityError } = await facilityQuery.single();

            if (facilityError || !facility) {
              throw new Error(`Facility "${user.facility_name}" not found in this organization${user.workspace_name ? ` within workspace "${user.workspace_name}"` : ''}`);
            }

            facilityId = facility.id;
            workspaceId = facility.workspace_id;

            // Resolve Department
            if (['department_head', 'staff', 'intern'].includes(user.role)) {
              if (!user.department_name) {
                throw new Error(`Department Name is required for role "${user.role}"`);
              }

              const { data: department, error: deptError } = await supabaseAdmin
                .from('departments')
                .select('id')
                .eq('name', user.department_name)
                .eq('facility_id', facilityId)
                .single();

              if (deptError || !department) {
                throw new Error(`Department "${user.department_name}" not found in facility "${user.facility_name}"`);
              }

              departmentId = department.id;

              // Resolve Specialty
              if (user.specialty_name) {
                const { data: specialty, error: specialtyError } = await supabaseAdmin
                  .from('departments')
                  .select('id')
                  .eq('name', user.specialty_name)
                  .eq('parent_department_id', departmentId)
                  .single();

                if (specialty) {
                  specialtyId = specialty.id;
                }
              }
            }
          }
        }

        console.log(`[Row ${rowNumber}] IDs resolved: Org=${rowOrganizationId}, WS=${workspaceId}, Fac=${facilityId}, Dept=${departmentId}`);

        // Create/Get auth user
        let newUserId: string | null = null;

        // OPTIMIZATION: Check if user already exists in profiles (Fastest way)
        const { data: existingProfileByEmail } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', user.email.toLowerCase())
          .maybeSingle();

        if (existingProfileByEmail) {
          console.log(`[Row ${rowNumber}] User found in profiles: ${existingProfileByEmail.id}`);
          newUserId = existingProfileByEmail.id;
        }

        if (!newUserId) {
          // Not in profiles, try to create in Auth
          const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: user.email,
            password: '123456',
            email_confirm: true,
            user_metadata: {
              full_name: user.full_name,
            },
          });

          if (authError) {
            if (authError.message?.includes("already registered") || authError.status === 422) {
              console.log(`[Row ${rowNumber}] User already exists in Auth (but not profiles?), fetching ID...`);
              // Fetch more users to increase chance of finding the existing one. 
              const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });

              if (listError) {
                console.error(`[Row ${rowNumber}] List users error:`, listError);
                throw new Error(`Database error finding users: ${listError.message}`);
              }
              const existingUser = existingUsers.users.find((u: any) => u.email?.toLowerCase() === user.email.toLowerCase());

              if (!existingUser) {
                throw new Error(`User ${user.email} exists in Auth but was not found. Please contact support.`);
              }
              newUserId = existingUser.id;
            } else {
              console.error(`[Row ${rowNumber}] Auth creation failed:`, authError);
              throw new Error(`Auth creation failed: ${authError.message}`);
            }
          } else {
            newUserId = authUser.user.id;
          }
        }

        console.log(`[Row ${rowNumber}] Auth ID: ${newUserId}`);

        // Profile Handling: Atomic RPC Upsert
        const { error: rpcError } = await supabaseAdmin.rpc('upsert_profile_safe', {
          _id: newUserId,
          _email: user.email,
          _full_name: user.full_name,
          _created_by: requestingUser.id
        });

        if (rpcError) {
          console.error(`[Row ${rowNumber}] Profile RPC error:`, rpcError);
          throw new Error(`Profile creation failed (RPC): ${rpcError.message}`);
        }

        // Upsert user role
        const { error: roleInsertError } = await supabaseAdmin
          .from('user_roles')
          .upsert({
            user_id: newUserId,
            role: user.role,
            workspace_id: workspaceId,
            facility_id: facilityId,
            department_id: departmentId,
            specialty_id: specialtyId,
            organization_id: rowOrganizationId,
            created_by: requestingUser.id,
          }, { onConflict: 'user_id, role, workspace_id, facility_id, department_id, organization_id' });

        if (roleInsertError) {
          console.error(`[Row ${rowNumber}] Role upsert error:`, roleInsertError);
          throw new Error(`Role assignment failed: ${roleInsertError.message}`);
        }

        console.log(`[Row ${rowNumber}] Success`);
        result.success++;

      } catch (error: any) {
        console.error(`[Row ${rowNumber}] Failed:`, error.message);
        result.failed++;
        result.errors.push({
          row: rowNumber,
          email: user.email,
          error: error.message || 'Unknown error',
        });
      }
    }

    console.log(`Bulk upload finished. Success: ${result.success}, Failed: ${result.failed}`);
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
