import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ChevronLeft, ChevronRight, Save, Trash2, Check, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, eachDayOfInterval, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, isWithinInterval, addMonths, subMonths } from 'date-fns';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InteractiveStaffCalendarProps {
  departmentId: string;
}

export const InteractiveStaffCalendar: React.FC<InteractiveStaffCalendarProps> = ({ departmentId }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isSaving, setIsSaving] = useState(false);

  // Fetch published schedules
  const { data: schedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['schedules-for-assignment', departmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedules')
        .select(`*, shifts (*)`)
        .eq('department_id', departmentId)
        .eq('status', 'published')
        .order('start_date', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch department staff
  const { data: staff } = useQuery({
    queryKey: ['department-staff', departmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select(`user_id, role, profiles:user_id (id, full_name, email)`)
        .eq('department_id', departmentId)
        .in('role', ['staff', 'department_head']);

      if (error) throw error;
      return data;
    },
  });

  // Fetch existing assignments for selected staff and shift
  const { data: existingAssignments } = useQuery({
    queryKey: ['staff-shift-assignments', selectedStaffId, selectedShiftId],
    queryFn: async () => {
      if (!selectedStaffId || !selectedShiftId) return [];

      const { data, error } = await supabase
        .from('shift_assignments')
        .select('*')
        .eq('staff_id', selectedStaffId)
        .eq('shift_id', selectedShiftId);

      if (error) throw error;
      return data;
    },
    enabled: !!selectedStaffId && !!selectedShiftId,
  });

  // Fetch vacation conflicts for selected staff
  const { data: vacationConflicts } = useQuery({
    queryKey: ['staff-vacations', selectedStaffId],
    queryFn: async () => {
      if (!selectedStaffId) return [];

      // First get vacation plans for this staff
      const { data: plans, error: plansError } = await supabase
        .from('vacation_plans')
        .select('id, status')
        .eq('staff_id', selectedStaffId)
        .in('status', ['approved', 'pending_approval', 'department_pending', 'facility_pending', 'workspace_pending']);

      if (plansError) throw plansError;
      if (!plans || plans.length === 0) return [];

      const planIds = plans.map(p => p.id);

      // Then get splits for those plans
      const { data: splits, error: splitsError } = await supabase
        .from('vacation_splits')
        .select('*')
        .in('vacation_plan_id', planIds);

      if (splitsError) throw splitsError;
      return splits || [];
    },
    enabled: !!selectedStaffId,
  });

  // Fetch ALL assignments for this shift to check capacity
  const { data: allShiftAssignments } = useQuery({
    queryKey: ['all-shift-assignments', selectedShiftId],
    queryFn: async () => {
      if (!selectedShiftId) return [];
      const { data, error } = await supabase
        .from('shift_assignments')
        .select('*')
        .eq('shift_id', selectedShiftId);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedShiftId,
  });

  const selectedSchedule = schedules?.find((s: any) => s.id === selectedScheduleId);
  const selectedShift = selectedSchedule?.shifts?.find((s: any) => s.id === selectedShiftId);

  // Schedule date range
  const scheduleDateRange = useMemo(() => {
    if (!selectedSchedule) return null;
    return {
      start: parseISO(selectedSchedule.start_date),
      end: parseISO(selectedSchedule.end_date),
    };
  }, [selectedSchedule]);

  // Get calendar days for current month view
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  // Check if date is within schedule range
  const isDateInScheduleRange = (date: Date) => {
    if (!scheduleDateRange) return false;
    return isWithinInterval(date, scheduleDateRange);
  };

  // Check if date has vacation conflict
  const hasVacationOnDate = (date: Date) => {
    return vacationConflicts?.some((v: any) => {
      const start = parseISO(v.start_date);
      const end = parseISO(v.end_date);
      return isWithinInterval(date, { start, end });
    });
  };

  // Check if date is already assigned
  const isDateAssigned = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return existingAssignments?.some((a: any) => a.assignment_date === dateStr);
  };

  // Get assignment for date
  const getAssignmentForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return existingAssignments?.find((a: any) => a.assignment_date === dateStr);
  };

  // Check if date has reached required staff limit
  const isDateFull = (date: Date) => {
    if (!selectedShift) return false;
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayAssignments = allShiftAssignments?.filter((a: any) => a.assignment_date === dateStr) || [];
    return dayAssignments.length >= selectedShift.required_staff;
  };

  // Toggle date selection
  const toggleDateSelection = (date: Date) => {
    if (!isDateInScheduleRange(date) || hasVacationOnDate(date)) return;

    const dateStr = format(date, 'yyyy-MM-dd');
    const isFull = isDateFull(date);
    const isSelected = selectedDates.has(dateStr);

    if (!isSelected && isFull) {
      toast.error('This shift has already reached its staffing requirement for this date');
      return;
    }

    const newSelected = new Set(selectedDates);

    if (isSelected) {
      newSelected.delete(dateStr);
    } else {
      newSelected.add(dateStr);
    }
    setSelectedDates(newSelected);
  };

  // Quick select functions
  const selectWeekdays = () => {
    if (!scheduleDateRange) return;
    const newSelected = new Set<string>();
    const days = eachDayOfInterval(scheduleDateRange);

    days.forEach(day => {
      const dayOfWeek = day.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !hasVacationOnDate(day) && !isDateAssigned(day) && !isDateFull(day)) {
        newSelected.add(format(day, 'yyyy-MM-dd'));
      }
    });
    setSelectedDates(newSelected);
  };

  const selectAll = () => {
    if (!scheduleDateRange) return;
    const newSelected = new Set<string>();
    const days = eachDayOfInterval(scheduleDateRange);

    days.forEach(day => {
      if (!hasVacationOnDate(day) && !isDateAssigned(day) && !isDateFull(day)) {
        newSelected.add(format(day, 'yyyy-MM-dd'));
      }
    });
    setSelectedDates(newSelected);
  };

  const clearSelection = () => {
    setSelectedDates(new Set());
  };

  // Save assignments
  const saveAssignments = async () => {
    if (!selectedStaffId || !selectedShiftId || selectedDates.size === 0 || !selectedShift) return;

    setIsSaving(true);
    try {
      // Re-verify capacity for all selected dates before saving
      const { data: currentAssignments, error: fetchError } = await supabase
        .from('shift_assignments')
        .select('assignment_date')
        .eq('shift_id', selectedShiftId)
        .in('assignment_date', Array.from(selectedDates));

      if (fetchError) throw fetchError;

      // Group by date to check counts
      const dateCounts: Record<string, number> = {};
      currentAssignments?.forEach(a => {
        dateCounts[a.assignment_date] = (dateCounts[a.assignment_date] || 0) + 1;
      });

      const overCapacityDates = Array.from(selectedDates).filter(dateStr =>
        (dateCounts[dateStr] || 0) >= selectedShift.required_staff
      );

      if (overCapacityDates.length > 0) {
        toast.error(`Some dates have already reached their staffing requirement: ${overCapacityDates.join(', ')}`);
        return;
      }

      const assignments = Array.from(selectedDates).map(dateStr => ({
        shift_id: selectedShiftId,
        staff_id: selectedStaffId,
        assignment_date: dateStr,
        assigned_by: user?.id,
      }));

      const { error } = await supabase
        .from('shift_assignments')
        .insert(assignments);

      if (error) throw error;

      toast.success(`Assigned ${selectedDates.size} days successfully`);
      setSelectedDates(new Set());
      queryClient.invalidateQueries({ queryKey: ['staff-shift-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['all-shift-assignments'] });
    } catch (error: any) {
      toast.error(error.message || 'Failed to save assignments');
    } finally {
      setIsSaving(false);
    }
  };

  // Remove single assignment
  const removeAssignment = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from('shift_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;

      toast.success('Assignment removed');
      queryClient.invalidateQueries({ queryKey: ['staff-shift-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['all-shift-assignments'] });
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove assignment');
    }
  };

  if (schedulesLoading) return <LoadingState message="Loading schedules..." />;

  const publishedSchedules = schedules || [];

  if (publishedSchedules.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No published schedules"
        description="Publish a schedule first to start assigning staff"
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Selection Controls */}
      <Card>
        <CardHeader className="pb-3 px-4 sm:px-6">
          <CardTitle className="text-lg sm:text-xl">Interactive Staff Assignment</CardTitle>
          <CardDescription className="text-sm">Select schedule, shift, and staff, then tap calendar days</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-sm">Schedule</Label>
              <Select value={selectedScheduleId} onValueChange={(v) => {
                setSelectedScheduleId(v);
                setSelectedShiftId('');
                setSelectedStaffId('');
                setSelectedDates(new Set());
              }}>
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue placeholder="Select schedule" />
                </SelectTrigger>
                <SelectContent>
                  {publishedSchedules.map((schedule: any) => (
                    <SelectItem key={schedule.id} value={schedule.id}>
                      {schedule.name} ({format(parseISO(schedule.start_date), 'MMM d')} - {format(parseISO(schedule.end_date), 'MMM d')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Shift</Label>
              <Select
                value={selectedShiftId}
                onValueChange={(v) => {
                  setSelectedShiftId(v);
                  setSelectedDates(new Set());
                }}
                disabled={!selectedScheduleId}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  {selectedSchedule?.shifts?.map((shift: any) => (
                    <SelectItem key={shift.id} value={shift.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded shrink-0" style={{ backgroundColor: shift.color }} />
                        <span className="truncate">{shift.name} ({shift.start_time?.slice(0, 5)} - {shift.end_time?.slice(0, 5)})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2 lg:col-span-1">
              <Label className="text-sm">Staff Member</Label>
              <Select
                value={selectedStaffId}
                onValueChange={(v) => {
                  setSelectedStaffId(v);
                  setSelectedDates(new Set());
                }}
                disabled={!selectedShiftId}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {staff?.map((member: any) => {
                    const profile = member.profiles;
                    if (!profile?.id) return null;
                    return (
                      <SelectItem key={profile.id} value={profile.id}>
                        <span className="truncate">{profile.full_name || 'Unknown'}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar and Quick Actions */}
      {selectedStaffId && selectedShiftId && (
        <div className="grid gap-4 lg:grid-cols-4">
          {/* Calendar */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2 px-3 sm:px-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <div className="flex items-center gap-1 sm:gap-2">
                  <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="min-h-[44px] min-w-[44px]">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h3 className="font-semibold text-base sm:text-lg min-w-[140px] text-center">{format(currentMonth, 'MMMM yyyy')}</h3>
                  <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="min-h-[44px] min-w-[44px]">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                {selectedDates.size > 0 && (
                  <Button onClick={saveAssignments} disabled={isSaving} className="min-h-[44px] w-full sm:w-auto">
                    <Save className="h-4 w-4 mr-2" />
                    {isSaving ? 'Saving...' : `Save ${selectedDates.size}`}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-2 sm:px-6 overflow-x-auto">
              <div className="min-w-[320px]">
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-1">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                    <div key={i} className="text-center text-xs font-medium text-muted-foreground py-2">
                      <span className="sm:hidden">{day}</span>
                      <span className="hidden sm:inline">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]}</span>
                    </div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                  {calendarDays.map((day) => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const inScheduleRange = isDateInScheduleRange(day);
                    const hasVacation = hasVacationOnDate(day);
                    const isAssigned = isDateAssigned(day);
                    const isFull = isDateFull(day);
                    const assignment = getAssignmentForDate(day);
                    const isSelected = selectedDates.has(dateStr);
                    const inCurrentMonth = isSameMonth(day, currentMonth);

                    return (
                      <div
                        key={dateStr}
                        onClick={() => !isAssigned && toggleDateSelection(day)}
                        className={cn(
                          "relative h-11 sm:h-14 md:h-16 p-0.5 sm:p-1 border rounded-md flex flex-col items-center justify-center transition-all touch-manipulation",
                          !inCurrentMonth && "opacity-30",
                          !inScheduleRange && "bg-muted/30 cursor-not-allowed",
                          inScheduleRange && !hasVacation && !isAssigned && !isFull && "cursor-pointer hover:bg-accent active:bg-accent",
                          inScheduleRange && !hasVacation && !isAssigned && isFull && "bg-amber-100/50 cursor-pointer hover:bg-amber-100",
                          hasVacation && "bg-destructive/20 cursor-not-allowed",
                          isAssigned && "bg-primary/20",
                          isSelected && "bg-primary text-primary-foreground ring-2 ring-primary",
                        )}
                      >
                        <span className={cn(
                          "text-xs sm:text-sm font-medium",
                          isSelected && "text-primary-foreground"
                        )}>
                          {format(day, 'd')}
                        </span>

                        {hasVacation && (
                          <AlertTriangle className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-destructive absolute top-0.5 right-0.5" />
                        )}

                        {isAssigned && !isSelected && (
                          <div className="flex items-center gap-0.5">
                            <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-primary" />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (assignment) removeAssignment(assignment.id);
                              }}
                              className="opacity-50 sm:opacity-0 hover:opacity-100 transition-opacity p-1"
                            >
                              <X className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-destructive" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-4 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-primary" />
                  <span>Selected</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-primary/20 flex items-center justify-center">
                    <Check className="h-3 w-3 text-primary" />
                  </div>
                  <span>Assigned</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-destructive/20" />
                  <span>On Vacation</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-amber-100/50 border border-amber-200" />
                  <span>Requirement Met</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-muted/30" />
                  <span>Outside Schedule</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sidebar */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full justify-start" onClick={selectWeekdays}>
                Mon - Fri
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={selectAll}>
                Select All Available
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={clearSelection}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Selection
              </Button>

              <div className="pt-4 border-t">
                <h4 className="font-medium mb-2">Summary</h4>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>Selected: <span className="font-medium text-foreground">{selectedDates.size} days</span></p>
                  <p>Already Assigned: <span className="font-medium text-foreground">{existingAssignments?.length || 0} days</span></p>
                </div>
              </div>

              {selectedShift && (
                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2">Shift Info</h4>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: selectedShift.color }} />
                    <span className="text-sm font-medium">{selectedShift.name}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {selectedShift.start_time?.slice(0, 5)} - {selectedShift.end_time?.slice(0, 5)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Required: {selectedShift.required_staff} staff
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {!selectedStaffId && selectedShiftId && (
        <EmptyState
          icon={Calendar}
          title="Select a staff member"
          description="Choose a staff member from the dropdown to start assigning shifts"
        />
      )}
    </div>
  );
};
