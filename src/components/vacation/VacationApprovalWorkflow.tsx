import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, Calendar, User, FileText, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { sendVacationStatusNotification } from '@/lib/vacationNotifications';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';

interface VacationApprovalWorkflowProps {
  approvalLevel: 1 | 2 | 3;
  scopeType: 'department' | 'facility' | 'workspace';
  scopeId: string;
}

const VacationApprovalWorkflow = ({ approvalLevel, scopeType, scopeId }: VacationApprovalWorkflowProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');
  const [comments, setComments] = useState('');
  const [conflictData, setConflictData] = useState<any[]>([]);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictReason, setConflictReason] = useState('');
  const [previousLevelConflicts, setPreviousLevelConflicts] = useState<any[]>([]);
  const [showPreviousConflictDialog, setShowPreviousConflictDialog] = useState(false);
  const [selectedSplits, setSelectedSplits] = useState<Set<string>>(new Set());
  const [splitConflicts, setSplitConflicts] = useState<Map<string, any[]>>(new Map());
  const [schedulingConflicts, setSchedulingConflicts] = useState<any[]>([]);

  // Fetch pending vacation plans based on level
  const { data: pendingPlans, isLoading } = useQuery({
    queryKey: ['pending-vacation-plans', approvalLevel, scopeId],
    queryFn: async () => {
      let query = supabase
        .from('vacation_plans')
        .select(`
          *,
          vacation_types(name, description),
          departments(name, facility_id),
          vacation_splits(*),
          vacation_approvals(
            *,
            profiles:approver_id(full_name, email)
          )
        `) as any;

      // Add status filter
      query = query.in('status', ['pending_approval', 'department_pending', 'facility_pending', 'workspace_pending']);

      // Filter by Scope ID using direct columns with fallback
      if (!scopeId || scopeId === 'all') {
        // Super Admin or global view: See EVERYTHING
        // console.log('Super Admin / Global view detected: bypassing scope filters');
      } else if (approvalLevel === 1) {
        // Department scope
        query = query.eq('department_id', scopeId);
      } else if (approvalLevel === 2) {
        // Facility scope - Try direct column first
        query = query.eq('facility_id', scopeId);
      } else if (approvalLevel === 3) {
        // Workspace scope - Try direct column first
        query = query.eq('workspace_id', scopeId);
      }

      // DIAGNOSTIC: Check total visible plans
      const { count: totalVisible } = await supabase.from('vacation_plans').select('*', { count: 'exact', head: true });
      // console.log('DIAGNOSTIC - Total visible plans for user:', totalVisible);

      let { data: allPlans, error } = await query;

      // FALLBACK: If direct query returned 0 but totalVisible > 0, try join-based fallback
      if (!error && (!allPlans || allPlans.length === 0) && totalVisible && totalVisible > 0 && scopeId !== 'all') {
        // console.log(`Direct query for level ${approvalLevel} returned 0. Attempting join-based fallback...`);
        let fallbackQuery = supabase
          .from('vacation_plans')
          .select(`
            *,
            vacation_types(name, description),
            departments!inner(name, facility_id, facilities!inner(workspace_id)),
            vacation_splits(*),
            vacation_approvals(
              *,
              profiles:approver_id(full_name, email)
            )
          `) as any;

        fallbackQuery = fallbackQuery.in('status', ['pending_approval', 'department_pending', 'facility_pending', 'workspace_pending']);

        if (approvalLevel === 1) {
          fallbackQuery = fallbackQuery.eq('department_id', scopeId);
        } else if (approvalLevel === 2) {
          fallbackQuery = fallbackQuery.eq('departments.facility_id', scopeId);
        } else if (approvalLevel === 3) {
          fallbackQuery = fallbackQuery.eq('departments.facilities.workspace_id', scopeId);
        }

        const fallbackResult = await fallbackQuery;
        if (!fallbackResult.error && fallbackResult.data && fallbackResult.data.length > 0) {
          // console.log(`Fallback query successful! Found ${fallbackResult.data.length} plans.`);
          allPlans = fallbackResult.data;
        }
      }

      if (error) {
        console.error('Error fetching vacation plans:', error);
        throw error;
      }

      // console.log(`Raw plans from DB for level ${approvalLevel}:`, allPlans?.length || 0);
      if (allPlans && allPlans.length > 0) {
        const firstPlan = allPlans[0] as any;
        // console.log('DEBUG: First Plan Data (Unified):', {
        //   id: firstPlan.id,
        //   status: firstPlan.status,
        //   department_id: firstPlan.department_id,
        //   facility_id: firstPlan.facility_id,
        //   workspace_id: firstPlan.workspace_id
        // });
      }

      let filtered = allPlans || [];
      // console.log(`Initial plans for level ${approvalLevel}:`, filtered.length);

      // Fetch staff and creator info, including roles
      const extendedPlans = await Promise.all(
        filtered.map(async (plan) => {
          try {
            const [staffProfile, creatorProfile, roles] = await Promise.all([
              supabase.from('profiles').select('full_name, email').eq('id', plan.staff_id).maybeSingle(),
              supabase.from('profiles').select('full_name').eq('id', plan.created_by).maybeSingle(),
              supabase.from('user_roles').select('role').eq('user_id', plan.staff_id),
            ]);

            return {
              ...plan,
              staff_profile: staffProfile.data,
              creator_profile: creatorProfile.data,
              staff_roles: roles.data || [],
            };
          } catch (e) {
            console.error(`Error fetching details for plan ${plan.id}:`, e);
            return { ...plan, staff_roles: [] };
          }
        })
      );

      // Filter by Visibility Rules (New Hierarchy)
      // 1. Super Admin (which uses scopeId='all') sees everything.
      // 2. Supervisors (L1, L2, L3) should ONLY see plans from 'staff' or 'intern' role.
      if (!scopeId || scopeId === 'all') {
        return extendedPlans;
      }

      const finalPlans = extendedPlans.filter(p => {
        const roles = Array.isArray(p.staff_roles) ? p.staff_roles : [];
        const roleNames = roles.map((r: any) => r.role);

        // If roles failed to load, log warning but show the plan (better than hiding valid requests)
        if (roleNames.length === 0) {
          console.warn(`Plan ${p.id} has no roles loaded. Role-based visibility check bypassed.`);
          return true;
        }

        // Higher roles that ONLY Super Admin can approve
        const higherRoles = [
          'super_admin',
          'organization_admin',
          'general_admin',
          'workplace_supervisor',
          'facility_supervisor',
          'workspace_supervisor',
          'department_head'
        ];

        const hasHigherRole = roleNames.some(role => higherRoles.includes(role));
        const isStaffOrIntern = roleNames.includes('staff') || roleNames.includes('intern');

        // Supervisors (L1, L2, L3) should ONLY see plans for pure staff/interns
        // If they have ANY higher role, they must be approved by Super Admin
        if (approvalLevel >= 1 && approvalLevel <= 3) {
          return isStaffOrIntern && !hasHigherRole;
        }

        return false;
      });

      // console.log(`Final plans for approval level ${approvalLevel}:`, finalPlans.length);
      return finalPlans;
    },
    enabled: !!user && !!scopeId,
  });

  const approvalMutation = useMutation({
    mutationFn: async ({
      planId,
      action,
      comments,
      hasConflict = false,
      conflictReason = '',
      conflictingPlans = [],
      selectedSplitIds = []
    }: any) => {
      let effectiveAction = action;
      let rejectionReason = '';
      // Check for conflicts before approval (only for Department Head level)
      if (action === 'approve') {
        // 1. Fetch Plan Details to get staff and type
        const { data: planDetails } = await supabase
          .from('vacation_plans')
          .select('staff_id, vacation_type_id, department_id, departments(facility_id, facilities(workspace_id, workspaces(organization_id)))')
          .eq('id', planId)
          .single();

        if (planDetails) {
          // 2. Determine Organization ID (traverse up)
          // The plan -> department -> facility -> workspace -> organization
          const orgId = (planDetails.departments as any)?.facilities?.workspaces?.organization_id;

          if (orgId) {
            // 3. Check Organization Vacation Mode
            const { data: orgData } = await supabase
              .from('organizations')
              .select('vacation_mode')
              .eq('id', orgId)
              .single();

            if (orgData?.vacation_mode === 'full') {
              // 4. Fetch Current Balance
              const currentYear = new Date().getFullYear();
              const { data: balanceData } = await supabase
                .from('leave_balances')
                .select('balance')
                .eq('staff_id', planDetails.staff_id)
                .eq('vacation_type_id', planDetails.vacation_type_id)
                .eq('year', currentYear)
                .maybeSingle();

              // 5. Calculate Days to be Approved
              // If selectedSplitIds is provided, calculate ONLY those.
              // If not (e.g. quick approve?), use all splits? 
              // The confirmApproval function ENSURES selectedSplitIds is populated.
              // But let's be safe and fetch splits if needed, though we have selectedSplitIds arg.

              let approvedDays = 0;
              if (selectedSplitIds && selectedSplitIds.length > 0) {
                const { data: splits } = await supabase
                  .from('vacation_splits')
                  .select('days')
                  .in('id', selectedSplitIds);

                if (splits) {
                  approvedDays = splits.reduce((acc, curr) => acc + curr.days, 0);
                }
              }

              if (balanceData && balanceData.balance < approvedDays) {
                throw new Error('INSUFFICIENT_BALANCE');
              }
            }
          }
        }
      }

      if (action === 'approve' && approvalLevel === 1 && !hasConflict) {
        const { data: planData } = await supabase
          .from('vacation_plans')
          .select('department_id')
          .eq('id', planId)
          .single();

        if (planData) {
          // Check for vacation overlaps with OTHER users (existing logic)
          const { data: conflicts } = await supabase.rpc('check_vacation_conflicts', {
            _vacation_plan_id: planId,
            _department_id: planData.department_id
          });

          // Check for Shift Assignments
          const { data: planWithSplits } = await supabase
            .from('vacation_plans')
            .select('staff_id, vacation_splits(start_date, end_date)')
            .eq('id', planId)
            .single();

          const schedulingConflicts: any[] = [];
          if (planWithSplits?.vacation_splits) {
            for (const split of planWithSplits.vacation_splits) {
              // Check for Shift Assignments
              const { data: shifts } = await supabase
                .from('shift_assignments')
                .select('*, shifts(name, start_time, end_time)')
                .eq('staff_id', planWithSplits.staff_id)
                .gte('assignment_date', split.start_date)
                .lte('assignment_date', split.end_date);

              if (shifts && shifts.length > 0) {
                shifts.forEach((s: any) => {
                  schedulingConflicts.push({
                    type: 'shift',
                    name: s.shifts?.name,
                    date: s.assignment_date,
                    details: `${s.shifts?.start_time} - ${s.shifts?.end_time}`
                  });
                });
              }

              // Check for Training/Meeting Events
              const { data: trainingTargets } = await supabase
                .from('training_event_targets')
                .select('*, training_events(title, event_type, start_datetime, end_datetime)')
                .eq('user_id', planWithSplits.staff_id)
                .eq('target_type', 'user')
                .gte('training_events.start_datetime', `${split.start_date}T00:00:00`)
                .lte('training_events.end_datetime', `${split.end_date}T23:59:59`);

              if (trainingTargets && trainingTargets.length > 0) {
                trainingTargets.forEach((t: any) => {
                  if (t.training_events) {
                    schedulingConflicts.push({
                      type: t.training_events.event_type || 'training',
                      name: t.training_events.title,
                      date: format(new Date(t.training_events.start_datetime), 'yyyy-MM-dd'),
                      details: `${format(new Date(t.training_events.start_datetime), 'HH:mm')} - ${format(new Date(t.training_events.end_datetime), 'HH:mm')}`
                    });
                  }
                });
              }
            }
          }

          // Instead of auto-rejecting, throw error to show conflict dialog
          const allConflicts = {
            vacationConflicts: conflicts || [],
            schedulingConflicts: schedulingConflicts || []
          };
          throw new Error('CONFLICTS_DETECTED:' + JSON.stringify(allConflicts));
        }
      }

      // For Level 2 & 3: Check if previous levels had conflicts that need acknowledgment
      if (action === 'approve' && (approvalLevel === 2 || approvalLevel === 3) && !hasConflict) {
        const { data: previousApprovals } = await supabase
          .from('vacation_approvals')
          .select('*, profiles:approver_id(full_name)')
          .eq('vacation_plan_id', planId)
          .eq('has_conflict', true)
          .in('approval_level', approvalLevel === 2 ? [1] : [1, 2]);

        if (previousApprovals && previousApprovals.length > 0) {
          throw new Error('PREVIOUS_CONFLICTS:' + JSON.stringify(previousApprovals));
        }
      }

      // Get all splits for the plan
      const { data: allSplits } = await supabase
        .from('vacation_splits')
        .select('*')
        .eq('vacation_plan_id', planId);

      // Update split statuses based on selection
      if (allSplits) {
        for (const split of allSplits) {
          const newSplitStatus = (effectiveAction === 'approve' && selectedSplitIds.includes(split.id)) ? 'approved' : 'rejected';
          await supabase
            .from('vacation_splits')
            .update({ status: newSplitStatus })
            .eq('id', split.id);
        }

        // Calculate new total days from approved splits
        const approvedSplits = allSplits.filter(s => selectedSplitIds.includes(s.id));
        const newTotalDays = approvedSplits.reduce((sum, split) => sum + split.days, 0);

        // Update vacation plan total_days
        await supabase
          .from('vacation_plans')
          .update({ total_days: newTotalDays })
          .eq('id', planId);

      }

      // Create or update approval record
      const { data: existingApproval } = await supabase
        .from('vacation_approvals')
        .select('*')
        .eq('vacation_plan_id', planId)
        .eq('approval_level', approvalLevel)
        .maybeSingle();

      const approvalData = {
        vacation_plan_id: planId,
        approval_level: approvalLevel,
        approver_id: user?.id,
        status: effectiveAction === 'approve' ? 'approved' : 'rejected',
        comments: (effectiveAction === 'reject' && rejectionReason) ? rejectionReason : (comments || null),
        has_conflict: effectiveAction === 'reject' && rejectionReason.includes('conflict') ? true : hasConflict,
        conflict_reason: conflictReason || null,
        conflicting_plans: (Array.isArray(conflictingPlans) && conflictingPlans.length > 0) ? conflictingPlans : null,
      };

      if (existingApproval) {
        await supabase
          .from('vacation_approvals')
          .update(approvalData)
          .eq('id', existingApproval.id);
      } else {
        await supabase.from('vacation_approvals').insert(approvalData);
      }

      // Update vacation plan status
      const newStatus = effectiveAction === 'approve' ? 'approved' : 'rejected';

      const { error: updateError } = await supabase
        .from('vacation_plans')
        .update({ status: newStatus })
        .eq('id', planId);

      if (updateError) throw updateError;

      // Send notification to staff member
      const { data: planData } = await supabase
        .from('vacation_plans')
        .select('staff_id')
        .eq('id', planId)
        .single();

      if (planData) {
        const { data: approverProfile } = await (supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user?.id) as any)
          .single();

        const finalComment = (effectiveAction === 'reject' && rejectionReason) ? rejectionReason : (comments || '');

        await sendVacationStatusNotification(
          planId,
          newStatus,
          planData.staff_id,
          approverProfile?.full_name,
          finalComment
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-vacation-plans'] });
      queryClient.invalidateQueries({ queryKey: ['admin-leave-balances'] });
      queryClient.invalidateQueries({ queryKey: ['staff-leave-balances'] });
      toast.success(`Vacation plan ${approvalAction === 'approve' ? 'approved' : 'rejected'}`);
      setShowApprovalDialog(false);
      setShowConflictDialog(false);
      setSelectedPlan(null);
      setComments('');
      setConflictReason('');
      setConflictData([]);
      setSelectedSplits(new Set());
      setSplitConflicts(new Map());
    },
    onError: (error: any) => {
      if (error.message.startsWith('STRICT_CONFLICT_DETECTED:')) {
        // Auto-reject the plan if strict conflicts are found
        const conflictsJson = error.message.replace('STRICT_CONFLICT_DETECTED:', '');
        const allConflicts = JSON.parse(conflictsJson);

        toast.error('Conflicts detected! Auto-rejecting vacation request.');

        // Trigger rejection
        approvalMutation.mutate({
          planId: selectedPlan.id,
          action: 'reject',
          comments: 'Auto-rejected due to scheduling/vacation conflicts.',
        });
      } else if (error.message.startsWith('CONFLICTS_DETECTED:')) {
        const conflictsJson = error.message.replace('CONFLICTS_DETECTED:', '');
        const allConflicts = JSON.parse(conflictsJson);
        const { vacationConflicts, schedulingConflicts } = allConflicts;

        // Build split conflicts map
        const conflictsMap = new Map<string, any[]>();
        vacationConflicts.forEach((item: any) => {
          if (item.conflicts && item.conflicts.length > 0) {
            conflictsMap.set(item.split_id, item.conflicts);
          }
        });

        setSplitConflicts(conflictsMap);
        setConflictData(vacationConflicts);
        setSchedulingConflicts(schedulingConflicts || []);
        setShowApprovalDialog(false);
        setShowConflictDialog(true);
      } else if (error.message.startsWith('PREVIOUS_CONFLICTS:')) {
        const conflictsJson = error.message.replace('PREVIOUS_CONFLICTS:', '');
        const conflicts = JSON.parse(conflictsJson);
        setPreviousLevelConflicts(conflicts);
        setShowApprovalDialog(false);
        setShowPreviousConflictDialog(true);
      } else if (error.message === 'INSUFFICIENT_BALANCE') {
        toast.error('Insufficient leave balance for this user. Approval denied.');
        setShowApprovalDialog(false);
      } else {
        toast.error('Failed to process approval');
      }
    },
  });

  const handleApprovalAction = (plan: any, action: 'approve' | 'reject') => {
    setSelectedPlan(plan);
    setApprovalAction(action);

    // Initialize selected splits with all splits
    const allSplitIds = new Set<string>(plan.vacation_splits.map((s: any) => s.id));
    setSelectedSplits(allSplitIds);
    setSplitConflicts(new Map());

    setShowApprovalDialog(true);
  };

  const toggleSplitSelection = (splitId: string) => {
    setSelectedSplits(prev => {
      const newSet = new Set<string>(prev);
      if (newSet.has(splitId)) {
        newSet.delete(splitId);
      } else {
        newSet.add(splitId);
      }
      return newSet;
    });
  };

  const confirmApproval = () => {
    if (!selectedPlan) return;

    // Check if at least one split is selected
    if (selectedSplits.size === 0) {
      toast.error('Please select at least one vacation segment to approve');
      return;
    }

    approvalMutation.mutate({
      planId: selectedPlan.id,
      action: approvalAction,
      comments,
      selectedSplitIds: Array.from(selectedSplits),
    });
  };

  const confirmConflictApproval = () => {
    if (!selectedPlan || !conflictReason.trim()) {
      toast.error('Please provide a reason for approving despite conflicts');
      return;
    }

    if (selectedSplits.size === 0) {
      toast.error('Please select at least one vacation segment to approve');
      return;
    }

    approvalMutation.mutate({
      planId: selectedPlan.id,
      action: 'approve',
      comments,
      hasConflict: true,
      conflictReason,
      conflictingPlans: conflictData,
      selectedSplitIds: Array.from(selectedSplits),
    });
  };

  const getStatusBadge = (status: string) => {
    const configs = {
      draft: { label: 'Draft', className: 'bg-warning text-warning-foreground' },
      pending_approval: { label: 'Pending Approval', className: 'bg-primary text-primary-foreground' },
      approved: { label: 'Approved', className: 'bg-success text-success-foreground' },
      rejected: { label: 'Rejected', className: 'bg-destructive text-destructive-foreground' },
    };
    const config = configs[status as keyof typeof configs] || configs.draft;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-muted-foreground">Loading vacation plans...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Approvals - Pending Review
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {(pendingPlans as any[])?.map((plan) => (
              <Card key={plan.id} className="border-2">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold">
                          {plan.staff_profile?.full_name || 'Unknown'}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          ({plan.staff_profile?.email})
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileText className="h-4 w-4" />
                        <span>Planned by: {plan.creator_profile?.full_name || 'Unknown'}</span>
                      </div>
                    </div>
                    {getStatusBadge(plan.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <p className="text-sm font-medium">Vacation Type</p>
                      <p className="text-sm text-muted-foreground">
                        {plan.vacation_types?.name}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Total Days</p>
                      <p className="text-sm text-muted-foreground">{plan.total_days} days</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Department</p>
                      <p className="text-sm text-muted-foreground">
                        {plan.departments?.name}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Submitted</p>
                      <p className="text-sm text-muted-foreground">
                        {plan.submitted_at
                          ? format(new Date(plan.submitted_at), 'PPP')
                          : 'Not yet'}
                      </p>
                    </div>
                  </div>

                  {plan.notes && (
                    <div className="bg-accent p-3 rounded-lg">
                      <p className="text-sm font-medium mb-1">Notes:</p>
                      <p className="text-sm text-muted-foreground">{plan.notes}</p>
                    </div>
                  )}

                  {plan.vacation_splits && plan.vacation_splits.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Vacation Segments ({plan.vacation_splits.length})
                      </p>
                      <div className="space-y-2">
                        {plan.vacation_splits.map((split: any, index: number) => (
                          <div
                            key={split.id}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-2 sm:p-3 bg-accent rounded gap-2"
                          >
                            <span className="text-sm font-medium">Segment {index + 1}</span>
                            <span className="text-xs sm:text-sm font-medium">
                              {format(new Date(split.start_date), 'PPP')} →{' '}
                              {format(new Date(split.end_date), 'PPP')}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs sm:text-sm text-muted-foreground">
                                {split.days} days
                              </span>
                              {split.status && split.status !== 'pending' && (
                                <Badge className={cn(
                                  split.status === 'approved' && 'bg-success text-success-foreground',
                                  split.status === 'rejected' && 'bg-destructive text-destructive-foreground'
                                )}>
                                  {split.status}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Separator />

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      onClick={() => handleApprovalAction(plan, 'approve')}
                      className="flex-1"
                      disabled={approvalMutation.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => handleApprovalAction(plan, 'reject')}
                      className="flex-1"
                      disabled={approvalMutation.isPending}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {pendingPlans?.length === 0 && (
              <div className="text-center p-12 border-2 border-dashed rounded-lg">
                <Clock className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No Pending Approvals</h3>
                <p className="text-muted-foreground">
                  All vacation plans at this level have been processed
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="max-w-md max-h-[95vh] flex flex-col p-0 overflow-hidden">
          <div className="p-6 border-b shrink-0">
            <DialogHeader className="p-0">
              <DialogTitle className="text-xl">
                {approvalAction === 'approve' ? 'Approve' : 'Reject'} Vacation Plan
              </DialogTitle>
              <DialogDescription className="mt-1.5">
                {approvalAction === 'approve'
                  ? `You are about to approve this vacation plan for ${selectedPlan?.staff_profile?.full_name}.`
                  : `You are about to reject this vacation plan for ${selectedPlan?.staff_profile?.full_name}.`}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-lg p-3 space-y-2 border border-border/50">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Staff Member:</span>
                  <span className="font-semibold">{selectedPlan?.staff_profile?.full_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Vacation Type:</span>
                  <span className="font-semibold text-primary">{selectedPlan?.vacation_types?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Duration:</span>
                  <span className="font-semibold">{selectedPlan?.total_days} days</span>
                </div>
              </div>

              <Separator className="bg-border/50" />

              {/* Vacation Segments with Checkboxes */}
              {approvalAction === 'approve' && selectedPlan?.vacation_splits && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Select Vacation Segments to Approve
                  </Label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Uncheck segments to reject them individually. At least one segment must be selected.
                  </p>
                  <div className="space-y-3">
                    {selectedPlan.vacation_splits.map((split: any, index: number) => {
                      const isSelected = selectedSplits.has(split.id);

                      return (
                        <div
                          key={split.id}
                          className={cn(
                            "flex items-start gap-3 p-3 sm:p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer hover:shadow-md",
                            isSelected
                              ? "bg-primary/5 border-primary shadow-sm"
                              : "bg-muted/50 border-transparent grayscale-[0.5] opacity-80"
                          )}
                          onClick={() => toggleSplitSelection(split.id)}
                        >
                          <div className="pt-1 shrink-0">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSplitSelection(split.id)}
                              id={`split-${split.id}`}
                              className="h-5 w-5 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label
                                htmlFor={`split-${split.id}`}
                                className="text-sm font-bold cursor-pointer transition-colors"
                              >
                                Segment {index + 1}
                              </label>
                              {isSelected ? (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                                  Selected
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
                                  Excluded
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium truncate sm:whitespace-normal">
                              {format(new Date(split.start_date), 'MMM dd, yyyy')} → {format(new Date(split.end_date), 'MMM dd, yyyy')}
                            </p>
                            <p className="text-xs text-muted-foreground font-medium">
                              Duration: {split.days} days
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs font-semibold text-muted-foreground">
                      Selected: {selectedSplits.size} of {selectedPlan.vacation_splits.length} segments
                    </p>
                    <p className="text-xs font-semibold text-primary">
                      {selectedPlan.total_days} days total
                    </p>
                  </div>
                </div>
              )}

              <Separator className="bg-border/50" />

              <div>
                <label className="text-sm font-bold mb-2 block">
                  Comments {approvalAction === 'reject' && <span className="text-destructive font-black">*</span>}
                </label>
                <Textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder={
                    approvalAction === 'approve'
                      ? 'Optional comments or notes'
                      : 'Please explain the reason for rejection'
                  }
                  rows={2}
                  className="resize-none"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 border-t bg-muted/5 sm:gap-4 shrink-0">
            <Button
              variant="outline"
              onClick={() => setShowApprovalDialog(false)}
              className="px-8"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmApproval}
              disabled={
                approvalMutation.isPending ||
                (approvalAction === 'reject' && !comments.trim())
              }
              variant={approvalAction === 'approve' ? 'default' : 'destructive'}
              className="px-8 font-bold"
            >
              {approvalAction === 'approve' ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Confirm Approval
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  Confirm Rejection
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >

      {/* Conflict Warning Dialog with Per-Segment Selection */}
      < Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog} >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Vacation Conflict Detected
            </DialogTitle>
            <DialogDescription>
              Some vacation segments have conflicts. Review each segment and select which ones to approve.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Per-Segment Conflict Display with Checkboxes */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Select Segments to Approve</Label>
              <p className="text-xs text-muted-foreground">
                Segments with conflicts show conflicting staff. You can approve non-conflicting segments or acknowledge conflicts for specific segments.
              </p>

              {selectedPlan?.vacation_splits.map((split: any, index: number) => {
                const isSelected = selectedSplits.has(split.id);
                const hasConflict = splitConflicts.has(split.id);
                const conflicts = hasConflict ? splitConflicts.get(split.id) : [];

                return (
                  <div
                    key={split.id}
                    className={cn(
                      "border-2 rounded-xl p-4 transition-all duration-200 cursor-pointer hover:shadow-md",
                      hasConflict
                        ? "border-warning bg-warning/5 shadow-sm"
                        : isSelected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-transparent bg-muted/50 grayscale-[0.5] opacity-80"
                    )}
                    onClick={() => toggleSplitSelection(split.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="pt-1">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSplitSelection(split.id)}
                          id={`conflict-split-${split.id}`}
                          className="h-5 w-5 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <label
                            htmlFor={`conflict-split-${split.id}`}
                            className="text-sm font-bold cursor-pointer"
                          >
                            Segment {index + 1}
                          </label>
                          <div className="flex gap-2">
                            {hasConflict ? (
                              <Badge className="bg-warning text-warning-foreground text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border-none">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Conflict
                              </Badge>
                            ) : (
                              <Badge className="bg-success text-success-foreground text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border-none">
                                No Conflict
                              </Badge>
                            )}
                            {isSelected ? (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                Selected
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                Excluded
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mb-1">
                          {format(new Date(split.start_date), 'MMM dd, yyyy')} → {format(new Date(split.end_date), 'MMM dd, yyyy')} ({split.days} days)
                        </p>

                        {hasConflict && conflicts && conflicts.length > 0 && (
                          <div className="mt-3 p-3 bg-background rounded-lg border border-warning/20 shadow-inner">
                            <p className="text-[10px] font-bold text-warning uppercase tracking-tighter mb-2">Conflicting Staff:</p>
                            <div className="space-y-2">
                              {conflicts.map((cp: any, cpIdx: number) => (
                                <div key={cpIdx} className="text-xs text-muted-foreground pl-3 border-l-2 border-warning/50">
                                  <p className="font-bold text-foreground/80">{cp.staff_name}</p>
                                  <p className="text-[10px] font-medium">
                                    {format(new Date(cp.start_date), 'MMM dd')} - {format(new Date(cp.end_date), 'MMM dd, yyyy')} ({cp.days} days)
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {index === 0 && schedulingConflicts.length > 0 && (
                          <div className="mt-3 p-3 bg-destructive/5 rounded-lg border border-destructive/20 shadow-inner">
                            <p className="text-[10px] font-bold text-destructive uppercase tracking-tighter mb-2">Pre-existing Schedule Conflicts:</p>
                            <div className="space-y-2">
                              {schedulingConflicts.map((sc: any, scIdx: number) => (
                                <div key={scIdx} className="text-xs text-muted-foreground pl-3 border-l-2 border-destructive/50">
                                  <p className="font-bold text-foreground/80">{sc.name} ({sc.type})</p>
                                  <p className="text-[10px] font-medium">
                                    {format(new Date(sc.date), 'MMM dd, yyyy')}: {sc.details}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="conflict-reason" className="text-destructive">
                Acknowledgment & Reason for Approval *
              </Label>
              <Textarea
                id="conflict-reason"
                value={conflictReason}
                onChange={(e) => setConflictReason(e.target.value)}
                placeholder="I acknowledge the conflicts and approve selected segments because..."
                rows={4}
                required
              />
              <p className="text-sm text-muted-foreground">
                By providing a reason, you acknowledge responsibility for approving segments with overlapping vacations.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowConflictDialog(false);
                setConflictReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmConflictApproval}
              disabled={approvalMutation.isPending || !conflictReason.trim() || selectedSplits.size === 0}
            >
              {approvalMutation.isPending ? 'Processing...' : `Acknowledge & Approve ${selectedSplits.size} Segment(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >

      {/* Level 2 & 3 Previous Conflict Acknowledgment Dialog */}
      < Dialog open={showPreviousConflictDialog} onOpenChange={setShowPreviousConflictDialog} >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-warning" />
              Previous Level Conflicts Detected
            </DialogTitle>
            <DialogDescription>
              This vacation plan was previously approved with conflicts by{' '}
              {approvalLevel === 2 ? 'Level 1 (Department Head)' : 'previous approval levels'}.
              You must acknowledge these conflicts before proceeding with your approval.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <ScrollArea className="max-h-80 border rounded-md p-4">
              {previousLevelConflicts.map((conflict, index) => (
                <div key={index} className="mb-4 pb-4 border-b last:border-0 bg-warning/5 p-3 rounded">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-warning text-warning-foreground">
                      Level {conflict.approval_level}
                    </Badge>
                    <span className="font-medium">
                      {conflict.profiles?.full_name}
                    </span>
                  </div>

                  {conflict.conflicting_plans && Array.isArray(conflict.conflicting_plans) && (
                    <div className="mt-2 space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Conflicting Staff:</p>
                      {conflict.conflicting_plans.map((cp: any, idx: number) => (
                        <div key={idx} className="text-sm pl-4 border-l-2 border-warning">
                          <p className="font-medium">{cp.staff_name}</p>
                          <p className="text-muted-foreground">
                            {format(new Date(cp.start_date), 'MMM dd')} - {format(new Date(cp.end_date), 'MMM dd, yyyy')} ({cp.days} days)
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {conflict.conflict_reason && (
                    <div className="mt-2 p-2 bg-background rounded text-sm">
                      <span className="font-medium">Reason for approval: </span>
                      <span className="text-muted-foreground">{conflict.conflict_reason}</span>
                    </div>
                  )}
                </div>
              ))}
            </ScrollArea>

            <div className="space-y-2">
              <Label htmlFor="level-conflict-reason" className="text-destructive">
                Your Acknowledgment & Approval Reason *
              </Label>
              <Textarea
                id="level-conflict-reason"
                value={conflictReason}
                onChange={(e) => setConflictReason(e.target.value)}
                placeholder="I acknowledge the previous conflict approvals and approve because..."
                rows={4}
                required
              />
              <p className="text-sm text-muted-foreground">
                By approving, you acknowledge and accept responsibility for the staffing conflicts identified at previous approval levels.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPreviousConflictDialog(false);
                setConflictReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!conflictReason.trim()) {
                  toast.error('Please provide a reason for your approval');
                  return;
                }
                approvalMutation.mutate({
                  planId: selectedPlan.id,
                  action: 'approve',
                  comments,
                  hasConflict: true,
                  conflictReason,
                  conflictingPlans: [],
                });
              }}
              disabled={approvalMutation.isPending || !conflictReason.trim()}
            >
              {approvalMutation.isPending ? 'Processing...' : 'Acknowledge & Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >
    </>
  );
};

export default VacationApprovalWorkflow;