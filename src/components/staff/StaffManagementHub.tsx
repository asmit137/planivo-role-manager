import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Users } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { z } from 'zod';

const staffSchema = z.object({
  email: z.string().email('Invalid email address'),
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  specialty_id: z.string().uuid('Please select a specialty'),
});

interface DepartmentInfo {
  id: string;
  name: string;
  facilities?: {
    id: string;
    name: string;
    workspaces?: {
      id: string;
      name: string;
    };
  };
}

interface UserRoleWithDept {
  id: string;
  user_id: string;
  role: string;
  workspace_id: string | null;
  facility_id: string | null;
  department_id: string | null;
  specialty_id: string | null;
  departments?: DepartmentInfo;
}

const StaffManagementHub = () => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [specialtyId, setSpecialtyId] = useState('');
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get Department Head's role
  const { data: userRole } = useQuery<UserRoleWithDept>({
    queryKey: ['department-head-role', user?.id],
    queryFn: async () => {
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user?.id)
        .eq('role', 'department_head')
        .single();

      if (roleError) throw roleError;
      
      // Fetch department info separately
      if (roleData.department_id) {
        const { data: deptData, error: deptError } = await supabase
          .from('departments')
          .select('*, facilities(*, workspaces(*))')
          .eq('id', roleData.department_id)
          .single();
          
        if (deptError) throw deptError;
        
        return {
          ...roleData,
          departments: deptData as DepartmentInfo
        } as UserRoleWithDept;
      }
      
      return roleData as UserRoleWithDept;
    },
    enabled: !!user,
  });

  // Get specialties for the department
  const { data: specialties } = useQuery({
    queryKey: ['specialties', userRole?.department_id],
    queryFn: async () => {
      if (!userRole?.department_id) return [];
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('parent_department_id', userRole.department_id)
        .order('name');

      if (error) throw error;
      return data;
    },
    enabled: !!userRole?.department_id,
  });

  // Get staff in the department
  const { data: staff, isLoading } = useQuery({
    queryKey: ['department-staff', userRole?.department_id],
    queryFn: async () => {
      if (!userRole?.department_id) return [];
      
      const { data: staffRoles, error } = await supabase
        .from('user_roles')
        .select('*, profiles(*), departments!user_roles_specialty_id_fkey(name)')
        .eq('department_id', userRole.department_id)
        .eq('role', 'staff');

      if (error) throw error;
      return staffRoles;
    },
    enabled: !!userRole?.department_id,
  });

  const createStaffMutation = useMutation({
    mutationFn: async (staffData: { email: string; full_name: string; specialty_id: string }) => {
      const validated = staffSchema.parse(staffData);

      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: validated.email,
          password: '123456', // Default password
          full_name: validated.full_name,
          role: 'staff',
          workspace_id: userRole?.workspace_id,
          facility_id: userRole?.facility_id,
          department_id: userRole?.department_id,
          specialty_id: validated.specialty_id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['department-staff'] });
      toast.success('Staff member created successfully. Default password: 123456');
      setEmail('');
      setFullName('');
      setSpecialtyId('');
      setOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create staff member');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createStaffMutation.mutate({ email, full_name: fullName, specialty_id: specialtyId });
  };

  if (!userRole) {
    return (
      <Card className="border-2">
        <CardHeader>
          <CardTitle>Staff Management</CardTitle>
          <CardDescription>Loading department information...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Staff Management</h2>
        <p className="text-muted-foreground">
          Manage staff members in your department
        </p>
      </div>

      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Department Staff</CardTitle>
              <CardDescription>
                {userRole.departments?.name || 'Loading...'} - {userRole.departments?.facilities?.name || 'Loading...'}
              </CardDescription>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-primary">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add Staff
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Staff Member</DialogTitle>
                  <DialogDescription>
                    Create a new staff account. Default password: 123456
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="full-name">Full Name</Label>
                    <Input
                      id="full-name"
                      placeholder="John Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="john@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="specialty">Specialty</Label>
                    <Select value={specialtyId} onValueChange={setSpecialtyId} required>
                      <SelectTrigger>
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
                  </div>
                  <Button type="submit" className="w-full" disabled={createStaffMutation.isPending}>
                    {createStaffMutation.isPending ? 'Creating...' : 'Create Staff Member'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading staff members...
            </div>
          ) : staff && staff.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Specialty</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((member: any) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.profiles?.full_name}</TableCell>
                      <TableCell>{member.profiles?.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {member.departments?.name || 'No specialty'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.profiles?.is_active ? "default" : "secondary"}>
                          {member.profiles?.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No staff members found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StaffManagementHub;
