import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { UserPlus, Calendar, Users, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, eachDayOfInterval } from 'date-fns';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';

interface StaffAssignmentsProps {
  departmentId: string;
}

export const StaffAssignments: React.FC<StaffAssignmentsProps> = ({ departmentId }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [isAssignOpen, setIsAssignOpen] = useState(false);

  // Fetch schedules (published only for assignment)
  const { data: schedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['schedules-for-assignment', departmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedules')
        .select(`
          *,
          shifts (*)
        `)
        .eq('department_id', departmentId)
        .in('status', ['published', 'draft'])
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
        .select(`
          user_id,
          role,
          profiles:user_id!inner (id, full_name, email)
        `)
        .eq('department_id', departmentId)
        .eq('profiles.is_active', true)
        .in('role', ['staff', 'department_head']);

      if (error) throw error;
      return data;
    },
  });

  // Fetch existing assignments for selected shift
  const { data: existingAssignments } = useQuery({
    queryKey: ['shift-assignments', selectedShiftId, selectedDate],
    queryFn: async () => {
      if (!selectedShiftId || !selectedDate) return [];

      const { data, error } = await supabase
        .from('shift_assignments')
        .select(`
          *,
          profiles:staff_id (full_name, email)
        `)
        .eq('shift_id', selectedShiftId)
        .eq('assignment_date', selectedDate);

      if (error) throw error;
      return data;
    },
    enabled: !!selectedShiftId && !!selectedDate,
  });

  // Fetch vacation conflicts
  const { data: vacationConflicts } = useQuery({
    queryKey: ['vacation-conflicts', departmentId, selectedDate],
    queryFn: async () => {
      if (!selectedDate) return [];

      const { data, error } = await supabase
        .from('vacation_splits')
        .select(`
          *,
          vacation_plan:vacation_plan_id (
            staff_id,
            status,
            profiles:staff_id (full_name)
          )
        `)
        .lte('start_date', selectedDate)
        .gte('end_date', selectedDate);

      if (error) throw error;
      return data?.filter((v: any) =>
        v.vacation_plan?.status === 'approved' ||
        v.vacation_plan?.status?.includes('pending')
      ) || [];
    },
    enabled: !!selectedDate,
  });

  // Create assignment mutation
  const createAssignment = useMutation({
    mutationFn: async () => {
      const assignments = selectedStaff.map(staffId => ({
        shift_id: selectedShiftId,
        staff_id: staffId,
        assignment_date: selectedDate,
        assigned_by: user?.id,
      }));

      const { error } = await supabase
        .from('shift_assignments')
        .insert(assignments);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      toast.success('Staff assigned successfully');
      setSelectedStaff([]);
      setIsAssignOpen(false);
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to assign staff';
      toast.error(errorMessage);
    },
  });

  // Remove assignment mutation
  const removeAssignment = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from('shift_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
      toast.success('Assignment removed');
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove assignment';
      toast.error(errorMessage);
    },
  });

  const selectedSchedule = schedules?.find((s: any) => s.id === selectedScheduleId);
  const selectedShift = selectedSchedule?.shifts?.find((s: any) => s.id === selectedShiftId);

  // Get available dates from schedule
  const availableDates = selectedSchedule
    ? eachDayOfInterval({
      start: parseISO(selectedSchedule.start_date),
      end: parseISO(selectedSchedule.end_date),
    })
    : [];

  // Check if staff has vacation conflict
  const hasVacationConflict = (staffId: string) => {
    return vacationConflicts?.some((v: any) => v.vacation_plan?.staff_id === staffId);
  };

  // Check if staff is already assigned
  const isAlreadyAssigned = (staffId: string) => {
    return existingAssignments?.some((a: any) => a.staff_id === staffId);
  };

  const toggleStaffSelection = (staffId: string) => {
    setSelectedStaff(prev =>
      prev.includes(staffId)
        ? prev.filter(id => id !== staffId)
        : [...prev, staffId]
    );
  };

  if (schedulesLoading) return <LoadingState message="Loading schedules..." />;

  const publishedSchedules = schedules?.filter((s: any) => s.status === 'published') || [];

  return (
    <div className="space-y-6">
      {/* Schedule and Shift Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Assign Staff to Shifts</CardTitle>
          <CardDescription>Select a schedule, shift, and date to manage staff assignments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Schedule</Label>
              <Select value={selectedScheduleId} onValueChange={(v) => {
                setSelectedScheduleId(v);
                setSelectedShiftId('');
                setSelectedDate('');
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select schedule" />
                </SelectTrigger>
                <SelectContent>
                  {publishedSchedules.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      No published schedules available
                    </div>
                  ) : (
                    publishedSchedules.map((schedule: any) => (
                      <SelectItem key={schedule.id} value={schedule.id}>
                        {schedule.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Shift</Label>
              <Select
                value={selectedShiftId}
                onValueChange={setSelectedShiftId}
                disabled={!selectedScheduleId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  {selectedSchedule?.shifts?.map((shift: any) => (
                    <SelectItem key={shift.id} value={shift.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: shift.color }}
                        />
                        {shift.name} ({shift.start_time?.slice(0, 5)} - {shift.end_time?.slice(0, 5)})
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Date</Label>
              <Select
                value={selectedDate}
                onValueChange={setSelectedDate}
                disabled={!selectedShiftId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select date" />
                </SelectTrigger>
                <SelectContent>
                  {availableDates.map((date) => (
                    <SelectItem key={date.toISOString()} value={format(date, 'yyyy-MM-dd')}>
                      {format(date, 'EEEE, MMM d, yyyy')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Assignments */}
      {selectedShift && selectedDate && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: selectedShift.color }}
                />
                {selectedShift.name}
              </CardTitle>
              <CardDescription className="mt-1">
                {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')} •
                {selectedShift.start_time?.slice(0, 5)} - {selectedShift.end_time?.slice(0, 5)} •
                Required: {selectedShift.required_staff} staff
              </CardDescription>
            </div>
            <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign Staff
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Assign Staff to Shift</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <p className="text-sm text-muted-foreground">
                    Select staff members to assign to {selectedShift.name} on {format(parseISO(selectedDate), 'MMM d, yyyy')}
                  </p>

                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {staff?.map((member: any) => {
                      const profile = member.profiles;
                      if (!profile?.id) return null;

                      const hasConflict = hasVacationConflict(profile.id);
                      const isAssigned = isAlreadyAssigned(profile.id);

                      return (
                        <div
                          key={member.user_id}
                          className={`flex items-center justify-between p-3 border rounded-lg ${isAssigned ? 'opacity-50 bg-muted/50' : ''
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={selectedStaff.includes(profile.id)}
                              onCheckedChange={() => toggleStaffSelection(profile.id)}
                              disabled={isAssigned}
                            />
                            <div>
                              <p className="font-medium">{profile.full_name || 'Unknown'}</p>
                              <p className="text-sm text-muted-foreground">{profile.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {hasConflict && (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                On Leave
                              </Badge>
                            )}
                            {isAssigned && (
                              <Badge variant="secondary">Already Assigned</Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setIsAssignOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => createAssignment.mutate()}
                      disabled={selectedStaff.length === 0 || createAssignment.isPending}
                    >
                      {createAssignment.isPending ? 'Assigning...' : `Assign ${selectedStaff.length} Staff`}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {existingAssignments && existingAssignments.length > 0 ? (
              <div className="space-y-2">
                {existingAssignments.map((assignment: any) => (
                  <div
                    key={assignment.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{assignment.profiles?.full_name || 'Unknown'}</p>
                      <p className="text-sm text-muted-foreground">{assignment.profiles?.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">{assignment.status}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAssignment.mutate(assignment.id)}
                        disabled={removeAssignment.isPending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title="No staff assigned"
                description="Click 'Assign Staff' to add team members to this shift"
              />
            )}
          </CardContent>
        </Card>
      )}

      {!selectedScheduleId && (
        <EmptyState
          icon={Calendar}
          title="Select a schedule"
          description="Choose a schedule, shift, and date above to manage staff assignments"
        />
      )}
    </div>
  );
};
