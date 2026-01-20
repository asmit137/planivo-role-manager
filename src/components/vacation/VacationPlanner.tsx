import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, addDays, parseISO, isWithinInterval, eachDayOfInterval } from 'date-fns';
import { CalendarIcon, Plus, Trash2, Info, AlertCircle, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { sendVacationStatusNotification, sendVacationMessage } from '@/lib/vacationNotifications';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useUserRole } from '@/hooks/useUserRole';
import { Badge } from '@/components/ui/badge';

interface VacationSplit {
  start_date: Date;
  end_date: Date;
  days: number;
}

interface DepartmentStaffMember {
  user_id: string;
  role: string;
  profiles: {
    id: string;
    full_name: string;
    email: string;
  };
}

interface VacationPlannerProps {
  departmentId?: string;
  maxSplits?: number;
  staffOnly?: boolean;
}

const VacationPlanner = ({ departmentId, maxSplits = 6, staffOnly = false }: VacationPlannerProps) => {
  const { user } = useAuth();
  const { organization: currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [selectedStaff, setSelectedStaff] = useState<string | undefined>(undefined);
  const [selectionMode, setSelectionMode] = useState<'single' | 'group'>('single');
  const [selectedRole, setSelectedRole] = useState<string>('staff');
  const [selectedVacationType, setSelectedVacationType] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string | undefined>(undefined);
  const [splits, setSplits] = useState<VacationSplit[]>([
    { start_date: new Date(), end_date: new Date(), days: 1 }
  ]);

  // Fetch current user's role to auto-detect behavior
  const { data: userRoles, isLoading: rolesLoading } = useUserRole();

  // Determine effective department ID and mode
  const isStaff = useMemo(() => userRoles?.some(r => r.role === 'staff' || r.role === 'intern') ?? false, [userRoles]);
  const isDepartmentHead = useMemo(() => userRoles?.some(r => r.role === 'department_head') ?? false, [userRoles]);
  const isSupervisor = useMemo(() => userRoles?.some(r => ['facility_supervisor', 'workplace_supervisor', 'workspace_supervisor'].includes(r.role)) ?? false, [userRoles]);
  const isSuperAdmin = useMemo(() => userRoles?.some(r => ['super_admin', 'organization_admin', 'general_admin'].includes(r.role)) ?? false, [userRoles]);

  // Find first role with a department_id for fallback
  const homeDepartmentId = useMemo(() => userRoles?.find(r => r.department_id)?.department_id, [userRoles]);

  const effectiveDepartmentId = departmentId || selectedDepartment || homeDepartmentId;
  const effectiveStaffOnly = staffOnly || (isStaff && !isSupervisor && !isSuperAdmin);

  // Auto-select staff member if in staff-only mode
  useEffect(() => {
    if (effectiveStaffOnly && user?.id && !selectedStaff) {
      setSelectedStaff(user.id);
    }
  }, [effectiveStaffOnly, user?.id, selectedStaff]);

  // Fetch all departments for Super Admin
  const { data: allDepartments } = useQuery({
    queryKey: ['all-departments', currentOrganization?.id],
    queryFn: async () => {
      let query = supabase
        .from('departments')
        .select('id, name, facilities!inner(name, workspaces!inner(organizations!inner(id, is_active)))')
        .eq('facilities.workspaces.organizations.is_active', true);

      // If specific organization is selected (and not 'all'), filter by it
      if (currentOrganization?.id && currentOrganization.id !== 'all') {
        query = query.eq('facilities.workspaces.organizations.id', currentOrganization.id);
      }

      const { data, error } = await query.order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!(isSuperAdmin || isSupervisor),
  });

  // Real-time subscriptions for live updates
  useRealtimeSubscription({
    table: 'vacation_plans',
    invalidateQueries: ['vacation-plans', 'department-staff'],
  });

  useRealtimeSubscription({
    table: 'vacation_splits',
    invalidateQueries: ['vacation-plans'],
  });

  useRealtimeSubscription({
    table: 'vacation_types',
    invalidateQueries: ['vacation-types'],
  });

  const { data: vacationTypes } = useQuery({
    queryKey: ['vacation-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vacation_types')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: departmentStaff } = useQuery<DepartmentStaffMember[]>({
    queryKey: ['department-staff', effectiveDepartmentId],
    queryFn: async () => {
      if (!effectiveDepartmentId) return [];

      // First get user_roles for the department
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .eq('department_id', effectiveDepartmentId)
        .in('role', ['staff', 'intern', 'department_head', 'facility_supervisor', 'workplace_supervisor', 'workspace_supervisor'] as any[]);

      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [];

      // Get profile data for these users
      const userIds = roles.map(r => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      // Ensure profiles is always an array
      const profilesArray = profiles || [];

      // Combine the data with safe fallback
      return roles
        .map(role => {
          const profile = profilesArray.find(p => p.id === role.user_id);
          return {
            user_id: role.user_id,
            role: role.role,
            profiles: profile || { id: role.user_id, full_name: 'Unknown User', email: 'No email' }
          };
        })
        .filter(item => item.profiles !== null) // Extra safety filter
        .sort((a, b) => {
          // Department heads first
          if (a.role === 'department_head' && b.role !== 'department_head') return -1;
          if (b.role === 'department_head' && a.role !== 'department_head') return 1;
          return 0;
        });
    },
    enabled: Boolean((effectiveDepartmentId && (isDepartmentHead || isSuperAdmin || isSupervisor || !effectiveStaffOnly)) || isSupervisor),
  });

  // Effect: If I am a Supervisor/Admin planning for myself, and I am not in the list, inject myself or handle it.
  // Actually, simpler: If I am a supervisor, I probably want to select MYSELF by default if I picked a department.
  // But wait, if I pick a department, do I become a "staff" of that department?
  // User Requirement: "supervisors can plan there vacation".
  // Solution: If the user is a Supervisor, just allow them to be the "selectedStaff" even if not in the list, 
  // OR fetch their profile specifically.

  if (!user) return null;

  // Note: 'organization' and 'staffView' are not defined in the current scope.
  // Assuming 'currentOrganization' is intended for 'organization' and 'staffOnly' for 'staffView'.
  // If these are meant to be different, they need to be passed as props or defined.
  if (isSuperAdmin && !currentOrganization?.id && !staffOnly) {
    return (
      <Card className="p-8 text-center text-muted-foreground border-2 border-dashed">
        Initializing Organization Context...
      </Card>
    );
  }

  if (rolesLoading) {
    return (
      <Card className="p-8 text-center text-muted-foreground border-2 border-dashed">
        Detecting roles and permissions...
      </Card>
    );
  }

  const { data: userProfile } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      return data;
    },
    enabled: !!user?.id
  });

  // Merge current user into departmentStaff if missing (for Supervisors planning for themselves)
  const effectiveStaffList = [...(departmentStaff || [])];
  if (isSupervisor && userProfile && !effectiveStaffList.find(s => s.user_id === user?.id)) {
    const primaryRole = userRoles?.find(r => r.user_id === user?.id)?.role || 'supervisor';
    effectiveStaffList.push({
      user_id: user!.id,
      role: primaryRole,
      profiles: userProfile
    });
  }

  const targetStaffIdForBalance = effectiveStaffOnly ? user?.id : (selectedStaff || user?.id);

  const { data: staffBalances } = useQuery({
    queryKey: ['staff-leave-balances', targetStaffIdForBalance, new Date().getFullYear()],
    queryFn: async () => {
      if (!targetStaffIdForBalance) return [];

      // 1. Get the target user's role and organization
      const { data: userRoleData, error: roleError } = await (supabase
        .from('user_roles' as any)
        .select('role, organization_id')
        .eq('user_id', targetStaffIdForBalance)
        .maybeSingle() as any);

      if (roleError) throw roleError;

      // 2. Get existing individual balances
      const { data: balances, error: balancesError } = await (supabase
        .from('leave_balances' as any) as any)
        .select('*')
        .eq('staff_id', targetStaffIdForBalance)
        .eq('year', new Date().getFullYear());

      if (balancesError) throw balancesError;

      // 3. If we have a role/org, fetch the defaults
      let defaults: any[] = [];
      if (userRoleData?.role && userRoleData?.organization_id) {
        const { data: defaultsData, error: defaultsError } = await (supabase
          .from('role_vacation_defaults' as any)
          .select('*')
          .eq('role', userRoleData.role)
          .eq('organization_id', userRoleData.organization_id)
          .eq('year', new Date().getFullYear()) as any);

        if (!defaultsError) defaults = defaultsData || [];
      }

      // 4. Merge: For each vacation type, use individual balance if exists, otherwise use default
      // We need to fetch vacation types too or use the already fetched ones if possible
      // But queryFn should be self-contained or use closures. 
      // Since vacationTypes is available in the component, we can use it, but vacationTypes might be null initially.

      const { data: vTypes } = await supabase
        .from('vacation_types')
        .select('id, name')
        .eq('is_active', true);

      return (vTypes || []).map(type => {
        const individual = balances?.find((b: any) => b.vacation_type_id === type.id);
        const roleDefault = defaults?.find((d: any) => d.vacation_type_id === type.id);

        if (individual) return individual;

        // Return a mock balance object based on default
        return {
          vacation_type_id: type.id,
          accrued: roleDefault?.default_days || 0,
          balance: roleDefault?.default_days || 0,
          used: 0,
          is_default: true // Marker for UI if needed
        };
      });
    },
    enabled: !!targetStaffIdForBalance,
  });

  // Fetch team vacations for busy date indicators
  const { data: teamVacations } = useQuery({
    queryKey: ['team-vacations', effectiveDepartmentId],
    queryFn: async () => {
      if (!effectiveDepartmentId) return [];
      const { data, error } = await supabase
        .from('vacation_plans')
        .select(`
          id, staff_id, status,
          vacation_splits(start_date, end_date, days),
          profiles:staff_id(full_name)
        `)
        .eq('department_id', effectiveDepartmentId)
        .in('status', ['pending_approval', 'approved'])
        .neq('staff_id', user?.id || '');

      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveDepartmentId,
  });

  // Calculate busy dates from team vacations
  const busyDatesMap = useMemo(() => {
    const map = new Map<string, { names: string[], count: number }>();
    if (!teamVacations) return map;

    teamVacations.forEach((plan: any) => {
      const staffName = plan.profiles?.full_name || 'Unknown';
      plan.vacation_splits?.forEach((split: any) => {
        try {
          const start = parseISO(split.start_date);
          const end = parseISO(split.end_date);
          const days = eachDayOfInterval({ start, end });

          days.forEach(day => {
            const key = format(day, 'yyyy-MM-dd');
            const existing = map.get(key) || { names: [], count: 0 };
            if (!existing.names.includes(staffName)) {
              existing.names.push(staffName);
              existing.count++;
            }
            map.set(key, existing);
          });
        } catch (e) {
          // Skip invalid dates
        }
      });
    });

    return map;
  }, [teamVacations]);

  const getBusyInfo = (date: Date) => {
    const key = format(date, 'yyyy-MM-dd');
    return busyDatesMap.get(key);
  };


  const createPlanMutation = useMutation({
    mutationFn: async (planData: any) => {
      // Use the effective department ID
      const targetDepartmentId = effectiveDepartmentId;

      if (!targetDepartmentId) {
        throw new Error('No department ID available');
      }

      // Check validation only if NOT in planning mode OR if explicitly requested (e.g. strict check passed)
      // Actually, we perform checks in handleSubmit. Here we just trust the inputs mostly, 
      // EXCEPT for concurrency checks which are still good.
      let finalStatus = planData.status || 'pending_approval';
      let autoRejectionReason = '';

      if (currentOrganization?.vacation_mode !== 'planning') {
        // Check for same-user overlapping vacation plans
        const targetStaffId = effectiveStaffOnly ? user?.id : planData.staff_id;
        const { data: userOverlaps } = await supabase.rpc('check_user_vacation_overlap', {
          _staff_id: targetStaffId,
          _splits: planData.splits
        });

        if (userOverlaps && Array.isArray(userOverlaps) && userOverlaps.length > 0) {
          const overlap = userOverlaps[0] as any;
          const sDate = new Date(overlap.start_date);
          const eDate = new Date(overlap.end_date);
          const startStr = !isNaN(sDate.getTime()) ? format(sDate, 'PPP') : 'Unknown Start';
          const endStr = !isNaN(eDate.getTime()) ? format(eDate, 'PPP') : 'Unknown End';
          autoRejectionReason = `Conflict with existing vacation from ${startStr} to ${endStr} (${overlap.vacation_type}).`;
          finalStatus = 'rejected';
        }

        if (!autoRejectionReason) {
          // Check for Shift Assignments
          for (const split of planData.splits) {
            const { data: shifts } = await supabase
              .from('shift_assignments')
              .select('*, shifts(name, start_time, end_time)')
              .eq('staff_id', targetStaffId)
              .gte('assignment_date', split.start_date)
              .lte('assignment_date', split.end_date);

            if (shifts && shifts.length > 0) {
              const s = shifts[0] as any;
              const aDate = new Date(s.assignment_date);
              const dateStr = !isNaN(aDate.getTime()) ? format(aDate, 'PPP') : 'Unknown Date';
              autoRejectionReason = `Conflict with shift: ${s.shifts?.name} on ${dateStr}.`;
              finalStatus = 'rejected';
              break;
            }

            // Check for Training/Meeting Events (Standard overlap logic)
            const { data: trainingTargets } = await supabase
              .from('training_event_targets')
              .select('*, training_events!inner(title, event_type, start_datetime, end_datetime)')
              .eq('user_id', targetStaffId)
              .eq('target_type', 'user')
              .lte('training_events.start_datetime', `${split.end_date}T23:59:59`)
              .gte('training_events.end_datetime', `${split.start_date}T00:00:00`);

            if (trainingTargets && trainingTargets.length > 0) {
              const t = trainingTargets[0] as any;
              console.info('Conflict detected with training event:', t);
              const tDate = new Date(t.training_events?.start_datetime);
              const dateStr = !isNaN(tDate.getTime()) ? format(tDate, 'PPP') : 'Unknown Date';
              autoRejectionReason = `Conflict with ${t.training_events?.event_type || 'training'}: ${t.training_events?.title} on ${dateStr}.`;
              finalStatus = 'rejected';
              break;
            }
          }
        }
      }

      const { data: plan, error: planError } = await supabase
        .from('vacation_plans')
        .insert({
          staff_id: effectiveStaffOnly ? user?.id : planData.staff_id,
          department_id: targetDepartmentId,
          vacation_type_id: planData.vacation_type_id,
          total_days: planData.total_days,
          notes: autoRejectionReason ? `${planData.notes}\n\n[Auto-Rejected: ${autoRejectionReason}]` : planData.notes,
          created_by: user?.id,
          status: finalStatus,
        })
        .select()
        .single();

      if (planError) throw planError;

      if (planData.splits.length > 0) {
        const { error: splitsError } = await supabase
          .from('vacation_splits')
          .insert(
            planData.splits.map((split: any) => ({
              vacation_plan_id: plan.id,
              ...split,
              status: finalStatus === 'approved' ? 'approved' : finalStatus === 'rejected' ? 'rejected' : 'pending',
            }))
          );
        if (splitsError) throw splitsError;
      }

      return plan;
    },
    onSuccess: async (data, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ['vacation-plans'] });
      queryClient.invalidateQueries({ queryKey: ['vacations'] });

      // Send notification if approved
      if (data.status === 'approved') {
        await sendVacationStatusNotification(
          data.id,
          'approved',
          variables.staff_id,
          userProfile?.full_name || 'Manager',
          'Auto-approved by manager'
        );
        toast.success('Vacation plan created and approved successfully');
      } else if (data.status === 'rejected') {
        // If auto-rejected, notify too
        await sendVacationStatusNotification(
          data.id,
          'rejected',
          variables.staff_id,
          'System',
          'Auto-rejected due to scheduling conflict or insufficient balance'
        );
        toast.error('Vacation plan rejected due to conflicts');
      } else {
        toast.success('Vacation plan submitted for approval');
      }

      // Send chat message if created by manager for staff
      if (user?.id && variables.staff_id && user.id !== variables.staff_id) {
        await sendVacationMessage(
          data.id,
          variables.staff_id,
          user.id,
          userProfile?.full_name || 'Manager'
        );
      }

      resetForm();
    },
    onError: (error: any) => {
      console.error('Vacation plan creation error:', error);
      toast.error(error.message || 'Failed to create vacation plan');
    },
  });

  const addSplit = () => {
    if (splits.length >= maxSplits) {
      toast.error(`Maximum ${maxSplits} splits allowed`);
      return;
    }
    const lastSplit = splits[splits.length - 1];
    const newStartDate = lastSplit ? addDays(new Date(lastSplit.end_date), 1) : new Date();
    const newEndDate = addDays(newStartDate, 0); // Default to same day (1 day total)

    setSplits([
      ...splits,
      { start_date: newStartDate, end_date: newEndDate, days: 1 },
    ]);
  };

  const removeSplit = (index: number) => {
    if (index === 0) return; // First split is mandatory
    setSplits(splits.filter((_, i) => i !== index));
  };

  const updateSplit = (index: number, field: keyof VacationSplit, value: any) => {
    const newSplits = [...splits];
    const vacationType = vacationTypes?.find(t => t.id === selectedVacationType);
    const maxDays = vacationType?.max_days;

    newSplits[index] = { ...newSplits[index], [field]: value };

    if (field === 'start_date') {
      const start = new Date(value);
      if (start && !isNaN(start.getTime())) {
        // If end_date is before new start_date, or not set, set it to start_date (1 day)
        if (!newSplits[index].end_date || newSplits[index].end_date < start) {
          newSplits[index].end_date = start;
          newSplits[index].days = 1;
        } else {
          // Recalculate days based on existing end_date
          const end = new Date(newSplits[index].end_date);
          const diffTime = Math.abs(end.getTime() - start.getTime());
          newSplits[index].days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        }
      }
    }

    if (field === 'end_date') {
      const start = new Date(newSplits[index].start_date);
      const end = new Date(value);

      if (start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
        if (end < start) {
          toast.error('End date cannot be before start date');
          return;
        }

        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        if (maxDays && diffDays > maxDays) {
          toast.warning(`You can plan the vacation only for ${maxDays} days for this vacation type`);
          // Optionally reset to max allowed, or just warn. User said "show the message".
        }

        newSplits[index].days = diffDays;
      }
    }

    setSplits(newSplits);
  };

  const resetForm = () => {
    setSelectedStaff(undefined);
    setSelectedVacationType(undefined);
    setNotes('');
    setSelectedDepartment(undefined);
    setSplits([
      { start_date: new Date(), end_date: new Date(), days: 1 }
    ]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isSuperAdmin && !selectedDepartment) {
      toast.error('Please select a department');
      return;
    }

    if (!effectiveStaffOnly && !selectedStaff) {
      toast.error('Please select staff member');
      return;
    }

    if (!selectedVacationType) {
      toast.error('Please select vacation type');
      return;
    }

    if (splits.length === 0) {
      toast.error('Please add at least one vacation period');
      return;
    }

    const totalDays = splits.reduce((sum, split) => sum + split.days, 0);
    const vacationType = vacationTypes?.find(t => t.id === selectedVacationType);

    if (vacationType?.max_days && totalDays > vacationType.max_days) {
      toast.error(`Total vacation days (${totalDays}) exceeds the maximum limit for ${vacationType.name} (${vacationType.max_days} days).`);
      return;
    }

    const commonData = {
      vacation_type_id: selectedVacationType,
      total_days: totalDays,
      notes,
      splits: splits.map(split => ({
        start_date: format(split.start_date, 'yyyy-MM-dd'),
        end_date: format(split.end_date, 'yyyy-MM-dd'),
        days: split.days,
      })),
    };

    if (selectionMode === 'single') {
      // Scenario Detection
      const isSelfRequest = selectedStaff === user?.id;
      const isManagerAction = (isSuperAdmin || isSupervisor || isDepartmentHead) && !isSelfRequest;
      const isAdminSelfRequest = (isSupervisor || isDepartmentHead || isSuperAdmin) && isSelfRequest;

      let initialStatus = 'pending_approval';

      // Scenario 2: Manager planning for staff -> Direct Approval
      if (isManagerAction) {
        if (currentOrganization?.vacation_mode === 'full') {
          const typeBalance = (staffBalances as any)?.find((b: any) => b.vacation_type_id === selectedVacationType);
          if (!typeBalance || totalDays > (typeBalance as any).balance) {
            const typeName = vacationTypes?.find(t => t.id === selectedVacationType)?.name || 'this vacation type';
            const balance = typeBalance ? (typeBalance as any).balance : 0;
            toast.error(`Auto-rejection: Insufficient leave balance for staff member. REQUEST: ${totalDays} days, REMAINING: ${balance} days.`);

            // Auto-reject scenario: Create as rejected
            createPlanMutation.mutate({
              ...commonData,
              staff_id: selectedStaff,
              status: 'rejected',
              notes: `${notes}\n\n[Auto-Rejected: Insufficient Balance]`,
            });
            return;
          }
          initialStatus = 'approved';
        } else {
          initialStatus = 'approved';
        }
      }
      // Scenario 3: Admin/Supervisor self-request -> Specifically pending for Super Admin
      else if (isAdminSelfRequest) {
        initialStatus = 'pending_approval'; // We will filter this for Super Admin in the Workflow component
      }

      // Check for conflicts before creating (Mandatory for all scenarios)
      // This will be handled inside createPlanMutation, but we can also do a quick check here if we want to "Directly reject"

      createPlanMutation.mutate({
        ...commonData,
        staff_id: selectedStaff,
        status: initialStatus,
      });
    } else {
      // Group Selection Mode (Usually manager action)
      const targetUsers = (effectiveStaffList || []).filter(s => s.role === selectedRole);

      if (targetUsers.length === 0) {
        toast.error(`No users found with role: ${selectedRole}`);
        return;
      }

      toast.info(`Creating vacations for ${targetUsers.length} users...`);

      targetUsers.forEach(staff => {
        // Auto-approve by default in planning mode, otherwise pending
        createPlanMutation.mutate({
          ...commonData,
          staff_id: staff.user_id,
          status: currentOrganization?.vacation_mode === 'planning' ? 'approved' : 'pending_approval',
        });
      });
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Create Vacation Plan</CardTitle>
        {currentOrganization?.vacation_mode === 'planning' && (
          <div className="bg-blue-50 text-blue-800 p-3 rounded-md flex items-start gap-2 text-sm mt-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Planning Mode Active</p>
              <p>Vacation requests will not deduct from your leave balance. This is for scheduling purposes only.</p>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {(isSuperAdmin || isSupervisor) && !departmentId && (
            <div>
              <Label>Select Department *</Label>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a department" />
                </SelectTrigger>
                <SelectContent>
                  {allDepartments && allDepartments.length > 0 ? (
                    allDepartments.map((dept: any) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name} {dept.facilities?.name && `(${dept.facilities.name})`}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-xs text-muted-foreground text-center">
                      No departments available
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {!effectiveStaffOnly && (
            <div className="space-y-4 pt-2 border-t mt-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Selection Mode</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={selectionMode === 'single' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectionMode('single')}
                  >
                    Individual
                  </Button>
                  <Button
                    type="button"
                    variant={selectionMode === 'group' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectionMode('group')}
                  >
                    Group / Role
                  </Button>
                </div>
              </div>

              {selectionMode === 'single' ? (
                <div>
                  <Label>Select Staff Member *</Label>
                  <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff member" />
                    </SelectTrigger>
                    <SelectContent>
                      {effectiveStaffList && effectiveStaffList.length > 0 ? (
                        effectiveStaffList.map((staff) => (
                          <SelectItem key={staff.user_id} value={staff.user_id}>
                            {staff.profiles?.full_name || 'Unknown User'} ({staff.role})
                          </SelectItem>
                        ))
                      ) : (
                        <div className="p-2 text-xs text-muted-foreground text-center">
                          No staff members available
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label>Select Role to Apply *</Label>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">All Staff</SelectItem>
                      <SelectItem value="intern">All Interns</SelectItem>
                      <SelectItem value="department_head">Department Heads</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1 italic">
                    This will create a vacation request for all users in the selected department with this role.
                  </p>
                </div>
              )}
            </div>
          )}

          <div>
            <Label>Vacation Type</Label>
            <Select value={selectedVacationType} onValueChange={setSelectedVacationType}>
              <SelectTrigger>
                <SelectValue placeholder="Select vacation type" />
              </SelectTrigger>
              <SelectContent>
                {vacationTypes && vacationTypes.length > 0 ? (
                  vacationTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name} {type.max_days && `(Max: ${type.max_days} days)`}
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-2 text-xs text-muted-foreground text-center">
                    No vacation types available
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <Label>Vacation Splits (Up to 6)</Label>
              <Button type="button" size="sm" onClick={addSplit}>
                <Plus className="h-4 w-4 mr-1" />
                Add Split
              </Button>
            </div>
            <div className="space-y-4">
              {splits.map((split, index) => (
                <div key={index} className="border p-3 sm:p-4 rounded-lg space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-sm sm:text-base">Split {index + 1}</span>
                    {index > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive-ghost"
                        onClick={() => removeSplit(index)}
                        className="min-h-[44px] min-w-[44px]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <Label className="text-sm">Start Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal min-h-[44px] text-sm',
                              !split.start_date && 'text-muted-foreground'
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {split.start_date ? format(split.start_date, 'PP') : 'Pick date'}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-auto p-0 pointer-events-auto"
                          align="center"
                          side="bottom"
                          sideOffset={4}
                        >
                          <div className="p-2 pb-0">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                              <div className="w-3 h-3 bg-warning/30 rounded" />
                              <span>Team member on leave</span>
                            </div>
                          </div>
                          <Calendar
                            mode="single"
                            selected={split.start_date}
                            onSelect={(date) => date && updateSplit(index, 'start_date', date)}
                            disabled={{ before: new Date() }}
                            initialFocus
                            className="pointer-events-auto"
                            modifiers={{
                              busy: (date) => !!getBusyInfo(date)
                            }}
                            modifiersClassNames={{
                              busy: 'bg-warning/30 hover:bg-warning/40 font-semibold'
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div>
                      <Label className="text-sm">End Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal min-h-[44px] text-sm',
                              !split.end_date && 'text-muted-foreground'
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {split.end_date ? format(split.end_date, 'PP') : 'Pick date'}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-auto p-0 pointer-events-auto"
                          align="center"
                          side="bottom"
                          sideOffset={4}
                        >
                          <div className="p-2 pb-0">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                              <div className="w-3 h-3 bg-warning/30 rounded" />
                              <span>Team member on leave</span>
                            </div>
                          </div>
                          <Calendar
                            mode="single"
                            selected={split.end_date}
                            onSelect={(date) => date && updateSplit(index, 'end_date', date)}
                            disabled={[
                              { before: new Date() },
                              { before: split.start_date }
                            ]}
                            initialFocus
                            className="pointer-events-auto"
                            modifiers={{
                              busy: (date) => !!getBusyInfo(date)
                            }}
                            modifiersClassNames={{
                              busy: 'bg-warning/30 hover:bg-warning/40 font-semibold'
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">Days: {split.days}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="submit" disabled={createPlanMutation.isPending} className="w-full sm:w-auto">
              Create Plan
            </Button>
            <Button type="button" variant="outline" onClick={resetForm} className="w-full sm:w-auto">
              Reset
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default VacationPlanner;