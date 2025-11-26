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
        `);

      if (approvalLevel === 1) {
        // Department Head: Plans pending department approval
        query = query.eq('status', 'department_pending').eq('department_id', scopeId);
        const { data: plans, error } = await query;
        if (error) throw error;

        // Fetch staff and creator info
        const enrichedPlans = await Promise.all(
          (plans || []).map(async (plan) => {
            const [staffProfile, creatorProfile] = await Promise.all([
              supabase.from('profiles').select('full_name, email').eq('id', plan.staff_id).single(),
              supabase.from('profiles').select('full_name').eq('id', plan.created_by).single(),
            ]);
            return {
              ...plan,
              staff_profile: staffProfile.data,
              creator_profile: creatorProfile.data,
            };
          })
        );

        return enrichedPlans;
      } else if (approvalLevel === 2) {
        // Facility Supervisor: Plans approved by Dept Head, pending facility approval
        query = query.eq('status', 'facility_pending');
        const { data: plans, error } = await query;
        if (error) throw error;

        // Filter by facility
        const filtered = plans?.filter((plan: any) => {
          return plan.departments?.facility_id === scopeId;
        });

        // Fetch staff and creator info
        const enrichedPlans = await Promise.all(
          (filtered || []).map(async (plan) => {
            const [staffProfile, creatorProfile] = await Promise.all([
              supabase.from('profiles').select('full_name, email').eq('id', plan.staff_id).single(),
              supabase.from('profiles').select('full_name').eq('id', plan.created_by).single(),
            ]);
            return {
              ...plan,
              staff_profile: staffProfile.data,
              creator_profile: creatorProfile.data,
            };
          })
        );

        return enrichedPlans;
      } else {
        // Workplace Supervisor: Plans approved at level 2, pending workspace approval
        query = query.eq('status', 'workspace_pending');
        const { data: plans, error } = await query;
        if (error) throw error;

        // Filter by workspace
        const { data: facilities } = await supabase
          .from('facilities')
          .select('id')
          .eq('workspace_id', scopeId);
        
        const facilityIds = facilities?.map((f) => f.id) || [];
        
        const filtered = plans?.filter((plan: any) => {
          return facilityIds.includes(plan.departments?.facility_id);
        });

        // Fetch staff and creator info
        const enrichedPlans = await Promise.all(
          (filtered || []).map(async (plan) => {
            const [staffProfile, creatorProfile] = await Promise.all([
              supabase.from('profiles').select('full_name, email').eq('id', plan.staff_id).single(),
              supabase.from('profiles').select('full_name').eq('id', plan.created_by).single(),
            ]);
            return {
              ...plan,
              staff_profile: staffProfile.data,
              creator_profile: creatorProfile.data,
            };
          })
        );

        return enrichedPlans;
      }
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
      // Check for conflicts before approval (only for Department Head level)
      if (action === 'approve' && approvalLevel === 1 && !hasConflict) {
        const { data: planData } = await supabase
          .from('vacation_plans')
          .select('department_id')
          .eq('id', planId)
          .single();

        if (planData) {
          const { data: conflicts } = await supabase.rpc('check_vacation_conflicts', {
            _vacation_plan_id: planId,
            _department_id: planData.department_id
          });

          if (conflicts && Array.isArray(conflicts) && conflicts.length > 0) {
            // Return per-split conflicts
            throw new Error('CONFLICTS_DETECTED:' + JSON.stringify(conflicts));
          }
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
      if (allSplits && selectedSplitIds.length > 0) {
        for (const split of allSplits) {
          const newSplitStatus = selectedSplitIds.includes(split.id) ? 'approved' : 'rejected';
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
        status: action === 'approve' ? 'approved' : 'rejected',
        comments: comments || null,
        has_conflict: hasConflict,
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
      let newStatus = '';
      if (action === 'reject') {
        newStatus = 'rejected';
      } else {
        // Check if all splits were rejected
        const hasApprovedSplits = selectedSplitIds.length > 0;
        if (!hasApprovedSplits) {
          newStatus = 'rejected';
        } else {
          // Progress to next approval level
          newStatus = 
            approvalLevel === 1 ? 'facility_pending' :
            approvalLevel === 2 ? 'workspace_pending' : 
            'approved';
        }
      }

      const { error: updateError } = await supabase
        .from('vacation_plans')
        .update({ status: newStatus })
        .eq('id', planId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-vacation-plans'] });
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
      if (error.message.startsWith('CONFLICTS_DETECTED:')) {
        const conflictsJson = error.message.replace('CONFLICTS_DETECTED:', '');
        const conflicts = JSON.parse(conflictsJson);
        
        // Build split conflicts map
        const conflictsMap = new Map<string, any[]>();
        conflicts.forEach((item: any) => {
          if (item.conflicts && item.conflicts.length > 0) {
            conflictsMap.set(item.split_id, item.conflicts);
          }
        });
        
        setSplitConflicts(conflictsMap);
        setConflictData(conflicts);
        setShowApprovalDialog(false);
        setShowConflictDialog(true);
      } else if (error.message.startsWith('PREVIOUS_CONFLICTS:')) {
        const conflictsJson = error.message.replace('PREVIOUS_CONFLICTS:', '');
        const conflicts = JSON.parse(conflictsJson);
        setPreviousLevelConflicts(conflicts);
        setShowApprovalDialog(false);
        setShowPreviousConflictDialog(true);
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
      department_pending: { label: 'Pending Dept Head', className: 'bg-primary text-primary-foreground' },
      facility_pending: { label: 'Pending Facility', className: 'bg-accent text-accent-foreground' },
      workspace_pending: { label: 'Pending Final', className: 'bg-secondary text-secondary-foreground' },
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
            {approvalLevel === 1 && 'Level 1 (Department Head) Approvals'}
            {approvalLevel === 2 && 'Level 2 (Facility Supervisor) Approvals'}
            {approvalLevel === 3 && 'Level 3 (Workspace Supervisor) Approvals'}
            {' - Pending Review'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {pendingPlans?.map((plan) => (
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
                  <div className="grid grid-cols-2 gap-4">
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
                            className="flex items-center justify-between p-2 bg-accent rounded"
                          >
                            <span className="text-sm">Segment {index + 1}</span>
                            <span className="text-sm font-medium">
                              {format(new Date(split.start_date), 'PPP')} →{' '}
                              {format(new Date(split.end_date), 'PPP')}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">
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

                  <div className="flex gap-2">
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {approvalAction === 'approve' ? 'Approve' : 'Reject'} Vacation Plan
            </DialogTitle>
            <DialogDescription>
              {approvalAction === 'approve'
                ? `You are about to approve this vacation plan for ${selectedPlan?.staff_profile?.full_name}. ${
                    approvalLevel === 1
                      ? 'This will move it to Level 2 (Facility Supervisor) for approval.'
                      : approvalLevel === 2
                      ? 'This will move it to Level 3 (Workspace Supervisor) for final approval.'
                      : 'This will be the final approval and the vacation will be confirmed.'
                  }`
                : `You are about to reject this vacation plan for ${selectedPlan?.staff_profile?.full_name}. Please provide a reason for rejection.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedPlan && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Staff:</span>
                  <span className="font-medium">{selectedPlan.staff_profile?.full_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Vacation Type:</span>
                  <span className="font-medium">{selectedPlan.vacation_types?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Days:</span>
                  <span className="font-medium">{selectedPlan.total_days} days</span>
                </div>
              </div>
            )}

            <Separator />

            {/* Vacation Segments with Checkboxes */}
            {approvalAction === 'approve' && selectedPlan?.vacation_splits && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Select Vacation Segments to Approve
                </Label>
                <p className="text-xs text-muted-foreground mb-3">
                  Uncheck segments to reject them individually. At least one segment must be selected.
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-3">
                  {selectedPlan.vacation_splits.map((split: any, index: number) => {
                    const isSelected = selectedSplits.has(split.id);
                    
                    return (
                      <div
                        key={split.id}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border-2 transition-colors",
                          isSelected ? "bg-primary/5 border-primary" : "bg-muted border-border"
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSplitSelection(split.id)}
                          id={`split-${split.id}`}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <label
                            htmlFor={`split-${split.id}`}
                            className="text-sm font-medium cursor-pointer block mb-1"
                          >
                            Segment {index + 1}
                          </label>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(split.start_date), 'MMM dd, yyyy')} → {format(new Date(split.end_date), 'MMM dd, yyyy')}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {split.days} days
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Selected: {selectedSplits.size} of {selectedPlan.vacation_splits.length} segments
                </p>
              </div>
            )}

            <Separator />

            <div>
              <label className="text-sm font-medium mb-2 block">
                Comments {approvalAction === 'reject' && '(Required)'}
              </label>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder={
                  approvalAction === 'approve'
                    ? 'Optional comments or notes'
                    : 'Please explain the reason for rejection'
                }
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApprovalDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmApproval}
              disabled={
                approvalMutation.isPending ||
                (approvalAction === 'reject' && !comments.trim())
              }
              variant={approvalAction === 'approve' ? 'default' : 'destructive'}
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
      </Dialog>

      {/* Conflict Warning Dialog with Per-Segment Selection */}
      <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
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
                      "border-2 rounded-lg p-4 transition-colors",
                      hasConflict && "border-warning bg-warning/5",
                      !hasConflict && isSelected && "border-primary bg-primary/5",
                      !hasConflict && !isSelected && "border-border bg-muted"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSplitSelection(split.id)}
                        id={`conflict-split-${split.id}`}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <label
                            htmlFor={`conflict-split-${split.id}`}
                            className="text-sm font-semibold cursor-pointer"
                          >
                            Segment {index + 1}
                          </label>
                          {hasConflict && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge className="bg-warning text-warning-foreground text-xs">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    Conflict
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">This segment overlaps with other staff vacations</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {!hasConflict && (
                            <Badge className="bg-success text-success-foreground text-xs">
                              No Conflict
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-1">
                          {format(new Date(split.start_date), 'MMM dd, yyyy')} → {format(new Date(split.end_date), 'MMM dd, yyyy')} ({split.days} days)
                        </p>
                        
                        {hasConflict && conflicts && conflicts.length > 0 && (
                          <div className="mt-2 p-3 bg-background rounded-md border border-warning/20">
                            <p className="text-xs font-medium text-warning mb-2">Conflicting Staff:</p>
                            <div className="space-y-1">
                              {conflicts.map((cp: any, cpIdx: number) => (
                                <div key={cpIdx} className="text-xs text-muted-foreground pl-3 border-l-2 border-warning">
                                  <p className="font-medium">{cp.staff_name}</p>
                                  <p>
                                    {format(new Date(cp.start_date), 'MMM dd')} - {format(new Date(cp.end_date), 'MMM dd, yyyy')} ({cp.days} days)
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
      </Dialog>

      {/* Level 2 & 3 Previous Conflict Acknowledgment Dialog */}
      <Dialog open={showPreviousConflictDialog} onOpenChange={setShowPreviousConflictDialog}>
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
      </Dialog>
    </>
  );
};

export default VacationApprovalWorkflow;