import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { User, Settings, Loader2, Mail, Briefcase } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

const UserProfile = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [fullName, setFullName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (open) {
      loadProfile();
    }
  }, [open]);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      const { data: rolesData } = await supabase
        .from('user_roles')
        .select(`
          *,
          department:departments!user_roles_department_id_fkey(name),
          facility:facilities(name),
          workspace:workspaces(name),
          specialty:departments!user_roles_specialty_id_fkey(name)
        `)
        .eq('user_id', user.id);

      setProfile(profileData);
      setRoles(rolesData || []);
      setFullName(profileData?.full_name || '');
    } catch (error: any) {
      toast.error('Failed to load profile');
    }
  };

  const handleUpdateName = async () => {
    if (!fullName.trim()) {
      toast.error('Name cannot be empty');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim() })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('Name updated successfully');
      setProfile({ ...profile, full_name: fullName.trim() });
    } catch (error: any) {
      toast.error(error.message || 'Failed to update name');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error('Please fill in all password fields');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (newPassword === '123456') {
      toast.error('Please choose a different password than the default');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      super_admin: 'Super Admin',
      general_admin: 'General Admin',
      workplace_supervisor: 'Workplace Supervisor',
      facility_supervisor: 'Facility Supervisor',
      department_head: 'Department Head',
      staff: 'Staff',
    };
    return labels[role] || role;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <User className="h-4 w-4 mr-2" />
          Profile
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            User Profile
          </DialogTitle>
          <DialogDescription>
            View and update your profile information
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Basic Information</h3>
            
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={profile?.email || ''}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">Email cannot be changed</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <div className="flex gap-2">
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  disabled={loading}
                />
                <Button
                  onClick={handleUpdateName}
                  disabled={loading || fullName === profile?.full_name}
                  size="sm"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          {/* Roles & Specialties */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Roles & Specialties
            </h3>
            <p className="text-xs text-muted-foreground">
              Assigned by your department head or administrator
            </p>
            
            {roles.length > 0 ? (
              <div className="space-y-3">
                {roles.map((role, index) => (
                  <div key={index} className="p-3 border rounded-lg bg-muted/30 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{getRoleLabel(role.role)}</Badge>
                    </div>
                    {role.workspace && (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">Workspace:</span> {role.workspace.name}
                      </p>
                    )}
                    {role.facility && (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">Facility:</span> {role.facility.name}
                      </p>
                    )}
                    {role.department && (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">Department:</span> {role.department.name}
                      </p>
                    )}
                    {role.specialty && (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">Specialty:</span> {role.specialty.name}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No roles assigned yet</p>
            )}
          </div>

          <Separator />

          {/* Change Password */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Change Password</h3>
            
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 characters)"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                disabled={loading}
              />
            </div>

            <Button
              onClick={handleChangePassword}
              disabled={loading || !newPassword || !confirmPassword}
              className="w-full"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Change Password
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserProfile;
