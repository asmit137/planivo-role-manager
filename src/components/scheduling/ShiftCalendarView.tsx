import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, isSameDay, parseISO } from 'date-fns';
import { LoadingState } from '@/components/layout/LoadingState';
import { cn } from '@/lib/utils';

interface ShiftCalendarViewProps {
  departmentId: string;
}

export const ShiftCalendarView: React.FC<ShiftCalendarViewProps> = ({ departmentId }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('all');

  // Fetch published schedules
  const { data: schedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['schedules-published', departmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedules')
        .select(`
          *,
          shifts (
            *,
            shift_assignments (
              *,
              profiles:staff_id (full_name, email)
            )
          )
        `)
        .eq('department_id', departmentId)
        .in('status', ['published', 'draft'])
        .order('start_date', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get assignments for a specific day
  const getAssignmentsForDay = (day: Date) => {
    if (!schedules) return [];

    const assignments: any[] = [];

    schedules.forEach((schedule: any) => {
      if (selectedScheduleId !== 'all' && schedule.id !== selectedScheduleId) return;

      const scheduleStart = parseISO(schedule.start_date);
      const scheduleEnd = parseISO(schedule.end_date);

      if (day >= scheduleStart && day <= scheduleEnd) {
        schedule.shifts?.forEach((shift: any) => {
          const dayAssignments = shift.shift_assignments?.filter((a: any) =>
            isSameDay(parseISO(a.assignment_date), day)
          ) || [];

          if (dayAssignments.length > 0 || schedule.status === 'published') {
            assignments.push({
              shift,
              schedule,
              assignments: dayAssignments,
            });
          }
        });
      }
    });

    return assignments;
  };

  if (schedulesLoading) return <LoadingState message="Loading calendar..." />;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-[160px] text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date())}>
            Today
          </Button>
        </div>

        <Select value={selectedScheduleId} onValueChange={setSelectedScheduleId}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by schedule" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Schedules</SelectItem>
            {schedules?.map((schedule: any) => (
              <SelectItem key={schedule.id} value={schedule.id}>
                {schedule.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Calendar Grid */}
      <Card>
        <CardContent className="p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for days before month start */}
            {Array.from({ length: monthStart.getDay() }).map((_, i) => (
              <div key={`empty-start-${i}`} className="min-h-[100px] bg-muted/20 rounded" />
            ))}

            {monthDays.map((day) => {
              const dayAssignments = getAssignmentsForDay(day);
              const hasAssignments = dayAssignments.length > 0;

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-[100px] border rounded p-1 transition-colors",
                    isToday(day) && "bg-primary/10 border-primary",
                    !isSameMonth(day, currentMonth) && "opacity-50"
                  )}
                >
                  <div className="flex justify-between items-start">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        isToday(day) && "text-primary"
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                  </div>

                  {/* Shift indicators */}
                  <div className="mt-1 space-y-1">
                    {dayAssignments.slice(0, 3).map((item, idx) => (
                      <div
                        key={`${item.shift.id}-${idx}`}
                        className="text-xs px-1 py-0.5 rounded truncate"
                        style={{
                          backgroundColor: `${item.shift.color}20`,
                          color: item.shift.color,
                          borderLeft: `2px solid ${item.shift.color}`,
                        }}
                      >
                        {item.shift.name}
                        {item.assignments.length > 0 && (
                          <span className="ml-1 opacity-75">
                            ({item.assignments.length})
                          </span>
                        )}
                      </div>
                    ))}
                    {dayAssignments.length > 3 && (
                      <div className="text-xs text-muted-foreground">
                        +{dayAssignments.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Empty cells for days after month end */}
            {Array.from({ length: 6 - monthEnd.getDay() }).map((_, i) => (
              <div key={`empty-end-${i}`} className="min-h-[100px] bg-muted/20 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Shift Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {schedules?.flatMap((schedule: any) =>
              schedule.shifts?.map((shift: any) => (
                <div key={shift.id} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: shift.color }}
                  />
                  <span className="text-sm">{shift.name}</span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
