import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BulkCreateStaffRequest {
  emails: string[];
  workspaceId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
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
      throw new Error('Unauthorized');
    }

    // Verify user is super_admin
    const { data: roles } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roles?.role !== 'super_admin') {
      throw new Error('Only super admins can perform bulk staff creation');
    }

    const { emails, workspaceId }: BulkCreateStaffRequest = await req.json();

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      throw new Error('Invalid emails array');
    }

    if (!workspaceId) {
      throw new Error('Workspace ID is required');
    }

    const results = {
      created: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const email of emails) {
      try {
        // Create user with default password
        const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
          email: email.trim(),
          password: '123456',
          email_confirm: true,
        });

        if (createError) {
          results.failed++;
          results.errors.push(`${email}: ${createError.message}`);
          continue;
        }

        if (!newUser.user) {
          results.failed++;
          results.errors.push(`${email}: Failed to create user`);
          continue;
        }

        // Create profile with force_password_change flag
        const { error: profileError } = await supabaseClient
          .from('profiles')
          .insert({
            id: newUser.user.id,
            email: email.trim(),
            full_name: email.split('@')[0], // Temporary name from email
            force_password_change: true,
            created_by: user.id,
          });

        if (profileError) {
          // Rollback: delete the auth user
          await supabaseClient.auth.admin.deleteUser(newUser.user.id);
          results.failed++;
          results.errors.push(`${email}: ${profileError.message}`);
          continue;
        }

        // Create user role as staff in the workspace
        const { error: roleError } = await supabaseClient
          .from('user_roles')
          .insert({
            user_id: newUser.user.id,
            role: 'staff',
            workspace_id: workspaceId,
            created_by: user.id,
          });

        if (roleError) {
          // Rollback: delete profile and auth user
          await supabaseClient.from('profiles').delete().eq('id', newUser.user.id);
          await supabaseClient.auth.admin.deleteUser(newUser.user.id);
          results.failed++;
          results.errors.push(`${email}: ${roleError.message}`);
          continue;
        }

        results.created++;
      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`${email}: ${errorMessage}`);
      }
    }

    return new Response(
      JSON.stringify(results),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
