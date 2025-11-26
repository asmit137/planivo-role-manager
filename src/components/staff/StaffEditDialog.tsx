import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TextField, SelectField, SwitchField } from '@/components/shared/FormField';

interface StaffEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffUserId: string;
  departmentId: string;
}

export function StaffEditDialog({
  open,
  onOpenChange,
  staffUserId,
  departmentId,
}: StaffEditDialogProps) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [specialtyId, setSpecialtyId] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Fetch staff profile
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['staff-profile', staffUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', staffUserId)
        .single();

      if (error) throw error;
      
      setFullName(data.full_name);
      setIsActive(data.is_active);
      
      return data;
    },
    enabled: open && !!staffUserId,
  });

  // Fetch staff user_role to get current specialty
  const { data: userRole } = useQuery({
    queryKey: ['staff-role', staffUserId, departmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', staffUserId)
        .eq('role', 'staff')
        .eq('department_id', departmentId)
        .single();

      if (error) throw error;
      
      setSpecialtyId(data.specialty_id || '');
      
      return data;
    },
    enabled: open && !!staffUserId && !!departmentId,
  });

  // Fetch specialties for the department
  const { data: specialties } = useQuery({
    queryKey: ['department-specialties', departmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('id, name')
        .eq('facility_id', departmentId)
        .eq('is_template', false)
        .order('name');

      if (error) throw error;
      return data;
    },
    enabled: open && !!departmentId,
  });

  const updateStaffMutation = useMutation({
    mutationFn: async () => {
      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          is_active: isActive,
        })
        .eq('id', staffUserId);

      if (profileError) throw profileError;

      // Update user_role specialty
      if (specialtyId && userRole) {
        const { error: roleError } = await supabase
          .from('user_roles')
          .update({
            specialty_id: specialtyId,
          })
          .eq('id', userRole.id);

        if (roleError) throw roleError;
      }
    },
    onSuccess: () => {
      toast.success('Staff member updated successfully');
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      queryClient.invalidateQueries({ queryKey: ['staff-profile'] });
      queryClient.invalidateQueries({ queryKey: ['staff-role'] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(`Failed to update staff: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateStaffMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Staff Member</DialogTitle>
          <DialogDescription>
            Update staff member details and status
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            id="staff-full-name"
            label="Full Name"
            value={fullName}
            onChange={(value) => setFullName(value)}
            required
            disabled={profileLoading}
          />

          <SelectField
            id="staff-specialty"
            label="Specialty"
            value={specialtyId}
            onChange={(value) => setSpecialtyId(value)}
            options={
              specialties?.map((s) => ({
                value: s.id,
                label: s.name,
              })) || []
            }
            required
            disabled={!specialties}
          />

          <SwitchField
            id="staff-active-status"
            label="Active Status"
            checked={isActive}
            onCheckedChange={setIsActive}
            description="Inactive users cannot log in"
          />

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateStaffMutation.isPending}>
              {updateStaffMutation.isPending ? 'Updating...' : 'Update Staff'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
