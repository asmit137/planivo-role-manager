import { useState, useEffect } from 'react';
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
import { format, addDays } from 'date-fns';
import { CalendarIcon, Plus, Trash2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { sendVacationStatusNotification } from '@/lib/vacationNotifications';

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
  const [selectedStaff, setSelectedStaff] = useState('');
  const [selectedVacationType, setSelectedVacationType] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [splits, setSplits] = useState<VacationSplit[]>([]);

  // Fetch current user's role to auto-detect behavior
  const { data: currentUserRole } = useQuery({
    queryKey: ['current-user-role', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id)
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Determine effective department ID and mode
  const isStaff = (currentUserRole?.role as any) === 'staff' || (currentUserRole?.role as any) === 'intern';
  const isDepartmentHead = (currentUserRole?.role as any) === 'department_head';
  const isSupervisor = ['facility_supervisor', 'workplace_supervisor', 'workspace_supervisor'].includes(currentUserRole?.role as any);
  const isSuperAdmin = (currentUserRole?.role as any) === 'super_admin' || (currentUserRole?.role as any) === 'organization_admin';
  const effectiveDepartmentId = departmentId || selectedDepartment || currentUserRole?.department_id;
  const effectiveStaffOnly = staffOnly || isStaff;

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
        .eq('facilities.workspaces.organizations.is_active', true)
        .order('name');

      // If specific organization is selected (and not 'all'), filter by it
      if (currentOrganization?.id && currentOrganization.id !== 'all') {
        query = query.eq('facilities.workspaces.organizations.id', currentOrganization.id);
      }

      const { data, error } = await query;
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
    effectiveStaffList.push({
      user_id: user!.id,
      role: currentUserRole?.role,
      profiles: userProfile
    });
  }

  const targetStaffIdForBalance = effectiveStaffOnly ? user?.id : (selectedStaff || user?.id);

  const { data: staffBalances } = useQuery({
    queryKey: ['staff-leave-balances', targetStaffIdForBalance, new Date().getFullYear()],
    queryFn: async () => {
      if (!targetStaffIdForBalance) return [];
      const { data, error } = await (supabase
        .from('leave_balances' as any) as any)
        .select('*')
        .eq('staff_id', targetStaffIdForBalance)
        .eq('year', new Date().getFullYear());
      if (error) throw error;
      return data;
    },
    enabled: !!targetStaffIdForBalance, // Removed && currentOrganization?.vacation_mode === 'full'
  });

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
          throw new Error(
            `You already have a vacation request from ${startStr} to ${endStr} (${overlap.vacation_type}) that overlaps with this date range.`
          );
        }

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
            throw new Error(`Conflict with shift: ${s.shifts?.name} on ${dateStr}. Please resolve the schedule conflict first.`);
          }

          // Check for Training/Meeting Events
          const { data: trainingTargets } = await supabase
            .from('training_event_targets')
            .select('*, training_events(title, event_type, start_datetime, end_datetime)')
            .eq('user_id', targetStaffId)
            .eq('target_type', 'user')
            .gte('training_events.start_datetime', `${split.start_date}T00:00:00`)
            .lte('training_events.end_datetime', `${split.end_date}T23:59:59`);

          if (trainingTargets && trainingTargets.length > 0) {
            const t = trainingTargets[0] as any;
            const tDate = new Date(t.training_events?.start_datetime);
            const dateStr = !isNaN(tDate.getTime()) ? format(tDate, 'PPP') : 'Unknown Date';
            throw new Error(`Conflict with ${t.training_events?.event_type || 'training'}: ${t.training_events?.title} on ${dateStr}.`);
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
          notes: planData.notes,
          created_by: user?.id,
          status: planData.status || 'pending_approval', // Use passed status
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
              status: planData.status === 'approved' ? 'approved' : 'pending', // Auto-approve splits too
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
      if (variables.status === 'approved') {
        await sendVacationStatusNotification(
          data.id,
          'approved',
          variables.staff_id,
          userProfile?.full_name || 'Manager',
          'Auto-approved by manager'
        );
        toast.success('Vacation plan created and approved successfully');
      } else {
        toast.success('Vacation plan created');
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
    setSplits([
      ...splits,
      { start_date: new Date(), end_date: new Date(), days: 1 },
    ]);
  };

  const removeSplit = (index: number) => {
    setSplits(splits.filter((_, i) => i !== index));
  };

  const updateSplit = (index: number, field: keyof VacationSplit, value: any) => {
    const newSplits = [...splits];
    const vacationType = vacationTypes?.find(t => t.id === selectedVacationType);
    const maxDays = vacationType?.max_days;

    newSplits[index] = { ...newSplits[index], [field]: value };

    if (field === 'start_date') {
      const start = new Date(value);
      if (start && !isNaN(start.getTime()) && maxDays) {
        // Automatically set end_date based on max_days
        const autoEndDate = addDays(start, maxDays - 1);
        newSplits[index].end_date = autoEndDate;
        newSplits[index].days = maxDays;
      } else if (start && !isNaN(start.getTime())) {
        // If no maxDays, ensure end_date is at least start_date
        if (newSplits[index].end_date < start) {
          newSplits[index].end_date = start;
          newSplits[index].days = 1;
        } else {
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
    setSelectedStaff('');
    setSelectedVacationType('');
    setNotes('');
    setSelectedDepartment('');
    setSplits([]);
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

    // Manager Auto-Approval Logic
    const isManagerPlanning = (isSuperAdmin || isSupervisor || isDepartmentHead) && selectedStaff && selectedStaff !== user?.id;
    let initialStatus = 'pending_approval';

    if (isManagerPlanning) {
      if (currentOrganization?.vacation_mode === 'full') {
        const typeBalance = (staffBalances as any)?.find((b: any) => b.vacation_type_id === selectedVacationType);

        // Strict balance check for Managers in Full Mode
        if (!typeBalance || totalDays > (typeBalance as any).balance) {
          const typeName = vacationTypes?.find(t => t.id === selectedVacationType)?.name || 'this vacation type';
          const balance = typeBalance ? (typeBalance as any).balance : 0;
          toast.error(`Insufficient leave balance. You are requesting ${totalDays} days, but only ${balance} days remain for ${typeName}. Cannot auto-approve.`);
          return;
        }
        initialStatus = 'approved';
      } else if (currentOrganization?.vacation_mode === 'planning') {
        // Planning mode: Skip balance check and Auto-Approve
        initialStatus = 'approved';
      }
    } else {
      // Regular user or Self-Planning
      const typeBalance = (staffBalances as any)?.find((b: any) => b.vacation_type_id === selectedVacationType);

      // Balance check (Always enforce if balance exists and not in planning mode)
      if (currentOrganization?.vacation_mode === 'full') {
        if (typeBalance) {
          if (totalDays > (typeBalance as any).balance) {
            const typeName = vacationTypes?.find(t => t.id === selectedVacationType)?.name || 'this vacation type';
            toast.error(`Insufficient leave balance. You are requesting ${totalDays} days, but only ${(typeBalance as any).balance} days remain for ${typeName}.`);
            return;
          }
        }
      }
    }

    createPlanMutation.mutate({
      staff_id: selectedStaff,
      vacation_type_id: selectedVacationType,
      total_days: totalDays,
      notes,
      status: initialStatus, // Pass status to mutation
      splits: splits.map(split => ({
        start_date: format(split.start_date, 'yyyy-MM-dd'),
        end_date: format(split.end_date, 'yyyy-MM-dd'),
        days: split.days,
      })),
    });
  };

  return (
    <Card>
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
          {(isSuperAdmin || (isSupervisor && !effectiveDepartmentId)) && (
            <div>
              <Label>Select Department *</Label>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a department" />
                </SelectTrigger>
                <SelectContent>
                  {allDepartments?.map((dept: any) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name} {dept.facilities?.name && `(${dept.facilities.name})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!effectiveStaffOnly && effectiveDepartmentId && (
            <div>
              <Label>Staff Member</Label>
              <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {effectiveStaffList?.map((staff: DepartmentStaffMember) => (
                    <SelectItem key={staff.user_id} value={staff.user_id}>
                      {staff.profiles?.full_name || 'Unknown User'} ({staff.profiles?.email || 'No email'})
                      {staff.role === 'department_head' && ' (Department Head)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Vacation Type</Label>
            <Select value={selectedVacationType} onValueChange={setSelectedVacationType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {vacationTypes?.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name} {type.max_days && `(Max: ${type.max_days} days)`}
                  </SelectItem>
                ))}
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
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => removeSplit(index)}
                      className="min-h-[44px] min-w-[44px]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
                        <PopoverContent className="w-auto p-0 z-50 pointer-events-auto max-w-[calc(100vw-2rem)]" align="start" side="bottom">
                          <Calendar
                            mode="single"
                            selected={split.start_date}
                            onSelect={(date) => date && updateSplit(index, 'start_date', date)}
                            disabled={{ before: new Date() }}
                            initialFocus
                            className="pointer-events-auto"
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
                        <PopoverContent className="w-auto p-0 z-50 pointer-events-auto max-w-[calc(100vw-2rem)]" align="start" side="bottom">
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

          <div className="flex gap-2">
            <Button type="submit" disabled={createPlanMutation.isPending}>
              Create Plan
            </Button>
            <Button type="button" variant="outline" onClick={resetForm}>
              Reset
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default VacationPlanner;