import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isSameDay } from 'date-fns';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { cn } from '@/lib/utils';

interface StaffScheduleViewProps {
  departmentId: string;
}

export const StaffScheduleView: React.FC<StaffScheduleViewProps> = ({ departmentId }) => {
  const { user } = useAuth();
  const [currentWeek, setCurrentWeek] = useState(new Date());

  const weekStart = startOfWeek(currentWeek);
  const weekEnd = endOfWeek(currentWeek);
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Fetch user's shift assignments
  const { data: assignments, isLoading } = useQuery({
    queryKey: ['my-shift-assignments', user?.id, format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd')],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('shift_assignments')
        .select(`
          *,
          shifts:shift_id (
            *,
            schedules:schedule_id (
              name,
              status
            )
          )
        `)
        .eq('staff_id', user.id)
        .gte('assignment_date', format(weekStart, 'yyyy-MM-dd'))
        .lte('assignment_date', format(weekEnd, 'yyyy-MM-dd'))
        .order('assignment_date', { ascending: true });

      if (error) throw error;
      
      // Filter only published schedules
      return data?.filter((a: any) => a.shifts?.schedules?.status === 'published') || [];
    },
    enabled: !!user?.id,
  });

  // Fetch upcoming assignments (next 30 days)
  const { data: upcomingAssignments } = useQuery({
    queryKey: ['upcoming-assignments', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const today = new Date();
      const futureDate = addWeeks(today, 4);

      const { data, error } = await supabase
        .from('shift_assignments')
        .select(`
          *,
          shifts:shift_id (
            *,
            schedules:schedule_id (
              name,
              status
            )
          )
        `)
        .eq('staff_id', user.id)
        .gte('assignment_date', format(today, 'yyyy-MM-dd'))
        .lte('assignment_date', format(futureDate, 'yyyy-MM-dd'))
        .order('assignment_date', { ascending: true });

      if (error) throw error;
      return data?.filter((a: any) => a.shifts?.schedules?.status === 'published') || [];
    },
    enabled: !!user?.id,
  });

  // Get assignments for a specific day
  const getAssignmentsForDay = (day: Date) => {
    return assignments?.filter((a: any) => 
      isSameDay(parseISO(a.assignment_date), day)
    ) || [];
  };

  if (isLoading) return <LoadingState message="Loading your schedule..." />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Schedule"
        description="View your assigned shifts and upcoming work schedule"
      />

      {/* Week Navigation */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="icon" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <h3 className="font-semibold">
                {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {assignments?.length || 0} shift{(assignments?.length || 0) !== 1 ? 's' : ''} this week
              </p>
            </div>
            <Button variant="outline" size="icon" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Week View */}
      <div className="grid gap-2 md:grid-cols-7">
        {weekDays.map((day) => {
          const dayAssignments = getAssignmentsForDay(day);
          const isToday = isSameDay(day, new Date());

          return (
            <Card
              key={day.toISOString()}
              className={cn(
                "min-h-[120px]",
                isToday && "ring-2 ring-primary"
              )}
            >
              <CardHeader className="p-3 pb-1">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">{format(day, 'EEE')}</p>
                  <p className={cn(
                    "text-lg font-semibold",
                    isToday && "text-primary"
                  )}>
                    {format(day, 'd')}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-2">
                {dayAssignments.length > 0 ? (
                  <div className="space-y-1">
                    {dayAssignments.map((assignment: any) => (
                      <div
                        key={assignment.id}
                        className="p-2 rounded text-xs"
                        style={{
                          backgroundColor: `${assignment.shifts?.color}20`,
                          borderLeft: `3px solid ${assignment.shifts?.color}`,
                        }}
                      >
                        <p className="font-medium truncate">{assignment.shifts?.name}</p>
                        <p className="text-muted-foreground">
                          {assignment.shifts?.start_time?.slice(0, 5)} - {assignment.shifts?.end_time?.slice(0, 5)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No shifts
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Upcoming Shifts List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Upcoming Shifts
          </CardTitle>
          <CardDescription>Your scheduled shifts for the next 4 weeks</CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingAssignments && upcomingAssignments.length > 0 ? (
            <div className="space-y-3">
              {upcomingAssignments.slice(0, 10).map((assignment: any) => (
                <div
                  key={assignment.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-10 rounded"
                      style={{ backgroundColor: assignment.shifts?.color }}
                    />
                    <div>
                      <p className="font-medium">{assignment.shifts?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(parseISO(assignment.assignment_date), 'EEEE, MMMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {assignment.shifts?.start_time?.slice(0, 5)} - {assignment.shifts?.end_time?.slice(0, 5)}
                    </p>
                    <Badge variant="outline" className="mt-1">
                      {assignment.status}
                    </Badge>
                  </div>
                </div>
              ))}
              {upcomingAssignments.length > 10 && (
                <p className="text-sm text-muted-foreground text-center pt-2">
                  +{upcomingAssignments.length - 10} more upcoming shifts
                </p>
              )}
            </div>
          ) : (
            <EmptyState
              icon={Calendar}
              title="No upcoming shifts"
              description="You don't have any shifts scheduled yet"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};
