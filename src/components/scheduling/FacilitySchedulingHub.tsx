import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Calendar, ClipboardList, LayoutDashboard, Clock, Send, Trash2, Filter, Monitor, Edit, ArrowLeft, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ShiftCalendarView } from './ShiftCalendarView';
import { SchedulingDashboard } from './SchedulingDashboard';
import { ScheduleDisplaySettings } from './ScheduleDisplaySettings';
import { useOrganization } from '@/contexts/OrganizationContext';

interface FacilitySchedulingHubProps {
  facilityId?: string;
  workspaceId?: string;
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

export const FacilitySchedulingHub: React.FC<FacilitySchedulingHubProps> = ({
  facilityId: propFacilityId,
  workspaceId: propWorkspaceId
}) => {
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>(propFacilityId || '');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(propWorkspaceId || '');
  const { user } = useAuth();
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('schedules');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [filterDepartmentId, setFilterDepartmentId] = useState<string>('all');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('');
  const [editingSchedule, setEditingSchedule] = useState<any>(null);

  // Use the effective facility ID (prop or selected)
  const facilityId = propFacilityId || selectedFacilityId;

  // Fetch workspaces for the active organization
  const { data: workspaces, isLoading: workspacesLoading } = useQuery({
    queryKey: ['workspaces', organization?.id],
    queryFn: async () => {
      // If we have a propWorkspaceId, we might technically strictly use it, 
      // but if we are in selector mode, we want choices.
      let query = supabase
        .from('workspaces')
        .select('id, name')
        .order('name');

      if (organization?.id && organization.id !== 'all') {
        query = query.eq('organization_id', organization.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !propWorkspaceId && !propFacilityId, // Only fetch if we are in selection mode
  });

  // Fetch facilities for the selected workspace
  const { data: facilities } = useQuery({
    queryKey: ['facilities', selectedWorkspaceId],
    queryFn: async () => {
      if (!selectedWorkspaceId) return [];

      const { data, error } = await supabase
        .from('facilities')
        .select('id, name')
        .eq('workspace_id', selectedWorkspaceId)
        .order('name');

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedWorkspaceId, // Only fetch if workspace is selected
  });

  // Form state
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [shiftCount, setShiftCount] = useState<number>(1);
  const [shifts, setShifts] = useState<ShiftConfig[]>([
    { name: 'Morning Shift', startTime: '06:00', endTime: '14:00', requiredStaff: 1, color: '#3b82f6' }
  ]);

  // Fetch departments in facility (including workspace-assigned templates)
  const { data: departments } = useQuery({
    queryKey: ['facility-departments', facilityId],
    queryFn: async () => {
      if (!facilityId) return [];
      // First get the workspace_id from the facility
      const { data: facility } = await supabase
        .from('facilities')
        .select('workspace_id')
        .eq('id', facilityId)
        .single();

      // Try workspace-assigned template departments first
      if (facility?.workspace_id) {
        const { data: workspaceDepts } = await supabase
          .from('workspace_departments')
          .select(`
            department_template_id,
            departments!inner(id, name)
          `)
          .eq('workspace_id', facility.workspace_id);

        if (workspaceDepts && workspaceDepts.length > 0) {
          return workspaceDepts
            .filter(wd => wd.departments)
            .map(wd => ({
              id: (wd.departments as any).id,
              name: (wd.departments as any).name
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
        }
      }

      // Fall back to facility-specific departments
      const { data, error } = await supabase
        .from('departments')
        .select('id, name')
        .eq('facility_id', facilityId)
        .order('name');

      if (error) throw error;
      return data || [];
    },
    enabled: !!facilityId,
  });

  // Fetch all schedules for facility
  const { data: schedules, isLoading } = useQuery({
    queryKey: ['facility-schedules', facilityId],
    queryFn: async () => {
      if (!facilityId) return [];
      const { data, error } = await supabase
        .from('schedules')
        .select(`
          *,
          shifts (*),
          departments:department_id (id, name)
        `)
        .eq('facility_id', facilityId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!facilityId,
  });

  // Filter schedules by department
  const filteredSchedules = schedules?.filter((schedule: any) => {
    if (filterDepartmentId === 'all') return true;
    return schedule.department_id === filterDepartmentId;
  }) || [];

  // Check for duplicate names
  const isDuplicateName = (scheduleName: string, excludeId?: string) => {
    return schedules?.some((s: any) =>
      s.name.trim().toLowerCase() === scheduleName.trim().toLowerCase() &&
      s.facility_id === facilityId &&
      s.id !== excludeId
    );
  };

  // Create schedule mutation
  const createSchedule = useMutation({
    mutationFn: async () => {
      if (!selectedDepartmentId) throw new Error('Please select a department');

      if (isDuplicateName(name)) {
        throw new Error('A schedule with this name already exists in this facility');
      }

      // Get workspace from facility
      const { data: facility } = await supabase
        .from('facilities')
        .select('workspace_id')
        .eq('id', facilityId)
        .single();

      const { data: schedule, error: scheduleError } = await supabase
        .from('schedules')
        .insert({
          name,
          department_id: selectedDepartmentId,
          facility_id: facilityId,
          workspace_id: facility?.workspace_id,
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
      queryClient.invalidateQueries({ queryKey: ['facility-schedules'] });
      toast.success('Schedule created successfully');
      resetForm();
      setIsCreateOpen(false);
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create schedule';
      toast.error(errorMessage);
    },
  });

  // Update schedule mutation
  const updateSchedule = useMutation({
    mutationFn: async () => {
      if (!editingSchedule) throw new Error('No schedule selected for editing');
      if (isDuplicateName(name, editingSchedule.id)) {
        throw new Error('A schedule with this name already exists in this facility');
      }

      // Update schedule details
      const { error: scheduleError } = await supabase
        .from('schedules')
        .update({
          name,
          department_id: selectedDepartmentId,
          start_date: startDate,
          end_date: endDate,
          shift_count: shiftCount,
        })
        .eq('id', editingSchedule.id);

      if (scheduleError) throw scheduleError;

      // Delete existing shifts
      const { error: deleteShiftsError } = await supabase
        .from('shifts')
        .delete()
        .eq('schedule_id', editingSchedule.id);

      if (deleteShiftsError) throw deleteShiftsError;

      // Create new shifts
      const shiftsToInsert = shifts.slice(0, shiftCount).map((shift, index) => ({
        schedule_id: editingSchedule.id,
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

      return editingSchedule.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facility-schedules'] });
      toast.success('Schedule updated successfully');
      resetForm();
      setIsCreateOpen(false);
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update schedule';
      toast.error(errorMessage);
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
      queryClient.invalidateQueries({ queryKey: ['facility-schedules'] });
      toast.success('Schedule published - Department Heads can now assign staff');
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to publish schedule';
      toast.error(errorMessage);
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
      queryClient.invalidateQueries({ queryKey: ['facility-schedules'] });
      toast.success('Schedule deleted');
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete schedule';
      toast.error(errorMessage);
    },
  });

  const resetForm = () => {
    setName('');
    setStartDate('');
    setEndDate('');
    setShiftCount(1);
    setSelectedDepartmentId('');
    setShifts([{ name: 'Morning Shift', startTime: '06:00', endTime: '14:00', requiredStaff: 1, color: '#3b82f6' }]);
    setEditingSchedule(null);
  };

  const handleEditClick = (schedule: any) => {
    setEditingSchedule(schedule);
    setName(schedule.name);
    setStartDate(schedule.start_date);
    setEndDate(schedule.end_date);
    setShiftCount(schedule.shift_count);
    setSelectedDepartmentId(schedule.department_id);

    // Map existing shifts to ShiftConfig format
    if (schedule.shifts && schedule.shifts.length > 0) {
      const mappedShifts = schedule.shifts
        .sort((a: any, b: any) => a.shift_order - b.shift_order)
        .map((s: any) => ({
          name: s.name,
          startTime: s.start_time,
          endTime: s.end_time,
          requiredStaff: s.required_staff,
          color: s.color || DEFAULT_SHIFT_COLORS[0]
        }));
      setShifts(mappedShifts);
    } else {
      setShifts([{ name: 'Morning Shift', startTime: '06:00', endTime: '14:00', requiredStaff: 1, color: '#3b82f6' }]);
    }

    setIsCreateOpen(true);
  };

  const handleShiftCountChange = (value: string) => {
    const count = parseInt(value);
    setShiftCount(count);

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
        return <Badge className="bg-amber-500 text-white">Draft</Badge>;
      case 'published':
        return <Badge className="bg-emerald-500 text-white">Published</Badge>;
      case 'archived':
        return <Badge variant="outline">Archived</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading && facilityId) return <LoadingState message="Loading schedules..." />;

  // Initial Selection Flow: Side-by-Side Selection
  if (!facilityId && !propFacilityId) {
    return (
      <Card className="w-full mt-6">
        <CardHeader>
          <CardTitle>Schedule Management</CardTitle>
          <CardDescription>Select a workspace and facility to manage schedules</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Workspace Selection */}
            <div className="space-y-2">
              <Label>Workspace</Label>
              {workspacesLoading ? (
                <div className="h-10 w-full animate-pulse rounded-md border border-input bg-muted" />
              ) : (
                <Select
                  value={selectedWorkspaceId}
                  onValueChange={(value) => {
                    setSelectedWorkspaceId(value);
                    setSelectedFacilityId(''); // Reset facility when workspace changes
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a workspace..." />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces?.map((ws: any) => (
                      <SelectItem key={ws.id} value={ws.id}>
                        {ws.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Facility Selection */}
            <div className="space-y-2">
              <Label>Facility</Label>
              <Select
                value={selectedFacilityId}
                onValueChange={setSelectedFacilityId}
                disabled={!selectedWorkspaceId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!selectedWorkspaceId ? "Select workspace first" : "Select a facility..."} />
                </SelectTrigger>
                <SelectContent>
                  {facilities?.map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(workspaces?.length === 0 && !workspacesLoading) && (
            <div className="mt-4 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground text-center">
              No workspaces found for your organization.
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <ErrorBoundary>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Top Bar with Facility/Workspace Context */}
        {!propFacilityId && (
          <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-muted/30 p-4 rounded-lg border border-border/50">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Current Context</h3>
                <div className="flex items-center gap-1.5 text-foreground font-semibold">
                  <span>{workspaces?.find((w: any) => w.id === selectedWorkspaceId)?.name || 'Unknown Workspace'}</span>
                  <span className="text-muted-foreground">/</span>
                  <span>{facilities?.find((f: any) => f.id === selectedFacilityId)?.name || 'Unknown Facility'}</span>
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSelectedFacilityId('')}>
              Switch Facility
            </Button>
          </div>
        )}

        {/* ... Tab Navigation ... */}
        <div className="overflow-x-auto scrollbar-hide -mx-2 px-2 mb-6">
          <TabsList className="grid w-max min-w-full grid-cols-4 gap-1">
            <TabsTrigger value="schedules" className="flex items-center gap-2 min-h-[44px] px-3">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Schedules</span>
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex items-center gap-2 min-h-[44px] px-3">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Calendar</span>
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="flex items-center gap-2 min-h-[44px] px-3">
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="display" className="flex items-center gap-2 min-h-[44px] px-3">
              <Monitor className="h-4 w-4" />
              <span className="hidden sm:inline">Display</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="schedules">
          <div className="space-y-6">
            {/* Header with Filter and Create */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-xl font-semibold">Facility Schedules</h2>
                <p className="text-sm text-muted-foreground">
                  Create schedules for departments - Department Heads will assign staff
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                {/* Department Filter */}
                <Select value={filterDepartmentId} onValueChange={setFilterDepartmentId}>
                  <SelectTrigger className="w-full sm:w-[180px] min-h-[44px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments?.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Create/Edit Modal */}
                <Dialog open={isCreateOpen} onOpenChange={(open) => {
                  setIsCreateOpen(open);
                  if (!open) resetForm();
                }}>
                  <DialogTrigger asChild>
                    <Button className="min-h-[44px]">
                      <Plus className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">Create Schedule</span>
                      <span className="sm:hidden">New</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{editingSchedule ? 'Edit Schedule' : 'Create New Schedule'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                      {/* Department Selection */}
                      <div className="space-y-2">
                        <Label>Department *</Label>
                        <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                          <SelectContent>
                            {departments?.map((dept) => (
                              <SelectItem key={dept.id} value={dept.id}>
                                {dept.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Basic Info */}
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">Schedule Name *</Label>
                          <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., January 2025 Schedule"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="startDate">Start Date *</Label>
                            <Input
                              id="startDate"
                              type="date"
                              value={startDate}
                              onChange={(e) => {
                                setStartDate(e.target.value);
                                // If end date is now before start date, update it
                                if (endDate && e.target.value > endDate) {
                                  setEndDate(e.target.value);
                                }
                              }}
                              min={!editingSchedule ? new Date().toISOString().split('T')[0] : undefined}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="endDate">End Date *</Label>
                            <Input
                              id="endDate"
                              type="date"
                              value={endDate}
                              onChange={(e) => setEndDate(e.target.value)}
                              min={startDate || new Date().toISOString().split('T')[0]}
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
                          className="flex flex-wrap gap-4"
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
                                  className="w-8 h-8 rounded cursor-pointer border-0"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Shift Name</Label>
                                <Input
                                  value={shift.name}
                                  onChange={(e) => updateShift(index, 'name', e.target.value)}
                                  placeholder="e.g., Morning Shift"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Start Time</Label>
                                  <Input
                                    type="time"
                                    value={shift.startTime}
                                    onChange={(e) => updateShift(index, 'startTime', e.target.value)}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>End Time</Label>
                                  <Input
                                    type="time"
                                    value={shift.endTime}
                                    onChange={(e) => updateShift(index, 'endTime', e.target.value)}
                                  />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label>Required Staff per Shift</Label>
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

                      <div className="flex justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={() => editingSchedule ? updateSchedule.mutate() : createSchedule.mutate()}
                          disabled={!name || !startDate || !endDate || !selectedDepartmentId || createSchedule.isPending || updateSchedule.isPending}
                        >
                          {editingSchedule
                            ? (updateSchedule.isPending ? 'Updating...' : 'Update Schedule')
                            : (createSchedule.isPending ? 'Creating...' : 'Create Schedule')
                          }
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Schedule List */}
            {filteredSchedules.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title={filterDepartmentId === 'all' ? 'No schedules yet' : 'No schedules for this department'}
                description={filterDepartmentId === 'all'
                  ? 'Create your first schedule for a department'
                  : 'Create a schedule for this department or select a different filter'
                }
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredSchedules.map((schedule: any) => (
                  <Card key={schedule.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-lg">{schedule.name}</CardTitle>
                          <CardDescription>
                            {(schedule.departments as any)?.name}
                          </CardDescription>
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(schedule.start_date), 'MMM d')} - {format(parseISO(schedule.end_date), 'MMM d, yyyy')}
                          </p>
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
                                onClick={() => handleEditClick(schedule)}
                              >
                                <Edit className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => publishSchedule.mutate(schedule.id)}
                                disabled={publishSchedule.isPending}
                              >
                                <Send className="h-4 w-4 mr-1" />
                                Publish
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteSchedule.mutate(schedule.id)}
                                disabled={deleteSchedule.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {schedule.status === 'published' && (
                            <p className="text-xs text-muted-foreground">
                              Awaiting staff assignment by Department Head
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="calendar">
          {filterDepartmentId !== 'all' ? (
            <ShiftCalendarView departmentId={filterDepartmentId} />
          ) : departments && departments.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Select a department filter above to view its calendar
                </span>
              </div>
              <ShiftCalendarView departmentId={departments[0].id} />
            </div>
          ) : (
            <EmptyState
              icon={Calendar}
              title="No departments"
              description="Add departments to this facility first"
            />
          )}
        </TabsContent>

        <TabsContent value="dashboard">
          {filterDepartmentId !== 'all' ? (
            <SchedulingDashboard departmentId={filterDepartmentId} />
          ) : departments && departments.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Select a department filter above to view its dashboard stats
                </span>
              </div>
              <SchedulingDashboard departmentId={departments[0].id} />
            </div>
          ) : (
            <EmptyState
              icon={LayoutDashboard}
              title="No departments"
              description="Add departments to this facility first"
            />
          )}
        </TabsContent>

        <TabsContent value="display">
          <ScheduleDisplaySettings facilityId={facilityId} />
        </TabsContent>
      </Tabs>
    </ErrorBoundary>
  );
};
