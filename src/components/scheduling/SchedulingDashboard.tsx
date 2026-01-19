import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Calendar, Users, AlertTriangle, CheckCircle, Clipboard } from 'lucide-react';
import { format, parseISO, isWithinInterval, startOfWeek, endOfWeek, addDays } from 'date-fns';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { StatsCard } from '@/components/shared/StatsCard';
import { ShiftAssignmentDialog } from './ShiftAssignmentDialog';

interface SchedulingDashboardProps {
  departmentId: string;
}

export const SchedulingDashboard: React.FC<SchedulingDashboardProps> = ({ departmentId }) => {
  const [selectedGap, setSelectedGap] = React.useState<{ shift: any; date: Date } | null>(null);
  const today = new Date();
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);

  // Fetch all schedules with shifts and assignments
  const { data: schedules, isLoading } = useQuery({
    queryKey: ['scheduling-dashboard', departmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedules')
        .select(`
          *,
          shifts (
            *,
            shift_assignments (
              *,
              profiles:staff_id (full_name)
            )
          )
        `)
        .eq('department_id', departmentId)
        .order('start_date', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch department staff count
  const { data: staffCount } = useQuery({
    queryKey: ['department-staff-count', departmentId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('department_id', departmentId)
        .eq('role', 'staff');

      if (error) throw error;
      return count || 0;
    },
  });

  if (isLoading) return <LoadingState message="Loading dashboard..." />;

  // Calculate statistics
  const activeSchedules = schedules?.filter((s: any) => s.status === 'published') || [];
  const draftSchedules = schedules?.filter((s: any) => s.status === 'draft') || [];

  // Current week's schedules
  const currentWeekSchedules = activeSchedules.filter((s: any) => {
    const start = parseISO(s.start_date);
    const end = parseISO(s.end_date);
    return isWithinInterval(today, { start, end });
  });

  // Calculate coverage for current week
  let totalShifts = 0;
  let filledShifts = 0;
  let understaffedShifts = 0;

  currentWeekSchedules.forEach((schedule: any) => {
    schedule.shifts?.forEach((shift: any) => {
      // Count days in current week that fall within schedule
      for (let d = weekStart; d <= weekEnd; d = addDays(d, 1)) {
        if (d >= parseISO(schedule.start_date) && d <= parseISO(schedule.end_date)) {
          totalShifts++;
          const dayAssignments = shift.shift_assignments?.filter((a: any) =>
            format(parseISO(a.assignment_date), 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd')
          ) || [];

          if (dayAssignments.length >= shift.required_staff) {
            filledShifts++;
          } else if (dayAssignments.length > 0) {
            understaffedShifts++;
          }
        }
      }
    });
  });

  const coverageRate = totalShifts > 0 ? Math.round((filledShifts / totalShifts) * 100) : 0;

  // Get upcoming shifts with low coverage
  const upcomingGaps: any[] = [];
  currentWeekSchedules.forEach((schedule: any) => {
    schedule.shifts?.forEach((shift: any) => {
      for (let d = today; d <= weekEnd; d = addDays(d, 1)) {
        if (d >= parseISO(schedule.start_date) && d <= parseISO(schedule.end_date)) {
          const dayAssignments = shift.shift_assignments?.filter((a: any) =>
            format(parseISO(a.assignment_date), 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd')
          ) || [];

          if (dayAssignments.length < shift.required_staff) {
            upcomingGaps.push({
              shift,
              schedule,
              date: d,
              assigned: dayAssignments.length,
              required: shift.required_staff,
            });
          }
        }
      }
    });
  });

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Active Schedules"
          value={activeSchedules.length}
          icon={Calendar}
          description="Published"
        />
        <StatsCard
          title="Draft Schedules"
          value={draftSchedules.length}
          icon={Clipboard}
          description="Awaiting publish"
        />
        <StatsCard
          title="Department Staff"
          value={staffCount || 0}
          icon={Users}
          description="Available"
        />
        <StatsCard
          title="Weekly Coverage"
          value={`${coverageRate}%`}
          icon={CheckCircle}
          description={`${filledShifts}/${totalShifts} filled`}
        />
      </div>

      {/* Coverage Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly Coverage Overview</CardTitle>
          <CardDescription>
            {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Overall Coverage</span>
                <span className="font-medium">{coverageRate}%</span>
              </div>
              <Progress value={coverageRate} className="h-2" />
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center pt-4">
              <div className="space-y-1">
                <div className="text-2xl font-bold text-emerald-500">{filledShifts}</div>
                <div className="text-xs text-muted-foreground">Fully Staffed</div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-amber-500">{understaffedShifts}</div>
                <div className="text-xs text-muted-foreground">Understaffed</div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-red-500">{totalShifts - filledShifts - understaffedShifts}</div>
                <div className="text-xs text-muted-foreground">Unfilled</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Gaps */}
      {upcomingGaps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Staffing Gaps
            </CardTitle>
            <CardDescription>Shifts that need additional staff this week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingGaps.slice(0, 5).map((gap, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors group"
                  onClick={() => setSelectedGap({ shift: gap.shift, date: gap.date })}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: gap.shift.color }}
                    />
                    <div>
                      <p className="font-medium group-hover:text-primary transition-colors">{gap.shift.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(gap.date, 'EEEE, MMM d')} • {gap.shift.start_time?.slice(0, 5)} - {gap.shift.end_time?.slice(0, 5)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                      {gap.assigned}/{gap.required} staff
                    </Badge>
                    <Button variant="ghost" size="sm" className="h-8 px-2">Fill</Button>
                  </div>
                </div>
              ))}
              {upcomingGaps.length > 5 && (
                <p className="text-sm text-muted-foreground text-center">
                  +{upcomingGaps.length - 5} more gaps this week
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Schedules List */}
      <Card>
        <CardHeader>
          <CardTitle>Active Schedules</CardTitle>
          <CardDescription>Currently published schedules</CardDescription>
        </CardHeader>
        <CardContent>
          {activeSchedules.length > 0 ? (
            <div className="space-y-3">
              {activeSchedules.map((schedule: any) => (
                <div
                  key={schedule.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{schedule.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(parseISO(schedule.start_date), 'MMM d')} - {format(parseISO(schedule.end_date), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {schedule.shift_count} shift{schedule.shift_count > 1 ? 's' : ''}
                    </Badge>
                    <Badge className="bg-emerald-500 text-white">Active</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Calendar}
              title="No active schedules"
              description="Publish a schedule to start managing shifts"
            />
          )}
        </CardContent>
      </Card>

      {/* Shift Assignment Dialog */}
      <ShiftAssignmentDialog
        open={!!selectedGap}
        onOpenChange={(open) => !open && setSelectedGap(null)}
        shift={selectedGap?.shift}
        date={selectedGap?.date || new Date()}
        departmentId={departmentId}
      />
    </div>
  );
};
