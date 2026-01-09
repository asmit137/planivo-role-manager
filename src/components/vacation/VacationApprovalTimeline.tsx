import { format } from 'date-fns';
import { CheckCircle2, Clock, XCircle, Hourglass, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ApprovalStage {
  level: number;
  role: string;
  approverName?: string;
  status: 'approved' | 'rejected' | 'pending' | 'waiting';
  timestamp?: string;
  comments?: string;
}

interface VacationApprovalTimelineProps {
  currentStatus: string;
  approvals: any[];
  departmentId: string;
  facilityId?: string;
  workspaceId?: string;
}

const VacationApprovalTimeline = ({
  currentStatus,
  approvals,
  departmentId,
  facilityId,
  workspaceId,
}: VacationApprovalTimelineProps) => {

  // Fetch designated approvers for each level
  const { data: designatedApprovers } = useQuery({
    queryKey: ['designated-approvers', departmentId, facilityId, workspaceId],
    queryFn: async () => {
      const results = {
        level1: 'Not Assigned',
        level2: 'Not Assigned',
        level3: 'Not Assigned',
      };

      // Level 1: Get Department Head
      if (departmentId) {
        const { data: deptHead } = await supabase
          .from('user_roles')
          .select('user_id, profiles:user_id(full_name)')
          .eq('role', 'department_head')
          .eq('department_id', departmentId)
          .maybeSingle();

        if (deptHead?.profiles) {
          results.level1 = (deptHead.profiles as any).full_name || 'Not Assigned';
        }
      }

      // Level 2: Get Facility Supervisor
      if (facilityId) {
        const { data: facilitySup } = await supabase
          .from('user_roles')
          .select('user_id, profiles:user_id(full_name)')
          .eq('role', 'facility_supervisor')
          .eq('facility_id', facilityId)
          .maybeSingle();

        if (facilitySup?.profiles) {
          results.level2 = (facilitySup.profiles as any).full_name || 'Not Assigned';
        }
      }

      // Level 3: Get Workspace Supervisor
      if (workspaceId) {
        const { data: workspaceSup } = await supabase
          .from('user_roles')
          .select('user_id, profiles:user_id(full_name)')
          .eq('role', 'workplace_supervisor')
          .eq('workspace_id', workspaceId)
          .maybeSingle();

        if (workspaceSup?.profiles) {
          results.level3 = (workspaceSup.profiles as any).full_name || 'Not Assigned';
        }
      }

      return results;
    },
    enabled: !!(departmentId || facilityId || workspaceId),
  });

  // Build the 3-level approval stages based on current status and approvals
  const stages: ApprovalStage[] = [
    {
      level: 1,
      role: 'Department Head',
      status: getStageStatus(1, currentStatus, approvals),
      ...getApprovalDetails(1, approvals, designatedApprovers?.level1),
    },
    {
      level: 2,
      role: 'Facility Supervisor',
      status: getStageStatus(2, currentStatus, approvals),
      ...getApprovalDetails(2, approvals, designatedApprovers?.level2),
    },
    {
      level: 3,
      role: 'Workspace Supervisor',
      status: getStageStatus(3, currentStatus, approvals),
      ...getApprovalDetails(3, approvals, designatedApprovers?.level3),
    },
  ];

  // Check if any approval has conflicts
  const hasAnyConflicts = approvals?.some(a => a.has_conflict);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium text-muted-foreground px-2">
          APPROVAL WORKFLOW
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Conflict Alert Banner */}
      {hasAnyConflicts && (
        <div className="bg-warning/10 border-2 border-warning rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-warning" />
            <span className="font-semibold text-warning">APPROVED WITH CONFLICT</span>
          </div>
          <p className="text-sm text-muted-foreground">
            This vacation was approved despite staffing conflicts. See details below in each approval stage.
          </p>
        </div>
      )}

      {/* Visual Progress Line - Responsive */}
      <div className="mb-6 sm:mb-8 overflow-x-auto">
        <div className="min-w-[320px] px-2 sm:px-8">
          {/* Circles and connecting lines */}
          <div className="flex items-center justify-between sm:justify-center mb-3 sm:mb-4">
            {stages.map((stage, index) => (
              <div key={stage.level} className="flex items-center">
                {/* Circle */}
                <div
                  className={cn(
                    'w-10 h-10 sm:w-14 sm:h-14 rounded-full flex items-center justify-center border-2 transition-all shrink-0',
                    stage.status === 'approved' &&
                    'bg-success border-success text-success-foreground',
                    stage.status === 'rejected' &&
                    'bg-destructive border-destructive text-destructive-foreground',
                    stage.status === 'pending' &&
                    'bg-warning border-warning text-warning-foreground animate-pulse',
                    stage.status === 'waiting' && (currentStatus === 'approved' || currentStatus === 'rejected') &&
                    'bg-success/20 border-success/40 text-success',
                    stage.status === 'waiting' && currentStatus === 'pending_approval' &&
                    'bg-muted border-border text-muted-foreground'
                  )}
                >
                  {stage.status === 'approved' && <CheckCircle2 className="h-4 w-4 sm:h-6 sm:w-6" />}
                  {stage.status === 'rejected' && <XCircle className="h-4 w-4 sm:h-6 sm:w-6" />}
                  {stage.status === 'pending' && <Clock className="h-4 w-4 sm:h-6 sm:w-6" />}
                  {stage.status === 'waiting' && (currentStatus === 'approved' || currentStatus === 'rejected') &&
                    <CheckCircle2 className="h-4 w-4 sm:h-6 sm:w-6 opacity-50" />}
                  {stage.status === 'waiting' && currentStatus === 'pending_approval' &&
                    <Hourglass className="h-4 w-4 sm:h-6 sm:w-6" />}
                </div>

                {/* Connecting Line */}
                {index < stages.length - 1 && (
                  <div
                    className={cn(
                      'h-0.5 w-8 sm:w-24 md:w-32 mx-1 sm:mx-4 transition-all',
                      (stage.status === 'approved' || currentStatus === 'approved') ? 'bg-success' : 'bg-border'
                    )}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Labels below circles */}
          <div className="flex items-start justify-between sm:justify-center sm:gap-24 md:gap-40">
            {stages.map((stage) => (
              <div key={`label-${stage.level}`} className="text-center w-20 sm:w-32">
                <span className="text-xs sm:text-sm font-medium block mb-1">
                  L{stage.level}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detailed Stage Cards */}
      <div className="space-y-3">
        {stages.map((stage) => {
          const stageApproval = approvals?.find(a => a.approval_level === stage.level);
          const stageHasConflict = stageApproval?.has_conflict;

          return (
            <div
              key={stage.level}
              className={cn(
                'p-4 rounded-lg border-2 transition-all',
                stageHasConflict && 'border-warning bg-warning/5',
                !stageHasConflict && stage.status === 'approved' && 'border-success bg-success/5',
                !stageHasConflict && stage.status === 'rejected' && 'border-destructive bg-destructive/5',
                !stageHasConflict && stage.status === 'pending' && 'border-warning bg-warning/5',
                !stageHasConflict && stage.status === 'waiting' && 'border-border bg-muted/30'
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{stage.level}. {stage.role}</span>
                    {getStatusBadge(stage.status, currentStatus)}
                    {stageHasConflict && stageApproval?.conflicting_plans && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge className="bg-warning text-warning-foreground flex items-center gap-1 cursor-help">
                              <AlertCircle className="h-3 w-3" />
                              Conflict
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <div className="space-y-1">
                              <p className="font-semibold text-xs">Conflicting Staff:</p>
                              {Array.isArray(stageApproval.conflicting_plans) && stageApproval.conflicting_plans.map((cp: any, idx: number) => (
                                <p key={idx} className="text-xs">
                                  • {cp.staff_name}: {format(new Date(cp.start_date), 'MMM dd')} - {format(new Date(cp.end_date), 'MMM dd')} ({cp.days} days)
                                </p>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {stage.status === 'approved' ? '✅ Approved by: ' :
                      stage.status === 'rejected' ? '❌ Rejected by: ' :
                        stage.status === 'waiting' && (currentStatus === 'approved' || currentStatus === 'rejected') ? '🏁 Resolved by parallel action' :
                          '⏳ Pending with: '}
                    {(stage.status !== 'waiting' || (currentStatus !== 'approved' && currentStatus !== 'rejected')) && (
                      <span className="font-medium text-foreground">{stage.role}</span>
                    )}
                  </p>
                </div>
              </div>

              {stage.timestamp && (
                <p className="text-xs text-muted-foreground mb-2">
                  {stage.status === 'approved' && 'Completed on '}
                  {stage.status === 'rejected' && 'Action taken on '}
                  {stage.status === 'pending' && 'Waiting since '}
                  {format(new Date(stage.timestamp), 'PPP p')}
                </p>
              )}

              {stage.status === 'pending' && (
                <div className="mt-2 p-2 bg-warning/10 border border-warning/20 rounded-md">
                  <p className="text-xs text-warning flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Currently pending final decision from {stage.role}
                  </p>
                </div>
              )}

              {stage.status === 'waiting' && currentStatus === 'pending_approval' && (
                <p className="text-xs text-muted-foreground">
                  ⏸️ Waiting for previous approval
                </p>
              )}

              {/* Show conflict details if this stage had conflicts */}
              {stageHasConflict && stageApproval && (
                <div className="mt-3 p-3 bg-warning/10 border border-warning rounded-md space-y-2">
                  <p className="text-sm font-semibold text-warning flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Conflicting Staff Identified
                  </p>
                  {stageApproval.conflicting_plans && Array.isArray(stageApproval.conflicting_plans) && (
                    <div className="space-y-1 pl-4">
                      {stageApproval.conflicting_plans.map((cp: any, idx: number) => (
                        <div key={idx} className="text-sm border-l-2 border-warning pl-2">
                          <p className="font-medium">{cp.staff_name}</p>
                          <p className="text-muted-foreground text-xs">
                            {format(new Date(cp.start_date), 'MMM dd')} - {format(new Date(cp.end_date), 'MMM dd, yyyy')} ({cp.days} days)
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {stageApproval.conflict_reason && (
                    <div className="mt-2 p-2 bg-background rounded text-xs">
                      <span className="font-medium">Approval Reason: </span>
                      <span className="text-muted-foreground">{stageApproval.conflict_reason}</span>
                    </div>
                  )}
                </div>
              )}

              {stage.comments && (
                <div className="mt-2 p-2 bg-background rounded text-xs">
                  <span className="font-medium">💬 Comment: </span>
                  <span className="text-muted-foreground">{stage.comments}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Helper function to determine stage status based on current plan status and approvals
function getStageStatus(
  level: number,
  currentStatus: string,
  approvals: any[]
): 'approved' | 'rejected' | 'pending' | 'waiting' {
  const approval = approvals?.find((a) => a.approval_level === level);

  // If there's an explicit approval record, use its status
  if (approval) {
    if (approval.status === 'approved') return 'approved';
    if (approval.status === 'rejected') return 'rejected';
  }

  // In parallel workflow, 'pending_approval' means all levels are pending
  if (currentStatus === 'pending_approval') {
    return 'pending';
  }

  // If the plan is already approved/rejected but this level didn't act, mark as waiting/not-required
  if (currentStatus === 'approved' || currentStatus === 'rejected') {
    return 'waiting';
  }

  // For legacy support of sequential statuses
  if (level === 1 && currentStatus === 'department_pending') return 'pending';
  if (level === 2 && currentStatus === 'facility_pending') return 'pending';
  if (level === 3 && currentStatus === 'workspace_pending') return 'pending';

  return 'waiting';
}

// Helper function to get approval details from approval records
function getApprovalDetails(level: number, approvals: any[], designatedApprover?: string) {
  const approval = approvals?.find((a) => a.approval_level === level);

  if (!approval) {
    // No approval yet, show designated approver
    return {
      approverName: designatedApprover || 'Not Assigned',
    };
  }

  return {
    approverName: approval.profiles?.full_name || designatedApprover || 'Admin/System',
    timestamp: approval.updated_at || approval.created_at,
    comments: approval.comments,
  };
}

// Helper function to render status badges
function getStatusBadge(status: string, currentStatus: string) {
  const configs = {
    approved: { label: 'Approved', className: 'bg-success text-success-foreground' },
    rejected: { label: 'Rejected', className: 'bg-destructive text-destructive-foreground' },
    pending: { label: 'Pending', className: 'bg-warning text-warning-foreground' },
    waiting: {
      label: currentStatus === 'approved' || currentStatus === 'rejected' ? 'Completed' : 'Waiting',
      className: 'bg-muted text-muted-foreground'
    },
  };
  const config = configs[status as keyof typeof configs] || configs.waiting;
  return (
    <Badge className={cn('text-xs', config.className)}>
      {config.label}
    </Badge>
  );
}

export default VacationApprovalTimeline;
