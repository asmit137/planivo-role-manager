import { useState, useEffect, useRef } from 'react';
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
import { User, Settings, Loader2, Mail, Briefcase, Phone, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

interface UserProfileProps {
  collapsed?: boolean;
}

const UserProfile = ({ collapsed = false }: UserProfileProps) => {
  const passwordSectionRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  // Password Change States
  const [showPasswordFields, setShowPasswordFields] = useState(false);
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

  useEffect(() => {
    let timer: any;
    if (otpCooldown > 0) {
      timer = setTimeout(() => setOtpCooldown(prev => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [otpCooldown]);

  useEffect(() => {
    if (showPasswordFields) {
      // Small timeout to allow the element to render/expand before scrolling
      const timeout = setTimeout(() => {
        passwordSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [showPasswordFields]);

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

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('send-password-otp', {
        body: { email: profile.email },
      });

      if (error) {
        let errorMessage = error.message;
        if (error instanceof Error && (error as any).context) {
          try {
            const body = await (error as any).context.json();
            if (body && body.error) errorMessage = body.error;
          } catch (e) { }
        }
        throw new Error(errorMessage);
      }

      setIsOtpSent(true);
      setOtpCooldown(60);
      toast.success('Verification code sent!', {
        description: "Please check your email (and spam folder)."
      });
    } catch (error: any) {
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
      const { error } = await supabase.functions.invoke('verify-and-update-password', {
        body: {
          email: profile.email,
          otp,
          newPassword
        },
      });

      if (error) {
        let errorMessage = error.message;
        if (error instanceof Error && (error as any).context) {
          try {
            const body = await (error as any).context.json();
            if (body && body.error) errorMessage = body.error;
          } catch (e) { }
        }
        throw new Error(errorMessage);
      }

      // Success! Clear force flag if necessary
      if (profile?.force_password_change) {
        await supabase
          .from('profiles')
          .update({ force_password_change: false })
          .eq('id', profile.id);
      }

      toast.success('Password changed successfully');
      setIsOtpSent(false);
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordFields(false);
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
      workplace_supervisor: 'Workspace Supervisor',
      workspace_supervisor: 'Workspace Supervisor',
      facility_supervisor: 'Facility Supervisor',
      department_head: 'Department Head',
      staff: 'Staff',
      intern: 'Intern',
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

            {roles.length > 0 ? (
              <div className="border rounded-lg overflow-hidden border-border bg-muted/20">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                      <th className="px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Workspace / Facility / Department</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {roles.map((role, index) => (
                      <tr key={index} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 align-top whitespace-nowrap">
                          <Badge variant="secondary" className="font-medium text-[11px] h-5 py-0 px-2 leading-none">
                            {getRoleLabel(role.role)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            {role.workspace && (
                              <p className="text-xs text-foreground flex items-center gap-1.5">
                                <span className="text-muted-foreground font-normal min-w-[70px]">Workspace:</span>
                                <span className="font-medium truncate">{role.workspace.name}</span>
                              </p>
                            )}
                            {role.facility && (
                              <p className="text-xs text-foreground flex items-center gap-1.5">
                                <span className="text-muted-foreground font-normal min-w-[70px]">Facility:</span>
                                <span className="font-medium truncate">{role.facility.name}</span>
                              </p>
                            )}
                            {role.department && (
                              <p className="text-xs text-foreground flex items-center gap-1.5">
                                <span className="text-muted-foreground font-normal min-w-[70px]">Department:</span>
                                <span className="font-medium truncate">{role.department.name}</span>
                              </p>
                            )}
                            {role.specialty && (
                              <p className="text-xs text-secondary-foreground flex items-center gap-1.5">
                                <span className="text-muted-foreground font-normal min-w-[70px]">Specialty:</span>
                                <span className="font-medium truncate">{role.specialty.name}</span>
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No roles assigned yet</p>
            )}
          </div>

          <Separator />

          {/* Change Password Section */}
          <div className="space-y-4" ref={passwordSectionRef}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Change Password
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPasswordFields(!showPasswordFields)}
                className="h-8 gap-1"
              >
                {showPasswordFields ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showPasswordFields ? 'Cancel' : 'Change Password'}
              </Button>
            </div>

            {showPasswordFields && (
              <div className="space-y-4 p-4 border rounded-lg bg-accent/5 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    disabled={loading || isOtpSent}
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
                  <div className="space-y-3 pt-2">
                    <Separator className="opacity-50" />
                    <div className="space-y-2">
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
                      <div className="flex items-center justify-between px-1">
                        <p className="text-[10px] text-muted-foreground">
                          Code sent to your email
                        </p>
                        <Button
                          variant="link"
                          size="sm"
                          onClick={handleSendOTP}
                          disabled={loading || otpCooldown > 0}
                          className="h-auto p-0 text-[10px]"
                        >
                          {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : "Resend code"}
                        </Button>
                      </div>
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
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserProfile;
