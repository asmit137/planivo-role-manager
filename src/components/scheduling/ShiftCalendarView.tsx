import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { cn } from '@/lib/utils';
import { ShiftAssignmentDialog } from './ShiftAssignmentDialog';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format, isSameDay, parseISO, isSameMonth } from 'date-fns';

interface ShiftCalendarViewProps {
  departmentId: string;
}

export const ShiftCalendarView: React.FC<ShiftCalendarViewProps> = ({ departmentId }) => {
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('all');
  const [selectedShiftData, setSelectedShiftData] = useState<{ shift: any; date: Date } | null>(null);

  // Fetch published and draft schedules
  const { data: schedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['schedules-calendar', departmentId],
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

  if (!schedules || schedules.length === 0) {
    return (
      <EmptyState
        icon={CalendarIcon}
        title="No schedules available"
        description="Create and publish schedules to see them on the calendar"
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold min-w-[160px]">
            Schedule Calendar
          </h2>
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

      <Card className="border-2">
        <CardContent className="p-3 sm:p-6 overflow-x-auto">
          <div className="min-w-[320px]">
            <Calendar
              mode="single"
              selected={currentMonth}
              onSelect={(date) => date && setCurrentMonth(date)}
              onMonthChange={setCurrentMonth}
              month={currentMonth}
              className="rounded-md w-full pointer-events-auto"
              classNames={{
                months: "flex flex-col gap-4 sm:gap-8 w-full justify-center",
                month: "space-y-4 flex-1",
                caption: "flex justify-center pt-1 relative items-center mb-4 sm:mb-8",
                caption_label: "text-lg sm:text-2xl font-bold tracking-tight",
                nav: "flex items-center",
                nav_button: "h-10 w-10 bg-transparent p-0 opacity-60 hover:opacity-100 hover:bg-accent rounded-xl transition-all flex items-center justify-center z-20",
                nav_button_previous: "absolute left-0 top-1/2 -translate-y-1/2",
                nav_button_next: "absolute right-0 top-1/2 -translate-y-1/2",
                table: "w-full border-collapse",
                head_row: "flex w-full mb-4",
                head_cell: "text-muted-foreground/60 rounded-md font-bold text-[0.65rem] sm:text-xs uppercase tracking-widest flex-1 text-center",
                row: "flex w-full mt-2",
                cell: "relative p-0.5 text-center focus-within:relative focus-within:z-20 flex-1 h-10 sm:h-16",
                day: "h-full w-full p-0 font-normal hover:bg-accent/50 rounded-xl transition-all touch-manipulation",
                day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground shadow-lg shadow-primary/20",
                day_today: "bg-accent/30 text-accent-foreground font-bold ring-2 ring-primary/20 ring-offset-2",
                day_outside: "text-muted-foreground opacity-20",
                day_disabled: "text-muted-foreground opacity-20",
                day_hidden: "invisible",
              }}
              components={{
                Day: ({ date, displayMonth, ...props }: any) => {
                  const dayAssignments = getAssignmentsForDay(date);
                  const hasAssignments = dayAssignments.length > 0;
                  const isCurrentMonth = isSameMonth(date, currentMonth);
                  const isToday = isSameDay(date, new Date());

                  // Count total assigned staff across all shifts
                  const totalAssigned = dayAssignments.reduce((sum, item) => sum + item.assignments.length, 0);

                  return (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          {...props}
                          className={cn(
                            "h-full w-full p-2 font-normal rounded-xl transition-all relative group touch-manipulation flex flex-col items-center justify-center gap-1 overflow-hidden border-2",
                            hasAssignments && "bg-emerald-100 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-200 dark:hover:bg-emerald-900",
                            !hasAssignments && "border-transparent hover:bg-accent/50",
                            !isCurrentMonth && "opacity-30"
                          )}
                        >
                          <time
                            dateTime={format(date, "yyyy-MM-dd")}
                            className={cn(
                              "text-sm sm:text-lg font-medium transition-colors w-full text-center",
                              isToday ? "text-primary font-bold" : "text-foreground/70"
                            )}
                          >
                            {format(date, "d")}
                          </time>

                          {hasAssignments && (
                            <div className="w-full flex items-center justify-between">
                              <div className={cn(
                                "text-white text-[9px] sm:text-[10px] font-black rounded-lg px-1.5 py-0.5 flex items-center justify-center shadow-md z-10 border border-white/10",
                                totalAssigned >= dayAssignments.reduce((sum, item) => sum + (item.shift.required_staff || 0), 0)
                                  ? "bg-emerald-500"
                                  : "bg-amber-500"
                              )}>
                                {totalAssigned}
                              </div>

                              <div className="flex -space-x-1.5 overflow-hidden">
                                {dayAssignments.slice(0, 3).map((item: any, idx: number) => (
                                  <div
                                    key={idx}
                                    className="h-2 w-2 sm:h-3 sm:w-3 rounded-full border-2 border-background shadow-sm"
                                    style={{ backgroundColor: item.shift.color || '#10b981' }}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </button>
                      </PopoverTrigger>
                      {hasAssignments && (
                        <PopoverContent className="w-80 p-3 sm:p-4 max-h-[60vh] overflow-y-auto" side="bottom" align="center">
                          <div className="space-y-3">
                            <h4 className="font-semibold text-lg border-b pb-2">
                              {format(date, "MMMM d, yyyy")}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {dayAssignments.length} shift{dayAssignments.length > 1 ? 's' : ''} scheduled
                            </p>
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                              {dayAssignments.map((item: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="flex items-start gap-3 rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors cursor-pointer"
                                  onClick={() => setSelectedShiftData({ shift: item.shift, date })}
                                >
                                  <div
                                    className="w-3 h-10 rounded"
                                    style={{ backgroundColor: item.shift.color }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{item.shift.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {item.shift.start_time?.slice(0, 5)} - {item.shift.end_time?.slice(0, 5)}
                                    </p>
                                    <p className="text-xs font-semibold mt-1">
                                      <span className={item.assignments.length >= item.shift.required_staff ? "text-emerald-600" : "text-amber-600"}>
                                        {item.assignments.length}/{item.shift.required_staff} staff
                                      </span>
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </PopoverContent>
                      )}
                    </Popover>
                  );
                }
              }}
            />
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

      {/* Shift Assignment Dialog */}
      <ShiftAssignmentDialog
        open={!!selectedShiftData}
        onOpenChange={(open) => !open && setSelectedShiftData(null)}
        shift={selectedShiftData?.shift}
        date={selectedShiftData?.date || new Date()}
        departmentId={departmentId}
      />
    </div>
  );
};
