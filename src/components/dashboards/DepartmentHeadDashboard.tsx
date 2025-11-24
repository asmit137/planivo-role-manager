import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/DashboardLayout';
import VacationPlanner from '@/components/vacation/VacationPlanner';
import VacationPlansList from '@/components/vacation/VacationPlansList';
import TaskManager from '@/components/tasks/TaskManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, ClipboardList, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { z } from 'zod';

const staffSchema = z.object({
  email: z.string().email('Invalid email address'),
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(100),
});

const DepartmentHeadDashboard = () => {
  const { user } = useAuth();
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [staffEmail, setStaffEmail] = useState('');
  const [staffFullName, setStaffFullName] = useState('');
  const queryClient = useQueryClient();

  const { data: userRole } = useQuery({
    queryKey: ['department-head-role', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user?.id)
        .eq('role', 'department_head')
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: departmentStaff } = useQuery({
    queryKey: ['department-staff', userRole?.department_id],
    queryFn: async () => {
      if (!userRole?.department_id) return [];
      
      const { data: staffRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('department_id', userRole.department_id)
        .eq('role', 'staff');
      
      if (rolesError) throw rolesError;
      if (!staffRoles || staffRoles.length === 0) return [];

      const userIds = staffRoles.map(sr => sr.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds);
      
      if (profilesError) throw profilesError;
      return profiles;
    },
    enabled: !!userRole?.department_id,
  });

  const createStaffMutation = useMutation({
    mutationFn: async (data: { email: string; full_name: string }) => {
      const validated = staffSchema.parse(data);
      
      const { data: result, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: validated.email,
          password: '123456',
          full_name: validated.full_name,
          role: 'staff',
          department_id: userRole?.department_id,
          force_password_change: true,
        },
      });

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['department-staff'] });
      toast.success('Staff member created successfully. Default password: 123456');
      setStaffEmail('');
      setStaffFullName('');
      setAddStaffOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create staff member');
    },
  });

  const handleCreateStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userRole?.department_id) {
      toast.error('Department not found');
      return;
    }
    createStaffMutation.mutate({ email: staffEmail, full_name: staffFullName });
  };

  if (!userRole?.department_id) {
    return (
      <DashboardLayout title="Team Management" roleLabel="Department Head" roleColor="text-primary">
        <div className="text-center p-12">
          <p className="text-muted-foreground">Loading department information...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Team Management" roleLabel="Department Head" roleColor="text-primary">
      <Tabs defaultValue="staff" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="staff">
            <UserPlus className="h-4 w-4 mr-2" />
            Staff Management
          </TabsTrigger>
          <TabsTrigger value="vacation">
            <Calendar className="h-4 w-4 mr-2" />
            Vacation Planning
          </TabsTrigger>
          <TabsTrigger value="tasks">
            <ClipboardList className="h-4 w-4 mr-2" />
            Department Tasks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="staff">
          <Card className="border-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Department Staff</CardTitle>
                  <CardDescription>Manage staff members in your department</CardDescription>
                </div>
                <Button onClick={() => setAddStaffOpen(true)} className="bg-gradient-primary">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add Staff
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {departmentStaff && departmentStaff.length > 0 ? (
                <div className="space-y-2">
                  {departmentStaff.map((staff: any) => (
                    <div key={staff.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">{staff.full_name}</p>
                        <p className="text-sm text-muted-foreground">{staff.email}</p>
                      </div>
                      <Badge variant={staff.is_active ? 'default' : 'secondary'}>
                        {staff.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <UserPlus className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No staff members yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vacation">
          <div className="space-y-6">
            <VacationPlanner departmentId={userRole.department_id} />
            <VacationPlansList departmentId={userRole.department_id} />
          </div>
        </TabsContent>

        <TabsContent value="tasks">
          <TaskManager scopeType="department" scopeId={userRole.department_id} />
        </TabsContent>
      </Tabs>

      {/* Add Staff Dialog */}
      <Dialog open={addStaffOpen} onOpenChange={setAddStaffOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
            <DialogDescription>
              Create a new staff member for your department. Default password will be 123456 and they will be required to change it on first login.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateStaff} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="staff-name">Full Name</Label>
              <Input
                id="staff-name"
                placeholder="John Doe"
                value={staffFullName}
                onChange={(e) => setStaffFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-email">Email</Label>
              <Input
                id="staff-email"
                type="email"
                placeholder="john.doe@example.com"
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                required
              />
            </div>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> The staff member will receive the email address you provide and a default password of <strong>123456</strong>. They will be required to change this password upon their first login.
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={createStaffMutation.isPending}>
              {createStaffMutation.isPending ? 'Creating...' : 'Create Staff Member'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default DepartmentHeadDashboard;
