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

  // Find the final approver (the one who actually approved or rejected)
  // Find the final status (Rejected takes precedence over Approved)
  const finalApproval = approvals?.find(a => a.status === 'rejected') ||
    approvals?.find(a => a.status === 'approved');
  const hasAnyConflicts = approvals?.some(a => a.has_conflict);

  // Get role name from approval level
  const getRoleName = (level: number) => {
    if (level === 1) return 'Department Head';
    if (level === 2) return 'Facility Supervisor';
    if (level === 3) return 'Workspace Supervisor';
    return 'Approver';
  };

  // If no approval yet (pending), show pending status
  if (!finalApproval && currentStatus === 'pending_approval') {
    return (
      <div className="p-4 rounded-lg border-2 border-warning bg-warning/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center">
            <Clock className="h-5 w-5 text-warning" />
          </div>
          <div>
            <p className="font-semibold text-sm">Pending Approval</p>
            <p className="text-xs text-muted-foreground">Waiting for supervisor approval</p>
          </div>
        </div>
      </div>
    );
  }

  // If draft, don't show approval info
  if (currentStatus === 'draft') {
    return null;
  }

  return (
    <div className={cn(
      "p-4 rounded-lg border-2",
      finalApproval?.status === 'approved' && "border-success bg-success/5",
      finalApproval?.status === 'rejected' && "border-destructive bg-destructive/5",
      !finalApproval && "border-warning bg-warning/5"
    )}>
      {/* Conflict Alert if any */}
      {hasAnyConflicts && (
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-warning/30">
          <AlertCircle className="h-4 w-4 text-warning" />
          <span className="text-sm font-medium text-warning">Approved with conflict</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center",
          finalApproval?.status === 'approved' && "bg-success/20",
          finalApproval?.status === 'rejected' && "bg-destructive/20",
          !finalApproval && "bg-warning/20"
        )}>
          {finalApproval?.status === 'approved' && <CheckCircle2 className="h-5 w-5 text-success" />}
          {finalApproval?.status === 'rejected' && <XCircle className="h-5 w-5 text-destructive" />}
          {!finalApproval && <Clock className="h-5 w-5 text-warning" />}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={cn(
              "text-xs",
              finalApproval?.status === 'approved' && "bg-success text-success-foreground",
              finalApproval?.status === 'rejected' && "bg-destructive text-destructive-foreground"
            )}>
              {finalApproval?.status === 'approved' ? 'Approved' : 'Rejected'}
            </Badge>
          </div>
          <p className="text-sm">
            <span className="text-muted-foreground">
              {finalApproval?.status === 'approved' ? 'Approved by: ' : 'Rejected by: '}
            </span>
            <span className="font-medium">
              {finalApproval?.profiles?.full_name || getRoleName(finalApproval?.approval_level || 3)}
            </span>
          </p>
          {finalApproval?.updated_at && (
            <p className="text-xs text-muted-foreground mt-1">
              {format(new Date(finalApproval.updated_at), 'PPP p')}
            </p>
          )}
          {finalApproval?.comments && (
            <div className="mt-2 p-2 bg-background rounded text-xs">
              <span className="font-medium">Comment: </span>
              <span className="text-muted-foreground">{finalApproval.comments}</span>
            </div>
          )}
        </div>
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
