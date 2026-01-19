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
import { User, Settings, Loader2, Mail, Briefcase, Phone } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

interface UserProfileProps {
  collapsed?: boolean;
}

const UserProfile = ({ collapsed = false }: UserProfileProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);

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
          department:departments!fk_user_roles_department(name),
          facility:facilities(name),
          workspace:workspaces(name),
          specialty:departments!user_roles_specialty_id_fkey(name)
        `)
        .eq('user_id', user.id);

      setProfile(profileData);
      setRoles(rolesData || []);
      setFullName(profileData?.full_name || '');
      setPhone(profileData?.phone || '');
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
        .update({ full_name: fullName.trim(), phone: phone.trim() || null })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('Profile updated successfully');
      setProfile({ ...profile, full_name: fullName.trim(), phone: phone.trim() || null });
    } catch (error: any) {
      toast.error(error.message || 'Failed to update name');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async () => {
    if (!profile?.email) {
      toast.error('User email not found');
      return;
    }

    if (!newPassword || !confirmPassword) {
      toast.error('Please fill in both password fields first');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    if (newPassword === '123456') {
      toast.error('Please choose a more secure password than the default');
      return;
    }

    setLoading(true);
    console.log('[UserProfile] Initiating OTP request for:', profile.email);
    try {
      const { data, error } = await supabase.functions.invoke('send-password-otp', {
        body: { email: profile.email },
      });

      console.log('[UserProfile] OTP function response:', { data, error });

      if (error) {
        console.error('[UserProfile] Edge Function Error:', error);

        // Attempt to parse the error message from the response body if possible
        let errorMessage = error.message;
        if (error instanceof Error && (error as any).context) {
          try {
            const body = await (error as any).context.json();
            if (body && body.error) {
              errorMessage = body.error;
            }
          } catch (e) {
            console.error('[UserProfile] Failed to parse error body:', e);
          }
        }

        throw new Error(errorMessage);
      }

      setIsOtpSent(true);
      setOtpCooldown(60);
      toast.success('Verification code sent to your email');
    } catch (error: any) {
      console.error('[UserProfile] Error in handleSendOTP:', error);
      toast.error(error.message || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!isOtpSent) {
      toast.error('Please request a verification code first');
      return;
    }

    if (!otp) {
      toast.error('Please enter the verification code');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-and-update-password', {
        body: {
          email: profile.email,
          otp,
          newPassword
        },
      });

      console.log('[UserProfile] Password change response:', { data, error });

      if (error) {
        console.error('[UserProfile] Edge Function Password Error:', error);

        let errorMessage = error.message;
        if (error instanceof Error && (error as any).context) {
          try {
            const body = await (error as any).context.json();
            if (body && body.error) {
              errorMessage = body.error;
            }
          } catch (e) {
            console.error('[UserProfile] Failed to parse password error body:', e);
          }
        }

        throw new Error(errorMessage);
      }

      toast.success('Password changed successfully');
      setIsOtpSent(false);
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('[UserProfile] Error in handleChangePassword:', error);
      toast.error(error.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let timer: any;
    if (otpCooldown > 0) {
      timer = setTimeout(() => setOtpCooldown(prev => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [otpCooldown]);

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
        <Button variant={collapsed ? "ghost" : "outline"} size={collapsed ? "icon" : "sm"} className={collapsed ? "min-h-[44px] min-w-[44px]" : ""}>
          <User className={collapsed ? "h-4 w-4" : "h-4 w-4 mr-2"} />
          {!collapsed && "Profile"}
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
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Phone
              </Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter your phone number"
                disabled={loading}
              />
            </div>

            <Button
              onClick={handleUpdateName}
              disabled={loading || (fullName === profile?.full_name && phone === (profile?.phone || ''))}
              className="w-full"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Profile
            </Button>
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
                disabled={loading || isOtpSent}
              />
            </div>

            {isOtpSent && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <Label htmlFor="otp">Verification Code</Label>
                <Input
                  id="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter 6-digit code"
                  className="text-center tracking-widest font-mono text-lg"
                  maxLength={6}
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground text-center">
                  Sent to {profile?.email}
                </p>
                <div className="flex justify-center">
                  <Button
                    variant="link"
                    size="sm"
                    onClick={handleSendOTP}
                    disabled={loading || otpCooldown > 0}
                    className="text-xs"
                  >
                    {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : "Resend code"}
                  </Button>
                </div>
              </div>
            )}

            {!isOtpSent ? (
              <Button
                onClick={handleSendOTP}
                disabled={loading}
                className="w-full"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Verification Code
              </Button>
            ) : (
              <Button
                onClick={handleChangePassword}
                disabled={loading || !otp}
                className="w-full"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify & Change Password
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserProfile;
