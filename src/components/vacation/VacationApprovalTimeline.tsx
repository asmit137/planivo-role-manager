import { format } from 'date-fns';
import { CheckCircle2, Clock, XCircle, Hourglass } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium text-muted-foreground px-2">
          APPROVAL WORKFLOW
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

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
        {stages.map((stage) => (
          <div
            key={stage.level}
            className={cn(
              'p-4 rounded-lg border-2 transition-all',
              stage.status === 'approved' && 'border-success bg-success/5',
              stage.status === 'rejected' && 'border-destructive bg-destructive/5',
              stage.status === 'pending' && 'border-warning bg-warning/5',
              stage.status === 'waiting' && 'border-border bg-muted/30'
            )}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm">{stage.level}. {stage.role}</span>
                  {getStatusBadge(stage.status)}
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

            {stage.comments && (
              <div className="mt-2 p-2 bg-background rounded text-xs">
                <span className="font-medium">💬 Comment: </span>
                <span className="text-muted-foreground">{stage.comments}</span>
              </div>
            )}
          </div>
        ))}
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
  
  if (approval) {
    if (approval.status === 'approved') return 'approved';
    if (approval.status === 'rejected') return 'rejected';
  }

  // Determine if this stage is pending or waiting
  if (currentStatus === 'draft') return 'waiting';
  
  if (level === 1) {
    return currentStatus === 'department_pending' ? 'pending' : 'waiting';
  }
  
  if (level === 2) {
    if (currentStatus === 'facility_pending') return 'pending';
    return ['department_pending', 'draft'].includes(currentStatus) ? 'waiting' : 'waiting';
  }
  
  if (level === 3) {
    if (currentStatus === 'workspace_pending') return 'pending';
    return ['draft', 'department_pending', 'facility_pending'].includes(currentStatus)
      ? 'waiting'
      : 'waiting';
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
