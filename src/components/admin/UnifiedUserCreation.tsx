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

const userSchema = z.object({
  email: z.string().email('Invalid email address').max(255, 'Email too long'),
  full_name: z.string().min(2, 'Name too short').max(100, 'Name too long'),
  facility_id: z.string().uuid('Invalid facility'),
  department_id: z.string().uuid('Invalid department'),
  specialty_id: z.string().uuid().nullable(),
  role: z.enum(['staff', 'department_head', 'facility_supervisor']),
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
  const [role, setRole] = useState<'staff' | 'department_head' | 'facility_supervisor'>('staff');
  const queryClient = useQueryClient();
  
  // Get current user's roles to determine permissions
  const { data: currentUserRoles } = useUserRole();
  
  // Determine highest role and scope
  const getHighestRole = (): AppRole | null => {
    if (!currentUserRoles || currentUserRoles.length === 0) return null;
    
    const roleHierarchy: AppRole[] = [
      'super_admin',
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

  // Fetch departments for selected facility
  const { data: departments } = useQuery({
    queryKey: ['departments', facilityId],
    queryFn: async () => {
      if (!facilityId) return [];
      const { data, error } = await supabase
        .from('departments')
        .select('id, name')
        .eq('facility_id', facilityId)
        .is('parent_department_id', null)
        .order('name');
      if (error) throw error;
      return data;
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
      // Validate
      try {
        userSchema.parse(userData);
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          const firstError = validationError.errors[0];
          throw new Error(firstError.message);
        }
        throw validationError;
      }

      const facility = facilities?.find(f => f.id === userData.facility_id);
      if (!facility) throw new Error('Facility not found');

      // Call edge function to create user
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: userData.email,
          password: '123456', // Default password - user must change on first login
          full_name: userData.full_name,
          role: userData.role,
          workspace_id: facility.workspace_id,
          facility_id: userData.facility_id,
          department_id: userData.department_id,
          specialty_id: userData.specialty_id,
          force_password_change: true,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('User created successfully! Default password: 123456');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      handleReset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      let errorMessage = 'Failed to create user';
      const rawMessage = error?.message ?? (typeof error === 'string' ? error : '');

      if (rawMessage) {
        // Try to parse structured validation errors (e.g. Zod arrays)
        try {
          const parsed = JSON.parse(rawMessage);
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.message) {
            errorMessage = parsed.map((e: any) => e.message).join(', ');
          } else {
            errorMessage = rawMessage;
          }
        } catch {
          if (rawMessage.includes('already been registered') || rawMessage.includes('duplicate')) {
            errorMessage = 'A user with this email already exists';
          } else if (rawMessage.includes('specialty')) {
            errorMessage = rawMessage;
          } else {
            errorMessage = rawMessage;
          }
        }
      }
      
      toast.error(errorMessage);
      console.error(error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    createUserMutation.mutate({
      email: email.trim(),
      full_name: fullName.trim(),
      facility_id: facilityId,
      department_id: departmentId,
      specialty_id: specialtyId || null,
      role,
    });
  };

  const handleReset = () => {
    setEmail('');
    setFullName('');
    setFacilityId('');
    setDepartmentId('');
    setSpecialtyId('');
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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

          {/* Organization Assignment */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4" />
              Organization Assignment
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="facility">Facility *</Label>
                <Select 
                  value={facilityId} 
                  onValueChange={handleFacilityChange} 
                  required
                  disabled={highestRole === 'department_head' || highestRole === 'facility_supervisor'}
                >
                  <SelectTrigger id="facility">
                    <SelectValue placeholder="Select facility" />
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
                <Label htmlFor="department">Department *</Label>
                <Select 
                  value={departmentId} 
                  onValueChange={handleDepartmentChange}
                  disabled={!facilityId || highestRole === 'department_head'}
                  required
                >
                  <SelectTrigger id="department">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments?.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {highestRole === 'department_head' && (
                  <p className="text-xs text-muted-foreground">
                    Auto-assigned to your department
                  </p>
                )}
              </div>
            </div>

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
          </div>

          {/* Role Assignment */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FolderTree className="h-4 w-4" />
              Role Assignment
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select value={role} onValueChange={(value: any) => setRole(value)} required>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
            </div>
          </div>

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
