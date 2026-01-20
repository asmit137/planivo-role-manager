import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { format, parseISO, isWithinInterval } from 'date-fns';
import { AlertCircle, Calendar, Users, Filter, X, Mail, ExternalLink, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { sendVacationStatusNotification } from '@/lib/vacationNotifications';

interface ConflictDashboardProps {
  scopeType?: 'workspace' | 'facility' | 'department' | 'all';
  scopeId?: string;
}

const VacationConflictDashboard = ({ scopeType = 'all', scopeId }: ConflictDashboardProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [selectedPlanToReject, setSelectedPlanToReject] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedDepartment('all');
  };

  // Reject vacation mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ planId, reason }: { planId: string; reason: string }) => {
      // Update vacation plan status to rejected
      const { error: planError } = await supabase
        .from('vacation_plans')
        .update({ status: 'rejected' })
        .eq('id', planId);

      if (planError) throw planError;

      // Update all splits to rejected
      const { error: splitsError } = await supabase
        .from('vacation_splits')
        .update({ status: 'rejected' })
        .eq('vacation_plan_id', planId);

      if (splitsError) throw splitsError;

      // Determine approval level based on user role
      const isSuper = user?.email?.includes('admin') || true; // Fallback or context check needed
      // Actually, we should probably pass the level from props or detect it
      const currentLevel = scopeType === 'workspace' ? 3 : scopeType === 'facility' ? 2 : 1;

      // Add approval record with rejection
      const { error: approvalError } = await supabase
        .from('vacation_approvals')
        .insert({
          vacation_plan_id: planId,
          approval_level: currentLevel,
          approver_id: user?.id || '',
          status: 'rejected',
          comments: `Rejected due to conflict: ${reason}`,
          has_conflict: true,
          conflict_reason: reason,
        });

      if (approvalError) throw approvalError;

      // Return the plan data for notification
      return { planId, reason };
    },
    onSuccess: async (data) => {
      // Send notification to staff
      if (data && selectedPlanToReject) {
        await sendVacationStatusNotification(
          data.planId,
          'rejected',
          selectedPlanToReject.staff_id,
          undefined,
          `Conflict found: ${data.reason}`
        );
      }
      queryClient.invalidateQueries({ queryKey: ['vacation-conflicts'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-plans'] });
      toast.success('Vacation rejected successfully');
      setShowRejectDialog(false);
      setSelectedPlanToReject(null);
      setRejectReason('');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to reject vacation');
    },
  });

  const handleRejectClick = (plan: any) => {
    setSelectedPlanToReject(plan);
    setShowRejectDialog(true);
  };

  const confirmReject = () => {
    if (!selectedPlanToReject || !rejectReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    rejectMutation.mutate({
      planId: selectedPlanToReject.id,
      reason: rejectReason,
    });
  };
  // Fetch departments for filtering
  const { data: departments } = useQuery({
    queryKey: ['departments', scopeId],
    queryFn: async () => {
      let query = supabase
        .from('departments')
        .select('id, name, facility_id, facilities(workspace_id)');

      if (scopeType === 'facility' && scopeId) {
        query = query.eq('facility_id', scopeId);
      } else if (scopeType === 'workspace' && scopeId) {
        const { data: facilities } = await supabase
          .from('facilities')
          .select('id')
          .eq('workspace_id', scopeId);
        const facilityIds = facilities?.map(f => f.id) || [];
        query = query.in('facility_id', facilityIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Fetch all vacation plans with conflicts
  const { data: conflictData, isLoading } = useQuery({
    queryKey: ['vacation-conflicts', scopeType, scopeId, selectedDepartment, startDate, endDate],
    queryFn: async () => {
      // Get department IDs based on scope
      let allowedDepartmentIds: string[] = [];

      if (scopeType === 'facility' && scopeId) {
        // Facility Supervisor: only departments in their facility
        const { data: depts } = await supabase
          .from('departments')
          .select('id')
          .eq('facility_id', scopeId);
        allowedDepartmentIds = depts?.map(d => d.id) || [];
      } else if (scopeType === 'workspace' && scopeId) {
        // Workplace Supervisor: departments in all facilities in their workspace
        const { data: facilities } = await supabase
          .from('facilities')
          .select('id')
          .eq('workspace_id', scopeId);
        const facilityIds = facilities?.map(f => f.id) || [];

        const { data: depts } = await supabase
          .from('departments')
          .select('id')
          .in('facility_id', facilityIds);
        allowedDepartmentIds = depts?.map(d => d.id) || [];
      } else if (scopeType === 'department' && scopeId) {
        // Department Head: only their department
        allowedDepartmentIds = [scopeId];
      }
      // else scopeType === 'all': Super Admin sees all departments

      // Fetch all approved or pending vacation plans
      let query = supabase
        .from('vacation_plans')
        .select(`
          *,
          vacation_types(name),
          departments(id, name, facility_id),
          profiles!vacation_plans_staff_id_fkey(full_name, email),
          vacation_splits(*),
          vacation_approvals(has_conflict, conflict_reason, conflicting_plans)
        `)
        .in('status', ['pending_approval', 'department_pending', 'facility_pending', 'workspace_pending', 'approved']);

      // Apply scope filtering
      if (scopeType !== 'all' && allowedDepartmentIds.length > 0) {
        query = query.in('department_id', allowedDepartmentIds);
      }

      // Filter by specific department if selected
      if (selectedDepartment && selectedDepartment !== 'all') {
        query = query.eq('department_id', selectedDepartment);
      }

      const { data: plans, error } = await query;
      if (error) throw error;

      if (!plans) return [];

      // Group plans by department to find conflicts
      const departmentGroups = plans.reduce((acc: any, plan: any) => {
        const deptId = plan.department_id;
        if (!acc[deptId]) {
          acc[deptId] = [];
        }
        acc[deptId].push(plan);
        return acc;
      }, {});

      // Find conflicts within each department
      const conflicts: any[] = [];

      Object.entries(departmentGroups).forEach(([deptId, deptPlans]: [string, any]) => {
        if (deptPlans.length < 2) return;

        // Check each plan against others
        deptPlans.forEach((plan: any, i: number) => {
          const planSplits = plan.vacation_splits || [];

          deptPlans.slice(i + 1).forEach((otherPlan: any) => {
            const otherSplits = otherPlan.vacation_splits || [];

            // Check for date overlaps
            const hasOverlap = planSplits.some((split: any) => {
              const splitStart = parseISO(split.start_date);
              const splitEnd = parseISO(split.end_date);

              return otherSplits.some((otherSplit: any) => {
                const otherStart = parseISO(otherSplit.start_date);
                const otherEnd = parseISO(otherSplit.end_date);

                // Check if dates overlap
                return (
                  (splitStart <= otherEnd && splitEnd >= otherStart) ||
                  (otherStart <= splitEnd && otherEnd >= splitStart)
                );
              });
            });

            if (hasOverlap) {
              // Apply date range filter if set
              if (startDate && endDate) {
                const filterStart = parseISO(startDate);
                const filterEnd = parseISO(endDate);

                const isInRange = planSplits.some((split: any) => {
                  const splitStart = parseISO(split.start_date);
                  const splitEnd = parseISO(split.end_date);
                  return (
                    isWithinInterval(splitStart, { start: filterStart, end: filterEnd }) ||
                    isWithinInterval(splitEnd, { start: filterStart, end: filterEnd }) ||
                    isWithinInterval(filterStart, { start: splitStart, end: splitEnd })
                  );
                });

                if (!isInRange) return;
              }

              const hasAcknowledgment = plan.vacation_approvals?.some((a: any) => a.has_conflict) ||
                otherPlan.vacation_approvals?.some((a: any) => a.has_conflict);

              conflicts.push({
                id: `${plan.id}-${otherPlan.id}`,
                department: plan.departments,
                plans: [plan, otherPlan],
                hasAcknowledgment,
                acknowledgmentReason: plan.vacation_approvals?.find((a: any) => a.has_conflict)?.conflict_reason ||
                  otherPlan.vacation_approvals?.find((a: any) => a.has_conflict)?.conflict_reason,
              });
            }
          });
        });
      });

      return conflicts;
    },
  });



  const hasActiveFilters = startDate || endDate || selectedDepartment !== 'all';

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Vacation Conflict Dashboard
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Monitor overlapping vacation schedules across specialties
            </CardDescription>
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full sm:w-auto min-h-[40px] text-muted-foreground hover:bg-secondary transition-colors">
              <X className="h-4 w-4 mr-2" />
              Clear Filters
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <Card className="mb-6 bg-muted/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                <CardTitle>Filters</CardTitle>
              </div>
              {(startDate || endDate || selectedDepartment !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8 text-muted-foreground hover:bg-secondary transition-colors"
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear Filters
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="department">Specialty</Label>
                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                  <SelectTrigger id="department">
                    <SelectValue placeholder="All Specialties" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Specialties</SelectItem>
                    {departments?.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Conflicts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">
                {conflictData?.length || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Acknowledged</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-warning">
                {conflictData?.filter(c => c.hasAcknowledgment).length || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Unacknowledged</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">
                {conflictData?.filter(c => !c.hasAcknowledgment).length || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Conflicts List */}
        <ScrollArea className="h-[600px]">
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Loading conflicts...</p>
            </div>
          ) : conflictData && conflictData.length > 0 ? (
            <div className="space-y-4">
              {conflictData.map((conflict) => (
                <Card key={conflict.id} className={cn(
                  "border-2",
                  conflict.hasAcknowledgment ? "border-warning" : "border-destructive"
                )}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          {conflict.department.name}
                        </CardTitle>
                        <CardDescription>Overlapping vacation schedules detected</CardDescription>
                      </div>
                      <Badge variant={conflict.hasAcknowledgment ? "secondary" : "destructive"}>
                        {conflict.hasAcknowledgment ? 'Acknowledged' : 'Unacknowledged'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {conflict.plans.map((plan: any, idx: number) => (
                      <div key={plan.id}>
                        <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
                          <div className="flex-1 w-full min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="font-semibold truncate">
                                {plan.profiles?.full_name || 'Unknown'}
                              </span>
                              <Badge variant="outline" className="whitespace-nowrap">{plan.vacation_types?.name}</Badge>
                            </div>
                            <div className="space-y-2 ml-0 sm:ml-6">
                              {plan.vacation_splits?.map((split: any) => (
                                <div key={split.id} className="flex flex-wrap items-center gap-2 text-sm bg-muted/30 p-1.5 rounded">
                                  <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="font-medium">
                                    {format(parseISO(split.start_date), 'MMM dd, yyyy')} -{' '}
                                    {format(parseISO(split.end_date), 'MMM dd, yyyy')}
                                  </span>
                                  <span className="text-muted-foreground text-xs">({split.days} days)</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        {idx === 0 && <Separator className="my-4" />}
                      </div>
                    ))}

                    {conflict.hasAcknowledgment && conflict.acknowledgmentReason && (
                      <div className="bg-warning/10 border border-warning p-3 rounded-lg">
                        <p className="text-sm font-medium text-warning mb-1">Acknowledgment Reason:</p>
                        <p className="text-sm text-muted-foreground">
                          {conflict.acknowledgmentReason}
                        </p>
                      </div>
                    )}

                    {/* Quick Actions */}
                    <div className="flex flex-wrap gap-2 pt-2">
                      {conflict.plans.map((plan: any) => (
                        <div key={plan.id} className="flex gap-2">
                          {plan.profiles?.email && (
                            <a
                              href={`mailto:${plan.profiles.email}?subject=Vacation Conflict - Schedule Adjustment Needed&body=Hi ${plan.profiles.full_name},%0D%0A%0D%0AYour vacation request has a scheduling conflict with another team member. Please review and coordinate your dates.%0D%0A%0D%0AThank you.`}
                              className="inline-flex"
                            >
                              <Button variant="outline" size="sm" className="gap-1">
                                <Mail className="h-3 w-3" />
                                Contact {plan.profiles.full_name?.split(' ')[0]}
                              </Button>
                            </a>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            className="gap-1"
                            onClick={() => handleRejectClick(plan)}
                            disabled={rejectMutation.isPending}
                          >
                            <XCircle className="h-3 w-3" />
                            Reject {plan.profiles?.full_name?.split(' ')[0]}'s Leave
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <AlertCircle className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Conflicts Found</h3>
              <p className="text-muted-foreground">
                {hasActiveFilters
                  ? 'No vacation conflicts match your current filters'
                  : 'No overlapping vacation schedules detected'}
              </p>
            </div>
          )}
        </ScrollArea>
      </CardContent>

      {/* Reject Confirmation Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Reject Vacation Request
            </DialogTitle>
            <DialogDescription>
              You are about to reject the vacation request for{' '}
              <strong>{selectedPlanToReject?.profiles?.full_name}</strong>.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <p className="text-sm font-medium">Vacation Details:</p>
              <p className="text-sm text-muted-foreground">
                Type: {selectedPlanToReject?.vacation_types?.name}
              </p>
              <p className="text-sm text-muted-foreground">
                Duration: {selectedPlanToReject?.vacation_splits?.reduce((sum: number, s: any) => sum + s.days, 0)} days
              </p>
            </div>

            <div>
              <Label htmlFor="reject-reason" className="text-sm font-medium">
                Reason for Rejection <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Please explain why this vacation is being rejected due to the conflict..."
                rows={3}
                className="mt-1.5"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false);
                setSelectedPlanToReject(null);
                setRejectReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={rejectMutation.isPending || !rejectReason.trim()}
            >
              {rejectMutation.isPending ? 'Rejecting...' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default VacationConflictDashboard;
