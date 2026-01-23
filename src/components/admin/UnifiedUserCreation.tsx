import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Loader2, User, Building2, FolderTree, Stethoscope } from 'lucide-react';
import { z } from 'zod';
import { useUserRole, type AppRole } from '@/hooks/useUserRole';

// Base schema - role-specific validation happens in the mutation
const userSchema = z.object({
  email: z.string().email('Invalid email address').max(255, 'Email too long'),
  full_name: z.string().min(2, 'Name too short').max(100, 'Name too long'),
  facility_id: z.string().uuid('Invalid facility').optional().nullable(),
  department_id: z.string().uuid('Invalid department').optional().nullable(),
  specialty_id: z.string().uuid().optional().nullable(),
  organization_id: z.string().uuid().optional().nullable(),
  workspace_id: z.string().uuid().optional().nullable(),
  role: z.enum(['staff', 'intern', 'department_head', 'facility_supervisor', 'workplace_supervisor', 'workspace_supervisor', 'general_admin', 'organization_admin', 'custom']),
  custom_role_id: z.string().uuid().optional().nullable(),
});

interface UnifiedUserCreationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialOrganizationId?: string;
  organizationId?: string;
  scope?: 'system' | 'workspace' | 'facility' | 'department';
  scopeId?: string;
}

const UnifiedUserCreation = ({
  open,
  onOpenChange,
  initialOrganizationId,
  organizationId: propOrganizationId,
  scope,
  scopeId: propScopeId
}: UnifiedUserCreationProps) => {
  const [email, setEmail] = useState('');
  // Password is now generated on the server for security
  // const [password, setPassword] = useState('12345678');
  const [fullName, setFullName] = useState('');
  const [organizationId, setOrganizationId] = useState<string | undefined>(initialOrganizationId);
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(undefined);
  const [facilityId, setFacilityId] = useState<string | undefined>(undefined);
  const [departmentId, setDepartmentId] = useState<string | undefined>(undefined);
  const [specialtyId, setSpecialtyId] = useState<string | undefined>(undefined);
  const [customRoleId, setCustomRoleId] = useState<string | undefined>(undefined);
  const [role, setRole] = useState<'staff' | 'intern' | 'department_head' | 'facility_supervisor' | 'workplace_supervisor' | 'workspace_supervisor' | 'general_admin' | 'organization_admin' | 'custom'>('staff');
  const queryClient = useQueryClient();

  // Get current user's roles to determine permissions
  const { data: currentUserRoles } = useUserRole();

  // Determine highest role and scope
  const getHighestRole = (): AppRole | null => {
    if (!currentUserRoles || currentUserRoles.length === 0) return null;

    const roleHierarchy: AppRole[] = [
      'super_admin',
      'organization_admin',
      'general_admin',
      'workspace_supervisor',
      'workplace_supervisor',
      'facility_supervisor',
      'department_head',
      'staff',
      'intern'
    ];

    for (const hierarchyRole of roleHierarchy) {
      if (currentUserRoles.some(r => r.role === hierarchyRole)) {
        return hierarchyRole;
      }
    }
    return null;
  };

  const highestRole = getHighestRole();
  const currentUserRole = currentUserRoles?.[0]; // Get first role for scope info

  // Determine available roles based on creator's role
  const getAvailableRoles = (): AppRole[] => {
    switch (highestRole) {
      case 'super_admin':
        return ['organization_admin', 'general_admin', 'workspace_supervisor', 'facility_supervisor', 'department_head', 'staff', 'intern', 'custom'];
      case 'organization_admin':
        return ['workspace_supervisor', 'facility_supervisor', 'department_head', 'staff', 'intern'];
      case 'workplace_supervisor':
      case 'workspace_supervisor':
        return ['facility_supervisor', 'department_head', 'staff', 'intern'];
      case 'facility_supervisor':
        return ['department_head', 'staff', 'intern'];
      case 'department_head':
        return ['staff', 'intern'];
      default:
        return ['staff', 'intern'];
    }
  };

  const availableRoles = getAvailableRoles();

  // Auto-scope facility and department based on creator's role
  useEffect(() => {
    if (currentUserRole) {
      if (highestRole === 'department_head') {
        // Department heads create within their facility and department
        if (currentUserRole.organization_id) setOrganizationId(currentUserRole.organization_id);
        if (currentUserRole.workspace_id) setWorkspaceId(currentUserRole.workspace_id);
        if (currentUserRole.facility_id) setFacilityId(currentUserRole.facility_id);
        if (currentUserRole.department_id) setDepartmentId(currentUserRole.department_id);
      } else if (highestRole === 'facility_supervisor') {
        // Facility supervisors create within their facility
        if (currentUserRole.organization_id) setOrganizationId(currentUserRole.organization_id);
        if (currentUserRole.workspace_id) setWorkspaceId(currentUserRole.workspace_id);
        if (currentUserRole.facility_id) setFacilityId(currentUserRole.facility_id);
      } else if (highestRole === 'workspace_supervisor' || highestRole === 'workplace_supervisor') {
        if (currentUserRole.organization_id) setOrganizationId(currentUserRole.organization_id);
        if (currentUserRole.workspace_id) setWorkspaceId(currentUserRole.workspace_id);
      }
    }
  }, [currentUserRole, highestRole]);

  // Sync with initial organization ID when dialog opens
  useEffect(() => {
    if (open && (initialOrganizationId || propOrganizationId)) {
      setOrganizationId(initialOrganizationId || propOrganizationId || '');
    }
  }, [open, initialOrganizationId, propOrganizationId]);

  // DIAGNOSTIC CHECK: Verify schema exists on mount
  useEffect(() => {
    const checkSchema = async () => {
      try {
        // Try to select the new columns. If they don't exist, this will throw.
        const { error } = await supabase
          .from('profiles')
          .select('force_password_change')
          .limit(1);

        if (error && error.message.includes('does not exist')) {
          toast.error("CRITICAL: Database is outdated. 'force_password_change' column is missing. Please run the Diagnostic Script!", {
            duration: 10000,
            action: {
              label: "Get Script",
              onClick: () => { } // console.log("User notified of missing script")
            }
          });
        }
      } catch (e) {
        // console.error("Schema check failed", e);
      }
    };

    checkSchema();
  }, []);

  const { data: organizations } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: true,
  });

  // Fetch workspaces for selected organization
  const { data: workspaces } = useQuery({
    queryKey: ['workspaces', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('workspaces')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Fetch custom roles
  const { data: customRoles } = useQuery({
    queryKey: ['custom-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_roles')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: true,
  });

  // Fetch facilities for selected workspace
  const { data: facilities } = useQuery({
    queryKey: ['facilities', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data, error } = await supabase
        .from('facilities')
        .select('id, name, workspace_id')
        .eq('workspace_id', workspaceId)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!workspaceId,
  });

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
    enabled: true,
  });

  // Fetch departments - try facility-specific first, then workspace templates with category matching
  const { data: departments } = useQuery({
    queryKey: ['departments-for-user-creation', facilityId, workspaceId, categories?.length],
    queryFn: async () => {
      if (!facilityId) return [];

      const facilityName = facilities?.find(f => f.id === facilityId)?.name;

      // 1. First, check for any departments directly assigned to this specific facility
      const { data: facilityDepts, error: fError } = await supabase
        .from('departments')
        .select('id, name, parent_department_id')
        .eq('facility_id', facilityId)
        .order('name');

      if (!fError && facilityDepts && facilityDepts.length > 0) {
        // console.log(`Found ${facilityDepts.length} facility-specific departments`);
        return facilityDepts;
      }

      // 2. Fallback: Check for workspace-assigned template departments
      if (workspaceId) {
        const { data: workspaceDepts, error: wError } = await supabase
          .from('workspace_departments')
          .select(`
            department_template_id,
            departments!inner(id, name, is_template, category, parent_department_id)
          `)
          .eq('workspace_id', workspaceId);

        if (!wError && workspaceDepts && workspaceDepts.length > 0) {
          let depts = workspaceDepts
            .filter(wd => wd.departments)
            .map(wd => wd.departments);

          // SMART FILTERING: If facility name matches a category, filter by that category
          if (facilityName && categories) {
            const matchingCategory = categories.find(cat =>
              facilityName.toLowerCase().includes(cat.name.toLowerCase()) ||
              cat.name.toLowerCase().includes(facilityName.toLowerCase().replace(' facility', '').trim())
            );

            if (matchingCategory) {
              // console.log(`Detected category match: ${matchingCategory.name}`);
              depts = depts.filter(d =>
                d.category?.toLowerCase() === matchingCategory.name.toLowerCase()
              );
            }
          }

          // Build hierarchy/labels if needed (e.g. "Software Engineering > Frontend")
          const processed = depts.map(d => {
            if (d.parent_department_id) {
              const parent = depts.find(p => p.id === d.parent_department_id);
              if (parent) {
                return { ...d, name: `${parent.name} └─ ${d.name}` };
              }
            }
            return d;
          });

          // console.log(`Found ${processed.length} filtered departments`);
          return processed;
        }
      }

      return [];
    },
    enabled: !!facilityId && !!categories,
  });

  // Fetch specialties for selected department
  const { data: specialties } = useQuery({
    queryKey: ['specialties', departmentId],
    queryFn: async () => {
      if (!departmentId) return [];
      const { data, error } = await supabase
        .from('departments')
        .select('id, name')
        .eq('parent_department_id', departmentId)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!departmentId,
  });

  // const createUserMutation = useMutation({
  //   mutationFn: async (userData: z.infer<typeof userSchema>) => {
  //     // Get the current user to ensure we have a valid auth token and session
  //     const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();

  //     if (userError || !currentUser) {
  //       throw new Error('Authentication failed. Please log in again.');
  //     }

  //     const { data: { session } } = await supabase.auth.getSession();
  //     console.log("Diagnostic: Session token found:", !!session?.access_token);
  //     if (session?.access_token) {
  //       console.log("Diagnostic: Token length:", session.access_token.length);
  //     }

  //     // Role-specific validation
  //     if (userData.role === 'organization_admin') {
  //       if (!userData.organization_id) throw new Error('Organization is required for this role');
  //     } else if (userData.role === 'workplace_supervisor') {
  //       if (!userData.workspace_id) throw new Error('Workspace is required for this role');
  //     } else if (userData.role === 'facility_supervisor') {
  //       if (!userData.facility_id) throw new Error('Facility is required for this role');
  //     } else if (userData.role === 'department_head' || userData.role === 'staff') {
  //       if (!userData.facility_id) throw new Error('Facility is required for this role');
  //       if (!userData.department_id) throw new Error('Department is required for this role');
  //     }

  //     // For organization_admin, call edge function with organization_id
  //     if (userData.role === 'organization_admin') {
  //       const { data, error } = await supabase.functions.invoke('create-user', {
  //         body: {
  //           email: userData.email,
  //           password: password,
  //           full_name: userData.full_name,
  //           role: 'organization_admin',
  //           organization_id: userData.organization_id,
  //           force_password_change: true,
  //         },
  //       });
  //       if (error) throw error;
  //       return data;
  //     }

  //     // Determine final workspace ID
  //     const finalWorkspaceId = userData.workspace_id || workspaceId;
  //     if (!finalWorkspaceId && userData.role !== 'general_admin') {
  //       throw new Error('Could not determine workspace');
  //     }

  //     // Call edge function to create user
  //     const { data, error } = await supabase.functions.invoke('create-user', {
  //       body: {
  //         email: userData.email,
  //         password: password,
  //         full_name: userData.full_name,
  //         role: userData.role,
  //         workspace_id: finalWorkspaceId,
  //         organization_id: userData.organization_id,
  //         facility_id: userData.facility_id || null,
  //         department_id: userData.department_id || null,
  //         specialty_id: userData.specialty_id || null,
  //         custom_role_id: userData.custom_role_id || null,
  //         force_password_change: true,
  //       },
  //     });

  //     if (error) throw error;
  //     return data;
  //   },
  //   onSuccess: () => {
  //     toast.success(`User created successfully! Password: ${password}`);
  //     queryClient.invalidateQueries({ queryKey: ['unified-users'] });
  //     queryClient.invalidateQueries({ queryKey: ['users'] });
  //     queryClient.invalidateQueries({ queryKey: ['profiles'] });
  //     handleReset();
  //     onOpenChange(false);
  //   },
  //   onError: (error: any) => {
  //     console.error('Edge Function Error Object:', error);
  //     let errorMessage = 'Failed to create user';

  //     // Try to extract detailed error from Edge Function response
  //     if (error.context && (error.context.error || error.context.details)) {
  //       errorMessage = error.context.error || 'Database Error';
  //       if (error.context.details) errorMessage += `: ${error.context.details}`;
  //       if (error.context.diagnostic) console.log("Diagnostic Info:", error.context.diagnostic);
  //     } else if (error instanceof Error) {
  //       // Try to parse structured validation errors (e.g. Zod arrays) from message
  //       try {
  //         const parsed = JSON.parse(error.message);
  //         if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.message) {
  //           errorMessage = parsed.map((e: { message: string }) => e.message).join(', ');
  //         } else if (parsed.error) {
  //           errorMessage = parsed.error;
  //           if (parsed.details) errorMessage += `: ${parsed.details}`;
  //         } else {
  //           errorMessage = error.message;
  //         }
  //       } catch {
  //         errorMessage = error.message;
  //       }
  //     } else if (typeof error === 'string') {
  //       errorMessage = error;
  //     }

  //     // Check for specific database errors even if they are wrapped
  //     if (errorMessage.includes('force_password_change')) {
  //       errorMessage = "Database Error: Missing 'force_password_change' column. Please run the Diagnostic Script.";
  //     } else if (errorMessage.includes('specialty_id')) {
  //       errorMessage = "Database Error: Missing 'specialty_id' column. Please run the Diagnostic Script.";
  //     } else if (errorMessage.includes('Edge Function returned a non-2xx status code')) {
  //       // Fallback: If we can't read the body, it might be in the logs or content
  //       console.log("Full error for debugging:", JSON.stringify(error, null, 2));
  //       errorMessage = "System Error: Database schema mismatch. Please run the Diagnostic Script!";
  //     }

  //     toast.error(errorMessage);
  //   },
  // });

  const createUserMutation = useMutation({
    mutationFn: async (userData: z.infer<typeof userSchema>) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("No active session");
      }



      const { data, error } = await supabase.functions.invoke(
        "create-user",
        {
          body: {
            email: userData.email,
            // password, // Password generated on server
            full_name: userData.full_name,
            role: userData.role,
            organization_id: userData.organization_id,
            workspace_id: userData.workspace_id,
            facility_id: userData.facility_id,
            department_id: userData.department_id,
            specialty_id: userData.specialty_id,
            custom_role_id: userData.custom_role_id,
            force_password_change: true,
          },
        }
      );

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(`User created successfully!`, {
        description: "Credentials have been sent to their email address."
      });
      queryClient.invalidateQueries({ queryKey: ['unified-users'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['department-staff'] });
      handleReset();
      onOpenChange(false);
    },
    onError: async (error: any) => {
      // console.error('--- EDGE FUNCTION ERROR ---');
      // console.dir(error);

      let errorMessage = 'Failed to create user';

      // Handle the case where error.context is a Response object
      if (error.context && typeof error.context.json === 'function') {
        try {
          const body = await error.context.json();
          // console.log('Processed Error Body:', JSON.stringify(body, null, 2));

          if (body.error) {
            errorMessage = body.error;
            if (body.details) errorMessage += `: ${body.details}`;
            if (body.hint) errorMessage += ` (Hint: ${body.hint})`;
            if (body.diagnostic) {
              // console.log('--- BACKEND DIAGNOSTIC ---');
              // console.log(JSON.stringify(body.diagnostic, null, 2));
              // Provide more specific info for auth errors
              if (body.error === "Unauthorized_from_code") {
                errorMessage = `Auth Failed: ${body.details || 'Token invalid'}`;
              }
            }
          }
        } catch (e) {
          // console.error('Failed to parse error body:', e);
          errorMessage = `HTTP ${error.context.status}: ${error.context.statusText || 'Unknown Error'}`;
        }
      } else if (error.message) {
        try {
          const parsed = JSON.parse(error.message);
          if (parsed.error) {
            errorMessage = parsed.error;
            if (parsed.details) errorMessage += `: ${parsed.details}`;
          }
        } catch {
          errorMessage = error.message;
        }
      }

      toast.error(errorMessage);
    },
  });



  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Role-specific validation
    if (role === 'organization_admin') {
      if (!organizationId) { toast.error('Organization is required'); return; }
    } else if (role === 'workspace_supervisor' || role === 'workplace_supervisor') {
      if (!organizationId) { toast.error('Organization is required'); return; }
      if (!workspaceId) { toast.error('Workspace is required'); return; }
    } else if (role === 'facility_supervisor') {
      if (!organizationId) { toast.error('Organization is required'); return; }
      if (!workspaceId) { toast.error('Workspace is required'); return; }
      if (!facilityId) { toast.error('Facility is required'); return; }
    } else if (['department_head', 'staff', 'intern'].includes(role)) {
      if (!organizationId) { toast.error('Organization is required'); return; }
      if (!workspaceId) { toast.error('Workspace is required'); return; }
      if (!facilityId) { toast.error('Facility is required'); return; }
      if (!departmentId) { toast.error('Department is required'); return; }
    }

    createUserMutation.mutate({
      email: email.trim(),
      full_name: fullName.trim(),
      organization_id: organizationId || null,
      workspace_id: workspaceId || null,
      facility_id: facilityId || null,
      department_id: departmentId || null,
      specialty_id: specialtyId || null,
      custom_role_id: customRoleId || null,
      role,
    });
  };

  const handleReset = () => {
    setEmail('');
    // setPassword('');
    setFullName('');
    setOrganizationId(initialOrganizationId);
    setWorkspaceId(undefined);
    setFacilityId(undefined);
    setDepartmentId(undefined);
    setSpecialtyId(undefined);
    setCustomRoleId(undefined);
    setRole('staff');
  };

  const handleOrganizationChange = (value: string) => {
    setOrganizationId(value);
    setWorkspaceId(undefined);
    setFacilityId(undefined);
    setDepartmentId(undefined);
    setSpecialtyId(undefined);
  };

  const handleWorkspaceChange = (value: string) => {
    setWorkspaceId(value);
    setFacilityId(undefined);
    setDepartmentId(undefined);
    setSpecialtyId(undefined);
  };

  const handleFacilityChange = (value: string) => {
    setFacilityId(value);
    setDepartmentId(undefined);
    setSpecialtyId(undefined);
  };

  const handleDepartmentChange = (value: string) => {
    setDepartmentId(value);
    setSpecialtyId('');
  };

  const handleRoleChange = (value: string) => {
    const isCustom = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

    if (isCustom) {
      setRole('custom');
      setCustomRoleId(value);
    } else {
      setRole(value as any);
      setCustomRoleId('');
    }
    // Clear fields based on role requirements
    if (['workplace_supervisor', 'workspace_supervisor', 'facility_supervisor', 'general_admin', 'organization_admin'].includes(value)) {
      setDepartmentId('');
      setSpecialtyId('');
    }
    if (['workplace_supervisor', 'workspace_supervisor', 'general_admin', 'organization_admin'].includes(value)) {
      setFacilityId('');
    }

    // Clear everything except organizationId when role changes to ensure clean slate
    // Preservation of organizationId is important for UX and correct scoping
    setWorkspaceId('');
    setFacilityId('');
    setDepartmentId('');
    setSpecialtyId('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl sm:text-2xl">Create New User</DialogTitle>
          <DialogDescription className="text-sm">
            Enter user information and assign to facility, department, and specialty
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off" data-form-type="other">
          {/* Basic Information */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <User className="h-4 w-4" />
              Basic Information
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={255}
                  autoComplete="off"
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="full_name" className="text-sm">Full Name *</Label>
                <Input
                  id="full_name"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  maxLength={100}
                  autoComplete="off"
                  className="h-10"
                />
              </div>
            </div>

          </div>

          {/* Password input removed - generated on server */}


          {/* Role Assignment - Moved BEFORE Organization Assignment */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FolderTree className="h-4 w-4" />
              Role Assignment
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <SearchableSelect
                options={[
                  ...(availableRoles.includes('organization_admin') ? [{ value: 'organization_admin', label: 'Organization Admin' }] : []),
                  ...(availableRoles.includes('general_admin') ? [{ value: 'general_admin', label: 'General Admin' }] : []),
                  ...(availableRoles.includes('workspace_supervisor') ? [{ value: 'workspace_supervisor', label: 'Workspace Supervisor' }] : []),
                  ...(availableRoles.includes('facility_supervisor') ? [{ value: 'facility_supervisor', label: 'Facility Supervisor' }] : []),
                  ...(availableRoles.includes('department_head') ? [{ value: 'department_head', label: 'Department Head' }] : []),
                  ...(availableRoles.includes('staff') ? [{ value: 'staff', label: 'Staff' }] : []),
                  ...(availableRoles.includes('intern') ? [{ value: 'intern', label: 'Intern' }] : []),
                  ...(availableRoles.includes('custom') ? (customRoles?.filter(cr => !['staff', 'intern', 'department head', 'facility supervisor', 'workspace supervisor'].includes(cr.name.toLowerCase())).map(cr => ({ value: cr.id, label: `${cr.name} (Custom)` })) || []) : [])
                ]}
                value={role}
                onValueChange={handleRoleChange}
                placeholder="Select a role"
              />
              <p className="text-xs text-muted-foreground">
                {role === 'organization_admin' && 'Organization-level access - manages workspaces, facilities, and users within an organization'}
                {role === 'general_admin' && 'General admin access - manages the workspace'}
                {(role === 'workspace_supervisor' || role === 'workplace_supervisor') && 'Workspace-level access - no facility/department required'}
                {role === 'facility_supervisor' && 'Facility-level access - department not required'}
                {role === 'department_head' && 'Department-level access - requires facility and department'}
                {role === 'staff' && 'Staff member - requires facility and department'}
                {role === 'intern' && 'Intern member - requires facility and department'}
                {role === 'custom' && 'Dynamic role with custom module permissions'}
              </p>
            </div>

            {/* Removed separate custom role selector as it's now integrated */}
          </div>

          {/* Organizational Scoping Section */}
          {role !== 'general_admin' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold border-t pt-4">
                <Building2 className="h-4 w-4" />
                Organization & Scope Assignment
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Organization - Required for almost all roles */}
                <div className="space-y-2">
                  <Label htmlFor="organization" className="text-sm">Organization *</Label>
                  <SearchableSelect
                    options={organizations?.map((org) => ({ value: org.id, label: org.name })) || []}
                    value={organizationId}
                    onValueChange={handleOrganizationChange}
                    placeholder="Select organization"
                    disabled={!!currentUserRole?.organization_id}
                  />
                  {currentUserRole?.organization_id && (
                    <p className="text-[10px] text-muted-foreground italic">Restricted to your current organization</p>
                  )}
                </div>

                {/* Workspace - Required for Workspace Supervisor and below */}
                {['workspace_supervisor', 'workplace_supervisor', 'facility_supervisor', 'department_head', 'staff', 'intern'].includes(role) && (
                  <div className="space-y-2">
                    <Label htmlFor="workspace">Workspace *</Label>
                    <SearchableSelect
                      options={workspaces?.map((ws) => ({ value: ws.id, label: ws.name })) || []}
                      value={workspaceId}
                      onValueChange={handleWorkspaceChange}
                      placeholder={!organizationId ? "Select organization first" : "Select workspace"}
                      disabled={!organizationId || !!currentUserRole?.workspace_id}
                    />
                  </div>
                )}

                {/* Facility - Required for Facility Supervisor and below */}
                {['facility_supervisor', 'department_head', 'staff', 'intern'].includes(role) && (
                  <div className="space-y-2">
                    <Label htmlFor="facility">Facility *</Label>
                    <SearchableSelect
                      options={facilities?.map((f) => ({ value: f.id, label: f.name })) || []}
                      value={facilityId}
                      onValueChange={handleFacilityChange}
                      placeholder={!workspaceId ? "Select workspace first" : "Select facility"}
                      disabled={!workspaceId || !!currentUserRole?.facility_id}
                    />
                  </div>
                )}

                {/* Department - Required for Department Head, Staff, and Intern */}
                {['department_head', 'staff', 'intern'].includes(role) && (
                  <div className="space-y-2">
                    <Label htmlFor="department">Department *</Label>
                    <SearchableSelect
                      options={departments?.map((d) => ({ value: d.id, label: d.name })) || []}
                      value={departmentId}
                      onValueChange={handleDepartmentChange}
                      placeholder={!facilityId ? "Select facility first" : "Select department"}
                      disabled={!facilityId || !!currentUserRole?.department_id}
                    />
                  </div>
                )}

                {/* Specialty - Optional for Staff and Intern */}
                {['staff', 'intern'].includes(role) && (
                  <div className="space-y-2">
                    <Label htmlFor="specialty">Specialty (Optional)</Label>
                    <SearchableSelect
                      options={specialties?.map((s) => ({ value: s.id, label: s.name })) || []}
                      value={specialtyId}
                      onValueChange={setSpecialtyId}
                      placeholder={!departmentId ? "Select department first" : "Select specialty"}
                      disabled={!departmentId}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <Alert>
            <Stethoscope className="h-4 w-4" />
            <AlertDescription>
              User will receive email: <strong>{email || 'user@example.com'}</strong>
              <br />
              Initial password will be <strong>randomly generated</strong> and sent to this email.
            </AlertDescription>
          </Alert>

          <div className="flex gap-2 justify-between items-center w-full">

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create User'
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UnifiedUserCreation;
