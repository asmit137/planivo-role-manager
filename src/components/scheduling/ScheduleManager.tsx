import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Edit, Trash2, Send, Clock, Users, Clipboard, Building2, CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface ScheduleManagerProps {
  departmentId: string;
}

interface ShiftConfig {
  name: string;
  startTime: string;
  endTime: string;
  requiredStaff: number;
  color: string;
}

const DEFAULT_SHIFT_COLORS = ['#3b82f6', '#10b981', '#f59e0b'];
const DEFAULT_SHIFT_NAMES = ['Morning Shift', 'Afternoon Shift', 'Night Shift'];

export const ScheduleManager: React.FC<ScheduleManagerProps> = ({ departmentId }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<any>(null);

  // Form state
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [shiftCount, setShiftCount] = useState<number>(1);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([departmentId]);
  const [shifts, setShifts] = useState<ShiftConfig[]>([
    { name: 'Morning Shift', startTime: '06:00', endTime: '14:00', requiredStaff: 1, color: '#3b82f6' }
  ]);

  // Initialize with current department
  useEffect(() => {
    if (departmentId && !selectedDepartments.includes(departmentId)) {
      setSelectedDepartments([departmentId]);
    }
  }, [departmentId]);

  // Fetch available departments (workspace-assigned templates or all templates)
  const { data: availableDepartments } = useQuery({
    queryKey: ['available-departments-for-scheduling', departmentId],
    queryFn: async () => {
      // Get workspace from current department's facility
      const { data: currentDept } = await supabase
        .from('departments')
        .select('id, name, facility_id, facilities(workspace_id)')
        .eq('id', departmentId)
        .maybeSingle();

      const workspaceId = (currentDept?.facilities as any)?.workspace_id;

      // Try workspace-assigned departments first
      if (workspaceId) {
        const { data: workspaceDepts } = await supabase
          .from('workspace_departments')
          .select('department_template_id, departments:department_template_id(id, name)')
          .eq('workspace_id', workspaceId);

        if (workspaceDepts && workspaceDepts.length > 0) {
          return workspaceDepts
            .filter(wd => wd.departments)
            .map(wd => ({
              id: (wd.departments as any).id,
              name: (wd.departments as any).name
            }));
        }
      }

      // Fall back to all template departments
      const { data: templateDepts, error } = await supabase
        .from('departments')
        .select('id, name')
        .eq('is_template', true)
        .is('parent_department_id', null)
        .order('name');

      if (error) {
        console.error('Error fetching departments:', error);
        return [];
      }

      return templateDepts || [];
    },
  });

  // Fetch schedules
  const { data: schedules, isLoading } = useQuery({
    queryKey: ['schedules', departmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedules')
        .select(`
          *,
          shifts (*)
        `)
        .eq('department_id', departmentId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Create schedule mutation
  const createSchedule = useMutation({
    mutationFn: async () => {
      // Use first selected department for the schedule
      const primaryDepartmentId = selectedDepartments[0] || departmentId;

      // Fetch department info to get correct facility and workspace
      const { data: deptInfo } = await supabase
        .from('departments')
        .select('facility_id, facilities(workspace_id)')
        .eq('id', primaryDepartmentId)
        .single();

      const facilityId = deptInfo?.facility_id;
      const workspaceId = (deptInfo?.facilities as any)?.workspace_id;

      // Check for duplicate name in department
      const { data: existingSchedule } = await supabase
        .from('schedules')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('department_id', primaryDepartmentId)
        .eq('name', name)
        .maybeSingle();

      if (existingSchedule) {
        throw new Error(`A schedule with the name "${name}" already exists in this department.`);
      }

      const { data: schedule, error: scheduleError } = await supabase
        .from('schedules')
        .insert({
          name,
          department_id: primaryDepartmentId,
          facility_id: facilityId,
          workspace_id: workspaceId,
          start_date: startDate ? format(startDate, 'yyyy-MM-dd') : null,
          end_date: endDate ? format(endDate, 'yyyy-MM-dd') : null,
          shift_count: shiftCount,
          created_by: user?.id,
        })
        .select()
        .single();

      if (scheduleError) {
        console.error('Schedule creation error:', scheduleError);
        throw scheduleError;
      }

      // Create shifts
      const shiftsToInsert = shifts.slice(0, shiftCount).map((shift, index) => ({
        schedule_id: schedule.id,
        name: shift.name,
        start_time: shift.startTime,
        end_time: shift.endTime,
        shift_order: index + 1,
        required_staff: shift.requiredStaff,
        color: shift.color,
      }));

      const { error: shiftsError } = await supabase
        .from('shifts')
        .insert(shiftsToInsert);

      if (shiftsError) throw shiftsError;

      return schedule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      toast.success('Schedule created successfully');
      resetForm();
      setIsCreateOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create schedule');
    },
  });

  // Publish schedule mutation
  const publishSchedule = useMutation({
    mutationFn: async (scheduleId: string) => {
      const { error } = await supabase
        .from('schedules')
        .update({ status: 'published' })
        .eq('id', scheduleId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      toast.success('Schedule published');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to publish schedule');
    },
  });

  // Delete schedule mutation
  const deleteSchedule = useMutation({
    mutationFn: async (scheduleId: string) => {
      const { error } = await supabase
        .from('schedules')
        .delete()
        .eq('id', scheduleId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      toast.success('Schedule deleted');
      setIsDeleteDialogOpen(false);
      setScheduleToDelete(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete schedule');
    },
  });

  const resetForm = () => {
    setName('');
    setStartDate(undefined);
    setEndDate(undefined);
    setShiftCount(1);
    setSelectedDepartments([departmentId]);
    setShifts([{ name: 'Morning Shift', startTime: '06:00', endTime: '14:00', requiredStaff: 1, color: '#3b82f6' }]);
  };

  const toggleDepartment = (deptId: string) => {
    setSelectedDepartments(prev =>
      prev.includes(deptId)
        ? prev.filter(id => id !== deptId)
        : [...prev, deptId]
    );
  };

  const handleShiftCountChange = (value: string) => {
    const count = parseInt(value);
    setShiftCount(count);

    // Adjust shifts array
    const newShifts = [...shifts];
    while (newShifts.length < count) {
      const index = newShifts.length;
      newShifts.push({
        name: DEFAULT_SHIFT_NAMES[index] || `Shift ${index + 1}`,
        startTime: index === 0 ? '06:00' : index === 1 ? '14:00' : '22:00',
        endTime: index === 0 ? '14:00' : index === 1 ? '22:00' : '06:00',
        requiredStaff: 1,
        color: DEFAULT_SHIFT_COLORS[index] || '#3b82f6',
      });
    }
    setShifts(newShifts.slice(0, count));
  };

  const updateShift = (index: number, field: keyof ShiftConfig, value: string | number) => {
    const newShifts = [...shifts];
    newShifts[index] = { ...newShifts[index], [field]: value };
    setShifts(newShifts);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'published':
        return <Badge className="bg-emerald-500 text-white">Published</Badge>;
      case 'archived':
        return <Badge variant="outline" className="bg-muted text-muted-foreground border-muted-foreground/20">Archived</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) return <LoadingState message="Loading schedules..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold">Schedules</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">Manage department schedules and shifts</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto min-h-[44px]">
              <Plus className="h-4 w-4 mr-2" />
              Create Schedule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
            <DialogHeader>
              <DialogTitle>Create New Schedule</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              {/* Basic Info */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Schedule Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Week 1 Schedule"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-2 block">Start Date</Label>
                    <Popover modal={true}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !startDate && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? format(startDate, 'PPP') : 'Pick date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[100]" align="start">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={setStartDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label className="mb-2 block">End Date</Label>
                    <Popover modal={true}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !endDate && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDate ? format(endDate, 'PPP') : 'Pick date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[100]" align="start">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={setEndDate}
                          disabled={(date) => startDate ? date < startDate : false}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              {/* Department Selection Checklist */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  <Label>Departments *</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Select the departments this schedule applies to
                </p>
                <ScrollArea className="h-[150px] border rounded-md p-3">
                  <div className="space-y-2">
                    {availableDepartments && availableDepartments.length > 0 ? (
                      availableDepartments.map((dept) => (
                        <div key={dept.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`dept-${dept.id}`}
                            checked={selectedDepartments.includes(dept.id)}
                            onCheckedChange={() => toggleDepartment(dept.id)}
                          />
                          <Label
                            htmlFor={`dept-${dept.id}`}
                            className="cursor-pointer text-sm font-normal"
                          >
                            {dept.name}
                          </Label>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No departments available</p>
                    )}
                  </div>
                </ScrollArea>
                {selectedDepartments.length === 0 && (
                  <p className="text-xs text-destructive">Please select at least one department</p>
                )}
              </div>

              {/* Shift Count Selector */}
              <div className="space-y-3">
                <Label>Number of Shifts</Label>
                <RadioGroup
                  value={shiftCount.toString()}
                  onValueChange={handleShiftCountChange}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="1" id="shift1" />
                    <Label htmlFor="shift1" className="cursor-pointer">1 Shift</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="2" id="shift2" />
                    <Label htmlFor="shift2" className="cursor-pointer">2 Shifts</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="3" id="shift3" />
                    <Label htmlFor="shift3" className="cursor-pointer">3 Shifts</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Dynamic Shift Configuration */}
              <div className="space-y-4">
                <Label>Shift Configuration</Label>
                {shifts.slice(0, shiftCount).map((shift, index) => (
                  <Card key={index} className="border-l-4" style={{ borderLeftColor: shift.color }}>
                    <CardContent className="pt-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Shift {index + 1}</span>
                        <input
                          type="color"
                          value={shift.color}
                          onChange={(e) => updateShift(index, 'color', e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer"
                        />
                      </div>
                      <div>
                        <Label>Shift Name</Label>
                        <Input
                          value={shift.name}
                          onChange={(e) => updateShift(index, 'name', e.target.value)}
                          placeholder="e.g., Morning Shift"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label>Start Time</Label>
                          <Input
                            type="time"
                            value={shift.startTime}
                            onChange={(e) => updateShift(index, 'startTime', e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>End Time</Label>
                          <Input
                            type="time"
                            value={shift.endTime}
                            onChange={(e) => updateShift(index, 'endTime', e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Required Staff</Label>
                        <Input
                          type="number"
                          min={1}
                          value={shift.requiredStaff}
                          onChange={(e) => updateShift(index, 'requiredStaff', parseInt(e.target.value) || 1)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createSchedule.mutate()}
                  disabled={!name || !startDate || !endDate || selectedDepartments.length === 0 || createSchedule.isPending}
                >
                  {createSchedule.isPending ? 'Creating...' : 'Create Schedule'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Schedule List */}
      {!schedules || schedules.length === 0 ? (
        <EmptyState
          icon={Clipboard}
          title="No schedules yet"
          description="Create your first schedule to start managing shifts"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {schedules.map((schedule: any) => (
            <Card key={schedule.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{schedule.name}</CardTitle>
                    <CardDescription>
                      {format(new Date(schedule.start_date), 'MMM d')} - {format(new Date(schedule.end_date), 'MMM d, yyyy')}
                    </CardDescription>
                  </div>
                  {getStatusBadge(schedule.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{schedule.shift_count} shift{schedule.shift_count > 1 ? 's' : ''}</span>
                  </div>

                  {/* Shift previews */}
                  <div className="flex flex-wrap gap-2">
                    {schedule.shifts?.map((shift: any) => (
                      <Badge
                        key={shift.id}
                        variant="outline"
                        style={{ borderColor: shift.color, color: shift.color }}
                      >
                        {shift.name}
                      </Badge>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    {schedule.status === 'draft' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => publishSchedule.mutate(schedule.id)}
                      >
                        <Send className="h-4 w-4 mr-1" />
                        Publish
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="destructive-ghost"
                      className="h-8 w-8 bg-destructive/10 hover:bg-destructive/20"
                      onClick={() => {
                        setScheduleToDelete(schedule.id);
                        setIsDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the schedule
              and all its associated shifts and assignments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setScheduleToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => scheduleToDelete && deleteSchedule.mutate(scheduleToDelete)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteSchedule.isPending ? 'Deleting...' : 'Delete Schedule'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
