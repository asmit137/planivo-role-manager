import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { Calendar, Send, Trash2, User, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import VacationApprovalTimeline from './VacationApprovalTimeline';
import { cn } from '@/lib/utils';
import { sendVacationStatusNotification } from '@/lib/vacationNotifications';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useState } from 'react';

interface VacationPlansListProps {
  departmentId?: string;
  scopeType?: 'workspace' | 'facility' | 'department' | 'all';
  scopeId?: string;
  staffView?: boolean;
  isSuperAdmin?: boolean;
}

const VacationPlansList = ({ departmentId, scopeType = 'department', scopeId, staffView = false, isSuperAdmin = false }: VacationPlansListProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  const [deletingPlan, setDeletingPlan] = useState<string | null>(null);
  const [submittingPlan, setSubmittingPlan] = useState<string | null>(null);

  if (!user) return null;

  if (isSuperAdmin && !organization?.id && !staffView) {
    return (
      <Card className="p-8 text-center text-muted-foreground border-2 border-dashed">
        Initializing Organization Context...
      </Card>
    );
  }

  const { data: plans, isLoading } = useQuery({
    queryKey: ['vacation-plans-list', departmentId, scopeType, scopeId, staffView, user?.id, organization?.id, isSuperAdmin],
    queryFn: async () => {
      const isOrgFilter = isSuperAdmin && organization?.id && organization.id !== 'all';
      const isSuperAdminAll = isSuperAdmin && (!organization || organization.id === 'all');

      const departmentsSelect = (isOrgFilter || isSuperAdminAll)
        ? 'departments!inner(name, facility_id, facilities!inner(name, workspace_id, workspaces!inner(organization_id)))'
        : 'departments(name, facility_id, facilities!facility_id(name, workspace_id))';

      let query = supabase
        .from('vacation_plans')
        .select(`
          *,
          vacation_types(name),
          profiles:staff_id(full_name, email),
          ${departmentsSelect},
          vacation_splits(*),
          vacation_approvals(
            *,
            profiles!approver_id(full_name, email)
          )
        `) as any;

      if (staffView) {
        query = query.eq('staff_id', user?.id);
      } else if (scopeType === 'facility' && scopeId && scopeId !== 'all') {
        query = query.eq('facility_id', scopeId) as any;
      } else if (scopeType === 'workspace' && scopeId && scopeId !== 'all') {
        query = query.eq('workspace_id', scopeId) as any;
      } else if (scopeType === 'department' && (departmentId || scopeId)) {
        const finalId = departmentId || scopeId;
        if (finalId && finalId !== 'all') {
          query = query.eq('department_id', finalId);
        }
      }

      if (isOrgFilter) {
        query = query.eq('departments.facilities.workspaces.organization_id', organization.id).eq('status', 'approved');
      } else if (isSuperAdminAll && !staffView && scopeType === 'department' && !departmentId && !scopeId) {
        // If super admin and all orgs selected, and no specific filters, show all approved
        query = query.eq('status', 'approved');
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      return data || [];
    },
    enabled: !!user,
  });

  const submitMutation = useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase
        .from('vacation_plans')
        .update({ status: 'pending_approval', submitted_at: new Date().toISOString() })
        .eq('id', planId);
      if (error) throw error;

      // Send parallel notifications to all supervisors
      const { data: planData } = await supabase
        .from('vacation_plans')
        .select('staff_id')
        .eq('id', planId)
        .single();

      if (planData) {
        await sendVacationStatusNotification(planId, 'pending_approval', planData.staff_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacation-plans-list'] });
      toast.success('Vacation plan submitted for approval');
      setSubmittingPlan(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to submit vacation plan');
      setSubmittingPlan(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase
        .from('vacation_plans')
        .delete()
        .eq('id', planId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacation-plans-list'] });
      toast.success('Vacation plan deleted');
      setDeletingPlan(null);
    },
    onError: () => toast.error('Failed to delete vacation plan'),
  });

  const getStatusBadge = (status: string) => {
    const configs = {
      draft: { label: 'Draft', className: 'bg-warning text-warning-foreground' },
      pending_approval: { label: 'Pending Approval', className: 'bg-blue-500 text-white' },
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

  // Removed the blocking UI for 'All Organizations' to allow viewing all approved plans

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            {staffView ? 'My Vacation Plans' : isSuperAdmin ? 'Organization Vacation Plan' : 'Department Vacation Plans'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {plans?.map((plan) => {
              const hasConflicts = plan.vacation_approvals?.some((a: any) => a.has_conflict);

              return (
                <Card key={plan.id} className="border-2">
                  {/* Conflict Alert Banner at Top */}
                  {hasConflicts && (
                    <div className="bg-warning/10 border-b-2 border-warning p-3 sm:p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                        <div className="flex-1 space-y-2">
                          <p className="font-semibold text-warning">CONFLICT ALERT</p>
                          <p className="text-sm text-muted-foreground">
                            This vacation was approved despite overlapping with other staff members.
                          </p>
                          {plan.vacation_approvals
                            ?.filter((a: any) => a.has_conflict)
                            .map((approval: any, idx: number) => (
                              <div key={idx} className="mt-2 p-2 bg-background rounded-md text-sm">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge className="bg-warning text-warning-foreground text-xs">
                                    Level {approval.approval_level}
                                  </Badge>
                                  <span className="font-medium">
                                    {approval.profiles?.full_name}
                                  </span>
                                </div>
                                {approval.conflicting_plans && Array.isArray(approval.conflicting_plans) && (
                                  <div className="mt-1 pl-4 space-y-1">
                                    {approval.conflicting_plans.map((cp: any, cpIdx: number) => (
                                      <p key={cpIdx} className="text-xs text-muted-foreground">
                                        • {cp.staff_name}: {format(new Date(cp.start_date), 'MMM dd')} - {format(new Date(cp.end_date), 'MMM dd')}
                                      </p>
                                    ))}
                                  </div>
                                )}
                                {approval.conflict_reason && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Reason: {approval.conflict_reason}
                                  </p>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <CardHeader className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="min-w-0 w-full">
                          {!staffView && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-2 min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="font-semibold truncate">
                                  {plan.profiles?.full_name}
                                </span>
                              </div>
                              <span className="text-xs sm:text-sm text-muted-foreground truncate">
                                ({plan.profiles?.email})
                              </span>
                            </div>
                          )}
                          <div className="text-sm text-muted-foreground truncate">
                            {plan.departments?.name}
                          </div>
                        </div>
                        {hasConflicts && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1 cursor-help text-warning shrink-0">
                                  <AlertCircle className="h-4 w-4" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <div className="space-y-1">
                                  <p className="font-semibold text-xs">Conflicting Staff:</p>
                                  {plan.vacation_approvals
                                    ?.filter((a: any) => a.has_conflict)
                                    .flatMap((a: any) => a.conflicting_plans || [])
                                    .map((cp: any, idx: number) => (
                                      <p key={idx} className="text-xs">
                                        • {cp.staff_name}: {format(new Date(cp.start_date), 'MMM dd')} - {format(new Date(cp.end_date), 'MMM dd')}
                                      </p>
                                    ))}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <div className="shrink-0 self-start sm:self-center">
                        {getStatusBadge(plan.status)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 space-y-4 pt-0 sm:pt-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        <p className="text-sm font-medium">Created</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(plan.created_at), 'PPP')}
                        </p>
                      </div>
                      {plan.submitted_at && (
                        <div>
                          <p className="text-sm font-medium">Submitted</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(plan.submitted_at), 'PPP')}
                          </p>
                        </div>
                      )}
                    </div>

                    {plan.notes && (
                      <div className="bg-cyan-500/5 p-4 rounded-xl border border-cyan-500/10 shadow-sm">
                        <p className="text-xs font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 mb-2">Notes</p>
                        <p className="text-sm leading-relaxed opacity-90">{plan.notes}</p>
                      </div>
                    )}

                    {plan.vacation_splits && plan.vacation_splits.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Vacation Periods ({plan.vacation_splits.length})
                        </p>
                        <div className="space-y-2">
                          {plan.vacation_splits.map((split: any, index: number) => (
                            <div
                              key={split.id}
                              className={cn(
                                "flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded gap-2",
                                split.status === 'approved' && "bg-success/10 border border-success",
                                split.status === 'rejected' && "bg-destructive/10 border border-destructive",
                                split.status === 'pending' && "bg-accent"
                              )}
                            >
                              <div className="flex items-center justify-between sm:justify-start gap-2">
                                <span className="text-sm font-medium">Period {index + 1}</span>
                                {/* Mobile-only Badge */}
                                {split.status && split.status !== 'pending' && (
                                  <Badge className={cn(
                                    "sm:hidden text-[10px] h-5 px-1.5",
                                    split.status === 'approved' && 'bg-success text-success-foreground',
                                    split.status === 'rejected' && 'bg-destructive text-destructive-foreground'
                                  )}>
                                    {split.status === 'approved' ? 'Approved' : 'Rejected'}
                                  </Badge>
                                )}
                              </div>

                              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                                <span className="text-[13px] sm:text-sm font-semibold text-foreground/90">
                                  {format(new Date(split.start_date), 'MMM d, yyyy')} →{' '}
                                  {format(new Date(split.end_date), 'MMM d, yyyy')}
                                </span>

                                <div className="flex items-center justify-between sm:justify-end gap-2 mt-1 sm:mt-0">
                                  <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                                    {split.days} days
                                  </span>

                                  {/* Desktop Badge */}
                                  {split.status && split.status !== 'pending' && (
                                    <Badge className={cn(
                                      "hidden sm:inline-flex",
                                      split.status === 'approved' && 'bg-success text-success-foreground',
                                      split.status === 'rejected' && 'bg-destructive text-destructive-foreground'
                                    )}>
                                      {split.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {plan.status !== 'draft' && (
                      <div className="border-t pt-4">
                        <VacationApprovalTimeline
                          currentStatus={plan.status}
                          approvals={plan.vacation_approvals || []}
                          departmentId={plan.department_id}
                          facilityId={plan.departments?.facility_id}
                          workspaceId={plan.departments?.facilities?.workspace_id}
                        />
                      </div>
                    )}

                    {plan.status === 'draft' &&
                      (plan.created_by === user?.id || plan.staff_id === user?.id) && (
                        <div className="flex gap-2 pt-2">
                          <Button
                            onClick={() => setSubmittingPlan(plan.id)}
                            className="flex-1"
                            disabled={submitMutation.isPending}
                          >
                            <Send className="h-4 w-4 mr-2" />
                            Submit for Approval
                          </Button>
                          <Button
                            variant="destructive-ghost"
                            onClick={() => setDeletingPlan(plan.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                  </CardContent>
                </Card>
              );
            })}

            {plans?.length === 0 && (
              <div className="text-center p-12 border-2 border-dashed rounded-lg">
                <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No Vacation Plans</h3>
                <p className="text-muted-foreground">
                  {staffView
                    ? 'No vacation plans have been created for you yet'
                    : 'Create vacation plans for your staff to get started'}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!submittingPlan} onOpenChange={() => setSubmittingPlan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Vacation Plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This will submit the vacation plan for approval.
              You won't be able to edit it after submission.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => submittingPlan && submitMutation.mutate(submittingPlan)}
            >
              Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingPlan} onOpenChange={() => setDeletingPlan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vacation Plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the vacation plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingPlan && deleteMutation.mutate(deletingPlan)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default VacationPlansList;