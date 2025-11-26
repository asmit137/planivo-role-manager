import { format } from 'date-fns';
import { CheckCircle2, Clock, XCircle, Hourglass, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

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
}: VacationApprovalTimelineProps) => {
  
  // Build the 3-level approval stages based on current status and approvals
  const stages: ApprovalStage[] = [
    {
      level: 1,
      role: 'Department Head',
      status: getStageStatus(1, currentStatus, approvals),
      ...getApprovalDetails(1, approvals),
    },
    {
      level: 2,
      role: 'Facility Supervisor',
      status: getStageStatus(2, currentStatus, approvals),
      ...getApprovalDetails(2, approvals),
    },
    {
      level: 3,
      role: 'Workspace Supervisor',
      status: getStageStatus(3, currentStatus, approvals),
      ...getApprovalDetails(3, approvals),
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

      {/* Visual Progress Line */}
      <div className="relative flex items-center justify-between px-4 py-2">
        {stages.map((stage, index) => (
          <div key={stage.level} className="flex-1 flex items-center">
            {/* Stage Circle */}
            <div className="relative flex flex-col items-center">
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all',
                  stage.status === 'approved' &&
                    'bg-success border-success text-success-foreground',
                  stage.status === 'rejected' &&
                    'bg-destructive border-destructive text-destructive-foreground',
                  stage.status === 'pending' &&
                    'bg-warning border-warning text-warning-foreground animate-pulse',
                  stage.status === 'waiting' &&
                    'bg-muted border-border text-muted-foreground'
                )}
              >
                {stage.status === 'approved' && <CheckCircle2 className="h-5 w-5" />}
                {stage.status === 'rejected' && <XCircle className="h-5 w-5" />}
                {stage.status === 'pending' && <Clock className="h-5 w-5" />}
                {stage.status === 'waiting' && <Hourglass className="h-5 w-5" />}
              </div>
              <span className="absolute -bottom-6 text-xs font-medium whitespace-nowrap">
                Level {stage.level}
              </span>
            </div>

            {/* Connecting Line */}
            {index < stages.length - 1 && (
              <div
                className={cn(
                  'flex-1 h-0.5 mx-2 transition-all',
                  stage.status === 'approved' ? 'bg-success' : 'bg-border'
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Detailed Stage Cards */}
      <div className="space-y-3 mt-8">
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
                    {getStatusBadge(stage.status)}
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
                  {stage.approverName && (
                    <p className="text-sm text-muted-foreground">
                      👤 {stage.approverName}
                    </p>
                  )}
                </div>
              </div>

              {stage.timestamp && (
                <p className="text-xs text-muted-foreground mb-2">
                  {stage.status === 'approved' && '✅ Approved on '}
                  {stage.status === 'rejected' && '❌ Rejected on '}
                  {stage.status === 'pending' && '⏳ Pending since '}
                  {format(new Date(stage.timestamp), 'PPP p')}
                </p>
              )}

              {stage.status === 'waiting' && (
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

  // If the plan is rejected at any level, all subsequent levels are waiting
  if (currentStatus === 'rejected') return 'waiting';

  // If the plan is draft, all levels are waiting
  if (currentStatus === 'draft') return 'waiting';
  
  // Level 1 (Department Head)
  if (level === 1) {
    if (currentStatus === 'department_pending') return 'pending';
    // If we're past department_pending, Level 1 was approved (even without record)
    if (['facility_pending', 'workspace_pending', 'approved'].includes(currentStatus)) {
      return 'approved';
    }
    return 'waiting';
  }
  
  // Level 2 (Facility Supervisor)
  if (level === 2) {
    if (currentStatus === 'facility_pending') return 'pending';
    // If we're past facility_pending, Level 2 was approved
    if (['workspace_pending', 'approved'].includes(currentStatus)) {
      return 'approved';
    }
    // Still waiting for Level 1
    if (currentStatus === 'department_pending') return 'waiting';
    return 'waiting';
  }
  
  // Level 3 (Workspace Supervisor)
  if (level === 3) {
    if (currentStatus === 'workspace_pending') return 'pending';
    // If status is approved, Level 3 approved
    if (currentStatus === 'approved') return 'approved';
    // Still waiting for previous levels
    return 'waiting';
  }

  return 'waiting';
}

// Helper function to get approval details from approval records
function getApprovalDetails(level: number, approvals: any[]) {
  const approval = approvals?.find((a) => a.approval_level === level);
  if (!approval) return {};

  return {
    approverName: approval.profiles?.full_name || 'Unknown',
    timestamp: approval.updated_at || approval.created_at,
    comments: approval.comments,
  };
}

// Helper function to render status badges
function getStatusBadge(status: string) {
  const configs = {
    approved: { label: 'Approved', className: 'bg-success text-success-foreground' },
    rejected: { label: 'Rejected', className: 'bg-destructive text-destructive-foreground' },
    pending: { label: 'Pending', className: 'bg-warning text-warning-foreground' },
    waiting: { label: 'Waiting', className: 'bg-muted text-muted-foreground' },
  };
  const config = configs[status as keyof typeof configs] || configs.waiting;
  return (
    <Badge className={cn('text-xs', config.className)}>
      {config.label}
    </Badge>
  );
}

export default VacationApprovalTimeline;
