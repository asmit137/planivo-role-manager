import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { format, parseISO, isWithinInterval } from 'date-fns';
import { AlertCircle, Calendar, Users, Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConflictDashboardProps {
  scopeType?: 'workspace' | 'facility' | 'department' | 'all';
  scopeId?: string;
}

const VacationConflictDashboard = ({ scopeType = 'all', scopeId }: ConflictDashboardProps) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');

  // Fetch departments for filtering
  const { data: departments } = useQuery({
    queryKey: ['departments', scopeId],
    queryFn: async () => {
      let query = supabase.from('departments').select('id, name, facility_id, facilities(workspace_id)');

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

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedDepartment('all');
  };

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
            <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full sm:w-auto min-h-[40px]">
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
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
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
    </Card>
  );
};

export default VacationConflictDashboard;
