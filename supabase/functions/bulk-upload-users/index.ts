// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
// @ts-ignore
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
// @ts-ignore
import nodemailer from "npm:nodemailer@6.9.10";

declare const Deno: any;

console.log("BULK UPLOAD FUNCTION LOADED - Version: 2.0.3 (Restored Logic)");

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
  organizationId: z.string().uuid('Invalid organization ID').optional().nullable(),
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

Deno.serve(async (req: Request) => {
  console.log("--- BULK UPLOAD USERS REQUEST RECEIVED ---");
  console.log("Method:", req.method);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  try {
    const rawBody = await req.json();

    if (rawBody.type === "health") {
      return new Response(
        JSON.stringify({ status: "ok", message: "Function reached successfully" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Auth Validation (Robust Pattern)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization token" }), { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace("Bearer ", "");

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data: { user: requestingUser }, error: authError } = await authClient.auth.getUser(token);

    if (authError || !requestingUser) {
      return new Response(JSON.stringify({ error: "Unauthorized", details: authError?.message }), { status: 401, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check if user has admin role
    const { data: userRoles, error: roleRecordsError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id)
      .in("role", ["super_admin", "organization_admin", "general_admin"]);

    if (roleRecordsError || !userRoles || userRoles.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403, headers: corsHeaders });
    }

    // Rate limiting
    const withinRateLimit = await checkRateLimit(supabaseAdmin, requestingUser.id, 'bulk_upload_users', 5, 300);
    if (!withinRateLimit) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: corsHeaders });
    }

    const validationResult = bulkUploadSchema.safeParse(rawBody);
    if (!validationResult.success) {
      return new Response(JSON.stringify({ error: "Validation failed", details: validationResult.error.errors }), { status: 400, headers: corsHeaders });
    }

    const { users, organizationId } = validationResult.data;
    const result: BulkUploadResult = { success: 0, failed: 0, errors: [] };

    const orgCache = new Map<string, string>();
    const workspaceCache = new Map<string, string>();
    const facilityCache = new Map<string, string>();
    const departmentCache = new Map<string, string>();
    const specialtyCache = new Map<string, string>();
    const vTypesCache = new Map<string, any[]>();


    // Helper to generate a random password
    const generatePassword = (length = 12) => {
      const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
      let retVal = "";
      for (let i = 0, n = charset.length; i < length; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * n));
      }
      return retVal;
    };

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const rowNumber = i + 2;
      const password = generatePassword(); // Generate unique password for each user

      try {
        let userRole = user.role;
        let rowOrganizationId = organizationId;
        let workspaceId: string | null = null;
        let facilityId: string | null = null;
        let departmentId: string | null = null;
        let specialtyId: string | null = null;

        // Organization resolution
        if (user.organization_name) {
          const orgName = user.organization_name.trim();
          if (orgCache.has(orgName)) {
            rowOrganizationId = orgCache.get(orgName)!;
          } else {
            const { data: org } = await supabaseAdmin.from('organizations').select('id').ilike('name', orgName).maybeSingle();
            if (!org) throw new Error(`Organization "${orgName}" not found`);
            orgCache.set(orgName, org.id);
            rowOrganizationId = org.id;
          }
        }

        // Validate that we have an organization context
        if (!rowOrganizationId) {
          throw new Error(`Organization context missing. Please specify organization_name in the row or select a global organization.`);
        }

        // Workspace resolution
        if (user.workspace_name && !['organization_admin', 'general_admin'].includes(userRole)) {
          const wsKey = `${rowOrganizationId}:${user.workspace_name.trim()}`;
          if (workspaceCache.has(wsKey)) {
            workspaceId = workspaceCache.get(wsKey)!;
          } else {
            const { data: ws } = await supabaseAdmin.from('workspaces').select('id').ilike('name', user.workspace_name.trim()).eq('organization_id', rowOrganizationId).maybeSingle();
            if (!ws) throw new Error(`Workspace "${user.workspace_name}" not found in the specified organization`);
            workspaceCache.set(wsKey, ws.id);
            workspaceId = ws.id;
          }
        }

        // Facility resolution
        if (['facility_supervisor', 'department_head', 'staff', 'intern'].includes(userRole)) {
          if (!user.facility_name) throw new Error(`Facility required for role ${userRole}`);
          const facName = user.facility_name.trim();
          const facKey = `${workspaceId || 'any'}:${facName}`;
          if (facilityCache.has(facKey)) {
            facilityId = facilityCache.get(facKey)!;
          } else {
            let q = supabaseAdmin.from('facilities').select('id, workspace_id, workspaces!inner(organization_id)').ilike('name', facName).eq('workspaces.organization_id', rowOrganizationId);
            if (workspaceId) q = q.eq('workspace_id', workspaceId);
            const { data: fac } = await q.maybeSingle();
            if (!fac) throw new Error(`Facility "${facName}" not found in the specified organization/workspace`);
            facilityCache.set(facKey, fac.id);
            facilityId = fac.id;
            if (!workspaceId) workspaceId = fac.workspace_id;
          }

          // Department resolution
          if (['department_head', 'staff', 'intern'].includes(userRole)) {
            if (!user.department_name) throw new Error(`Department required for role ${userRole}`);
            const deptName = user.department_name.trim();
            const deptKey = `${facilityId}:${deptName}`;
            if (departmentCache.has(deptKey)) {
              departmentId = departmentCache.get(deptKey)!;
            } else {
              const { data: dept } = await supabaseAdmin.from('departments').select('id').ilike('name', deptName).eq('facility_id', facilityId).maybeSingle();
              if (!dept) throw new Error(`Department "${deptName}" not found in facility "${facName}"`);
              departmentCache.set(deptKey, dept.id);
              departmentId = dept.id;
            }

            // Specialty resolution
            if (user.specialty_name) {
              const specName = user.specialty_name.trim();
              const specKey = `${departmentId}:${specName}`;
              if (specialtyCache.has(specKey)) {
                specialtyId = specialtyCache.get(specKey)!;
              } else {
                const { data: spec } = await supabaseAdmin.from('departments').select('id').ilike('name', specName).eq('parent_department_id', departmentId).maybeSingle();
                if (spec) {
                  specialtyCache.set(specKey, spec.id);
                  specialtyId = spec.id;
                }
              }
            }
          }
        }

        // Auth User Creation/Establishment
        let newUserId: string | null = null;
        const lowEmail = user.email.toLowerCase().trim();
        const { data: existingProfile } = await supabaseAdmin.from('profiles').select('id').eq('email', lowEmail).maybeSingle();

        if (existingProfile) {
          newUserId = existingProfile.id;
        } else {
          const { data: authUser, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
            email: lowEmail,
            password: password,
            email_confirm: true,
            user_metadata: { full_name: user.full_name },
          });

          if (createAuthError) {
            if (createAuthError.message?.includes("already registered") || createAuthError.status === 422) {
              const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
              newUserId = listData.users.find((u: any) => u.email?.toLowerCase() === lowEmail)?.id || null;
              if (!newUserId) throw new Error("User exists in Auth but not found in list");
            } else throw new Error(`Auth failed: ${createAuthError.message}`);
          } else newUserId = authUser.user.id;
        }

        if (!newUserId) throw new Error("Target ID not established");

        // Profile & Role Sync
        const { error: pSyncError } = await supabaseAdmin.rpc('upsert_profile_safe', { _id: newUserId, _email: lowEmail, _full_name: user.full_name, _created_by: requestingUser.id });
        if (pSyncError) throw new Error(`Profile sync failed: ${pSyncError.message}`);

        const { error: rSyncError } = await supabaseAdmin.from('user_roles').upsert({
          user_id: newUserId, role: userRole, workspace_id: workspaceId, facility_id: facilityId, department_id: departmentId, specialty_id: specialtyId, organization_id: rowOrganizationId, created_by: requestingUser.id
        }, { onConflict: 'user_id, role, workspace_id, facility_id, department_id, organization_id' });
        if (rSyncError) throw new Error(`Role failed: ${rSyncError.message}`);

        // Leave Balances
        let vTypes = vTypesCache.get(rowOrganizationId);
        if (!vTypes) {
          const { data } = await supabaseAdmin.from("vacation_types").select("id").eq("organization_id", rowOrganizationId).eq("is_active", true);
          vTypes = (data || []) as any[];
          vTypesCache.set(rowOrganizationId, vTypes);
        }
        if (vTypes && vTypes.length > 0) {
          const currentYear = new Date().getFullYear();
          await supabaseAdmin.from("leave_balances").upsert(vTypes.map((vt: any) => ({ staff_id: newUserId, vacation_type_id: vt.id, organization_id: rowOrganizationId, accrued: 0, used: 0, balance: 0, year: currentYear })), { onConflict: 'staff_id, vacation_type_id, year' });
        }


        // Welcome Email (SMTP)
        const SMTP_HOST = Deno.env.get("SMTP_HOST");
        const SMTP_PORT = Deno.env.get("SMTP_PORT");
        const SMTP_USER = Deno.env.get("SMTP_USER");
        const SMTP_PASS = Deno.env.get("SMTP_PASS");
        const SMTP_FROM = Deno.env.get("SMTP_FROM") || "Planivo <noreply@planivo.com>";

        if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
          try {
            const transporter = nodemailer.createTransport({
              host: SMTP_HOST,
              port: parseInt(SMTP_PORT || "587"),
              secure: parseInt(SMTP_PORT || "587") === 465,
              auth: {
                user: SMTP_USER,
                pass: SMTP_PASS,
              },
            });

            await transporter.sendMail({
              from: SMTP_FROM,
              to: lowEmail,
              subject: "Welcome to Planivo - Your Account Credentials",
              html: `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #0ea5e9;">Welcome to Planivo!</h1>
                    <p>Your account was created via bulk upload.</p>
                    <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                      <p style="margin: 0;"><strong>Username:</strong> ${lowEmail}</p>
                      <p style="margin: 10px 0 0 0;"><strong>Password:</strong> ${password}</p>
                    </div>
                    <p>
                      <a href="${Deno.env.get("PUBLIC_APP_URL") || 'http://localhost:8080'}" 
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
          } catch (e) { console.error(`Email error Row ${rowNumber}:`, e); }
        } else {
          // console.warn("SMTP environment variables not set. Welcome email skipped.");
        }

        result.success++;
      } catch (err: any) {
        result.failed++;
        result.errors.push({ row: rowNumber, email: user.email, error: err.message });
      }
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
