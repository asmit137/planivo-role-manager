import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Users, Pencil, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { z } from 'zod';
import { StaffEditDialog } from './StaffEditDialog';

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
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<{ id: string; name: string } | null>(null);
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
      
      // Fetch user_roles first
      const { data: staffRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*, departments!user_roles_specialty_id_fkey(name)')
        .eq('department_id', userRole.department_id)
        .eq('role', 'staff');

      if (rolesError) throw rolesError;
      if (!staffRoles || staffRoles.length === 0) return [];

      // Fetch profiles separately
      const userIds = staffRoles.map(role => role.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      // Combine the data
      return staffRoles.map(role => ({
        ...role,
        profiles: profiles?.find(p => p.id === role.user_id) || null
      }));
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

  const deleteStaffMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Delete user_role record (removes staff from department)
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', 'staff')
        .eq('department_id', userRole?.department_id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Staff member removed from department');
      queryClient.invalidateQueries({ queryKey: ['department-staff'] });
      setDeleteDialogOpen(false);
      setStaffToDelete(null);
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove staff: ${error.message}`);
    },
  });

  const handleDeleteClick = (userId: string, name: string) => {
    setStaffToDelete({ id: userId, name });
    setDeleteDialogOpen(true);
  };

  const handleEditClick = (userId: string) => {
    setSelectedStaffId(userId);
    setEditDialogOpen(true);
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
                  <TableHead>Actions</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((member: any) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.profiles?.full_name || 'Unknown'}</TableCell>
                      <TableCell>{member.profiles?.email || 'No email'}</TableCell>
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
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditClick(member.user_id)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(member.user_id, member.profiles?.full_name || 'Unknown')}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
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

      {selectedStaffId && userRole?.department_id && (
        <StaffEditDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          staffUserId={selectedStaffId}
          departmentId={userRole.department_id}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Staff Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {staffToDelete?.name} from this department?
              This will remove their staff role but keep their account active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => staffToDelete && deleteStaffMutation.mutate(staffToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default StaffManagementHub;
