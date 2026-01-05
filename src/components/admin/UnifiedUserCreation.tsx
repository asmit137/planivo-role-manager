import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  role: z.enum(['staff', 'department_head', 'facility_supervisor', 'workplace_supervisor', 'general_admin', 'organization_admin']),
});

interface UnifiedUserCreationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const UnifiedUserCreation = ({ open, onOpenChange }: UnifiedUserCreationProps) => {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [specialtyId, setSpecialtyId] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [role, setRole] = useState<'staff' | 'department_head' | 'facility_supervisor' | 'workplace_supervisor' | 'general_admin' | 'organization_admin'>('staff');
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
      'workplace_supervisor',
      'facility_supervisor',
      'department_head',
      'staff'
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
        return ['organization_admin', 'general_admin', 'workplace_supervisor', 'facility_supervisor', 'department_head', 'staff'];
      case 'organization_admin':
      case 'general_admin':
        return ['workplace_supervisor', 'facility_supervisor', 'department_head', 'staff'];
      case 'workplace_supervisor':
        return ['facility_supervisor', 'department_head', 'staff'];
      case 'facility_supervisor':
        return ['department_head', 'staff'];
      case 'department_head':
        return ['staff'];
      default:
        return ['staff'];
    }
  };

  const availableRoles = getAvailableRoles();

  // Check if department is required based on role
  const isDepartmentRequired = role === 'staff' || role === 'department_head';
  const isFacilityRequired = !['workplace_supervisor', 'general_admin', 'organization_admin'].includes(role);
  const isOrganizationRequired = role === 'organization_admin';

  // Auto-scope facility and department based on creator's role
  useEffect(() => {
    if (currentUserRole) {
      if (highestRole === 'department_head') {
        // Department heads create within their facility and department
        if (currentUserRole.facility_id) setFacilityId(currentUserRole.facility_id);
        if (currentUserRole.department_id) setDepartmentId(currentUserRole.department_id);
      } else if (highestRole === 'facility_supervisor') {
        // Facility supervisors create within their facility
        if (currentUserRole.facility_id) setFacilityId(currentUserRole.facility_id);
      }
    }
  }, [currentUserRole, highestRole]);

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
              onClick: () => console.log("User notified of missing script")
            }
          });
        }
      } catch (e) {
        console.error("Schema check failed", e);
      }
    };

    checkSchema();
  }, []);

  // Fetch organizations (for organization_admin role)
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
    enabled: role === 'organization_admin',
  });

  // Fetch facilities
  const { data: facilities } = useQuery({
    queryKey: ['facilities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facilities')
        .select('id, name, workspace_id')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Get workspace_id from selected facility for template lookup
  const selectedFacility = facilities?.find(f => f.id === facilityId);
  const selectedWorkspaceId = selectedFacility?.workspace_id;

  // Fetch departments - try workspace-assigned templates first, fall back to facility-specific
  const { data: departments } = useQuery({
    queryKey: ['departments-for-user-creation', facilityId, selectedWorkspaceId],
    queryFn: async () => {
      if (!facilityId) return [];

      // First, check for workspace-assigned template departments
      if (selectedWorkspaceId) {
        const { data: workspaceDepts, error: wError } = await supabase
          .from('workspace_departments')
          .select(`
            department_template_id,
            departments!inner(id, name, is_template)
          `)
          .eq('workspace_id', selectedWorkspaceId);

        if (!wError && workspaceDepts && workspaceDepts.length > 0) {
          // Return template departments assigned to the workspace
          return workspaceDepts
            .filter(wd => wd.departments)
            .map(wd => ({
              id: wd.departments.id,
              name: wd.departments.name
            }));
        }
      }

      // Fall back to facility-specific departments
      const { data, error } = await supabase
        .from('departments')
        .select('id, name')
        .eq('facility_id', facilityId)
        .is('parent_department_id', null)
        .order('name');

      if (error) throw error;
      return data || [];
    },
    enabled: !!facilityId,
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

  const createUserMutation = useMutation({
    mutationFn: async (userData: z.infer<typeof userSchema>) => {
      // Validate base schema
      try {
        userSchema.parse(userData);
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          const firstError = validationError.errors[0];
          throw new Error(firstError.message);
        }
        throw validationError;
      }

      // Role-specific validation
      if (userData.role === 'organization_admin') {
        if (!userData.organization_id) throw new Error('Organization is required for this role');
      } else if (userData.role === 'staff' || userData.role === 'department_head') {
        if (!userData.facility_id) throw new Error('Facility is required for this role');
        if (!userData.department_id) throw new Error('Department is required for this role');
      } else if (userData.role === 'facility_supervisor') {
        if (!userData.facility_id) throw new Error('Facility is required for this role');
      }

      // For organization_admin, call edge function with organization_id
      if (userData.role === 'organization_admin') {
        const { data, error } = await supabase.functions.invoke('create-user', {
          body: {
            email: userData.email,
            password: '123456',
            full_name: userData.full_name,
            role: 'organization_admin',
            organization_id: userData.organization_id,
            force_password_change: true,
          },
        });
        if (error) throw error;
        return data;
      }

      // Get workspace_id from facility if facility is selected
      let workspaceId: string | null = null;
      if (userData.facility_id) {
        const facility = facilities?.find(f => f.id === userData.facility_id);
        if (!facility) throw new Error('Facility not found');
        workspaceId = facility.workspace_id;
      } else {
        // For workplace_supervisor without facility, get workspace from first facility or current user's scope
        const firstFacility = facilities?.[0];
        if (firstFacility) {
          workspaceId = firstFacility.workspace_id;
        }
      }

      if (!workspaceId) throw new Error('Could not determine workspace');

      // Call edge function to create user
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: userData.email,
          password: '123456', // Default password - user must change on first login
          full_name: userData.full_name,
          role: userData.role,
          workspace_id: workspaceId,
          facility_id: userData.facility_id || null,
          department_id: userData.department_id || null,
          specialty_id: userData.specialty_id || null,
          force_password_change: true,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('User created successfully! Default password: 123456');
      queryClient.invalidateQueries({ queryKey: ['unified-users'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      handleReset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error('Edge Function Error Object:', error);
      let errorMessage = 'Failed to create user';

      // Try to extract detailed error from Edge Function response
      if (error.context && error.context.error) {
        errorMessage = error.context.error;
      } else if (error instanceof Error) {
        // Try to parse structured validation errors (e.g. Zod arrays) from message
        try {
          const parsed = JSON.parse(error.message);
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.message) {
            errorMessage = parsed.map((e: { message: string }) => e.message).join(', ');
          } else {
            errorMessage = error.message;
          }
        } catch {
          errorMessage = error.message;
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      // Check for specific database errors even if they are wrapped
      if (errorMessage.includes('force_password_change')) {
        errorMessage = "Database Error: Missing 'force_password_change' column. Please run the Diagnostic Script.";
      } else if (errorMessage.includes('specialty_id')) {
        errorMessage = "Database Error: Missing 'specialty_id' column. Please run the Diagnostic Script.";
      } else if (errorMessage.includes('Edge Function returned a non-2xx status code')) {
        // Fallback: If we can't read the body, it might be in the logs or content
        console.log("Full error for debugging:", JSON.stringify(error, null, 2));
        errorMessage = "System Error: Database schema mismatch. Please run the Diagnostic Script!";
      }

      toast.error(errorMessage);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    createUserMutation.mutate({
      email: email.trim(),
      full_name: fullName.trim(),
      facility_id: facilityId || null,
      department_id: departmentId || null,
      specialty_id: specialtyId || null,
      organization_id: organizationId || null,
      role,
    });
  };

  const handleReset = () => {
    setEmail('');
    setFullName('');
    setFacilityId('');
    setDepartmentId('');
    setSpecialtyId('');
    setOrganizationId('');
    setRole('staff');
  };

  const handleFacilityChange = (value: string) => {
    setFacilityId(value);
    setDepartmentId('');
    setSpecialtyId('');
  };

  const handleDepartmentChange = (value: string) => {
    setDepartmentId(value);
    setSpecialtyId('');
  };

  const handleRoleChange = (value: 'staff' | 'department_head' | 'facility_supervisor' | 'workplace_supervisor' | 'general_admin' | 'organization_admin') => {
    setRole(value);
    // Clear fields based on role requirements
    if (['workplace_supervisor', 'facility_supervisor', 'general_admin', 'organization_admin'].includes(value)) {
      setDepartmentId('');
      setSpecialtyId('');
    }
    if (['workplace_supervisor', 'general_admin', 'organization_admin'].includes(value)) {
      setFacilityId('');
    }
    if (value !== 'organization_admin') {
      setOrganizationId('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New User</DialogTitle>
          <DialogDescription>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={255}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  maxLength={100}
                  autoComplete="off"
                />
              </div>
            </div>
          </div>

          {/* Role Assignment - Moved BEFORE Organization Assignment */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FolderTree className="h-4 w-4" />
              Role Assignment
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select value={role} onValueChange={handleRoleChange} required>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.includes('organization_admin') && (
                    <SelectItem value="organization_admin">Organization Admin</SelectItem>
                  )}
                  {availableRoles.includes('general_admin') && (
                    <SelectItem value="general_admin">General Admin</SelectItem>
                  )}
                  {availableRoles.includes('workplace_supervisor') && (
                    <SelectItem value="workplace_supervisor">Workplace Supervisor</SelectItem>
                  )}
                  {availableRoles.includes('facility_supervisor') && (
                    <SelectItem value="facility_supervisor">Facility Supervisor</SelectItem>
                  )}
                  {availableRoles.includes('department_head') && (
                    <SelectItem value="department_head">Department Head</SelectItem>
                  )}
                  {availableRoles.includes('staff') && (
                    <SelectItem value="staff">Staff</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {role === 'organization_admin' && 'Organization-level access - manages workspaces, facilities, and users within an organization'}
                {role === 'general_admin' && 'General admin access - manages the workspace'}
                {role === 'workplace_supervisor' && 'Workspace-level access - no facility/department required'}
                {role === 'facility_supervisor' && 'Facility-level access - department not required'}
                {role === 'department_head' && 'Department-level access - requires facility and department'}
                {role === 'staff' && 'Staff member - requires facility and department'}
              </p>
            </div>
          </div>

          {/* Organization Selector - Shows only for organization_admin role */}
          {role === 'organization_admin' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Building2 className="h-4 w-4" />
                Organization Selection
              </div>
              <div className="space-y-2">
                <Label htmlFor="organization">Organization *</Label>
                <Select
                  value={organizationId}
                  onValueChange={setOrganizationId}
                  required
                >
                  <SelectTrigger id="organization">
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations?.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  This user will become the owner/admin of the selected organization
                </p>
              </div>
            </div>
          )}

          {/* Organization Assignment - Shows conditionally based on role (not for organization_admin) */}
          {role !== 'organization_admin' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Building2 className="h-4 w-4" />
                Organization Assignment
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="facility">
                    Facility {isFacilityRequired ? '*' : '(Optional)'}
                  </Label>
                  <Select
                    value={facilityId}
                    onValueChange={handleFacilityChange}
                    required={isFacilityRequired}
                    disabled={highestRole === 'department_head' || highestRole === 'facility_supervisor' || !isFacilityRequired}
                  >
                    <SelectTrigger id="facility">
                      <SelectValue placeholder={!isFacilityRequired ? "Not required for this role" : "Select facility"} />
                    </SelectTrigger>
                    <SelectContent>
                      {facilities?.map((facility) => (
                        <SelectItem key={facility.id} value={facility.id}>
                          {facility.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(highestRole === 'department_head' || highestRole === 'facility_supervisor') && (
                    <p className="text-xs text-muted-foreground">
                      Auto-assigned to your facility
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="department">
                    Department {isDepartmentRequired ? '*' : '(Optional)'}
                  </Label>
                  <Select
                    value={departmentId}
                    onValueChange={handleDepartmentChange}
                    disabled={!facilityId || highestRole === 'department_head' || !isDepartmentRequired}
                    required={isDepartmentRequired}
                  >
                    <SelectTrigger id="department">
                      <SelectValue placeholder={
                        !facilityId ? "Select facility first" :
                          !isDepartmentRequired ? "Not required" :
                            departments?.length === 0 ? "No departments available" :
                              "Select department"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {departments && departments.length > 0 ? (
                        departments.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name}
                          </SelectItem>
                        ))
                      ) : (
                        <div className="py-2 px-2 text-sm text-muted-foreground">
                          No departments found for this facility
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  {highestRole === 'department_head' && (
                    <p className="text-xs text-muted-foreground">
                      Auto-assigned to your department
                    </p>
                  )}
                  {!isDepartmentRequired && (
                    <p className="text-xs text-muted-foreground">
                      Not required for {role === 'workplace_supervisor' ? 'Workplace' : 'Facility'} Supervisor
                    </p>
                  )}
                  {facilityId && departments?.length === 0 && isDepartmentRequired && (
                    <p className="text-xs text-destructive">
                      No departments exist for this facility. Please create departments first in Organization management.
                    </p>
                  )}
                </div>
              </div>

              {isDepartmentRequired && (
                <div className="space-y-2">
                  <Label htmlFor="specialty">Specialty (Optional)</Label>
                  <Select
                    value={specialtyId}
                    onValueChange={setSpecialtyId}
                    disabled={!departmentId}
                  >
                    <SelectTrigger id="specialty">
                      <SelectValue placeholder="Select specialty" />
                    </SelectTrigger>
                    <SelectContent>
                      {specialties?.map((specialty) => (
                        <SelectItem key={specialty.id} value={specialty.id}>
                          {specialty.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {specialties && specialties.length === 0 && departmentId && (
                    <p className="text-xs text-muted-foreground">
                      No specialties available for this department
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <Alert>
            <Stethoscope className="h-4 w-4" />
            <AlertDescription>
              User will receive email: <strong>{email || 'user@example.com'}</strong>
              <br />
              Default password: <strong>123456</strong> (must change on first login)
            </AlertDescription>
          </Alert>

          <div className="flex gap-2 justify-end">
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
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UnifiedUserCreation;
