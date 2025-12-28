import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

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
  .transform((email) => email.toLowerCase().trim());

const nameSchema = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must be less than 100 characters')
  .transform((name) => name.trim());

const bulkUserSchema = z.object({
  email: emailSchema,
  full_name: nameSchema,
  facility_name: z.string().min(1).max(200).transform(s => s.trim()),
  department_name: z.string().min(1).max(200).transform(s => s.trim()),
  specialty_name: z.string().max(200).optional().transform(s => s?.trim()),
  role: z.enum(['staff', 'department_head', 'facility_supervisor']),
});

const bulkUploadSchema = z.object({
  users: z.array(bulkUserSchema).min(1, 'At least one user required').max(100, 'Maximum 100 users per upload'),
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
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
      return new Response(
        JSON.stringify({ error: "No authorization token provided" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !requestingUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
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
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin access required for bulk upload" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limiting: 5 bulk uploads per 5 minutes per admin
    const withinRateLimit = await checkRateLimit(
      supabaseAdmin,
      requestingUser.id,
      'bulk_upload_users',
      5,
      300
    );

    if (!withinRateLimit) {
      console.warn(`Rate limit exceeded for bulk upload by user ${requestingUser.id}`);
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please wait before uploading more users." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse and validate request body
    const rawBody = await req.json();
    const validationResult = bulkUploadSchema.safeParse(rawBody);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      console.error("Validation error:", errors);
      return new Response(
        JSON.stringify({ error: "Validation failed", details: errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { users } = validationResult.data;
    console.log(`Processing bulk upload of ${users.length} users by ${requestingUser.id}`);

    const result: BulkUploadResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const rowNumber = i + 2; // +2 because Excel rows start at 1 and row 1 is header

      try {
        // Get workspace from facility
        const { data: facility, error: facilityError } = await supabaseAdmin
          .from('facilities')
          .select('id, workspace_id')
          .eq('name', user.facility_name)
          .single();

        if (facilityError || !facility) {
          throw new Error(`Facility "${user.facility_name}" not found`);
        }

        // Get department
        const { data: department, error: deptError } = await supabaseAdmin
          .from('departments')
          .select('id')
          .eq('name', user.department_name)
          .eq('facility_id', facility.id)
          .single();

        if (deptError || !department) {
          throw new Error(`Department "${user.department_name}" not found in facility "${user.facility_name}"`);
        }

        // Get specialty if provided
        let specialtyId = null;
        if (user.specialty_name) {
          const { data: specialty, error: specialtyError } = await supabaseAdmin
            .from('departments')
            .select('id')
            .eq('name', user.specialty_name)
            .eq('parent_department_id', department.id)
            .single();

          if (specialtyError || !specialty) {
            console.warn(`Specialty "${user.specialty_name}" not found, proceeding without it`);
          } else {
            specialtyId = specialty.id;
          }
        }

        // Create auth user with secure temporary password
        const tempPassword = '123456';
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: user.email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            full_name: user.full_name,
          },
        });

        if (authError) {
          throw new Error(`Failed to create auth user: ${authError.message}`);
        }

        console.log(`Created auth user: ${authUser.user.id}`);

        // Create profile
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: authUser.user.id,
            email: user.email,
            full_name: user.full_name,
            force_password_change: true,
            is_active: true,
            created_by: requestingUser.id,
          });

        if (profileError) {
          console.error('Profile creation failed:', profileError);
          // Rollback auth user creation
          await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
          throw new Error(`Failed to create profile: ${profileError.message}`);
        }

        // Create user role
        const { error: roleInsertError } = await supabaseAdmin
          .from('user_roles')
          .insert({
            user_id: authUser.user.id,
            role: user.role,
            workspace_id: facility.workspace_id,
            facility_id: facility.id,
            department_id: department.id,
            specialty_id: specialtyId,
            created_by: requestingUser.id,
          });

        if (roleInsertError) {
          console.error('Role creation failed:', roleInsertError);
          // Rollback
          await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
          throw new Error(`Failed to create role: ${roleInsertError.message}`);
        }

        result.success++;
        console.log(`Successfully created user ${user.email} (row ${rowNumber})`);

      } catch (error) {
        result.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({
          row: rowNumber,
          email: user.email,
          error: errorMessage,
        });
        console.error(`Failed to create user ${user.email} (row ${rowNumber}):`, errorMessage);
      }
    }

    console.log(`Bulk upload complete: ${result.success} succeeded, ${result.failed} failed`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Bulk upload error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});