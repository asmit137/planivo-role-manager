// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BulkCreateStaffRequest {
  emails: string[];
  departmentId: string;
}

serve(async (req: Request) => {
  console.log("--- BULK CREATE STAFF REQUEST RECEIVED ---");

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  try {
    const supabaseClient = createClient(
      SUPABASE_URL ?? '',
      SUPABASE_SERVICE_ROLE_KEY ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Verify the requesting user is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      console.error("AUTH ERROR:", authError);
      throw new Error('Unauthorized');
    }

    // Verify user has appropriate role
    const { data: userRoles, error: rolesError } = await supabaseClient
      .from('user_roles')
      .select('role, department_id')
      .eq('user_id', user.id);

    if (rolesError || !userRoles || userRoles.length === 0) {
      console.error("ROLES ERROR:", rolesError);
      throw new Error('User has no roles assigned');
    }

    const { emails, departmentId }: BulkCreateStaffRequest = await req.json();

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      throw new Error('Invalid emails array');
    }

    if (!departmentId) {
      throw new Error('Department ID is required');
    }

    // Get department details
    const { data: department, error: deptError } = await supabaseClient
      .from('departments')
      .select('*, facilities(id, workspace_id, workspaces(organization_id))')
      .eq('id', departmentId)
      .single();

    if (deptError || !department) {
      console.error("DEPT ERROR:", deptError);
      throw new Error('Department not found');
    }

    // Check authorization - must be super_admin, general_admin, or department_head of this dept
    const isSuperAdmin = userRoles.some((r: any) => r.role === 'super_admin');
    const isGeneralAdmin = userRoles.some((r: any) => r.role === 'general_admin');
    const isDeptHead = userRoles.some((r: any) => r.role === 'department_head' && r.department_id === departmentId);

    if (!isSuperAdmin && !isGeneralAdmin && !isDeptHead) {
      throw new Error('Insufficient permissions to create staff for this department');
    }

    console.log(`Creating ${emails.length} staff for department: ${department.name}`);

    const results = {
      created: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const email of emails) {
      try {
        const trimmedEmail = email.trim();

        // Create/Get auth user
        let newUserId: string;
        const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
          email: trimmedEmail,
          password: '1234',
          email_confirm: true,
          user_metadata: {
            full_name: trimmedEmail.split('@')[0],
          },
        });

        if (createError) {
          if (createError.message?.includes("already registered") || createError.status === 422) {
            console.log(`User ${trimmedEmail} already exists, fetching ID...`);
            const { data: existingUsers, error: listError } = await supabaseClient.auth.admin.listUsers();
            if (listError) throw listError;
            const existingUser = existingUsers.users.find((u: any) => u.email?.toLowerCase() === trimmedEmail.toLowerCase());
            if (!existingUser) throw new Error(`User ${trimmedEmail} exists but could not be found`);
            newUserId = existingUser.id;
          } else {
            results.failed++;
            results.errors.push(`${trimmedEmail}: ${createError.message}`);
            continue;
          }
        } else {
          newUserId = newUser.user.id;
        }

        // Upsert profile
        const { error: profileError } = await supabaseClient
          .from('profiles')
          .upsert({
            id: newUserId,
            email: trimmedEmail,
            full_name: trimmedEmail.split('@')[0],
            force_password_change: true,
            created_by: user.id,
          }, { onConflict: 'id' });

        if (profileError) {
          results.failed++;
          results.errors.push(`${trimmedEmail}: Profile error - ${profileError.message}`);
          continue;
        }

        // Upsert user role
        const { error: roleError } = await supabaseClient
          .from('user_roles')
          .upsert({
            user_id: newUserId,
            role: 'staff',
            workspace_id: department.facilities.workspace_id,
            facility_id: department.facility_id,
            department_id: departmentId,
            organization_id: department.facilities?.workspaces?.organization_id,
            created_by: user.id,
          }, { onConflict: 'user_id, role, workspace_id, facility_id, department_id, organization_id' });

        if (roleError) {
          results.failed++;
          results.errors.push(`${trimmedEmail}: Role error - ${roleError.message}`);
          continue;
        }

        results.created++;
      } catch (innerError: any) {
        results.failed++;
        results.errors.push(`${email}: ${innerError.message || 'Unknown error'}`);
      }
    }

    console.log(`Bulk creation complete. Created: ${results.created}, Failed: ${results.failed}`);

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Bulk staff error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
