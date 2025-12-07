import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Send, Clock, Users, Clipboard } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';

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
  const [editingSchedule, setEditingSchedule] = useState<any>(null);

  // Form state
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [shiftCount, setShiftCount] = useState<number>(1);
  const [shifts, setShifts] = useState<ShiftConfig[]>([
    { name: 'Morning Shift', startTime: '06:00', endTime: '14:00', requiredStaff: 1, color: '#3b82f6' }
  ]);

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
      // Get facility and workspace from department
      const { data: dept } = await supabase
        .from('departments')
        .select('facility_id, facilities(workspace_id)')
        .eq('id', departmentId)
        .single();

      const { data: schedule, error: scheduleError } = await supabase
        .from('schedules')
        .insert({
          name,
          department_id: departmentId,
          facility_id: dept?.facility_id,
          workspace_id: (dept?.facilities as any)?.workspace_id,
          start_date: startDate,
          end_date: endDate,
          shift_count: shiftCount,
          created_by: user?.id,
        })
        .select()
        .single();

      if (scheduleError) throw scheduleError;

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
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete schedule');
    },
  });

  const resetForm = () => {
    setName('');
    setStartDate('');
    setEndDate('');
    setShiftCount(1);
    setShifts([{ name: 'Morning Shift', startTime: '06:00', endTime: '14:00', requiredStaff: 1, color: '#3b82f6' }]);
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
        return <Badge variant="outline">Archived</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) return <LoadingState message="Loading schedules..." />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Schedules</h2>
          <p className="text-sm text-muted-foreground">Manage department schedules and shifts</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Schedule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate">End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
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
                      <div className="grid grid-cols-2 gap-4">
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
                  disabled={!name || !startDate || !endDate || createSchedule.isPending}
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
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => publishSchedule.mutate(schedule.id)}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Publish
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteSchedule.mutate(schedule.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
