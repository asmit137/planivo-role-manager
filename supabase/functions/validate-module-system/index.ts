import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestResult {
  test: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const results: TestResult[] = [];

    // Test 1: Verify all modules exist and are properly configured
    console.log('Test 1: Module definitions check');
    const { data: modules, error: modulesError } = await supabaseClient
      .from('module_definitions')
      .select('*');

    if (modulesError) {
      results.push({
        test: 'Module Definitions',
        status: 'fail',
        message: 'Failed to fetch modules',
        details: modulesError,
      });
    } else {
      const expectedModules = ['core', 'user_management', 'organization', 'staff_management', 'vacation_planning', 'task_management', 'messaging', 'notifications'];
      const actualModules = modules.map(m => m.key);
      const missing = expectedModules.filter(k => !actualModules.includes(k));
      
      if (missing.length > 0) {
        results.push({
          test: 'Module Definitions',
          status: 'fail',
          message: `Missing modules: ${missing.join(', ')}`,
          details: { expected: expectedModules, actual: actualModules },
        });
      } else {
        results.push({
          test: 'Module Definitions',
          status: 'pass',
          message: `All ${modules.length} modules configured correctly`,
          details: actualModules,
        });
      }
    }

    // Test 2: Verify dependency integrity
    console.log('Test 2: Dependency integrity check');
    if (modules) {
      const moduleKeys = modules.map(m => m.key);
      let dependencyIssues: string[] = [];

      modules.forEach(module => {
        if (module.depends_on && Array.isArray(module.depends_on)) {
          module.depends_on.forEach((dep: string) => {
            if (!moduleKeys.includes(dep)) {
              dependencyIssues.push(`${module.key} depends on non-existent module: ${dep}`);
            }
          });
        }
      });

      if (dependencyIssues.length > 0) {
        results.push({
          test: 'Dependency Integrity',
          status: 'fail',
          message: 'Broken dependencies found',
          details: dependencyIssues,
        });
      } else {
        results.push({
          test: 'Dependency Integrity',
          status: 'pass',
          message: 'All module dependencies are valid',
        });
      }
    }

    // Test 3: Verify role module access configuration
    console.log('Test 3: Role module access check');
    const { data: roleAccess, error: roleAccessError } = await supabaseClient
      .from('role_module_access')
      .select('role, module_id, can_view, can_edit, can_delete, can_admin');

    if (roleAccessError) {
      results.push({
        test: 'Role Module Access',
        status: 'fail',
        message: 'Failed to fetch role access',
        details: roleAccessError,
      });
    } else {
      const roles = ['super_admin', 'general_admin', 'workplace_supervisor', 'facility_supervisor', 'department_head', 'staff'];
      const accessByRole = roles.map(role => ({
        role,
        moduleCount: roleAccess.filter(ra => ra.role === role && ra.can_view).length,
      }));

      // Super admin should have access to all modules
      const superAdminAccess = accessByRole.find(r => r.role === 'super_admin');
      if (superAdminAccess && superAdminAccess.moduleCount !== modules?.length) {
        results.push({
          test: 'Role Module Access',
          status: 'warning',
          message: 'Super Admin does not have access to all modules',
          details: accessByRole,
        });
      } else {
        results.push({
          test: 'Role Module Access',
          status: 'pass',
          message: 'Role access configured for all roles',
          details: accessByRole,
        });
      }
    }

    // Test 4: Test get_user_modules function
    console.log('Test 4: get_user_modules function check');
    const { data: users } = await supabaseClient
      .from('user_roles')
      .select('user_id')
      .limit(1)
      .single();

    if (users) {
      const { data: userModules, error: userModulesError } = await supabaseClient
        .rpc('get_user_modules', { _user_id: users.user_id });

      if (userModulesError) {
        results.push({
          test: 'get_user_modules Function',
          status: 'fail',
          message: 'Function execution failed',
          details: userModulesError,
        });
      } else {
        results.push({
          test: 'get_user_modules Function',
          status: 'pass',
          message: `Function returned ${userModules.length} modules for test user`,
          details: userModules.map((m: any) => m.module_key),
        });
      }
    }

    // Test 5: Check workspace module overrides
    console.log('Test 5: Workspace module access check');
    const { data: workspaceAccess, error: workspaceAccessError } = await supabaseClient
      .from('workspace_module_access')
      .select('workspace_id, module_id, is_enabled');

    if (workspaceAccessError) {
      results.push({
        test: 'Workspace Module Access',
        status: 'fail',
        message: 'Failed to fetch workspace access',
        details: workspaceAccessError,
      });
    } else {
      results.push({
        test: 'Workspace Module Access',
        status: 'pass',
        message: `${workspaceAccess.length} workspace overrides configured`,
        details: workspaceAccess,
      });
    }

    // Test 6: Verify Core module cannot be disabled
    console.log('Test 6: Core module protection check');
    const coreModule = modules?.find(m => m.key === 'core');
    if (coreModule && !coreModule.is_active) {
      results.push({
        test: 'Core Module Protection',
        status: 'fail',
        message: 'Core module is disabled - this should not be possible',
      });
    } else {
      results.push({
        test: 'Core Module Protection',
        status: 'pass',
        message: 'Core module is active',
      });
    }

    // Summary
    const summary = {
      total: results.length,
      passed: results.filter(r => r.status === 'pass').length,
      failed: results.filter(r => r.status === 'fail').length,
      warnings: results.filter(r => r.status === 'warning').length,
    };

    return new Response(
      JSON.stringify({
        success: summary.failed === 0,
        summary,
        results,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Validation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
