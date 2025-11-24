import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Calendar, Send, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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
  staffView?: boolean;
}

const VacationPlansList = ({ departmentId, staffView = false }: VacationPlansListProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [deletingPlan, setDeletingPlan] = useState<string | null>(null);
  const [submittingPlan, setSubmittingPlan] = useState<string | null>(null);

  const { data: plans, isLoading } = useQuery({
    queryKey: ['vacation-plans-list', departmentId, staffView, user?.id],
    queryFn: async () => {
      let query = supabase
        .from('vacation_plans')
        .select(`
          *,
          vacation_types(name),
          departments(name),
          vacation_splits(*),
          vacation_approvals(*)
        `);

      if (staffView) {
        query = query.eq('staff_id', user?.id);
      } else if (departmentId) {
        query = query.eq('department_id', departmentId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      // Fetch staff profiles
      const enrichedPlans = await Promise.all(
        (data || []).map(async (plan) => {
          const { data: staffProfile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', plan.staff_id)
            .single();
          return { ...plan, staff_profile: staffProfile };
        })
      );

      return enrichedPlans;
    },
    enabled: !!user,
  });

  const submitMutation = useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase
        .from('vacation_plans')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', planId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacation-plans-list'] });
      toast.success('Vacation plan submitted for approval');
      setSubmittingPlan(null);
    },
    onError: () => toast.error('Failed to submit vacation plan'),
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
      draft: { label: 'Draft', className: 'bg-secondary' },
      submitted: { label: 'Pending Level 2', className: 'bg-primary' },
      approved_level2: { label: 'Pending Final Approval', className: 'bg-warning' },
      approved_final: { label: 'Approved', className: 'bg-success' },
      rejected: { label: 'Rejected', className: 'bg-destructive' },
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
            {staffView ? 'My Vacation Plans' : 'Department Vacation Plans'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {plans?.map((plan) => (
              <Card key={plan.id} className="border-2">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      {!staffView && (
                        <div className="flex items-center gap-2 mb-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold">
                            {plan.staff_profile?.full_name}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            ({plan.staff_profile?.email})
                          </span>
                        </div>
                      )}
                      <div className="text-sm text-muted-foreground">
                        {plan.departments?.name}
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
                    <div className="bg-accent p-3 rounded-lg">
                      <p className="text-sm font-medium mb-1">Notes:</p>
                      <p className="text-sm text-muted-foreground">{plan.notes}</p>
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
                            className="flex items-center justify-between p-2 bg-accent rounded"
                          >
                            <span className="text-sm">Period {index + 1}</span>
                            <span className="text-sm font-medium">
                              {format(new Date(split.start_date), 'PPP')} →{' '}
                              {format(new Date(split.end_date), 'PPP')}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {split.days} days
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {plan.vacation_approvals && plan.vacation_approvals.length > 0 && (
                    <div className="border-t pt-4">
                      <p className="text-sm font-medium mb-2">Approval History</p>
                      <div className="space-y-2">
                        {plan.vacation_approvals.map((approval: any) => (
                          <div
                            key={approval.id}
                            className="flex items-center justify-between p-2 bg-accent rounded"
                          >
                            <span className="text-sm">
                              Level {approval.approval_level}
                            </span>
                            <Badge
                              className={cn(
                                approval.status === 'approved' && 'bg-success',
                                approval.status === 'rejected' && 'bg-destructive',
                                approval.status === 'pending' && 'bg-secondary'
                              )}
                            >
                              {approval.status}
                            </Badge>
                            {approval.comments && (
                              <span className="text-xs text-muted-foreground">
                                {approval.comments}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!staffView && plan.status === 'draft' && (
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
                        variant="destructive"
                        onClick={() => setDeletingPlan(plan.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

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
              This will submit the vacation plan for Level 2 approval (Facility Supervisor). 
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