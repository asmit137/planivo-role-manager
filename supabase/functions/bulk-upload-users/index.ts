import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BulkUser {
  email: string;
  full_name: string;
  facility_name: string;
  department_name: string;
  specialty_name?: string;
  role: 'staff' | 'department_head' | 'facility_supervisor';
}

interface BulkUploadResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; email: string; error: string }>;
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

    const { users } = await req.json() as { users: BulkUser[] };

    if (!users || !Array.isArray(users) || users.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: users array required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Processing bulk upload of ${users.length} users`);

    const result: BulkUploadResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const rowNumber = i + 2; // +2 because Excel rows start at 1 and row 1 is header

      try {
        // Validate required fields
        if (!user.email || !user.full_name || !user.facility_name || !user.department_name || !user.role) {
          throw new Error('Missing required fields');
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(user.email)) {
          throw new Error('Invalid email format');
        }

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

        // Create auth user
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
          });

        if (profileError) {
          console.error('Profile creation failed:', profileError);
          throw new Error(`Failed to create profile: ${profileError.message}`);
        }

        // Create user role
        const { error: roleError } = await supabaseAdmin
          .from('user_roles')
          .insert({
            user_id: authUser.user.id,
            role: user.role,
            workspace_id: facility.workspace_id,
            facility_id: facility.id,
            department_id: department.id,
            specialty_id: specialtyId,
          });

        if (roleError) {
          console.error('Role creation failed:', roleError);
          throw new Error(`Failed to create role: ${roleError.message}`);
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
